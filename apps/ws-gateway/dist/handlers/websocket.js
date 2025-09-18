import jwt from 'jsonwebtoken';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ddbDoc = DynamoDBDocument.from(new DynamoDBClient({}));
const getToken = (event) => {
    // Read ?token first, then Authorization: Bearer ...
    const fromQuery = event.queryStringParameters?.token;
    if (fromQuery)
        return fromQuery;
    // Handle lower/uppercased header keys
    const auth = event.headers?.authorization || event.headers?.Authorization;
    if (!auth)
        return undefined;
    const parts = auth.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0]))
        return parts[1];
    return undefined;
};
const verifyToken = (token) => {
    if (!token || !JWT_SECRET)
        return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
};
const mgmtClientFor = (domainName, stage) => new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
const ok = (body) => ({ statusCode: 200, body: body ? JSON.stringify(body) : undefined });
const bad = (code, message) => ({ statusCode: code, body: JSON.stringify({ message }) });
const onConnect = async (event) => {
    const { connectionId = '', domainName = '', stage = '' } = event.requestContext;
    const token = getToken(event);
    const claims = verifyToken(token);
    if (!claims) {
        return bad(401, 'Unauthorized');
    }
    const userId = (claims.userId || claims.sub);
    if (!userId) {
        return bad(400, 'Token missing userId/sub claim');
    }
    if (process.env.IS_OFFLINE === 'true') {
        // Skip DynamoDB write during local offline runs
    }
    else {
        await ddbDoc.send(new PutCommand({
            TableName: CONNECTIONS_TABLE,
            Item: {
                connectionId,
                userId,
                domainName,
                stage,
                connectedAt: new Date().toISOString()
            }
        }));
    }
    try {
        const mgmt = mgmtClientFor(domainName, stage);
        await mgmt.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify({ type: 'connected', userId }))
        }));
    }
    catch { }
    return ok({ connected: true });
};
const onDisconnect = async (event) => {
    const { connectionId = '' } = event.requestContext;
    if (process.env.IS_OFFLINE === 'true') {
        // Skip DynamoDB delete during local offline runs
    }
    else {
        await ddbDoc.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
    }
    return ok({ disconnected: true });
};
const forwardToInternalApi = async (event, parsed) => {
    if (!INTERNAL_API_URL)
        return { status: 202, body: 'No INTERNAL_API_URL configured; message dropped' };
    const url = `${INTERNAL_API_URL.replace(/\/$/, '')}/ws/inbound`;
    const payload = {
        action: parsed?.action ?? 'message',
        payload: parsed?.payload ?? null,
        connectionId: event.requestContext.connectionId,
        userId: parsed?.userId,
        requestContext: {
            domainName: event.requestContext.domainName,
            stage: event.requestContext.stage
        }
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    return { status: res.status, body: text };
};
const onDefault = async (event) => {
    const { connectionId = '', domainName = '', stage = '' } = event.requestContext;
    let parsed = null;
    try {
        parsed = event.body ? JSON.parse(event.body) : {};
    }
    catch {
        return bad(400, 'Invalid JSON payload');
    }
    const forwardResult = await forwardToInternalApi(event, parsed);
    try {
        const mgmt = mgmtClientFor(domainName, stage);
        await mgmt.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify({ type: 'ack', status: forwardResult.status }))
        }));
    }
    catch { }
    return ok({ proxied: true, status: forwardResult.status });
};
export const handler = async (event) => {
    const route = event.requestContext.routeKey;
    switch (route) {
        case '$connect':
            return onConnect(event);
        case '$disconnect':
            return onDisconnect(event);
        default:
            return onDefault(event);
    }
};
//# sourceMappingURL=websocket.js.map