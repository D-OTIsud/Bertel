# Content-Security-Policy — inventaire des origines (R2, tranche 4/4)

**Date** : 2026-07-01 · **Source du plan** : `2026-06-30-api-fix-plan.md` (R2) · **Contrainte n°1 du PO** : *ne casser aucun accès nécessaire au front.*

> Dernière tranche de **R2** (durcissement du bord). Méthode imposée : **Report-Only d'abord**, inventaire des origines contre l'usage **réel** du front, vérification **zéro violation** dans l'app tournante, **puis** enforce. Policy portée par `next.config.ts` (en-tête statique `headers()`, s'applique à `/:path*`).

---

## Origines réellement chargées (vérifiées dans l'app tournante)

| Ressource | Origine | Directive CSP | Preuve |
|---|---|---|---|
| JS / CSS / API internes | `'self'` | `default-src` / `script-src` / `style-src` / `connect-src` | app Next |
| **Polices** (Manrope/Sora/IBM Plex Mono) | `'self'` (auto-hébergées `next/font/google` → `/_next/static/media/*.woff2`) | `font-src 'self'` | réseau : 4 `.woff2` en `200`. **Pas** de `fonts.googleapis`/`fonts.gstatic`. *(La mention « Geist » du plan était obsolète.)* |
| Hydratation Next SSR + bootstrap `runtime-config.js` (`beforeInteractive`) | inline | `script-src 'unsafe-inline'` | `runtime-config.js` sert de fichier `'self'` ; l'hydratation Next injecte des scripts inline |
| Styles inline (Next, MapLibre, attributs `style`, SVG glyphes de `map-markers`) | inline | `style-src 'unsafe-inline'` | 2 `dangerouslySetInnerHTML` = SVG interne contrôlé (pas de script) |
| Worker **MapLibre GL** | `blob:` | `worker-src 'self' blob:` | maplibre peut instancier son worker depuis un Blob (selon build) |
| Worker **PDF.js** | `/pdf.worker.min.mjs` | `worker-src 'self'` | fichier servi depuis `public/` |
| Styles + tuiles + glyphs + sprites carte | `demotiles.maplibre.org`, `tiles.openfreemap.org` | `connect-src` (+ `img-src` par sûreté) | réseau : **6 requêtes `tiles.openfreemap.org` en `200`**, carte rendue (canvas MapLibre présent) |
| Supabase REST/RPC + **Realtime** + Storage | `https://*.supabase.co` + `wss://*.supabase.co` | `connect-src` / `img-src` | prod (démo local = pas de Supabase) — couvert par construction |
| Géocodage **BAN** (autocomplete + bouton §02) | `api-adresse.data.gouv.fr` | `connect-src` | `fetch` client dans `geocode-address.ts` |
| Favicons plateformes (ContactCard/drawer) | `icons.duckduckgo.com` | `img-src` | `<img src>` dans `web-platform.ts` |
| Images démo | `images.unsplash.com` | `img-src` | réseau : **11 images en `200`** (mode démo local) |
| Previews upload / canvas / SVG data | `blob:` `data:` | `img-src blob: data:` | `URL.createObjectURL` (photo acteur/CRM, upload média) |

### Origines écartées après vérification
- **Fournisseurs IA** (`openrouter.ai`, `api.groq.com`) : **placeholders d'input** uniquement ; les appels IA passent **server-side** (`/api/menu/extract`, service-role) → hors périmètre navigateur, pas de `connect-src`.
- **`www.google.com/maps`** : liens « itinéraire » (`<a href>`), pas d'embed/fetch → aucune directive.
- **`<iframe>`** : aucune en prod → pas de `frame-src` externe ; `frame-ancestors 'self'` = parité avec `X-Frame-Options: SAMEORIGIN`.

---

## Policy retenue (enforced)

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
form-action 'self';
script-src 'self' 'unsafe-inline';           /* + 'unsafe-eval' en DEV uniquement (HMR/Fast Refresh) */
style-src 'self' 'unsafe-inline';
font-src 'self';
worker-src 'self' blob:;
img-src 'self' data: blob: https://*.supabase.co https://icons.duckduckgo.com https://images.unsplash.com https://demotiles.maplibre.org https://tiles.openfreemap.org;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api-adresse.data.gouv.fr https://demotiles.maplibre.org https://tiles.openfreemap.org;   /* + ws: en DEV (HMR) */
```

**Dev vs prod** : `next.config.ts` calcule la policy selon `process.env.NODE_ENV`. `'unsafe-eval'` (webpack HMR / React Fast Refresh) et `ws:` (websocket HMR) sont **exclusivement dev** — jamais servis en production.

**Supabase en wildcard** (`*.supabase.co`) : évite de coder en dur la ref projet dans la CSP et couvre les branches DB ; le sous-domaine reste borné au domaine Supabase.

---

## Décision `script-src 'unsafe-inline'` (plafond assumé)

`'unsafe-inline'` est conservé pour les scripts (l'hydratation Next SSR + le bootstrap `beforeInteractive` injectent de l'inline). **Chemin d'upgrade** : CSP à **nonce** par requête via middleware (Next.js propage le nonce à ses propres balises `<script>`) — **délibérément différé**. Justification : cette tranche est du **durcissement de bord**, et la surface XSS de l'app est déjà fermée (échappement React, allow-list de schéma d'URL SEC-7, aucun `dangerouslySetInnerHTML` sur entrée non fiable). Les gains forts obtenus ici sans nonce : `connect-src` (verrou d'exfiltration), `object-src 'none'`, `base-uri`/`form-action`/`frame-ancestors 'self'`.

---

## Vérification (2026-07-01, app tournante `next dev` port 3000, mode démo)

1. **Report-Only** — en-tête `Content-Security-Policy-Report-Only` servi ; Explorer + onglet Carte chargés ; réseau : `images.unsplash.com`×11 + `tiles.openfreemap.org`×6 en `200` ; **console : 0 rapport `[Report Only] Refused…`, 0 erreur**.
2. **Enforce** — bascule `Content-Security-Policy-Report-Only` → `Content-Security-Policy`, redémarrage serveur, re-test : carte **rendue à l'identique** (canvas MapLibre présent), 11 images + 6 tuiles chargées, **console : 0 erreur / 0 `Refused to…`**.

Report-Only à 0 violation ⇒ enforcer la **même** policy ne bloque aucun flux observé ; les origines non exerçables en démo (Supabase https/wss/storage, duckduckgo, BAN, demotiles classic, blob upload, PDF worker) sont couvertes **par construction**.

---

## Couplage à surveiller
- **Styles carte env-overridables** (`NEXT_PUBLIC_MAP_STYLE_*`) : l'allow-list suit les défauts livrés (`demotiles.maplibre.org` + `tiles.openfreemap.org`). Si un déploiement repointe les tuiles → **étendre `img-src`/`connect-src`** dans `next.config.ts`.
- **Nouvelle origine externe** (nouveau fournisseur d'image, favicon, API tierce navigateur) ⇒ ajouter la directive correspondante avant de l'utiliser, sinon blocage en prod.

## Reste de R2 / Phase 1
CSP = **R2 complet (4/4)**. Restent hors R2 : C-4 tombstone, C-5 i18n, I3 OpenAPI, Q1b allow-list anon complète (cf. `2026-06-30-api-fix-plan.md`).
