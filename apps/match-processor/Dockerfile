# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/match-processor/package.json ./apps/match-processor/
COPY packages/wage-shared/package.json ./packages/wage-shared/
RUN npm ci

COPY . .

WORKDIR /app/apps/match-processor
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

COPY package*.json ./
COPY apps/match-processor/package.json ./apps/match-processor/
COPY packages/wage-shared/package.json ./packages/wage-shared/
RUN npm ci --only=production --omit=dev

COPY --from=builder /app/apps/match-processor/dist ./apps/match-processor/dist
WORKDIR /app/apps/match-processor

EXPOSE 3001

CMD ["npm", "start"]
