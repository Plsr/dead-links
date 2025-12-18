# Base stage with pnpm (for web)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /app

# Base stage for worker (with Playwright browsers)
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS base-playwright
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /app

# Dependencies stage for web
FROM base AS deps-web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY worker/package.json ./worker/
RUN pnpm install --frozen-lockfile --filter web

# Dependencies stage for worker
FROM base-playwright AS deps-worker
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY worker/package.json ./worker/
RUN pnpm install --frozen-lockfile --filter worker

# Build stage for web
FROM base AS build-web
COPY --from=deps-web /app/node_modules ./node_modules
COPY --from=deps-web /app/web/node_modules ./web/node_modules
COPY . .
RUN pnpm --filter web build

# Build stage for worker
FROM base-playwright AS build-worker
COPY --from=deps-worker /app/node_modules ./node_modules
COPY --from=deps-worker /app/worker/node_modules ./worker/node_modules
COPY . .
RUN pnpm --filter worker build

# Production stage for web
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build-web /app/web/.next/standalone ./
COPY --from=build-web /app/web/.next/static ./web/.next/static
COPY --from=build-web /app/web/public ./web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "web/server.js"]

# Production stage for worker
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS worker
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build-worker /app/worker/dist ./dist
COPY --from=deps-worker /app/worker/node_modules ./node_modules

CMD ["node", "dist/index.js"]
