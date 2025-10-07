export interface DynamoDBInviteItem {
  pk: `USER#${string}`;
  sk: `INVITE#${string}`;
  EntityType: 'Invite';
  inviteCode: string;
  senderId: string;
  receiverContactHash: string;
  status: 'SENT' | 'ACCEPTED';
  createdAt: string;
}
