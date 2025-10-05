export interface DynamoDBPerkItem {
  pk: `PERK#${string}`;
  sk: 'METADATA';
  EntityType: 'Perk';
  perkName: string;
  chipsCost: number;
  perkClass: 'Default' | 'Basic' | 'Mid' | 'Elite';
  requiredPlayerTier: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
