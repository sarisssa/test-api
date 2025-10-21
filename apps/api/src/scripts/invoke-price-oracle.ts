import 'dotenv/config'
import { handler as priceOracle } from '../step-functions/handlers/price-oracle.js'

async function main() {
  const symbolsArg = process.argv.slice(2)
  const event = symbolsArg.length > 0 ? { symbols: symbolsArg } : {}
  const res = await priceOracle(event as any)
  console.log('Price Oracle result:', res)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

