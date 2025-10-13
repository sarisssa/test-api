export interface DynamoDBPerkItem {
  pk: `PERK#${string}`;
  sk: 'METADATA';
  EntityType: 'Perk';
  name: string;
  chipsCost: number;
  class: 'Default' | 'Basic' | 'Mid' | 'Elite';
  minimumPlayerTier: number;
  description?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
