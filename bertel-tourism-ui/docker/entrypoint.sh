#!/bin/sh
set -eu

: "${NEXT_PUBLIC_ENABLE_DEMO_MODE:=false}"
: "${NEXT_PUBLIC_MAP_STYLE_CLASSIC:=https://demotiles.maplibre.org/style.json}"
: "${NEXT_PUBLIC_MAP_STYLE_SATELLITE:=https://tiles.openfreemap.org/styles/liberty}"
: "${NEXT_PUBLIC_MAP_STYLE_TOPO:=https://tiles.openfreemap.org/styles/bright}"

# Fail closed: outside demo mode the app needs a real Supabase backend, or it would
# silently serve the reader an unconfigured/blank instance instead of an operator-visible error.
if [ "$NEXT_PUBLIC_ENABLE_DEMO_MODE" != "true" ]; then
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
    echo "entrypoint: NEXT_PUBLIC_ENABLE_DEMO_MODE is not 'true' but NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Set both, or set NEXT_PUBLIC_ENABLE_DEMO_MODE=true to run in demo mode." >&2
    exit 1
  fi
fi

export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_ENABLE_DEMO_MODE
export NEXT_PUBLIC_MAP_STYLE_CLASSIC NEXT_PUBLIC_MAP_STYLE_SATELLITE NEXT_PUBLIC_MAP_STYLE_TOPO

envsubst < /app/public/runtime-config.template.js > /app/public/runtime-config.js

exec "$@"
