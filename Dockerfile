# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 21080

CMD ["node", "dist/index.js"]

# Development stage with hot reload support
FROM node:20-alpine AS development

WORKDIR /app

# Install tsx for TypeScript execution
RUN npm install -g tsx

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Create writable temp directory for tsx
RUN mkdir -p /app/tmp && chmod 777 /app/tmp
ENV TMPDIR=/app/tmp

EXPOSE 21080

# Use tsx for hot reload in development
CMD ["tsx", "watch", "src/index.ts"]