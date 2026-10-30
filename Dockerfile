# F3 Estimation Tool - production image. Runs the same on a laptop (compose.yaml) and on AWS.
# Start sequence (docker/entrypoint.sh): check settings -> apply migrations -> start server.

ARG NODE_IMAGE=node:26-bookworm-slim

# 1. Install all dependencies (also generates the Prisma client via postinstall).
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# 2. Build the Next.js standalone server.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN npm run build

# 3. Prisma CLI only (same version as the project), for running migrations at startup.
#    Kept apart from the app's small standalone node_modules.
FROM ${NODE_IMAGE} AS migrate
WORKDIR /migrate
COPY package.json /tmp/app-package.json
RUN PRISMA_VERSION=$(node -p "require('/tmp/app-package.json').devDependencies.prisma") \
 && printf '{"name":"f3-migrate","private":true,"allowScripts":{"prisma@%s":true,"@prisma/engines@%s":true}}\n' \
      "$PRISMA_VERSION" "$PRISMA_VERSION" > package.json \
 && npm install --no-audit --no-fund "prisma@$PRISMA_VERSION" \
 && rm /tmp/app-package.json
COPY prisma.config.ts ./
COPY prisma ./prisma

# 4. Runtime image.
FROM ${NODE_IMAGE} AS runner
# Prisma's migration engine needs OpenSSL, which the slim image leaves out.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Startup settings check (runs with Node's built-in TypeScript support).
COPY --chown=node:node scripts/check-env.ts ./scripts/check-env.ts
COPY --chown=node:node src/lib/env-schema.ts ./src/lib/env-schema.ts
# The standalone build bundles zod into the server code; the check script needs the package
# itself (zod has no dependencies of its own).
COPY --from=deps --chown=node:node /app/node_modules/zod ./node_modules/zod
COPY --from=migrate --chown=node:node /migrate /migrate
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
