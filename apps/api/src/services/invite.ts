import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBInviteItem } from '../models/invite.js';

export const generateInviteLink = async (
  fastify: FastifyInstance,
  senderId: string
): Promise<{
  inviteUrl: string;
  invite: DynamoDBInviteItem;
}> => {
  fastify.log.info({
    senderId,
    msg: 'Starting invite link generation',
  });

  try {
    const sender = await fastify.repositories.user.getUserById(senderId);
    if (!sender) {
      throw new Error('Sender not found');
    }

    const inviteCode = generateInviteCode();

    fastify.log.info({
      senderId,
      inviteCode,
      msg: 'Generated invite code',
    });

    const invite = await fastify.repositories.invite.createInvite(
      senderId,
      inviteCode
    );

    const baseUrl = 'https://wage.app';
    const inviteUrl = `${baseUrl}/invite/${inviteCode}`;

    return {
      inviteUrl,
      invite,
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
      senderId,
      msg: 'Error generating invite link',
    });
    throw error;
  }
};

export const getUserInvites = async (
  fastify: FastifyInstance,
  userId: string
): Promise<DynamoDBInviteItem[]> => {
  fastify.log.info({
    userId,
    msg: 'Fetching user invites',
  });

  try {
    const user = await fastify.repositories.user.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const invites = await fastify.repositories.invite.getUserInvites(userId);

    // Sort by creation date (newest first)
    const sortedInvites = invites.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    fastify.log.info({
      userId,
      inviteCount: sortedInvites.length,
      msg: 'User invites fetched successfully',
    });

    return sortedInvites;
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
      msg: 'Error fetching user invites',
    });
    throw error;
  }
};

export const processInviteAcceptance = async (
  fastify: FastifyInstance,
  inviteCode: string,
  receiverId: string
): Promise<{ success: boolean; message: string }> => {
  fastify.log.info({
    inviteCode,
    receiverId,
    msg: 'Processing invite acceptance',
  });

  try {
    const invite =
      await fastify.repositories.invite.getInviteByCode(inviteCode);
    if (!invite) {
      return { success: false, message: 'Invalid invite code' };
    }

    if (invite.status === 'ACCEPTED') {
      return { success: false, message: 'Invite already used' };
    }

    const receiver = await fastify.repositories.user.getUserById(receiverId);
    if (!receiver) {
      return { success: false, message: 'Receiver not found' };
    }

    await fastify.repositories.invite.updateInviteStatus(
      invite.senderId,
      inviteCode,
      'ACCEPTED'
    );

    // TODO: Add referral rewards logic here

    fastify.log.info({
      inviteCode,
      senderId: invite.senderId,
      receiverId,
      msg: 'Invite accepted successfully',
    });

    return {
      success: true,
      message: 'Invite accepted successfully',
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
      inviteCode,
      receiverId,
      msg: 'Error processing invite acceptance',
    });
    throw error;
  }
};

function generateInviteCode(): string {
  const uuid = uuidv4().replace(/-/g, '');
  return uuid.substring(0, 8).toUpperCase();
}
