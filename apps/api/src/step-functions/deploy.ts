import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const execFile = promisify(_execFile)

type HandlerSpec = {
  handler: string
  functionName: string
  envVar: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_DIR = path.resolve(__dirname, '../..')
const HANDLERS_DIR = path.join(__dirname, 'handlers')
const BUILD_DIR = path.join(__dirname, '.build')
const ENV_FILE = path.join(API_DIR, '.env')
const ENV_EXAMPLE_FILE = path.join(API_DIR, '.env.example')

const REGION = process.env.AWS_REGION ?? 'us-east-1'
const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566'
const RUNTIME = process.env.LAMBDA_RUNTIME ?? 'nodejs18.x'
// Where Lambdas should reach LocalStack/Redis from inside the container
const LAMBDA_LOCALSTACK_HOST = process.env.LAMBDA_LOCALSTACK_HOST // e.g., "host.docker.internal" or "localstack-main.orb.local"
const LAMBDA_DYNAMODB_URL =
  process.env.LAMBDA_DYNAMODB_URL ??
  (LAMBDA_LOCALSTACK_HOST ? `http://${LAMBDA_LOCALSTACK_HOST}:4566` : 'http://host.docker.internal:4566')
const LAMBDA_REDIS_URL =
  process.env.LAMBDA_REDIS_URL ??
  (LAMBDA_LOCALSTACK_HOST ? `redis://${LAMBDA_LOCALSTACK_HOST}:6379` : 'redis://host.docker.internal:6379')

const AWS_ENV = {
  ...process.env,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN ?? 'test',
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? REGION,
  AWS_PAGER: ''
}

const HANDLERS: HandlerSpec[] = [
  { handler: 'compute-outcome', functionName: 'match-compute-outcome', envVar: 'MATCH_COMPUTE_OUTCOME_FN_ARN' },
  { handler: 'broadcast-completion', functionName: 'match-broadcast-completion', envVar: 'MATCH_BROADCAST_COMPLETION_FN_ARN' },
  { handler: 'price-oracle', functionName: 'price-oracle', envVar: 'PRICE_ORACLE_FN_ARN' },
  { handler: 'on-price-updated', functionName: 'on-price-updated', envVar: 'PRICE_STREAM_FN_ARN' }
]

async function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const { stdout, stderr } = await execFile(cmd, args, { cwd: opts.cwd, env: opts.env })
  if (stderr && stderr.trim().length > 0) {
    // Many CLIs write progress to stderr; do not treat as error.
    process.stderr.write(stderr)
  }
  return stdout.trim()
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function bundleHandler(handler: string): Promise<string> {
  const src = path.join(HANDLERS_DIR, `${handler}.ts`)
  const out = path.join(BUILD_DIR, `${handler}.js`)
  // Use esbuild CLI so we don't add deps; requires esbuild available via npx
  await run('npx', [
    'esbuild',
    src,
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${out}`,
    '--minify'
  ])
  return out
}

async function zipBundle(handler: string): Promise<string> {
  const zipPath = path.join(BUILD_DIR, `${handler}.zip`)
  // zip -q -r handler.zip handler.js
  await run('zip', ['-q', '-r', `${handler}.zip`, `${handler}.js`], { cwd: BUILD_DIR })
  return zipPath
}

async function lambdaExists(functionName: string): Promise<boolean> {
  try {
    await run('aws', ['lambda', 'get-function', '--function-name', functionName, '--region', REGION, '--endpoint-url', ENDPOINT], { env: AWS_ENV })
    return true
  } catch {
    return false
  }
}

function arnFor(functionName: string): string {
  return `arn:aws:lambda:${REGION}:000000000000:function:${functionName}`
}

async function deployLambda(spec: HandlerSpec): Promise<string> {
  await ensureDir(BUILD_DIR)
  await bundleHandler(spec.handler)
  const zipFile = await zipBundle(spec.handler)

  const exists = await lambdaExists(spec.functionName)
  if (exists) {
    // Update code and ensure environment is correct for LocalStack networking
    await run('aws', [
      'lambda', 'update-function-code',
      '--function-name', spec.functionName,
      '--zip-file', `fileb://${zipFile}`,
      '--region', REGION,
      '--endpoint-url', ENDPOINT
    ], { env: AWS_ENV })

    await run('aws', [
      'lambda', 'update-function-configuration',
      '--function-name', spec.functionName,
      '--environment', `Variables={AWS_REGION=${REGION},DYNAMODB_URL=${LAMBDA_DYNAMODB_URL},WAGE_TABLE_NAME=WageTable,REDIS_URL=${LAMBDA_REDIS_URL}}`,
      '--region', REGION,
      '--endpoint-url', ENDPOINT
    ], { env: AWS_ENV })
  } else {
    await run('aws', [
      'lambda', 'create-function',
      '--function-name', spec.functionName,
      '--runtime', RUNTIME,
      '--role', 'arn:aws:iam::000000000000:role/lambda-role',
      '--handler', `${spec.handler}.handler`,
      '--zip-file', `fileb://${zipFile}`,
      '--region', REGION,
      '--endpoint-url', ENDPOINT,
      '--environment', `Variables={AWS_REGION=${REGION},DYNAMODB_URL=${LAMBDA_DYNAMODB_URL},WAGE_TABLE_NAME=WageTable,REDIS_URL=${LAMBDA_REDIS_URL}}`
    ], { env: AWS_ENV })
  }

  return arnFor(spec.functionName)
}

async function createScheduleIfRequested(priceOracleArn: string) {
  if ((process.env.CREATE_PRICE_SCHEDULE ?? 'false').toLowerCase() !== 'true') return
  const scheduleName = process.env.PRICE_SCHEDULE_NAME ?? 'price-oracle-10s'
  const scheduleGroup = process.env.PRICE_SCHEDULE_GROUP ?? 'default'
  const roleArn = process.env.SCHEDULER_ROLE_ARN ?? 'arn:aws:iam::000000000000:role/scheduler-role'
  const input = JSON.stringify({})
  // Try to create or update schedule
  try {
    await run('aws', [
      'scheduler', 'create-schedule',
      '--name', scheduleName,
      '--group-name', scheduleGroup,
      '--schedule-expression', 'rate(10 seconds)',
      '--flexible-time-window', 'Mode=OFF',
      '--target', `Arn=${priceOracleArn},RoleArn=${roleArn},Input='${input}'`,
      '--region', REGION,
      '--endpoint-url', ENDPOINT
    ], { env: AWS_ENV })
    console.log(`[INFO] Created EventBridge schedule ${scheduleName}`)
  } catch (e) {
    console.warn('[WARN] create-schedule failed (may already exist):', (e as Error).message)
    try {
      await run('aws', [
        'scheduler', 'update-schedule',
        '--name', scheduleName,
        '--group-name', scheduleGroup,
        '--schedule-expression', 'rate(10 seconds)',
        '--flexible-time-window', 'Mode=OFF',
        '--target', `Arn=${priceOracleArn},RoleArn=${roleArn},Input='${input}'`,
        '--region', REGION,
        '--endpoint-url', ENDPOINT
      ], { env: AWS_ENV })
      console.log(`[INFO] Updated EventBridge schedule ${scheduleName}`)
    } catch (e2) {
      console.warn('[WARN] update-schedule failed:', (e2 as Error).message)
    }
  }
}

async function enableStreamMappingIfRequested(priceStreamArn: string) {
  if ((process.env.ENABLE_PRICE_STREAM ?? 'false').toLowerCase() !== 'true') return
  const table = process.env.WAGE_TABLE_NAME ?? 'WageTable'
  try {
    await run('aws', [
      'dynamodb', 'update-table', '--table-name', table,
      '--stream-specification', 'StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES',
      '--region', REGION, '--endpoint-url', ENDPOINT
    ], { env: AWS_ENV })
  } catch (e) {
    console.warn('[WARN] update-table (enable streams) failed (may already be enabled):', (e as Error).message)
  }
  let streamArn = ''
  try {
    const out = await run('aws', ['dynamodb', 'describe-table', '--table-name', table, '--query', 'Table.LatestStreamArn', '--output', 'text', '--region', REGION, '--endpoint-url', ENDPOINT], { env: AWS_ENV })
    streamArn = out.trim()
  } catch (e) {
    console.warn('[WARN] describe-table for stream ARN failed:', (e as Error).message)
    return
  }
  if (!streamArn) return
  try {
    await run('aws', [
      'lambda', 'create-event-source-mapping',
      '--function-name', 'on-price-updated',
      '--event-source-arn', streamArn,
      '--starting-position', 'LATEST',
      '--region', REGION, '--endpoint-url', ENDPOINT
    ], { env: AWS_ENV })
    console.log('[INFO] Created event source mapping for on-price-updated')
  } catch (e) {
    console.warn('[WARN] create-event-source-mapping failed (may exist):', (e as Error).message)
  }
}

async function upsertEnvVar(filePath: string, key: string, value: string) {
  let contents = ''
  try {
    contents = await fs.readFile(filePath, 'utf8')
  } catch {
    // file may not exist
  }
  const lines = contents.split(/\r?\n/)
  let found = false
  const newLines = lines.map(line => {
    if (line.startsWith(`${key}=`)) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) newLines.push(`${key}=${value}`)
  await fs.writeFile(filePath, newLines.join('\n'), 'utf8')
}

function parseArgs(): string[] | null {
  const args = process.argv.slice(2)
  if (args.length === 0) return null
  return args
}

async function main() {
  const selections = parseArgs()
  const targets = selections
    ? HANDLERS.filter(h => selections.includes(h.handler))
    : HANDLERS

  if (targets.length === 0) {
    console.error('No valid handlers specified. Valid options:', HANDLERS.map(h => h.handler).join(', '))
    process.exit(1)
  }

  console.log('[INFO] Deploying handlers to LocalStack and updating env files...')
  const results: Record<string, string> = {}
  for (const spec of targets) {
    console.log(`\n[INFO] Deploying ${spec.handler} -> ${spec.functionName}`)
    const arn = await deployLambda(spec)
    results[spec.envVar] = arn
    console.log(`[SUCCESS] ${spec.handler} deployed. ARN: ${arn}`)
    await upsertEnvVar(ENV_FILE, spec.envVar, arn)
    await upsertEnvVar(ENV_EXAMPLE_FILE, spec.envVar, arn)

    if (spec.handler === 'price-oracle') {
      await createScheduleIfRequested(arn)
    }
    if (spec.handler === 'on-price-updated') {
      await enableStreamMappingIfRequested(arn)
    }
  }

  console.log('\n[INFO] Updated files:')
  console.log(`  - ${ENV_FILE}`)
  console.log(`  - ${ENV_EXAMPLE_FILE}`)

  console.log('\n[INFO] Final ARNs:')
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}=${v}`)
  }

  console.log('\nNext steps:')
  console.log('  1) Run: npm run setup:step-functions -w api')
  console.log('  2) Restart the API to pick up env changes')
}

main().catch(err => {
  console.error('[ERROR] Deployment failed:', err)
  process.exit(1)
})
