import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { Match } from '../types'
import { ddb } from './aws-clients.js'

const WAGE_TABLE_NAME = process.env.WAGE_TABLE_NAME || 'WageTable'

export const getActiveMatches = async (): Promise<Match[]> => {
  console.log('Attempting DynamoDB scan for active matches...')
  const scanParams = {
    TableName: WAGE_TABLE_NAME,
    FilterExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'in_progress'
    }
  }

  const { Items: matches = [] } = await ddb.scan(scanParams)
  console.log(`DynamoDB scan complete. Found ${matches.length} active matches.`)
  return matches as Match[]
}

export const saveMatch = async (match: Match): Promise<void> => {
  try {
    await ddb.send(
      new PutCommand({
        TableName: WAGE_TABLE_NAME,
        Item: match
      })
    )
    console.log(`Successfully updated match ${match.matchId}`)
  } catch (updateError) {
    console.error(`Failed to update match ${match.matchId}:`, updateError)
    throw updateError
  }
}

export const saveUpdatedMatches = async (updatedMatches: Match[]): Promise<void> => {
  if (updatedMatches.length === 0) {
    console.log('No matches required updates.')
    return
  }

  console.log(`=== SAVING ${updatedMatches.length} UPDATED MATCHES ===`)
  for (const match of updatedMatches) {
    await saveMatch(match)
  }
}
