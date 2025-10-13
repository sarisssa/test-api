import { FastifyInstance } from 'fastify';
import { DynamoDBPerkItem } from '../models/perk.js';
import { calculatePlayerTier, getTierName } from '../utils/player-tier.js';

export const getAllPerks = async (
  fastify: FastifyInstance
): Promise<DynamoDBPerkItem[]> => {
  try {
    return await fastify.repositories.perk.getAllPerks();
  } catch (error) {
    fastify.log.error({
      error,
      msg: 'Error in getAllPerks service',
    });
    throw error;
  }
};

export const getUserPerks = async (
  fastify: FastifyInstance,
  userId: string
): Promise<
  {
    id: string;
    quantity: number;
  }[]
> => {
  try {
    const user = await fastify.repositories.user.getUserById(userId);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (!user.perks) {
      throw new Error(`User perks not found: ${userId}`);
    }
    const userPerks = [];

    for (const [perkId, perkData] of Object.entries(user.perks)) {
      const perk = await fastify.repositories.perk.getPerkById(perkId);
      if (perk) {
        userPerks.push({
          id: perkId,
          quantity: perkData.quantity,
        });
      }
    }

    return userPerks;
  } catch (error) {
    fastify.log.error({
      error,
      userId,
      msg: 'Error in getUserPerks service',
    });
    throw error;
  }
};

export const buyPerk = async (
  fastify: FastifyInstance,
  userId: string,
  perkId: string
): Promise<{
  message: string;
  newBalance?: number;
  reason?: 'TIER_REQUIREMENT' | 'INSUFFICIENT_FUNDS';
}> => {
  try {
    const [user, perk] = await Promise.all([
      fastify.repositories.user.getUserById(userId),
      fastify.repositories.perk.getPerkById(perkId),
    ]);
    if (!user) {
      fastify.log.warn({
        userId,
        msg: 'User not found during perk purchase',
      });
      return { message: 'User not found' };
    }

    if (!perk) {
      fastify.log.warn({
        perkId,
        msg: 'Perk not found during purchase',
      });
      return { message: 'Perk not found' };
    }

    const currentBalance = user.stats.inGameCurrency;

    const playerTier = calculatePlayerTier(user.stats.experience);
    if (playerTier.tier < perk.minimumPlayerTier) {
      const requiredTierName = getTierName(perk.minimumPlayerTier);
      fastify.log.warn({
        userId,
        perkId,
        currentTier: playerTier.name,
        requiredTier: requiredTierName,
        currentXP: user.stats.experience,
        msg: 'Insufficient player tier for perk purchase',
      });
      return {
        message: `This perk requires ${requiredTierName} tier (${perk.minimumPlayerTier}). Current tier: ${playerTier.name}`,
        reason: 'TIER_REQUIREMENT',
      };
    }

    if (currentBalance < perk.chipsCost) {
      fastify.log.warn({
        userId,
        perkId,
        currentBalance,
        requiredCost: perk.chipsCost,
        msg: 'Insufficient funds for perk purchase',
      });
      return {
        message: `Insufficient chips. Need ${perk.chipsCost}, have ${currentBalance}`,
        reason: 'INSUFFICIENT_FUNDS',
      };
    }

    const newBalance = currentBalance - perk.chipsCost;
    const purchasedAt = new Date().toISOString();

    const currentPerks = user.perks || {};
    const existingPerk = currentPerks[perkId];

    const updatedPerks = {
      ...currentPerks,
      [perkId]: {
        purchasedAt: existingPerk ? existingPerk.purchasedAt : purchasedAt,
        quantity: existingPerk ? existingPerk.quantity + 1 : 1,
      },
    };

    await fastify.repositories.user.updateUserPerksAndCurrency(
      userId,
      updatedPerks,
      newBalance
    );

    fastify.log.info({
      userId,
      perkId,
      perkName: perk.name,
      cost: perk.chipsCost,
      newBalance,
      msg: 'Perk purchased successfully',
    });

    return {
      message: `Successfully purchased ${perk.name}`,
      newBalance,
    };
  } catch (error) {
    fastify.log.error({
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      userId,
      perkId,
      msg: 'Error in buyPerk service',
    });
    throw error;
  }
};
