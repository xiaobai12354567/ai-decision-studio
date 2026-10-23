FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Prisma needs a URL to load its config; building does not connect to this database.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run build

FROM base AS runner
ENV NODE_ENV=production
# Keep the Prisma CLI and migrations for the startup command in compose.yml.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
