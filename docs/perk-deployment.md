# Perk Deployment WebSocket Action

## Overview

The system now supports deploying perks during an active match via WebSocket. This document describes the implementation and how to use it.

## WebSocket Action

### Action Name: `deploy_perk`

### Request Schema

```typescript
{
  action: "deploy_perk",
  payload: {
    matchId: string,      // Required: The match ID
    perkId: string,       // Required: The perk ID (e.g., "ICE", "FLAME", etc.)
    targetPlayerId?: string,  // Optional: Target player (defaults to self)
    targetTicker?: string     // Optional: Target asset ticker (for single-asset perks)
  }
}
```

### Response Schema

Success response:

```typescript
{
  ok: true,
  action: "deploy_perk",
  matchId: string,
  perkId: string
}
```

Error response:

```typescript
{
  ok: false,
  error: string,
  action: "deploy_perk"
}
```

## Implementation Details

### Validation Rules

1. **Inventory Check**: Verifies that `DynamoDBUserItem.perks[perkId].quantity > 0`
2. **Deployment Limit**: Ensures `PlayerAssetSelection.deployedPerks.length < 3`
3. **Match Status**: Only allows deployment when match status is `in_progress`
4. **Access Control**: Validates that the user is a participant in the match

### Atomic Operations

The implementation uses atomic operations to ensure data consistency:

1. **User Inventory Decrement**: Atomically decrements the perk count using DynamoDB conditional expressions
   - Condition: `attribute_exists(perks.#perkId) AND perks.#perkId.quantity >= 1`
   - Update: `SET perks.#perkId.quantity = perks.#perkId.quantity - 1`

2. **Match Update**: Atomically adds the deployed perk to the match
   - Condition: `match status = 'in_progress' AND deployedPerks.length < 3`
   - Update: Appends the new `DeployedPerk` to `PlayerAssetSelection.deployedPerks`

### Broadcast

After successful deployment, the system broadcasts to all players in the match:

```typescript
{
  type: "perk_deployed",
  matchId: string,
  userId: string,
  perkId: string,
  targetPlayerId: string,
  targetTicker?: string,
  playerAssets: PlayerAssetSelections,
  timestamp: number
}
```

## Data Structures

### DeployedPerk

```typescript
interface DeployedPerk {
  perkType: PerkType
  deployedAt: string // ISO timestamp
  targetPlayerId: string
  targetTicker?: string // Only for single-asset perks
}
```

### PlayerAssetSelection

```typescript
interface PlayerAssetSelection {
  assets: PlayerAsset[]
  deployedPerks: DeployedPerk[] // Max length: 3
  readyAt?: string
  performanceModifierPercent: number // For THIEF perk effects
}
```

## Error Handling

The system handles various error cases:

1. **Insufficient Inventory**: Returns error if user doesn't have the perk
2. **Deployment Limit Reached**: Returns error if player already deployed 3 perks
3. **Invalid Match Status**: Returns error if match is not in progress
4. **Concurrent Modifications**: Uses conditional expressions to prevent race conditions
5. **Partial Failure Handling**: Logs rollback requirements if match update fails after inventory consumption

## Example Usage

### JavaScript/TypeScript Client

```typescript
// Deploy an ICE perk to freeze an opponent's asset
websocket.send(
  JSON.stringify({
    action: 'deploy_perk',
    payload: {
      matchId: 'abc123',
      perkId: 'ICE',
      targetPlayerId: 'opponent-user-id',
      targetTicker: 'AAPL'
    }
  })
)

// Deploy a WIPE perk (no target needed)
websocket.send(
  JSON.stringify({
    action: 'deploy_perk',
    payload: {
      matchId: 'abc123',
      perkId: 'WIPE'
    }
  })
)
```

## Files Modified

1. **`apps/api/src/types/match.ts`**
   - Refactored `PlayerAsset` to use discriminated unions for perk states
   - Ensures type safety for perk-related fields

2. **`apps/api/src/repositories/user-repository.ts`**
   - Added `decrementPerkInventory()` method
   - Implements atomic decrement with conditional checks

3. **`apps/api/src/repositories/match-repository.ts`**
   - Added `addDeployedPerk()` method
   - Updated match initialization to include `deployedPerks` and `performanceModifierPercent`

4. **`apps/api/src/services/match.ts`**
   - Added `handlePerkDeployment()` service function
   - Orchestrates the full deployment flow with validation and broadcasting

5. **`apps/api/src/ws/actions.ts`**
   - Added `DeployPerkSchema` for request validation
   - Added `deployPerkHandler` and wired it to the `deploy_perk` action

## Future Enhancements

Consider implementing:

1. **Rollback Mechanism**: Proper compensation if match update fails after inventory consumption
2. **Perk Effect Processing**: Apply the actual perk effects to the match state
3. **Perk Duration Tracking**: For time-limited perks like FORTRESS
4. **Perk Interaction Logic**: Handle perk combinations (e.g., FLAME removing ICE)
