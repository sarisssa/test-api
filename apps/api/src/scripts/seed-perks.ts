import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { config } from 'dotenv';
import { DynamoDBPerkItem } from '../models/perk.js';

config();

const TABLE_NAME = 'wage-main-dev';

const client = new DynamoDBClient({
  region: 'us-east-1',
});

const dynamodb = DynamoDBDocumentClient.from(client);

interface PerkSeedData {
  perkName: string;
  chipsCost: number;
  perkClass: 'Default' | 'Basic' | 'Mid' | 'Elite';
  requiredPlayerTier: number;
  description?: string;
}

const perkData: PerkSeedData[] = [
  {
    perkName: 'Guard',
    chipsCost: 50,
    perkClass: 'Basic',
    requiredPlayerTier: 1,
    description:
      'Raise your defenses before the market strikes. Guard is a preemptive shield, blocking the impact of a single enemy perk on one of your assets. ',
  },
  {
    perkName: 'Ice',
    chipsCost: 50,
    perkClass: 'Basic',
    requiredPlayerTier: 1,
    description:
      'Cold, calm and calculated. Ice freezes the price of any asset — lock in the price while your opponent scrambles.',
  },
  {
    perkName: 'Flame',
    chipsCost: 50,
    perkClass: 'Basic',
    requiredPlayerTier: 1,
    description:
      'Break the ice. Flame thaws a frozen asset, bringing it back to life and putting you on the offense again.',
  },
  {
    perkName: 'Shadow',
    chipsCost: 25,
    perkClass: 'Default',
    requiredPlayerTier: 0,
    description:
      'Hide in plain sight. Shadow cloaks your next move, hiding your asset name and performance from your opponent.',
  },
  {
    perkName: 'Spotlight',
    chipsCost: 25,
    perkClass: 'Default',
    requiredPlayerTier: 0,
    description:
      'Reveal the truth. Spotlight brings a hidden asset into view. In this arena, no secret is hidden forever.',
  },
  {
    perkName: 'Flip',
    chipsCost: 100,
    perkClass: 'Mid',
    requiredPlayerTier: 2,
    description:
      'Flip the script. Flip turns a gain into loss or vice versa by inverting your price. Use it to forge your own short position—or to twist an opponent’s fortune against them.',
  },
  {
    perkName: 'Juiced',
    chipsCost: 50,
    perkClass: 'Basic',
    requiredPlayerTier: 1,
    description:
      'Hit the Juice and fuel your asset growth by 2x -  just remember, every high brings a harder crash.',
  },
  {
    perkName: 'Fortress',
    chipsCost: 100,
    perkClass: 'Mid',
    requiredPlayerTier: 2,
    description:
      'Lock the game down. Fortress  prevents any new perks from affecting it. It provides protection for 20% of total match time.',
  },
  {
    perkName: 'Wipe',
    chipsCost: 150,
    perkClass: 'Elite',
    requiredPlayerTier: 3,
    description:
      'Level the playing field. Wipe clears every perk in play—yours included—resetting the field to nothing but pure market instinct.',
  },
  {
    perkName: 'Assassin',
    chipsCost: 150,
    perkClass: 'Elite',
    requiredPlayerTier: 3,
    description: `Strike fast and neutralize the target. Assassin eliminates one asset from your opponent’s portfolio without warning.`,
  },
  {
    perkName: 'Thief',
    chipsCost: 150,
    perkClass: 'Elite',
    requiredPlayerTier: 3,
    description:
      'Victory isn’t always earned—it’s taken. Thief steals 1% of your opponent’s total and adds it to your own. ',
  },
];

function transformPerkToDynamoDB(perk: PerkSeedData): DynamoDBPerkItem {
  const now = new Date().toISOString();

  return {
    pk: `PERK#${perk.perkName.toUpperCase()}`,
    sk: 'METADATA',
    EntityType: 'Perk',
    perkName: perk.perkName,
    chipsCost: perk.chipsCost,
    perkClass: perk.perkClass,
    requiredPlayerTier: perk.requiredPlayerTier,
    description: perk.description,
    createdAt: now,
    updatedAt: now,
  };
}

async function batchWrite(items: DynamoDBPerkItem[]) {
  const BATCH_SIZE = 25;
  const batches = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  console.log(`Writing ${items.length} perks in ${batches.length} batches...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} (${batch.length} perks)...`
    );

    const writeRequests = batch.map(item => ({
      PutRequest: {
        Item: item,
      },
    }));

    try {
      await dynamodb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: writeRequests,
          },
        })
      );
      console.log(`✅ Batch ${i + 1} completed`);
    } catch (error) {
      console.error(`❌ Error writing batch ${i + 1}:`, error);
      throw error;
    }
  }
}

async function seedPerks() {
  console.log('🎮 Starting perk seeding...');

  try {
    const perkItems = perkData.map(transformPerkToDynamoDB);

    await batchWrite(perkItems);

    console.log(`\n🎉 Successfully seeded ${perkItems.length} perks!`);
  } catch (error) {
    console.error('💥 Fatal error during perk seeding:', error);
    process.exit(1);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPerks()
    .then(() => {
      console.log('✨ Perk seeding completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export { seedPerks };
