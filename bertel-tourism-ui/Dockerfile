FROM node:22-alpine AS builder
WORKDIR /app

# Build-time env for Next.js (required for npm run build)
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_ENABLE_DEMO_MODE=false
ARG NEXT_PUBLIC_MAP_STYLE_CLASSIC=https://demotiles.maplibre.org/style.json
ARG NEXT_PUBLIC_MAP_STYLE_SATELLITE=https://tiles.openfreemap.org/styles/liberty
ARG NEXT_PUBLIC_MAP_STYLE_TOPO=https://tiles.openfreemap.org/styles/bright

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_ENABLE_DEMO_MODE=$NEXT_PUBLIC_ENABLE_DEMO_MODE \
    NEXT_PUBLIC_MAP_STYLE_CLASSIC=$NEXT_PUBLIC_MAP_STYLE_CLASSIC \
    NEXT_PUBLIC_MAP_STYLE_SATELLITE=$NEXT_PUBLIC_MAP_STYLE_SATELLITE \
    NEXT_PUBLIC_MAP_STYLE_TOPO=$NEXT_PUBLIC_MAP_STYLE_TOPO \
    NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_TELEMETRY_DISABLED=1

# Common runtime compatibility for Next.js deps on Alpine (e.g. sharp)
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
# Keep the same lockfile installation options as CI. Next.js 16.2.11 pins
# @swc/helpers to 0.5.15, while @storybook/test-runner's @swc/core declares
# an optional peer >=0.5.17. --legacy-peer-deps preserves the lockfile tree
# despite this peer range mismatch; it is an explicit installation option.
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache gettext libc6-compat

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=builder --chown=node:node /app/.next/standalone /app
COPY --from=builder --chown=node:node /app/.next/static /app/.next/static
COPY --from=builder --chown=node:node /app/public /app/public

# Windows checkouts can contain CRLF; the Linux shebang must use LF.
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

WORKDIR /app

# Non-root runtime: entrypoint.sh regenerates public/runtime-config.js on every
# start (envsubst), so that path — copied with --chown above — must stay writable by "node".
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
