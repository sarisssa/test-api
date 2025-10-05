export enum PlayerTier {
  ROOKIE = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
  ELITE = 4,
}

export interface TierThreshold {
  tier: PlayerTier;
  name: string;
  minXP: number;
}

export const TIER_THRESHOLDS: TierThreshold[] = [
  { tier: PlayerTier.ROOKIE, name: 'Rookie', minXP: 0 },
  { tier: PlayerTier.BRONZE, name: 'Bronze', minXP: 1000 },
  { tier: PlayerTier.SILVER, name: 'Silver', minXP: 2500 },
  { tier: PlayerTier.GOLD, name: 'Gold', minXP: 6500 },
  { tier: PlayerTier.ELITE, name: 'Elite', minXP: 15000 },
];

export function calculatePlayerTier(experiencePoints: number): TierThreshold {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (experiencePoints >= TIER_THRESHOLDS[i].minXP) {
      return TIER_THRESHOLDS[i];
    }
  }
  return TIER_THRESHOLDS[0];
}

export function getTierName(tier: PlayerTier): string {
  return TIER_THRESHOLDS.find(t => t.tier === tier)?.name || 'Unknown';
}

export function getNextTierThreshold(currentXP: number): TierThreshold | null {
  const currentTier = calculatePlayerTier(currentXP);
  const nextTierIndex =
    TIER_THRESHOLDS.findIndex(t => t.tier === currentTier.tier) + 1;

  if (nextTierIndex < TIER_THRESHOLDS.length) {
    return TIER_THRESHOLDS[nextTierIndex];
  }

  return null;
}
