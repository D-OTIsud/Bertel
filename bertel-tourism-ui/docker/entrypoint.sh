#!/bin/sh
set -eu

: "${NEXT_PUBLIC_ENABLE_DEMO_MODE:=true}"
: "${NEXT_PUBLIC_MAP_STYLE_CLASSIC:=https://demotiles.maplibre.org/style.json}"
: "${NEXT_PUBLIC_MAP_STYLE_SATELLITE:=https://tiles.openfreemap.org/styles/liberty}"
: "${NEXT_PUBLIC_MAP_STYLE_TOPO:=https://tiles.openfreemap.org/styles/bright}"

export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_ENABLE_DEMO_MODE
export NEXT_PUBLIC_MAP_STYLE_CLASSIC NEXT_PUBLIC_MAP_STYLE_SATELLITE NEXT_PUBLIC_MAP_STYLE_TOPO

envsubst < /app/public/runtime-config.template.js > /app/public/runtime-config.js

exec "$@"
