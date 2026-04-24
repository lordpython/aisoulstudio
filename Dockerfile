FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @studio/server... --filter @studio/shared...

COPY packages/shared packages/shared
COPY packages/server packages/server

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/packages/server
CMD ["pnpm", "start"]
