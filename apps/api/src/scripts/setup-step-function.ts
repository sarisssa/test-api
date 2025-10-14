import 'dotenv/config'
import {
  CreateStateMachineCommand,
  DescribeStateMachineCommand,
  SFNClient,
  UpdateStateMachineCommand,
} from '@aws-sdk/client-sfn'
import { buildMatchSettlementDefinition } from '../step-functions/definition.js'

const STATE_MACHINE_NAME =
  process.env.MATCH_SETTLEMENT_STATE_MACHINE_NAME ?? 'wage-match-settlement'
const STATE_MACHINE_ROLE_ARN =
  process.env.MATCH_SETTLEMENT_ROLE_ARN ??
  'arn:aws:iam::000000000000:role/WageMatchSettlementRole'
const REGION = process.env.AWS_REGION ?? 'us-east-1'
const ENDPOINT = process.env.STEP_FUNCTIONS_ENDPOINT

if (!ENDPOINT) {
  console.error(
    '❌ STEP_FUNCTIONS_ENDPOINT is not set. Configure it (e.g., http://localhost:4566 when using LocalStack).'
  )
  process.exit(1)
}

const client = new SFNClient({
  region: REGION,
  endpoint: ENDPOINT,
})

const definition = buildMatchSettlementDefinition()

async function ensureStateMachine(): Promise<void> {
  try {
    const describe = (await client.send(
      new DescribeStateMachineCommand({
        name: STATE_MACHINE_NAME,
      })
    )) as { stateMachineArn?: string; name?: string }

    await client.send(
      new UpdateStateMachineCommand({
        stateMachineArn: describe.stateMachineArn,
        definition,
        roleArn: STATE_MACHINE_ROLE_ARN,
      })
    )

    console.log(
      `✅ Step Functions state machine '${STATE_MACHINE_NAME}' updated.\n   ARN: ${describe.stateMachineArn}`
    )
    console.log(
      '   Ensure MATCH_SETTLEMENT_STATE_MACHINE_ARN is set to this ARN before running the API.'
    )
    return
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('name' in error) ||
      error.name !== 'StateMachineDoesNotExist'
    ) {
      console.error('❌ Failed to describe Step Functions state machine.', error)
      process.exit(1)
    }
  }

  const create = (await client.send(
    new CreateStateMachineCommand({
      name: STATE_MACHINE_NAME,
      definition,
      roleArn: STATE_MACHINE_ROLE_ARN,
      type: 'STANDARD',
      tags: [
        {
          key: 'Project',
          value: 'Wage',
        },
      ],
    })
  )) as { stateMachineArn?: string }

  console.log(
    `✅ Step Functions state machine '${STATE_MACHINE_NAME}' created.\n   ARN: ${create.stateMachineArn}`
  )
  console.log(
    '   Remember to set MATCH_SETTLEMENT_STATE_MACHINE_ARN to this ARN so the API can trigger it.'
  )
}

ensureStateMachine()
  .catch(error => {
    console.error('❌ Failed to ensure Step Functions state machine:', error)
    process.exit(1)
  })
