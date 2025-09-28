# Frontend Integration: HTTP API

This reference explains the Fastify API surface so the client experience can stay consistent. All endpoints return JSON; status codes follow standard REST patterns. Use HTTPS in cloud environments.

## Authentication

### POST `/auth/send-otp`
- **Body**: `{ "phoneNumber": "+15555551212" }`
- **Success**: `200` with `{ "message": "OTP sent successfully" }`
- **Failures**: `500` with `{ message, error }` when Twilio Verify rejects the request or validation fails. Errors are logged server-side for investigation.

### POST `/auth/verify-otp`
- **Body**: `{ "phoneNumber": "+15555551212", "code": "123456" }`
- **Success**: `200` with `{ message, token, user }`
  - `token` is a JWT signed with `JWT_SECRET` and contains `userId` + `phoneNumber`.
  - `user` is the public profile object described below.
- **Failures**: `500` with a generic message when the code is invalid or a persistence error occurs. Detailed causes are logged only on the server.

## REST Endpoints

### GET `/health`
- Returns `{ status: 'ok', redis: {...}, version, uptime }` for readiness checks.

### GET `/assets`
- Query parameters: `search` (partial ticker/name match), `limit` (default 20), optional `type` (`STOCK | CRYPTO | COMMODITY`).
- Returns an array of asset records pulled from DynamoDB.
- Fails with `500` if the scan throws an exception.

### GET `/assets/:ticker`
- Returns the full asset record for a specific ticker.
- Responds with `404` if the item is missing.

### GET `/assets/:symbol/price`
- Returns `{ ticker, price, lastUpdated }`.
- Responds with `404` when the ticker has not been seeded.
- Responds with `500` on DynamoDB errors; the `researchCount` increment is best-effort and failures are logged as warnings.

### GET `/user`
- Query parameter `userId` is required (JWT enforcement is planned later).
- Returns the public profile or `404` if the user does not exist.
- `400` when `userId` is missing; `500` for unexpected errors.

### PUT `/user/username`
- Body: `{ "userId": "uuid", "username": "NewName" }`.
- Returns the updated public profile.
- Errors: `400` invalid payload, `404` user missing, `409` username already taken, `500` fallback.

### PUT `/user/profileImage`
- Currently returns `501` (`{"error":"Profile image update not implemented yet"}`) to signal that the upload flow is pending.

### GET `/user/matches`
- Requires `userId` query parameter.
- Returns `{ matches: [...], total }`, where each entry mirrors the `DynamoDBPlayerMatchItem` structure (`matchId`, `opponent`, `result`, timestamps).
- Errors: `400`, `404`, or `500` mirroring the profile endpoint.

## Error Handling Pattern
- Validation problems → `400` with a short `error` string (e.g., `"userId query parameter is required"`).
- Authentication gaps (future JWT validation) → will become `401`.
- Resource conflicts → `409` (e.g., duplicate username).
- Missing resources → `404`.
- Unhandled exceptions → `500` with generic text. Detailed stack traces remain in Fastify logs only.
- WebSocket actions reuse the same underlying services; when errors occur, they emit `{ ok: false, error: 'internal_error' }` and log the full cause.

## Response Shapes

### Public User Profile
```json
{
  "phoneNumber": "+15555551212",
  "username": "TraderOne",
  "emailAddress": null,
  "experiencePoints": 0,
  "stats": { "totalMatches": 0, "wins": 0, "losses": 0 },
  "profile": { "profilePictureUrl": null, "bio": null }
}
```

### Asset Record (from `/assets`)
```json
{
  "PK": "ASSET#STOCK",
  "SK": "AAPL",
  "EntityType": "Asset",
  "AssetType": "STOCK",
  "Symbol": "AAPL",
  "name": "Apple Inc.",
  "currentPrice": 123.45,
  "lastUpdated": "2025-01-01T00:00:00.000Z",
  "researchCount": 5
}
```

### Price Polling Response
```json
{ "ticker": "AAPL", "price": 123.45, "lastUpdated": "2025-01-01T00:00:00.000Z" }
```

## Client Responsibilities
- Store the JWT returned by `/auth/verify-otp`; attach it as a query parameter when opening a WebSocket (`/ws?token=<jwt>`). REST routes still accept `userId` explicitly until JWT enforcement is completed.
- Handle `500` responses with retry/backoff UI. The backend logs contain the root cause but do not expose it to clients.
- Validate all payloads client-side (sanitise usernames, format phone numbers) to avoid unnecessary 400 responses.
- Treat `404` responses as missing data and offer user guidance (e.g., prompt to seed assets when running against LocalStack).

Refer to `match-lifecycle.md` for WebSocket actions, state transitions, and match-related event payloads.
