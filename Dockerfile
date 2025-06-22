# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user for better security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm ci --only=production --omit=dev

# Copy the built application and package.json from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD [ "npm", "start" ]

