FROM node:22-alpine AS builder
WORKDIR /app

# Build-time env for Next.js (required for npm run build)
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_ENABLE_DEMO_MODE=true
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
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache gettext libc6-compat

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=builder /app/.next/standalone /app
COPY --from=builder /app/.next/static /app/.next/static
COPY --from=builder /app/public /app/public

RUN chmod +x /entrypoint.sh

WORKDIR /app

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
