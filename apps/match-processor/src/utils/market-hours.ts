import { AssetType } from '../types.js'

export const isStockMarketOpen = (): boolean => {
  const now = new Date()
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  const dayOfWeek = easternTime.getDay() // 0 = Sunday, 6 = Saturday
  const hour = easternTime.getHours()
  const minute = easternTime.getMinutes()
  const timeInMinutes = hour * 60 + minute

  // Monday = 1, Friday = 5
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5

  // Market hours: 9:30 AM to 4:00 PM ET
  const marketOpen = 9 * 60 + 30 // 9:30 AM in minutes
  const marketClose = 16 * 60 // 4:00 PM in minutes

  const isMarketHours = timeInMinutes >= marketOpen && timeInMinutes < marketClose

  return isWeekday && isMarketHours
}

//TODO: Implement granular logic for commodity market hours
export const isCommodityMarketOpen = (): boolean => {
  return isStockMarketOpen()
}

export const shouldFetchAssetType = (assetType: AssetType): boolean => {
  switch (assetType) {
    case AssetType.CRYPTO:
      return true // Crypto markets are always open
    case AssetType.STOCK:
      return isStockMarketOpen()
    case AssetType.COMMODITY:
      return isCommodityMarketOpen()
    default:
      return false
  }
}

export const filterTickersByMarketHours = (
  tickersWithTypes: Array<{ ticker: string; assetType: AssetType }>
): string[] => {
  const activeTickerData = tickersWithTypes.filter(({ assetType }) =>
    shouldFetchAssetType(assetType)
  )
  const activeTickers = activeTickerData.map(({ ticker }) => ticker)

  if (activeTickers.length < tickersWithTypes.length) {
    const filteredOut = tickersWithTypes.length - activeTickers.length
    console.log(
      `Market hours filter: ${activeTickers.length} active tickers, ${filteredOut} filtered out`
    )
  }

  return activeTickers
}
