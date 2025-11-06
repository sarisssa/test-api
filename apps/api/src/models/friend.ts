export interface DynamoDBFriendItem {
  pk: `USER#${string}`;
  sk: `FRIEND#${string}`;
  EntityType: 'Friend';
  friendId: string;
  friendSince: string;
  updatedAt: string;
}

export interface DynamoDBFriendRequestItem {
  pk: `USER#${string}`;
  sk: `REQUEST#${string}`;
  EntityType: 'FriendRequest';
  requestId: string;
  senderId: string;
  receiverId: string;
  gsi1_pk: `SENDER#${string}` | `RECEIVER#${string}`;
  gsi1_sk: `REQUEST#${string}`;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  requestedAt: string;
  updatedAt: string;
  readAt?: string;
}

export interface FriendResponse {
  userId: string;
  username?: string;
  profilePictureUrl?: string;
  stats: {
    tier: string;
    experience: number;
    wins: number;
    losses: number;
  };
  friendSince: string;
}

export interface FriendRequestResponse {
  requestId: string;
  userId: string;
  username?: string;
  profilePictureUrl?: string;
  requestedAt: string;
  direction: 'incoming' | 'outgoing';
}
