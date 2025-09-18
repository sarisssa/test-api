import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi'

export type SendToConnectionParams = {
  domainName: string
  stage: string
  connectionId: string
  data: unknown
}

export const sendToConnection = async ({
  domainName,
  stage,
  connectionId,
  data
}: SendToConnectionParams): Promise<void> => {
  const client = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`
  })
  const payload = Buffer.from(
    typeof data === 'string' ? data : JSON.stringify(data)
  )
  await client.send(
    new PostToConnectionCommand({ ConnectionId: connectionId, Data: payload })
  )
}

