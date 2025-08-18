# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/wage-shared/package.json ./packages/wage-shared/
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the TypeScript code
WORKDIR /app/apps/api
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files and install ONLY production dependencies
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/wage-shared/package.json ./packages/wage-shared/
RUN npm ci --only=production --omit=dev

# Copy the built application and package.json from the builder stage
COPY --from=builder /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api

EXPOSE 3000

CMD [ "npm", "start" ]

