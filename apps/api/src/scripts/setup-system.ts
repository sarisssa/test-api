import 'dotenv/config'

import {
  DYNAMODB_ENDPOINT,
  DYNAMODB_TABLE,
  REDIS_URL,
  ensureDynamoTable as ensureDynamoTableTask,
  ensureStepFunctionsStateMachine as ensureStepFunctionsStateMachineTask,
  seedCommodityAssets,
  seedCryptoAssets,
  seedStocks as seedStocksTask,
  shutdownSystemPrep,
  verifyRedis as verifyRedisTask
} from './lib/system-prep.js'

async function main() {
  console.log('🔧 Preparing Wage system dependencies...')
  console.log(`   DynamoDB endpoint: ${DYNAMODB_ENDPOINT}`)
  console.log(`   DynamoDB table: ${DYNAMODB_TABLE}`)
  console.log(`   Redis URL: ${REDIS_URL}`)

  await ensureDynamoTableTask()
  await ensureStepFunctionsStateMachineTask()

  const redis = await verifyRedisTask()
  redis.disconnect()

  await seedStocksTask()
  await seedCryptoAssets()
  await seedCommodityAssets()

  shutdownSystemPrep()
  console.log('✅ Environment prep complete.')
  console.log('   You can now run the API and optional system tests.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ System setup failed:', error)
    process.exit(1)
  })
}
