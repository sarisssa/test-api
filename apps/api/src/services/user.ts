import { PutObjectCommand } from '@aws-sdk/client-s3';
import { FastifyInstance } from 'fastify';
import { DynamoDBPlayerMatchItem } from '../models/match.js';
import { DynamoDBUserItem, UserPublicProfile } from '../models/user.js';

const toPublicProfile = (user: DynamoDBUserItem): UserPublicProfile => {
  if (!user) {
    throw new Error('Cannot convert undefined user to public profile');
  }

  return {
    userId: user.userId,
    phoneNumber: user.phoneNumber,
    username: user.username,
    emailAddress: user.emailAddress,
    stats: {
      totalMatches: user.stats.totalMatches,
      wins: user.stats.wins,
      losses: user.stats.losses,
      experience: user.stats.experience,
      inGameCurrency: user.stats.inGameCurrency,
    },
    profilePictureUrl: user.profilePictureUrl,
    bio: user.bio,
    perks: user.perks,
    createdAt: user.createdAt,
    lastLoggedIn: user.lastLoggedIn,
  };
};

export const findUserByPhone = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem | undefined> => {
  return fastify.repositories.user.fetchUserByPhone(phoneNumber);
};

export const createUser = async (
  fastify: FastifyInstance,
  phoneNumber: string
): Promise<DynamoDBUserItem> => {
  try {
    return await fastify.repositories.user.persistNewUser(phoneNumber);
  } catch (error) {
    fastify.log.error({
      phoneNumber,
      error,
      msg: 'Error in createUser service',
    });
    throw error;
  }
};

export const updateUserLastLogin = async (
  fastify: FastifyInstance,
  user: DynamoDBUserItem
): Promise<void> => {
  try {
    await fastify.repositories.user.updateUserLastLoginTimestamp(user);
  } catch (error) {
    fastify.log.error({
      userId: user.userId,
      error,
      msg: 'Error in updateUserLastLogin service',
    });
    throw error;
  }
};

export const getUserProfile = async (
  fastify: FastifyInstance,
  userId: string
): Promise<UserPublicProfile | undefined> => {
  try {
    fastify.log.info({
      userId,
      msg: 'Service: Starting getUserProfile',
    });

    const user = await fastify.repositories.user.getUserById(userId);

    fastify.log.info({
      userId,
      userFound: !!user,
      msg: 'Service: User lookup result',
    });

    if (user) {
      const publicProfile = toPublicProfile(user);

      return publicProfile;
    } else {
      fastify.log.warn({
        userId,
        msg: 'Service: User not found in repository',
      });
      return undefined;
    }
  } catch (error) {
    fastify.log.error({
      userId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      msg: 'Error in getProfile service',
    });
    throw error;
  }
};

export const updateUsername = async (
  fastify: FastifyInstance,
  userId: string,
  username: string
): Promise<UserPublicProfile> => {
  try {
    const updatedUser = await fastify.repositories.user.updateUsername(
      userId,
      username
    );
    return toPublicProfile(updatedUser);
  } catch (error) {
    fastify.log.error({
      userId,
      username,
      error,
      msg: 'Error in changeUsername service',
    });
    throw error;
  }
};

export interface EnrichedPlayerMatch extends DynamoDBPlayerMatchItem {
  opponentProfilePictureUrl?: string | null;
}

export const getUserMatchHistory = async (
  fastify: FastifyInstance,
  userId: string
): Promise<EnrichedPlayerMatch[]> => {
  try {
    const matches = await fastify.repositories.user.getUserMatches(userId);

    // Enrich matches with opponent profile picture (username is already stored in PlayerMatchItem)
    const enrichedMatches = await Promise.all(
      matches.map(async match => {
        try {
          const opponent = await fastify.repositories.user.getUserById(
            match.opponentId
          );
          return {
            ...match,
            opponentProfilePictureUrl: opponent?.profilePictureUrl,
          };
        } catch (error) {
          fastify.log.warn({
            matchId: match.id,
            opponentId: match.opponentId,
            error,
            msg: 'Failed to fetch opponent profile picture for match',
          });
          return match;
        }
      })
    );

    return enrichedMatches;
  } catch (error) {
    fastify.log.error({
      userId,
      error,
      msg: 'Error in getMatchHistory service',
    });
    throw error;
  }
};

export interface UploadProfilePictureParams {
  userId: string;
  fileBuffer: Buffer;
  mimetype: string;
}

export const uploadProfilePicture = async (
  fastify: FastifyInstance,
  { userId, fileBuffer, mimetype }: UploadProfilePictureParams
): Promise<{ profilePictureUrl: string; user: UserPublicProfile }> => {
  try {
    if (!fastify.config.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME not configured');
    }

    if (!fastify.config.AWS_REGION) {
      throw new Error('AWS_REGION not configured');
    }

    const fileExtension = mimetype.split('/')[1];
    const s3Key = `profiles/${userId}/${Date.now()}.${fileExtension}`;

    await fastify.s3.send(
      new PutObjectCommand({
        Bucket: fastify.config.S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimetype,
      })
    );

    const profilePictureUrl = `https://${fastify.config.S3_BUCKET_NAME}.s3.${fastify.config.AWS_REGION}.amazonaws.com/${s3Key}`;

    const updatedUser = await fastify.repositories.user.updateProfilePicture(
      userId,
      profilePictureUrl
    );

    fastify.log.info({
      userId,
      profilePictureUrl,
      msg: 'User profile updated with new picture URL',
    });

    return {
      profilePictureUrl,
      user: toPublicProfile(updatedUser),
    };
  } catch (error) {
    fastify.log.error({
      userId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      msg: 'Error in uploadProfilePicture service',
    });
    throw error;
  }
};
