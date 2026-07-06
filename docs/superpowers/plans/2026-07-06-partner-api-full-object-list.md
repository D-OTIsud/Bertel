# API partenaire — listes d'objets complets (`?view=full`) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer un mode `?view=full` sur `GET /api/public/objects` qui renvoie la fiche publique complète (même payload que `/objects/{id}`) par élément, paginé et borné, sans toucher au SQL.

**Architecture:** Le RPC `api.list_object_resources_page` sait déjà produire la fiche complète par item via son paramètre `p_view='full'` (→ `get_object_resources_batch` → `get_object_resource`). On expose ce mode depuis la route Next.js avec un plafond de page plus bas (garde-fou perf §125), on retire les 2 legs éditeur par item (comme la route détail), on ajoute une option `?track=gpx|kml`, puis on met à jour les 3 surfaces du contrat (OpenAPI + guide + Postman).

**Tech Stack:** Next.js route handler (Node runtime), TypeScript, Jest ; docs = OpenAPI 3.1 JSON + Markdown + collection Postman ; Supabase MCP pour la vérif live.

## Global Constraints

- Mode `full` : `page_size` **défaut 25, max 100**. Mode `card` inchangé : défaut 50, max 200.
- `status` **toujours forcé `published`** (jamais de brouillon partenaire).
- En mode `full`, retirer de **chaque** item `canonical_description` **et** `org_description` (legs éditeur Markdown i18n bruts, §106/§112) — parité avec `/objects/{id}`.
- `itinerary_details.track_geojson` est natif (toujours présent sur ITI avec géométrie). `?track=gpx|kml` n'est honoré **qu'en mode `full`** ; sinon `p_track_format='none'`.
- Changements **additifs** (même major, `contract_version` reste `1.0.0`) ; enveloppe `{meta,data}` inchangée.
- Invariant contrat : **guide + OpenAPI + Postman** restent synchronisés.
- Commits sur `master`, **par pathspec** (des sessions parallèles partagent l'index), stage+commit dans la **même** invocation, **sans** trailer co-author.

---

### Task 1 : Route `?view=full` + `?track` + strip des legs éditeur

**Files:**
- Modify: `bertel-tourism-ui/src/app/api/public/objects/route.ts`
- Test: `bertel-tourism-ui/src/app/api/public/objects/route.test.ts`

**Interfaces:**
- Consomme : `callPublicRpc('list_object_resources_page_text', params)` — le RPC accepte `p_view` (`'card'|'full'`, 11e param) et `p_track_format` (`'none'|'gpx'|'kml'`, 7e param).
- Produit : `GET /api/public/objects?view=full[&track=gpx|kml]` — chaque `data[i]` = `get_object_resource` complet, sans `canonical_description`/`org_description`.

- [ ] **Step 1 : Écrire les tests qui échouent** (ajouter ces `it(...)` à la fin du `describe('GET /api/public/objects', …)` de `route.test.ts`)

```ts
  it('view=full — passe p_view:full et page_size par défaut 25', async () => {
    await GET(req('?view=full'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_object_resources_page_text');
    expect(params.p_view).toBe('full');
    expect(params.p_page_size).toBe(25);
  });

  it('view absent — mode carte (p_view:card, défaut 50)', async () => {
    await GET(req());
    const params = rpcMock.mock.calls[0][1];
    expect(params.p_view).toBe('card');
    expect(params.p_page_size).toBe(50);
  });

  it('view=full — page_size plafonné à 100 (pas 200)', async () => {
    await GET(req('?view=full&page_size=9999'));
    expect(rpcMock.mock.calls[0][1].p_page_size).toBe(100);
  });

  it('view=full — retire canonical_description et org_description de CHAQUE item', async () => {
    rpcMock.mockResolvedValue({
      ok: true, status: 200,
      body: { info: {}, data: [
        { id: 'X', name: 'N', canonical_description: { fr: 'brut' }, org_description: { fr: 'brut' } },
      ] },
    });
    const res = await GET(req('?view=full'));
    const json = await res.json();
    expect(json.data[0]).toEqual({ id: 'X', name: 'N' });
    expect(json.data[0]).not.toHaveProperty('canonical_description');
    expect(json.data[0]).not.toHaveProperty('org_description');
  });

  it('mode carte — n\'altère PAS les items (pas de strip appliqué)', async () => {
    rpcMock.mockResolvedValue({
      ok: true, status: 200,
      body: { info: {}, data: [{ id: 'X', canonical_description: { fr: 'gardé-en-carte' } }] },
    });
    const res = await GET(req()); // pas de view
    const json = await res.json();
    expect(json.data[0]).toEqual({ id: 'X', canonical_description: { fr: 'gardé-en-carte' } });
  });

  it('track=gpx avec view=full — passe p_track_format:gpx', async () => {
    await GET(req('?view=full&track=gpx'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('gpx');
  });

  it('track=gpx SANS view=full — ignoré (p_track_format:none en mode carte)', async () => {
    await GET(req('?track=gpx'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('none');
  });

  it('track invalide (view=full) — ignoré (p_track_format:none)', async () => {
    await GET(req('?view=full&track=shp'));
    expect(rpcMock.mock.calls[0][1].p_track_format).toBe('none');
  });
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run : `cd bertel-tourism-ui && npx jest src/app/api/public/objects/route.test.ts`
Attendu : les 8 nouveaux tests ÉCHOUENT (`p_view` undefined, `p_page_size` 50 au lieu de 25, legs présents…), les anciens PASSENT.

- [ ] **Step 3 : Implémenter la route** — remplacer le contenu de `route.ts` par (blocs modifiés en place ; le reste inchangé) :

Dans le parse des query params (remplacer la ligne `const pageSize = …` et ajouter `view`/`track`) :

```ts
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  // Mode d'affichage : 'full' = fiche complète get_object_resource par item (lourd, plafond bas),
  // 'card' (défaut) = carte allégée. Toute valeur ≠ 'full' ⇒ 'card'.
  const view = (url.searchParams.get('view') ?? 'card').trim().toLowerCase() === 'full' ? 'full' : 'card';
  const isFull = view === 'full';
  // Plafond perf (§125) : full borné à 100 (mesuré ~3 s / 1,6 Mo), défaut 25 ; card inchangé 50/200.
  const defaultSize = isFull ? 25 : 50;
  const maxSize = isFull ? 100 : 200;
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') ?? String(defaultSize)) || defaultSize, 1), maxSize);
```

Après `const format = …` (ajouter le parse de `track`) :

```ts
  // Blob GPX/KML des itinéraires — honoré uniquement en mode full (les cartes ne portent pas
  // itinerary_details). Le tracé GeoJSON est de toute façon natif (track_geojson).
  const trackParam = (url.searchParams.get('track') ?? '').trim().toLowerCase();
  const track = isFull && (trackParam === 'gpx' || trackParam === 'kml') ? trackParam : 'none';
```

Dans l'appel RPC (ajouter `p_track_format: track` en remplacement du `'none'` figé, et `p_view: view`) :

```ts
  const result = await callPublicRpc('list_object_resources_page_text', {
    p_cursor: cursor,
    p_lang_prefs: [lang],
    p_page_size: pageSize,
    p_types: types,
    p_status: ['published'], // FORCED — partners see published only
    p_search: search,
    p_track_format: track,
    p_view: view,
  });
```

Juste après `let items = Array.isArray(rpcBody.data) ? (rpcBody.data as Record<string, unknown>[]) : [];` (avant le bloc `if (PIVOT_FORMATS.has(format) …)`) :

```ts
  if (isFull) {
    // Mode full : chaque item est la fiche complète get_object_resource — retirer les 2 legs
    // éditeur (Markdown i18n brut), exactement comme la route détail /objects/{id} (§106/§112).
    items = items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const copy = { ...it };
      delete copy.canonical_description;
      delete copy.org_description;
      return copy;
    });
  }
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run : `cd bertel-tourism-ui && npx jest src/app/api/public/objects/route.test.ts`
Attendu : TOUT passe (anciens + 8 nouveaux).

- [ ] **Step 5 : Type-check**

Run : `cd bertel-tourism-ui && npx tsc --noEmit`
Attendu : 0 erreur.

- [ ] **Step 6 : Commit** (pathspec)

```bash
git add "bertel-tourism-ui/src/app/api/public/objects/route.ts" "bertel-tourism-ui/src/app/api/public/objects/route.test.ts"
git commit -m "feat(partner-api): mode ?view=full sur la liste (fiche complète par item, plafond 100, +?track=gpx|kml)" -- "bertel-tourism-ui/src/app/api/public/objects/route.ts" "bertel-tourism-ui/src/app/api/public/objects/route.test.ts"
```

---

### Task 2 : Documentation contractuelle (OpenAPI + guide + Postman)

**Files:**
- Modify: `docs/openapi.json`
- Modify: `docs/guide-partenaires.md`
- Modify: `docs/Bertel_API_v3.postman_collection.json`

**Interfaces:**
- Consomme : le contrat de la Task 1 (params `view`/`track`, plafonds, items complets).
- Produit : les 3 surfaces décrivent `?view=full` et `?track=`.

- [ ] **Step 1 : OpenAPI — paramètres de `/objects`.** Dans `docs/openapi.json`, la liste `parameters` de `GET /objects` (actuellement Cursor/PageSize/Types/Lang/Search/Format) — ajouter View et Track :

```json
        "parameters": [
          { "$ref": "#/components/parameters/Cursor" },
          { "$ref": "#/components/parameters/PageSize" },
          { "$ref": "#/components/parameters/View" },
          { "$ref": "#/components/parameters/Track" },
          { "$ref": "#/components/parameters/Types" },
          { "$ref": "#/components/parameters/Lang" },
          { "$ref": "#/components/parameters/Search" },
          { "$ref": "#/components/parameters/Format" }
        ],
```

- [ ] **Step 2 : OpenAPI — items de réponse `oneOf`.** Remplacer la ligne `"data": { "type": "array", "items": { "$ref": "#/components/schemas/CardItem" } }` par :

```json
                    "data": { "type": "array", "items": { "oneOf": [ { "$ref": "#/components/schemas/CardItem" }, { "$ref": "#/components/schemas/ObjectResource" } ], "description": "Carte allégée (`view=card`, défaut) ou fiche complète (`view=full`, identique à `GET /objects/{id}`)." } }
```

- [ ] **Step 3 : OpenAPI — description de `/objects`.** Compléter la `description` de l'opération `listObjects` en ajoutant, à la fin de la chaîne existante, cette phrase (mode full) :

```
\n\nAvec `view=full`, chaque objet de la page est la **fiche complète** (identique à `GET /objects/{id}`) au lieu de la carte allégée. En mode `full` la page est bornée à **100** (défaut 25) pour la performance ; `track=gpx|kml` ajoute le blob GPX/KML des itinéraires (le tracé GeoJSON est de toute façon natif).
```

- [ ] **Step 4 : OpenAPI — paramètres réutilisables `View` et `Track`.** Dans `components.parameters`, après l'entrée `Format`, ajouter :

```json
      "View": {
        "name": "view", "in": "query", "required": false,
        "description": "`card` (défaut) = carte allégée ; `full` = fiche complète par objet (photos, descriptions, équipements, classements/distinctions, chambres, horaires, tracé GeoJSON…). En `full`, `page_size` est borné à **100** (défaut 25).",
        "schema": { "type": "string", "enum": ["card", "full"], "default": "card" }
      },
      "Track": {
        "name": "track", "in": "query", "required": false,
        "description": "En mode `view=full` uniquement : ajoute le blob `itinerary_details.track` au format demandé pour les itinéraires. Le tracé GeoJSON (`itinerary_details.track_geojson`) est natif et toujours présent, indépendamment de ce paramètre.",
        "schema": { "type": "string", "enum": ["gpx", "kml"] }
      },
```

- [ ] **Step 5 : Valider l'OpenAPI (JSON + $ref).**

Run : `node -e "const s=require('./docs/openapi.json');const t=JSON.stringify(s);const refs=[...t.matchAll(/\"\$ref\":\s*\"#\/([^\"]+)\"/g)].map(m=>m[1]);const miss=refs.filter(r=>{let o=s;for(const k of r.split('/')){o=o&&o[k];}return o===undefined;});if(miss.length){console.error('refs manquants:',[...new Set(miss)]);process.exit(1);}console.log('OpenAPI OK,',refs.length,'refs résolus');"`
Attendu : `OpenAPI OK, N refs résolus` (dont `components/parameters/View` et `.../Track` désormais présents et `components/schemas/ObjectResource` résolu).

- [ ] **Step 6 : Guide — table des paramètres §3.1.** Dans `docs/guide-partenaires.md`, insérer deux lignes dans la table de `### 3.1` (après la ligne `page_size`) :

```markdown
| `view` | `card` \| `full` | `card` | `full` = fiche complète par objet (voir §3.1.1) |
| `track` | `gpx` \| `kml` | — | En `view=full` : ajoute le blob GPX/KML des itinéraires |
```

- [ ] **Step 7 : Guide — nouvelle sous-section `#### 3.1.1`.** Insérer, juste avant `### 3.2`, ce bloc :

```markdown
#### 3.1.1 Objets complets en liste — `view=full`

Par défaut la liste renvoie une **carte allégée** par objet. Avec `view=full`, chaque objet
de la page est la **fiche complète** — strictement le même contenu que `GET /objects/{id}`
(photos, descriptions, équipements, classements/distinctions, chambres, horaires,
`itinerary_details.track_geojson`…), **hors CRM et champs internes**.

- La page est bornée à **100 objets** (défaut 25) : la fiche complète est ~15 kB et ~30 ms
  par objet, donc une grande page reste volumineuse. Utilisez le curseur pour parcourir.
- Pour les **itinéraires**, ajoutez `track=gpx` (ou `kml`) pour obtenir en plus le blob de
  tracé au format demandé sous `itinerary_details.track`. Le tracé **GeoJSON** est de toute
  façon inclus nativement (`itinerary_details.track_geojson`).

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://<domaine>/api/public/objects?view=full&page_size=100&track=gpx"
```
```

- [ ] **Step 8 : Guide — recette de synchro §4.** Dans `### 3.1` juste sous le paragraphe « Pagination par curseur », la liste des filtres figés par le curseur cite `types`, `page_size`, `search`, `lang` : y ajouter `view`, `track` → `(types, page_size, search, lang, view, track)`. Puis dans `## 4. Recette de synchronisation complète`, ajouter après la ligne `r = GET /objects?page_size=200[&format=<profil>][&cursor=cursor]` cette note :

```markdown
> Pour récupérer les **fiches complètes** en une passe (au lieu d'un appel détail par objet),
> utilisez `GET /objects?view=full&page_size=100[&cursor=cursor]` — la page est bornée à 100
> en mode `full`. Ajoutez `&track=gpx` si vous voulez les tracés GPX des itinéraires.
```

- [ ] **Step 9 : Vérifier le rendu du guide.**

Run : `node docs/partenaires-render.check.js`
Attendu : sortie OK (pas d'erreur de rendu), comme avant.

- [ ] **Step 10 : Postman — nouvelle requête section 13.** Dans `docs/Bertel_API_v3.postman_collection.json`, section `"13. API Publique Partenaire (/api/public/*)"`, dupliquer la requête « lister » (`{{public_base_url}}/api/public/objects?page_size=20`) en une nouvelle entrée juste après, avec ce corps :

```json
        {
          "name": "Objects — liste (fiches complètes, view=full)",
          "request": {
            "method": "GET",
            "header": [
              {"key": "Authorization", "value": "Bearer {{partner_key}}", "description": "Clé partenaire bk_live_…"}
            ],
            "url": {
              "raw": "{{public_base_url}}/api/public/objects?view=full&page_size=100&track=gpx",
              "host": ["{{public_base_url}}"],
              "path": ["api", "public", "objects"],
              "query": [
                {"key": "view", "value": "full", "description": "Fiche complète par objet (identique au détail)"},
                {"key": "page_size", "value": "100", "description": "Borné à 100 en mode full"},
                {"key": "track", "value": "gpx", "description": "Optionnel : blob GPX des itinéraires"}
              ]
            },
            "description": "Liste paginée où chaque objet est la fiche publique complète (photos, descriptions, équipements, classements, chambres, horaires, tracé GeoJSON natif). Mode `full` borné à 100/page. `track=gpx|kml` ajoute le blob de tracé des itinéraires."
          },
          "response": []
        },
```

(Adapter les crochets/virgules JSON à l'insertion : virgule après la requête précédente ; conserver un JSON valide.)

- [ ] **Step 11 : Valider le JSON Postman.**

Run : `node -e "require('./docs/Bertel_API_v3.postman_collection.json');console.log('Postman JSON OK')"`
Attendu : `Postman JSON OK`.

- [ ] **Step 12 : Commit** (pathspec)

```bash
git add "docs/openapi.json" "docs/guide-partenaires.md" "docs/Bertel_API_v3.postman_collection.json"
git commit -m "docs(partner-api): documenter ?view=full + ?track=gpx|kml (OpenAPI + guide + Postman)" -- "docs/openapi.json" "docs/guide-partenaires.md" "docs/Bertel_API_v3.postman_collection.json"
```

---

### Task 3 : Vérification live + journal de décision + mémoire

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
- Create: `C:/Users/dphil/.claude/projects/C--Users-dphil-Bertel3-0/memory/partner-api-full-list-2026-07-06.md`
- Modify: `C:/Users/dphil/.claude/projects/C--Users-dphil-Bertel3-0/memory/MEMORY.md`

- [ ] **Step 1 : Smoke live du RPC en mode full** (Supabase MCP `execute_sql`) — confirmer forme complète + timing + published-only :

```sql
WITH ids AS (SELECT array_agg(id) a FROM (SELECT id FROM object WHERE status='published' ORDER BY id LIMIT 100) s),
call AS (SELECT clock_timestamp() t0, api.list_object_resources_page_text(NULL, ARRAY['fr']::text[], 100, NULL, ARRAY['published']::text[], NULL, 'none', NULL, NULL, NULL, 'full') r, clock_timestamp() t1)
SELECT round(extract(epoch FROM (t1-t0))*1000) AS ms,
       json_array_length(r->'data') AS n,
       (r->'data'->0) ? 'canonical_description' AS leaks_canonical_leg,
       (r->'data'->0) ? 'org_description' AS leaks_org_leg
FROM call;
```
Attendu : `n=100`, `ms` < ~3500. Les 2 legs éditeur sont **présents au niveau RPC** (`true`) — c'est normal : c'est la **route** qui les retire (couvert par la Task 1). Noter le `ms` pour le journal.

- [ ] **Step 2 : Contrôle « aucun champ CRM/privé » dans la fiche complète.** Vérifier que `get_object_resource` (donc l'item full) ne porte pas de clé privée/CRM :

```sql
SELECT array_agg(k ORDER BY k) AS suspect_top_level_keys
FROM (
  SELECT jsonb_object_keys(
    (api.list_object_resources_page_text(NULL, ARRAY['fr']::text[], 5, NULL, ARRAY['published']::text[], NULL, 'none', NULL, NULL, NULL, 'full')::jsonb)->'data'->0
  ) AS k
) t
WHERE k ~* 'private|crm|interaction|note|internal|moderation|pending';
```
Attendu : `NULL` (aucune clé suspecte). Si non-`NULL`, STOP — c'est une régression de périmètre à traiter avant de continuer (la route détail expose déjà cette fiche : ce serait une fuite préexistante à remonter).

- [ ] **Step 3 : Journal de décision.** Rechercher le dernier `## §` de `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (les sessions parallèles incrémentent — **re-grep juste avant d'écrire**), puis ajouter une entrée `§<n+1>` résumant : approche A, `?view=full` (défaut 25 / **max 100**), strip des 2 legs éditeur par item (parité route détail), `?track=gpx|kml` (GeoJSON natif), mesures (~27 ms/objet), invariant « pas d'exposition nouvelle = même `get_object_resource` que le détail audité », B (streaming) différé. Citer les commits des Tasks 1-2.

- [ ] **Step 4 : Mémoire.** Créer le fichier mémoire (frontmatter `type: project`) résumant la livraison + invariants (plafond 100, strip par item, GeoJSON natif, B différé), puis ajouter une ligne d'index dans `MEMORY.md` sous « Work log (newest first) ».

- [ ] **Step 5 : Suite front complète + tsc (non-régression).**

Run : `cd bertel-tourism-ui && npx jest && npx tsc --noEmit`
Attendu : suite verte, 0 erreur tsc.

- [ ] **Step 6 : Commit** (pathspec — journal seulement ; les fichiers mémoire sont hors dépôt)

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs(decisions): §<n> API partenaire listes d'objets complets ?view=full" -- "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
```

---

## Self-review (contre la spec)

- **Couverture spec** : mode full (T1), plafond 100/défaut 25 (T1 §clamp + docs T2), strip legs éditeur (T1 step 3 + test), GeoJSON natif + `track=gpx|kml` (T1 + doc T2 steps 4/7), sécurité published-only + no-CRM (T3 steps 1-2), OpenAPI+guide+Postman (T2), perf mesurée (T3 step 1), decision log + mémoire (T3). Hors périmètre (streaming B, delta full) explicitement non traités. ✔
- **Placeholders** : aucun `TODO/TBD` ; code et JSON/Markdown complets fournis. ✔
- **Cohérence de types** : `p_view`/`p_track_format` cohérents entre route, tests et smoke SQL ; `view`/`track` en query cohérents entre route, OpenAPI, guide, Postman. ✔
