# Export Excel de la sélection — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer le bouton « CSV » de la barre de sélection de l'Exploreur par un export Excel (.xlsx) avec modale de sélection de colonnes, et poser la garde serveur 16t sur les coordonnées d'acteur.

**Architecture :** un registre unique de colonnes (`ExportColumnDef`, source `ParsedObjectDetail`) alimenté par `api.get_object_resources_batch` (lots de 50) ; écriture du classeur dans le navigateur par `write-excel-file` en import dynamique ; les 6 colonnes de coordonnées d'acteur passent par un RPC dédié journalisé (`api.export_actor_contacts`), gardé serveur à l'ORG éditrice.

**Tech stack :** Next.js 15 (webpack build), React, TypeScript, Zustand (persist), Jest + RTL, `write-excel-file@4.1.1`, PostgreSQL/Supabase (migration 16t).

**Spec :** [docs/superpowers/specs/2026-07-31-explorer-export-excel-design.md](../specs/2026-07-31-explorer-export-excel-design.md) — la lire AVANT de commencer, **section §0 (Révision R1) comprise : elle prévaut**.

## Révision R1 — ce qui a changé dans CE plan (2026-07-31)

Une revue externe a corrigé la conception ; le plan intègre les corrections en place.
Résumé pour l'exécutant :
1. Capacités `actor_identity` / `actor_contacts` remplacent le faux « public » des
   colonnes nom/rôle/principal (T4, T7, T10).
2. **`get_object_with_deep_data` / `get_objects_with_deep_data` : INTERDIT d'y toucher**
   — l'ex-Step 5 de T13 est supprimé ; un test CI prouve qu'elles sont intactes (T14).
3. Fusion multi-lots par `object_id` + `export_run_id` partagé + résultat de lot
   `{logId, authorized, denied, batchIndex/Count}` (T3, T8, T12, T16).
4. `cellType 'text' | 'number'` — latitude/longitude numériques (T4, T5, T8).
5. `actor_primary` multi-valué (T7).
6. Performance : projection `fields` par union des colonnes cochées, concurrence
   bornée à 2 lots, aplatissement immédiat + libération du JSON (T3, T7, T8) ;
   cibles d'acceptation mesurées (T17).
7. Matrice des colonnes **validée par le PO avant** le code du registre (T4 Step 0).
8. Journal multi-ORG : `org_object_ids[]` + `org_attributions` (T12, T14).

**Révision R2 (2e passe de revue, même jour) :**
9. La liste des fichiers de T13 ne mentionne plus les fonctions deep — la
   contradiction avec l'interdiction R1 est levée ; **la preuve d'identité est une
   comparaison des définitions complètes HEAD↔arbre** (T13 Step 5), l'assertion
   `prosrc` du test SQL n'étant qu'un complément (T14 H).
10. **Préflight serveur des capacités acteur** : `api.export_actor_capabilities(ids)`
    (T12 §1bis, T14 I, T10 Step 4a) — l'offre de colonnes acteur suit la
    consultation réelle DE LA SÉLECTION, pas le proxy « membre d'une ORG » ;
    fail-closed avant 16t ; jamais une garde (l'export refait fiche par fiche).

**Révision R2.1 (3e passe de revue, même jour) :**
11. **Le préflight peut OUVRIR, pas seulement restreindre.** `clearanceLevels`
    n'émet plus `actor_identity`/`actor_contacts` — ces deux capacités sont
    décidées **uniquement** par le préflight, et `availableColumns(session, caps)`
    compose les deux autorités. Sans ça, un lecteur sans ORG ne voyait jamais
    « Acteur — nom » même sur une fiche à lien public : le persona I3 était
    mort-né côté UI (T4/T7/T9/T10, + 3 tests dont le cas I3 en RTL).
12. **`search_path` sûr sur les fonctions `SECURITY DEFINER`** : `pg_temp`
    explicitement **en dernier** + relations schéma-qualifiées, sur les 3
    fonctions neuves ET (par `ALTER FUNCTION`, corps intouchés) sur les 2 feuilles
    d'autorisation `current_user_crm_object_ids` / `current_user_extended_object_ids`.
    Sabotage par table temporaire en CI (assertion J). Dette générale du dépôt
    (~105 fonctions) consignée, hors périmètre.

## Global Constraints

- **Répertoire de travail frontend :** `bertel-tourism-ui/`. Tous les chemins `src/…` ci-dessous sont relatifs à ce dossier. Les chemins SQL sont relatifs à `Base de donnée DLL et API/`.
- **Commandes :** `npm run test:run -- <fichier>` (Jest, pas de watch), `npm run typecheck`, `npm run build` (= `next build --webpack`). Lancer depuis `bertel-tourism-ui/`.
- **Commits :** conventionnels, français, **SANS trailer Co-Authored-By** (préférence maison). Stage par pathspec + commit dans la même commande. Un commit par tâche verte. Ne jamais `git push` (le PO pousse).
- **CSP de production sans `unsafe-eval`** (`next.config.ts:66`) : ne jamais introduire une lib qui appelle `eval`/`new Function` au runtime. `write-excel-file@4.1.1` est audité sain — ne pas lui substituer une autre lib.
- **Séparateurs :** `;` entre cellules CSV (existant), ` | ` entre valeurs DANS une cellule (export Excel). Jamais `;` en intra-cellule.
- **Cellules xlsx :** `cellType 'text'` ⇒ `type: String` (identifiants, codes postaux, SIRET…) ; `cellType 'number'` ⇒ `type: Number` (**latitude/longitude uniquement** — R1). Un champ absent rend `''` (texte) ou cellule vide (number), jamais « Non » (tri-état §133).
- **Deep RPC :** `api.get_object_with_deep_data` et `api.get_objects_with_deep_data` ne sont modifiées par AUCUNE tâche (R1). Toute tentation de les patcher = STOP + signalement.
- **Performance (R1) :** concurrence de lots bornée à 2 (jamais illimitée) ; aplatissement immédiat de chaque lot puis libération du JSON ; projection `p_options.fields` = union des besoins des colonnes cochées.
- **Notes d'équipe :** AUCUNE colonne ne les lit. Interdit d'ajouter une colonne dont la valeur lit `text.privateNote`, `text.privateNotes` ou `internal.privateNotes` (décision PO, spec §2).
- **SQL :** `gen_random_uuid()` jamais `uuid_generate_v4()` ; `REVOKE ALL … FROM PUBLIC` sur toute fonction DEFINER neuve ; `COALESCE(…, FALSE)` sur toute sonde à trois valeurs ; tableau passé EN VALEUR (`= ANY(v_scope)`), jamais `ANY((SELECT …))` ; policies par commande, `auth.*()` wrappé `(select …)`.
- **SQL — `search_path` sûr (R2.1) :** toute fonction `SECURITY DEFINER` créée ou altérée par ce plan porte `SET search_path = pg_catalog, …, pg_temp` (**`pg_temp` en dernier**) et **schéma-qualifie ses relations sensibles** (`public.app_user_profile`, `public.user_org_membership`, `public.object*`, `public.actor*`, `public.ref_*`). Motif : sans `pg_temp` explicite, PostgreSQL cherche le schéma temporaire EN PREMIER pour les relations — une table temporaire homonyme créée par n'importe quel `authenticated` masquerait celle qui décide de l'autorisation.
- **Toute décision prise en cours de route** va dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §208 (Tâche 18).

---

### Tâche 1 : dépendance `write-excel-file` + fichier témoin ouvert dans Excel

C'est la vérification que rien d'autre ne peut trancher (spec §6.2) : on la fait EN PREMIER. Si le témoin échoue dans Excel, on s'arrête et on remonte au PO.

**Files:**
- Modify: `bertel-tourism-ui/package.json` (dépendance)
- Create: `bertel-tourism-ui/scripts/xlsx-temoin.mjs`

**Interfaces:**
- Produces: la dépendance `write-excel-file` (exacte `4.1.1`) utilisée par la Tâche 8 via `await import('write-excel-file')`.

- [ ] **Step 1 : installer la dépendance en version exacte**

```bash
cd bertel-tourism-ui && npm install --save-exact write-excel-file@4.1.1
```

Attendu : `package.json` porte `"write-excel-file": "4.1.1"` (sans `^` — audit CSP/CVE fait sur CETTE version) et `fflate` apparaît dans le lockfile comme unique transitive.

- [ ] **Step 2 : écrire le script témoin**

Créer `bertel-tourism-ui/scripts/xlsx-temoin.mjs` :

```js
// Fichier témoin §208 — valide EMPIRIQUEMENT, avant d'écrire le reste :
// 1. qu'un code postal '01234' écrit en type String garde son zéro dans Excel ;
// 2. qu'une valeur '=1+1' n'est PAS évaluée comme formule (cellule typée texte) ;
// 3. l'API multi-feuilles + stickyRowsCount + columns de write-excel-file.
// Usage : node scripts/xlsx-temoin.mjs  → écrit temoin.xlsx à la racine du repo front.
import writeXlsxFile from 'write-excel-file/node';

const header = (label) => ({ value: label, type: String, fontWeight: 'bold' });
const cell = (value) => ({ value, type: String });

const fiches = [
  [header('Code postal'), header('Identifiant'), header('Latitude'), header('Piège formule')],
  [cell('97418'), cell('HOTRUN00000000ZW'), cell('-21.2783'), cell('=1+1')],
  [cell('01234'), cell('TESTMETROPOLE001'), cell('45.1'), cell('+33 692 12 34 56')],
];
const lisezMoi = [
  [header('Clé'), header('Valeur')],
  [cell('Généré le'), cell(new Date().toISOString())],
  [cell('But'), cell('Témoin §208 — zéros initiaux, formules neutralisées, multi-feuilles')],
];

await writeXlsxFile([fiches, lisezMoi], {
  sheets: ['Fiches', 'Lisez-moi'],
  columns: [
    [{ width: 14 }, { width: 22 }, { width: 12 }, { width: 20 }],
    [{ width: 14 }, { width: 60 }],
  ],
  stickyRowsCount: 1,
  filePath: 'temoin.xlsx',
});
console.log('OK — ouvrir temoin.xlsx dans Excel et vérifier : 01234 garde son zéro, =1+1 reste littéral, 2 feuilles, 1re ligne figée.');
```

- [ ] **Step 3 : exécuter et vérifier DANS Excel**

```bash
cd bertel-tourism-ui && node scripts/xlsx-temoin.mjs
```

Ouvrir `bertel-tourism-ui/temoin.xlsx` dans Excel (ou LibreOffice à défaut, mais Excel est la cible). Vérifier **de visu** les 5 points : `01234` affiché avec son zéro ; `=1+1` affiché tel quel (pas `2`) ; `+33 692…` affiché tel quel (pas interprété) ; deux onglets « Fiches » / « Lisez-moi » ; première ligne figée au scroll. **Si un point échoue : STOP, remonter au PO avant toute autre tâche.**

- [ ] **Step 4 : nettoyer et commiter**

```bash
cd bertel-tourism-ui && rm temoin.xlsx
git add package.json package-lock.json scripts/xlsx-temoin.mjs
git commit -m "build(export): ajoute write-excel-file@4.1.1 (epingle) + script temoin xlsx

Version epinglee sans ^ : l'audit CSP (0 eval/new Function sur le tarball)
et l'audit CVE valent pour cette version precise. Temoin verifie dans Excel :
zeros initiaux conserves, formules non evaluees, multi-feuilles, ligne figee."
```

---

### Tâche 2 : `xlsxCell` + consolidation SEC-8 des écrivains CSV divergents

**Files:**
- Modify: `bertel-tourism-ui/src/lib/safe-output.ts`
- Test: `bertel-tourism-ui/src/lib/safe-output.test.ts` (existe — étendre)
- Modify: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts:36-41,75`
- Modify: `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx:725-728,743`

**Interfaces:**
- Produces: `xlsxCell(value: unknown): string` dans `@/lib/safe-output` — consommée par la Tâche 8. `csvCell` inchangée dans sa signature.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/lib/safe-output.test.ts` (à la suite des cas existants) :

```ts
import { csvCell, escapeHtml, xlsxCell } from './safe-output';

describe('xlsxCell — cellule xlsx typée texte (§208)', () => {
  it("ne préfixe PAS d'apostrophe : le typage String de la cellule est la garde", () => {
    // Contre-intuitif vs csvCell : dans un .xlsx la cellule est typée, une chaîne
    // commençant par = n'est jamais évaluée — l'apostrophe serait VISIBLE.
    expect(xlsxCell('=1+1')).toBe('=1+1');
    expect(xlsxCell('+33 692 12 34 56')).toBe('+33 692 12 34 56');
  });
  it('normalise les fins de ligne en \\n et trim', () => {
    expect(xlsxCell('a\r\nb\rc\n')).toBe('a\nb\nc');
  });
  it('rend une chaîne vide pour null/undefined', () => {
    expect(xlsxCell(null)).toBe('');
    expect(xlsxCell(undefined)).toBe('');
  });
  it('borne à la limite Excel (32 767 caractères par cellule)', () => {
    const long = 'x'.repeat(40000);
    expect(xlsxCell(long).length).toBeLessThanOrEqual(32001);
    expect(xlsxCell(long).endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

```bash
cd bertel-tourism-ui && npm run test:run -- src/lib/safe-output.test.ts
```

Attendu : FAIL — `xlsxCell` n'existe pas (`(0 , _safeOutput.xlsxCell) is not a function` ou erreur d'import TS).

- [ ] **Step 3 : implémenter `xlsxCell`**

Ajouter à la fin de `src/lib/safe-output.ts` :

```ts
/**
 * Prépare une valeur pour une cellule .xlsx (§208). DIFFÈRE de csvCell, et c'est
 * voulu : dans un classeur OOXML la cellule est TYPÉE (`type: String` côté
 * write-excel-file) — c'est ce typage qui neutralise l'injection de formule
 * (`= + - @`), PAS le préfixe apostrophe de csvCell, qui serait ici VISIBLE dans
 * Excel. On garde les \n (Excel les rend dans la cellule), on normalise \r\n,
 * et on borne à la limite Excel de 32 767 caractères par cellule.
 * Invariant : tout écrivain xlsx passe par ici — ne pas recopier (dette SEC-8).
 */
export function xlsxCell(value: unknown): string {
  const normalized = (value == null ? '' : String(value)).replace(/\r\n?/g, '\n').trim();
  return normalized.length > 32000 ? `${normalized.slice(0, 32000)}…` : normalized;
}
```

- [ ] **Step 4 : vérifier le vert**

```bash
cd bertel-tourism-ui && npm run test:run -- src/lib/safe-output.test.ts
```

Attendu : PASS (tous les cas, anciens compris).

- [ ] **Step 5 : rebrancher `object-io-serialize.ts` sur `csvCell` (SEC-8)**

Dans `src/features/object-editor/io/object-io-serialize.ts` :
1. ajouter l'import en tête : `import { csvCell } from '@/lib/safe-output';`
2. **supprimer** la fonction locale `csvEscape` (lignes 35-41, y compris son commentaire « mirrors selection-export.ts » — il est faux depuis SEC-2) ;
3. ligne 75 : remplacer `.map(csvEscape).join(',')` par `.map(csvCell).join(',')`.

- [ ] **Step 6 : rebrancher `ObjectDetailView.tsx` sur `csvCell` (SEC-8)**

Dans `src/features/object-drawer/ObjectDetailView.tsx` :
1. compléter l'import existant de `@/lib/safe-output` s'il existe, sinon l'ajouter : `import { csvCell } from '@/lib/safe-output';`
2. **supprimer** la fonction locale `escapeCsvValue` (lignes 725-728) ;
3. ligne 743 : remplacer `row.map((cell) => escapeCsvValue(cell))` par `row.map((cell) => csvCell(cell))`.

Ajouter au-dessus de `buildNotesCsv` le commentaire :

```ts
// SEC-8 soldée (§208) : csvCell partagé = garde anti-formule (= + - @) que la
// copie locale avait perdue. Effet assumé : les \n DANS une note deviennent des
// espaces (csvCell aplatit) — le CSV reste RFC-4180 mais mono-ligne par cellule.
```

- [ ] **Step 7 : lancer les suites des deux fichiers touchés et corriger les attentes**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/io/object-io-serialize.test.ts src/features/object-drawer/ObjectDetailView.test.tsx
```

Si un cas assertait la sortie exacte d'une cellule commençant par `=`/`+`/`-`/`@` **sans** apostrophe, mettre à jour l'attente : la valeur gagne un `'` de tête (ex. `"=SUM(A1)"` → `"'=SUM(A1)"`). Ne JAMAIS « corriger » en retirant la garde. Attendu final : PASS.

- [ ] **Step 8 : typecheck + commit**

```bash
cd bertel-tourism-ui && npm run typecheck
git add src/lib/safe-output.ts src/lib/safe-output.test.ts src/features/object-editor/io/object-io-serialize.ts src/features/object-drawer/ObjectDetailView.tsx src/features/object-editor/io/object-io-serialize.test.ts src/features/object-drawer/ObjectDetailView.test.tsx
git commit -m "fix(securite): xlsxCell + les 2 ecrivains CSV divergents reprennent csvCell (SEC-8)

csvEscape (io-serialize) et escapeCsvValue (drawer notes) avaient perdu la
neutralisation de formule par copier-coller. xlsxCell est la garde soeur pour
le .xlsx : typage texte de la cellule, PAS d'apostrophe (elle serait visible)."
```

---

### Tâche 3 : service batch `getObjectResourcesBatch` + chargeur par lots avec progression/annulation

**Files:**
- Modify: `bertel-tourism-ui/src/services/rpc.ts` (ajout d'une fonction, après `getObjectResource` ~l.488)
- Create: `bertel-tourism-ui/src/services/export/export-fetch.ts`
- Test: `bertel-tourism-ui/src/services/export/export-fetch.test.ts`

**Interfaces:**
- Consumes: `requireRpcClient()` (rpc.ts:111, privée — la nouvelle fonction vit DANS rpc.ts pour y accéder), `normalizeObjectDetailPayload` (déjà importée en tête de rpc.ts), `mockObjectDetails` (déjà importé), `parseObjectDetail` (`src/services/object-detail-parser.ts:1260`).
- Produces:
  - `getObjectResourcesBatch(objectIds: string[], langPrefs: string[], options?: { signal?: AbortSignal; fields?: string[] }): Promise<(ObjectDetail | null)[]>` (export de `src/services/rpc.ts`)
  - `EXPORT_BATCH_SIZE = 50`, `EXPORT_BATCH_CONCURRENCY = 2`, `chunkIds(ids: string[], size?: number): string[][]`, `fetchResourceBatches(ids: string[], langPrefs: string[], opts: { fields?: string[]; onBatch: (entries: Array<[string, ParsedObjectDetail]>) => void; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<void>` (exports de `src/services/export/export-fetch.ts`)
- **R1 :** le chargeur STREAME chaque lot à `onBatch` (l'appelant aplatit immédiatement et libère le JSON — jamais 10,5 Mo accumulés) ; concurrence bornée à 2 lots ; fusion par `object_id` (ceinture : si `payload.id` diffère de l'id positionnel attendu, `payload.id` fait foi).

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/services/export/export-fetch.test.ts` :

```ts
import { chunkIds, EXPORT_BATCH_SIZE, fetchResourceBatches } from './export-fetch';
import { getObjectResourcesBatch } from '../rpc';
import type { ParsedObjectDetail } from '../object-detail-parser';

jest.mock('../rpc', () => ({ getObjectResourcesBatch: jest.fn() }));
const mockBatch = getObjectResourcesBatch as jest.Mock;

const fakeDetail = (id: string) => ({ id, name: `Fiche ${id}`, raw: { id, name: `Fiche ${id}`, type: 'HOT', status: 'published' } });

describe('chunkIds', () => {
  it('découpe par 50, dédoublonne et écarte les ids vides/null (jamais de NULL dans p_ids)', () => {
    const ids = ['a', 'b', 'a', ' ', '', 'c'];
    expect(chunkIds(ids, 2)).toEqual([['a', 'b'], ['c']]);
  });
  it('taille par défaut = 50 (mesuré : 1,37 s / lot, marge ×5,8 sous le timeout 8 s)', () => {
    expect(EXPORT_BATCH_SIZE).toBe(50);
    const many = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    expect(chunkIds(many).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe('fetchResourceBatches (R1 : streaming + concurrence 2 + fusion par object_id)', () => {
  beforeEach(() => mockBatch.mockReset());

  it('streame chaque lot à onBatch, saute les null, rapporte la progression', async () => {
    mockBatch.mockImplementation(async (ids: string[]) => ids.map((id) => (id === 'absent' ? null : fakeDetail(id))));
    const seen: Array<[number, number]> = [];
    const collected = new Map<string, ParsedObjectDetail>();
    await fetchResourceBatches(['x', 'absent', 'y'], ['fr'], {
      onBatch: (entries) => entries.forEach(([id, d]) => collected.set(id, d)),
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect([...collected.keys()]).toEqual(['x', 'y']);
    expect(collected.get('x')?.identity.name).toBe('Fiche x');
    expect(seen.at(-1)).toEqual([3, 3]);
  });

  it("fusionne par object_id : si le payload porte un id différent de la position, payload.id fait foi", async () => {
    mockBatch.mockImplementation(async () => [fakeDetail('reel-1')]); // le serveur rend un id ≠ position
    const collected = new Map<string, ParsedObjectDetail>();
    await fetchResourceBatches(['demande-1'], ['fr'], { onBatch: (e) => e.forEach(([id, d]) => collected.set(id, d)) });
    expect([...collected.keys()]).toEqual(['reel-1']);
  });

  it('concurrence bornée à 2 : jamais plus de 2 lots en vol', async () => {
    let inFlight = 0; let peak = 0;
    mockBatch.mockImplementation(async (ids: string[]) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return ids.map(fakeDetail);
    });
    const many = Array.from({ length: 250 }, (_, i) => `id-${i}`); // 5 lots de 50
    await fetchResourceBatches(many, ['fr'], { onBatch: () => {} });
    expect(mockBatch).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1); // la concurrence existe vraiment
  });

  it('transmet fields au batch (projection R1) et le signal', async () => {
    mockBatch.mockResolvedValue([fakeDetail('x')]);
    await fetchResourceBatches(['x'], ['fr'], { fields: ['contacts', 'address'], onBatch: () => {} });
    expect(mockBatch).toHaveBeenCalledWith(['x'], ['fr'], expect.objectContaining({ fields: ['contacts', 'address'] }));
  });

  it("s'arrête net quand le signal est déjà annulé (aucun appel réseau)", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchResourceBatches(['x'], ['fr'], { onBatch: () => {}, signal: controller.signal })).rejects.toThrow(/annul/i);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-fetch.test.ts
```

Attendu : FAIL (module `./export-fetch` introuvable).

- [ ] **Step 3 : ajouter `getObjectResourcesBatch` dans `rpc.ts`**

Insérer **après** la fonction `getObjectResource` (après la ligne 488, avant `readItineraryTrackFromPayload`) :

```ts
/**
 * Charge N fiches complètes en UN appel serveur (§208 — api.get_object_resources_batch,
 * dormant jusqu'ici : 0 appelant). Jamais N × get_object_resource : chaque aller-retour
 * coûte 220-310 ms depuis La Réunion. Options FIGÉES côté export :
 *  - render:false (personne ne lit les *_lines ici — et render.actor_lines n'est pas gardé) ;
 *  - omit_empty:true (payload mesuré 573 Ko / 50 fiches au lieu de 630) ;
 *  - include_private:false — les notes d'équipe ne sortent JAMAIS par ce chemin (décision PO).
 * Contrat du RPC : l'ordre d'entrée est préservé, un id inconnu/non lisible rend null
 * À SA PLACE. Ne JAMAIS passer null/'' dans p_ids (ligne supprimée ⇒ décalage des positions) —
 * l'appelant nettoie (cf. chunkIds).
 */
export async function getObjectResourcesBatch(
  objectIds: string[],
  langPrefs: string[],
  options: { signal?: AbortSignal; fields?: string[] } = {},
): Promise<(ObjectDetail | null)[]> {
  const client = requireRpcClient();
  if (!client) {
    return objectIds.map((id) => mockObjectDetails[id] ?? null);
  }

  let query = client.schema('api').rpc('get_object_resources_batch', {
    p_ids: objectIds,
    p_lang_prefs: langPrefs,
    p_track_format: 'none',
    p_options: {
      render: false,
      omit_empty: true,
      include_private: false,
      // R1 — projection : union des blocs requis par les colonnes cochées.
      // Mécanisme NON étanche (opening_times/relations/menus sortent quand même)
      // mais il réduit l'essentiel du payload. Absent = fiche complète.
      ...(options.fields && options.fields.length > 0 ? { fields: options.fields } : {}),
    },
  });
  if (options.signal) {
    query = query.abortSignal(options.signal);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const list = Array.isArray(data) ? data : [];
  return objectIds.map((id, index) => {
    const payload = list[index];
    if (!payload || typeof payload !== 'object') return null;
    return normalizeObjectDetailPayload(payload as Record<string, unknown>, id);
  });
}
```

- [ ] **Step 4 : créer `export-fetch.ts`**

Créer `src/services/export/export-fetch.ts` :

```ts
import { getObjectResourcesBatch } from '../rpc';
import { parseObjectDetail, type ParsedObjectDetail } from '../object-detail-parser';

/** Taille de lot mesurée en prod : 50 fiches = 1,37 s (marge ×5,8 sous le timeout authenticated de 8 s). NE PAS monter à 100 (3,3 s, marge ×2,4 — trop mince à 220-310 ms d'AR Réunion↔Supabase). */
export const EXPORT_BATCH_SIZE = 50;

/** R1 — concurrence BORNÉE : 2 lots en vol maximum. Jamais illimitée (charge SQL sans réduction du travail total). Mesurer avant d'augmenter. */
export const EXPORT_BATCH_CONCURRENCY = 2;

/** Dédoublonne, écarte les ids vides (jamais de NULL dans p_ids — décalage des positions), découpe. */
export function chunkIds(ids: string[], size = EXPORT_BATCH_SIZE): string[][] {
  const clean = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

/**
 * R1 — charge la sélection par lots et STREAME chaque lot à `onBatch` : l'appelant
 * aplatit immédiatement en lignes d'export et laisse le JSON partir au GC — on
 * n'accumule jamais le corpus entier en mémoire (10,5 Mo réseau ≫ en objets JS).
 * Fusion par object_id : le payload porte son id ; s'il diffère de l'id positionnel
 * attendu, payload.id fait foi (ceinture sur le contrat positionnel du RPC).
 * Concurrence bornée à EXPORT_BATCH_CONCURRENCY. Un lot en échec ⇒ throw — l'appelant
 * ne produit AUCUN fichier (spec R1-3).
 */
export async function fetchResourceBatches(
  ids: string[],
  langPrefs: string[],
  opts: {
    fields?: string[];
    onBatch: (entries: Array<[string, ParsedObjectDetail]>) => void;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const chunks = chunkIds(ids);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let done = 0;
  let cursor = 0;

  const assertAlive = () => {
    if (opts.signal?.aborted) throw new Error('Export annulé.');
  };

  async function worker(): Promise<void> {
    for (;;) {
      assertAlive();
      const index = cursor;
      if (index >= chunks.length) return;
      cursor += 1;
      const chunk = chunks[index];
      const details = await getObjectResourcesBatch(chunk, langPrefs, {
        signal: opts.signal,
        fields: opts.fields,
      });
      assertAlive();
      const entries: Array<[string, ParsedObjectDetail]> = [];
      details.forEach((detail, i) => {
        if (!detail) return;
        const rawId = typeof detail.raw.id === 'string' && detail.raw.id.trim() !== '' ? detail.raw.id : chunk[i];
        entries.push([rawId, parseObjectDetail(detail.raw)]);
      });
      opts.onBatch(entries);
      done += chunk.length;
      opts.onProgress?.(done, total);
    }
  }

  assertAlive();
  const workers = Array.from({ length: Math.min(EXPORT_BATCH_CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);
}
```

- [ ] **Step 5 : vérifier le vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-fetch.test.ts && npm run typecheck
git add src/services/rpc.ts src/services/export/export-fetch.ts src/services/export/export-fetch.test.ts
git commit -m "feat(export): getObjectResourcesBatch (projection fields) + chargeur streamant, concurrence 2, fusion par object_id

R1 : onBatch streame chaque lot (aplatissement immediat cote appelant, JSON
libere) ; 2 lots en vol max ; payload.id fait foi sur la position ; progression
et annulation par AbortSignal ; jamais de null dans p_ids."
```

---

### Tâche 4 : registre d'export — contrat, helpers, fixture de test partagée

**Files:**
- Create: `bertel-tourism-ui/src/services/export/export-columns.ts` (contrat + helpers seulement dans cette tâche)
- Create: `bertel-tourism-ui/src/services/export/export-fixture.test-utils.ts`
- Test: `bertel-tourism-ui/src/services/export/export-columns.test.ts` (helpers seulement)

**Interfaces:**
- Consumes: `ParsedObjectDetail` et ses sous-types (`src/services/object-detail-parser.ts:218`), types d'items (`src/features/object-drawer/utils.ts:10-319`).
- Produces (consommés par Tâches 5-10) :
  - `type ExportClearance = 'public' | 'org' | 'actor_identity' | 'actor_contacts' | 'editor' | 'superuser'` (R1)
  - `type ExportCellValue = string | number | null` (R1)
  - `type ExportGroupId = 'identite' | 'localisation' | 'contacts' | 'descriptions' | 'labels' | 'equipements' | 'capacite' | 'tarifs' | 'horaires' | 'medias' | 'acteur' | 'organisation' | 'legal' | 'liens'`
  - `interface ActorContactChannel { kindCode: string; kindName: string; value: string; isPrimary: boolean }`
  - `interface ActorContactsRow { objectId: string; displayName: string; roleName: string; isPrimary: boolean; note: string; contacts: ActorContactChannel[] }`
  - `interface ExportContext { actorContacts: Map<string, ActorContactsRow[]> | null }`
  - `interface ExportColumnDef { id; label; group; clearance; cellType?: 'text' | 'number'; fields?: string[]; requiresPurpose?: true; value(d, ctx): ExportCellValue }` — `cellType` absent = `'text'` ; `fields` = blocs `get_object_resource` requis (projection R1 ; absent = fiche complète requise, la projection est alors désactivée pour tout l'export)
  - helpers : `SEP`, `joinParts`, `itemLabels`, `groupItems`, `rawRecord`, `rawStr`, `rawList`, `namedList`, `dateFr`, `openingToText`, `EXPORT_GROUP_LABELS`, `requiredFieldsFor(columnIds): string[] | undefined`
- **Interdit :** aucune colonne ne lit `privateNote`/`privateNotes` (constrainte globale — un test le verrouille en Tâche 7).

- [ ] **Step 0 (R1) : la matrice des colonnes, validée par le PO AVANT le code**

Produire `docs/superpowers/specs/2026-07-31-export-excel-columns-matrix.md` : un tableau
UNE LIGNE PAR COLONNE du registre (celles des Tâches 5-7, qui servent de source), aux
colonnes : `id | libellé FR | groupe | source (chemin ParsedObjectDetail ou raw.*) |
type XLSX (text/number) | capacité requise | règle d'agrégation (jointure « | », comptage,
premier…) | si absent (rend '') | caractère (public / partenaire / interne / personnel)`.
Les colonnes `actor_*` portent « personnel » ; les colonnes `org`-clearance portent
« interne ». Committer le fichier, puis **STOP : présenter la matrice au PO et attendre
sa validation explicite avant d'exécuter les Tâches 5-7.** Toute correction du PO
s'applique à la matrice ET aux blocs de code des tâches concernées avant de continuer.

- [ ] **Step 1 : écrire le test des helpers (échec attendu)**

Créer `src/services/export/export-columns.test.ts` :

```ts
import { SEP, joinParts, dateFr, openingToText, namedList } from './export-columns';

describe('helpers du registre (§208)', () => {
  it('joinParts joint par « | » et écarte vide/null', () => {
    expect(joinParts(['a', '', null, 'b'])).toBe('a | b');
    expect(SEP).toBe(' | ');
  });
  it('dateFr rend jj/mm/aaaa et \'\' sur invalide/absent (tri-état §133)', () => {
    expect(dateFr('2026-07-31T04:00:00Z')).toBe('31/07/2026');
    expect(dateFr('')).toBe('');
    expect(dateFr('pas-une-date')).toBe('');
  });
  it("openingToText compose libellé — période — jours (weekdaySlots, JAMAIS slots seuls — §151)", () => {
    expect(
      openingToText({
        label: 'Haute saison', slots: ['09:00–12:00'], weekdays: ['Lundi'],
        weekdaySlots: [{ weekday: 'Lun–Ven', slots: ['09:00–12:00', '14:00–18:00'] }, { weekday: 'Sam', slots: ['09:00–12:00'] }],
        details: ['Fermé jours fériés'], season: '', allYears: false, startDate: '2026-06-01', endDate: '2026-09-30',
      }),
    ).toBe('Haute saison — 01/06/2026 → 30/09/2026 — Lun–Ven 09:00–12:00, 14:00–18:00 · Sam 09:00–12:00 — Fermé jours fériés');
  });
  it('namedList résout name→label→code (readNamedValue) et joint', () => {
    expect(namedList([{ name: 'Wi-Fi' }, { label: 'Piscine' }, { code: 'raw_code' }])).toBe('Wi-Fi | Piscine | raw_code');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts
```

Attendu : FAIL (module inexistant).

- [ ] **Step 3 : créer le contrat + helpers**

Créer `src/services/export/export-columns.ts` avec CE contenu (les groupes de colonnes s'ajouteront en Tâches 5-7 à l'emplacement marqué) :

```ts
import { readNamedValue } from '../../features/object-drawer/utils';
import type { OpeningItem, TaxonomyItem } from '../../features/object-drawer/utils';
import type { ParsedObjectDetail } from '../object-detail-parser';

/**
 * §208 — REGISTRE UNIQUE des colonnes d'export Excel de l'Exploreur.
 * Étend le contrat de table-columns.tsx (TableColumnDef) à la fiche COMPLÈTE
 * (ParsedObjectDetail), avec groupe + niveau d'autorisation. Toute nouvelle
 * colonne s'ajoute ICI — jamais un 5e écrivain ad hoc (invariant « un concept,
 * une surface », §196). `clearance` FILTRE l'offre (jamais un simple masquage,
 * §205) mais N'EST PAS la garde : la garde reste serveur (RLS + gates DEFINER
 * + 16t pour les coordonnées d'acteur).
 * INTERDIT : aucune colonne ne lit text.privateNote(s) / internal.privateNotes
 * (décision PO §208 — les notes d'équipe ne sortent jamais en Excel).
 */

/**
 * R1 — capacités MÉTIER, pas des rangs : `actor_identity` reprend exactement le
 * droit normal de consulter les acteurs d'une fiche (le gate de ligne serveur
 * v_can_read_extended OR visibility='public') ; `actor_contacts` exige le droit
 * d'export renforcé (16t). On ne réinvente PAS une interprétation des rôles pour
 * l'export : la modale approxime (ergonomie), le serveur réévalue PAR FICHE.
 */
export type ExportClearance = 'public' | 'org' | 'actor_identity' | 'actor_contacts' | 'editor' | 'superuser';

export type ExportCellValue = string | number | null;

export type ExportGroupId =
  | 'identite' | 'localisation' | 'contacts' | 'descriptions' | 'labels'
  | 'equipements' | 'capacite' | 'tarifs' | 'horaires' | 'medias'
  | 'acteur' | 'organisation' | 'legal' | 'liens';

export const EXPORT_GROUP_LABELS: Record<ExportGroupId, string> = {
  identite: 'Identité', localisation: 'Localisation', contacts: 'Contacts',
  descriptions: 'Descriptions', labels: 'Labels & classements', equipements: 'Équipements',
  capacite: 'Capacité & politiques', tarifs: 'Tarifs', horaires: 'Horaires', medias: 'Médias',
  acteur: 'Propriétaire / acteur', organisation: 'Organisation éditrice', legal: 'Légal',
  liens: 'Liens & références',
};

/** Ligne rendue par api.export_actor_contacts (Tâche 12) — camelCase côté front. */
export interface ActorContactChannel { kindCode: string; kindName: string; value: string; isPrimary: boolean }
export interface ActorContactsRow {
  objectId: string; displayName: string; roleName: string; isPrimary: boolean; note: string;
  contacts: ActorContactChannel[];
}

export interface ExportContext {
  /** Rempli UNIQUEMENT par l'appel journalisé api.export_actor_contacts ; null sinon. Les colonnes requiresPurpose ne lisent QUE ceci — jamais detail.relations.actors[].contacts (le journal serait contournable). */
  actorContacts: Map<string, ActorContactsRow[]> | null;
}

export interface ExportColumnDef {
  id: string;
  /** Libellé FR — part tel quel en en-tête de colonne Excel. */
  label: string;
  group: ExportGroupId;
  clearance: ExportClearance;
  /** R1 — type de cellule XLSX. Absent = 'text'. 'number' : latitude/longitude uniquement. */
  cellType?: 'text' | 'number';
  /** R1 — blocs get_object_resource requis (projection p_options.fields). Absent = fiche complète requise : la projection est alors désactivée pour l'export entier. */
  fields?: string[];
  /** TRUE ⇒ exige la saisie d'une finalité + l'appel journalisé (§208). Exactement les colonnes gardées serveur par 16t — même ensemble, aucune zone grise. */
  requiresPurpose?: true;
  value: (d: ParsedObjectDetail, ctx: ExportContext) => ExportCellValue;
}

/**
 * R1 — union des blocs requis par les colonnes cochées, pour p_options.fields.
 * `undefined` = au moins une colonne exige la fiche complète ⇒ pas de projection.
 * Mécanisme non étanche (certains legs sortent hors garde v_fields) : c'est une
 * optimisation de payload, jamais une garde.
 */
export function requiredFieldsFor(columnIds: string[]): string[] | undefined {
  const union = new Set<string>();
  for (const id of columnIds) {
    const col = getExportColumn(id);
    if (!col) continue;
    if (!col.fields) return undefined;
    col.fields.forEach((f) => union.add(f));
  }
  return [...union];
}

// ---------- Helpers d'aplatissement ----------

/** Séparateur INTRA-cellule. Jamais ';' (séparateur de cellules CSV en locale FR). */
export const SEP = ' | ';

export function joinParts(parts: Array<string | null | undefined>, sep = SEP): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
}

export function itemLabels(items: TaxonomyItem[]): string {
  return joinParts(items.map((i) => i.label));
}

/** Groupe de taxonomie par clé — parseTaxonomyGroups omet les groupes vides, donc find + défaut []. Clés réelles : taxonomy/labels/badges/tags/classifications/sustainability/environment/payments/languages/practices (utils.ts:1338-1356). */
export function groupItems(d: ParsedObjectDetail, key: string): TaxonomyItem[] {
  return d.taxonomy.groups.find((g) => g.key === key)?.items ?? [];
}

export function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Lecture défensive dans raw (18 colonnes que le parser n'expose pas — spec §8.3 : lecture directe assumée, gardée par le test de présence de clés de la Tâche 7). */
export function rawStr(d: ParsedObjectDetail, ...path: string[]): string {
  let cursor: unknown = d.raw;
  for (const key of path) {
    cursor = rawRecord(cursor)[key];
  }
  if (cursor == null) return '';
  return typeof cursor === 'string' ? cursor.trim() : typeof cursor === 'number' || typeof cursor === 'boolean' ? String(cursor) : '';
}

export function rawList(d: ParsedObjectDetail, key: string): Array<Record<string, unknown>> {
  const value = d.raw[key];
  return Array.isArray(value) ? value.map(rawRecord) : [];
}

/** Liste de {code,name}-like → libellés FR joints. Un SNAKE_CASE qui sort = bug serveur (les name sont résolus i18n côté RPC), le code n'est que le filet. */
export function namedList(list: unknown): string {
  if (!Array.isArray(list)) return '';
  return joinParts(list.map((entry) => readNamedValue(entry, '')));
}

const FR_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : FR_DATE.format(time);
}

/** Une période d'ouverture en clair. weekdaySlots OBLIGATOIRE (jamais slots[] seuls — créneaux détachés des jours, cas réels §151). */
export function openingToText(o: OpeningItem): string {
  const days = (o.weekdaySlots ?? []).map((ws) => `${ws.weekday} ${ws.slots.join(', ')}`).join(' · ');
  const period = o.allYears ? "Toute l'année" : joinParts([dateFr(o.startDate), dateFr(o.endDate)], ' → ');
  return joinParts([o.label !== period ? o.label : '', period, days, (o.details ?? []).join(', ')], ' — ');
}

// ---------- Colonnes (Tâches 5-7) ----------

export const EXPORT_COLUMNS: ExportColumnDef[] = [
  // PLAN-TACHE-5-ICI
];

export const EXPORT_COLUMN_IDS: string[] = EXPORT_COLUMNS.map((c) => c.id);

export function getExportColumn(id: string): ExportColumnDef | undefined {
  return EXPORT_COLUMNS.find((c) => c.id === id);
}
```

Note : `openingToText` évite de doubler le libellé quand il est égal à la période (« Toute l'année » — `getOpeningPeriodLabel` rend ce libellé par défaut, utils.ts:152-163).

- [ ] **Step 4 : vérifier le vert des helpers**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts
```

Attendu : PASS.

- [ ] **Step 5 : créer la fixture partagée**

Créer `src/services/export/export-fixture.test-utils.ts`. Elle passe par le VRAI `parseObjectDetail` (garde d'intégration parser↔registre) et fournit un contexte acteur :

```ts
import { parseObjectDetail, type ParsedObjectDetail } from '../object-detail-parser';
import type { ExportContext } from './export-columns';

/**
 * Fixture §208 — un extrait de payload get_object_resource, dans les FORMES
 * RÉELLES émises par le RPC (api_views_functions.sql). Passe par le vrai
 * parseObjectDetail : si le parser change de contrat, les tests du registre
 * tombent ici — c'est voulu.
 */
export const FIXTURE_RAW: Record<string, unknown> = {
  id: 'HOTRUN0000000TST', type: 'HOT', status: 'published', commercial_visibility: 'active',
  name: 'Hôtel Témoin', region_code: 'RUN',
  created_at: '2026-01-15T08:00:00Z', updated_at: '2026-07-30T10:00:00Z', published_at: '2026-02-01T08:00:00Z',
  address: { address1: '12 rue des Bois', postcode: '97418', city: 'Le Tampon', lieu_dit: 'La Plaine des Cafres', code_insee: '' },
  location: { latitude: -21.2783, longitude: 55.5187, altitude_m: 1600 },
  description: 'Description propre sans Markdown.',
  description_chapo: 'Accroche témoin.',
  contacts: [
    { id: 'c1', kind: { code: 'phone', name: 'Téléphone' }, value: '0262 27 00 00', is_public: true, is_primary: true },
    { id: 'c2', kind: { code: 'email', name: 'E-mail' }, value: 'contact@temoin.re', is_public: true },
    { id: 'c3', kind: { code: 'website', name: 'Site web' }, value: 'https://temoin.re', is_public: true },
    { id: 'c4', kind: { code: 'phone', name: 'Téléphone' }, value: '0692 00 00 00', is_public: false },
  ],
  languages: [{ code: 'fr', name: 'Français' }, { code: 'en', name: 'Anglais' }],
  amenities: [{ code: 'wifi', name: 'Wi-Fi' }, { code: 'piscine', name: 'Piscine' }],
  payment_methods: [{ code: 'cb', name: 'Carte bancaire' }],
  environment_tags: [{ code: 'montagne', name: 'Montagne' }],
  tags: [{ slug: 'vue_mer', name: 'Vue mer' }],
  taxonomy: [{ code: 'hot_3', name: 'Hôtel 3 étoiles' }],
  classifications: [{ scheme_name: 'Classement hôtelier', value_name: '3 étoiles', status: 'granted' }],
  sustainability_labels: [{ scheme_name: 'Clef Verte', status: 'granted' }],
  capacities: [{ metric_code: 'max_capacity', metric_name: 'Capacité maximale', value: 40 }, { metric_code: 'bedrooms', metric_name: 'Chambres', value: 18 }],
  prices: [
    { label: 'Chambre double', amount: '90', currency: 'EUR', period_label: 'par nuit' },
    { label: 'Petit-déjeuner', amount: 'n/a', currency: 'EUR' },
  ],
  pet_policy: { accepted: true, conditions: 'Petits chiens uniquement' },
  group_policies: [{ min_size: '10', max_size: '30', group_only: false, notes: 'Sur réservation' }],
  media: [
    { id: 'm1', url: 'https://cdn/img1.jpg', title: 'Façade', is_main: true, credit: 'OTI Sud', visibility: 'public' },
    { id: 'm2', url: 'https://cdn/img2.jpg', title: 'Piscine', visibility: 'private' },
  ],
  legal_records: [
    { type: { code: 'siret', name: 'SIRET', is_public: true }, value: '12345678900011', status: 'valide' },
    { type: { code: 'assurance_rc', name: 'Assurance RC', is_public: false }, value: 'POL-99', status: 'valide' },
  ],
  actors: [
    { id: 'a1', display_name: 'Jean Payet', role: { code: 'operator', name: 'Exploitant' }, is_primary: true, visibility: 'partners', contacts: [], contacts_restricted: true },
  ],
  org_links: [{ org_object_id: 'ORGRUN000000000A', name: 'OTI du Sud', role: { code: 'publisher', name: 'Éditeur' }, is_primary: true }],
  external_ids: [{ source: 'berta', external_id: 'B-1234' }],
  outgoing_relations: [{ target: { id: 'PNARUN000000000X', type: 'PNA', name: 'Site du Volcan' }, relation_type: { code: 'based_at_site', name: 'Basé sur le site' } }],
  web_channels: [{ platform: { code: 'facebook', name: 'Facebook' }, url: 'https://fb.example/temoin' }],
};

export function buildFixtureDetail(overrides: Record<string, unknown> = {}): ParsedObjectDetail {
  return parseObjectDetail({ ...FIXTURE_RAW, ...overrides });
}

export const EMPTY_CTX: ExportContext = { actorContacts: null };

export function ctxWithActorContacts(): ExportContext {
  return {
    actorContacts: new Map([[
      'HOTRUN0000000TST',
      [{
        objectId: 'HOTRUN0000000TST', displayName: 'Jean Payet', roleName: 'Exploitant', isPrimary: true,
        note: 'Préférer le matin',
        contacts: [
          { kindCode: 'mobile', kindName: 'Mobile', value: '0692 11 22 33', isPrimary: true },
          { kindCode: 'email', kindName: 'E-mail', value: 'jean.payet@exemple.re', isPrimary: false },
        ],
      }],
    ]]),
  };
}
```

**Précision honnête sur la fixture** (à conserver telle quelle dans l'esprit des tests) : les blocs dont la forme d'entrée du parser est complexe (`opening_times` arbre 5 tables, `room_types`, `meeting_rooms`, `itinerary_details`, `fma_occurrences`) ne sont PAS dans la fixture — leurs colonnes sont testées « ne jette pas et rend '' sur fiche sans le bloc », et leur logique d'aplatissement est testée UNITAIREMENT sur des items construits (cf. `openingToText` en Step 1). Ne pas inventer des formes de payload non vérifiées.

- [ ] **Step 6 : typecheck + commit**

```bash
cd bertel-tourism-ui && npm run typecheck
git add src/services/export/export-columns.ts src/services/export/export-columns.test.ts src/services/export/export-fixture.test-utils.ts
git commit -m "feat(export): contrat du registre de colonnes + helpers d'aplatissement + fixture partagee"
```

---

### Tâche 5 : registre — groupes Identité, Localisation, Contacts, Descriptions

**Files:**
- Modify: `bertel-tourism-ui/src/services/export/export-columns.ts` (remplacer le marqueur `// PLAN-TACHE-5-ICI`)
- Test: `bertel-tourism-ui/src/services/export/export-columns.test.ts` (étendre)

**Interfaces:**
- Consumes: helpers Tâche 4, `resolveTypeLabel` (`src/utils/labels.ts:30`), `STATUS_LABELS` — **recopié localement** (celui de `table-columns.tsx:19` n'est pas exporté ; ne pas l'exporter pour ça, la vue Table reste intouchée).

- [ ] **Step 1 : tests d'abord (échec attendu)**

Ajouter à `export-columns.test.ts` :

```ts
import { EXPORT_COLUMNS, getExportColumn } from './export-columns';
import { buildFixtureDetail, EMPTY_CTX } from './export-fixture.test-utils';

const d = buildFixtureDetail();
const val = (id: string) => {
  const col = getExportColumn(id);
  if (!col) throw new Error(`colonne absente du registre: ${id}`);
  return col.value(d, EMPTY_CTX);
};

describe('registre — identité/localisation/contacts/descriptions (§208)', () => {
  it('identité', () => {
    expect(val('id')).toBe('HOTRUN0000000TST');
    expect(val('name')).toBe('Hôtel Témoin');
    expect(val('type_code')).toBe('HOT');
    expect(val('type')).not.toBe('HOT'); // libellé FR résolu, jamais le code nu
    expect(val('status')).toBe('Publiée');
    expect(val('updated_at')).toBe('30/07/2026');
  });
  it('localisation — postcode reste une chaîne, code_insee vide rend \'\', lat/lon NUMÉRIQUES (R1)', () => {
    expect(val('postcode')).toBe('97418');
    expect(val('city')).toBe('Le Tampon');
    expect(val('code_insee')).toBe('');
    expect(val('latitude')).toBe(-21.2783);
    expect(getExportColumn('latitude')!.cellType).toBe('number');
    expect(getExportColumn('longitude')!.cellType).toBe('number');
    expect(val('altitude_m')).toBe('1600');
  });
  it('contacts — value, jamais displayValue/href ; le non-public reste hors de la colonne publique', () => {
    expect(val('phone')).toBe('0262 27 00 00');
    expect(val('email')).toBe('contact@temoin.re');
    expect(val('website')).toBe('https://temoin.re');
    expect(val('contacts_public')).not.toContain('0692 00 00 00');
    expect(val('web_channels')).toContain('Facebook');
  });
  it('descriptions', () => {
    expect(val('description')).toBe('Description propre sans Markdown.');
    expect(val('chapo')).toBe('Accroche témoin.');
    expect(val('descriptions_langs')).toBe('');
  });
  it('toutes les colonnes rendent string | number | null sans jeter, même sur une fiche quasi vide (R1)', () => {
    const minimal = buildFixtureDetail({
      contacts: [], languages: [], amenities: [], payment_methods: [], environment_tags: [], tags: [],
      taxonomy: [], classifications: [], sustainability_labels: [], capacities: [], prices: [],
      media: [], legal_records: [], actors: [], org_links: [], external_ids: [], outgoing_relations: [],
      web_channels: [], pet_policy: null, group_policies: [],
    });
    for (const col of EXPORT_COLUMNS) {
      const out = col.value(minimal, EMPTY_CTX);
      expect(out === null || typeof out === 'string' || typeof out === 'number').toBe(true);
      if (col.cellType !== 'number') expect(typeof out).toBe('string');
    }
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts
```

Attendu : FAIL (« colonne absente du registre: id »).

- [ ] **Step 3 : implémenter les 4 groupes**

Dans `export-columns.ts`, ajouter sous les imports :

```ts
import { resolveTypeLabel } from '../../utils/labels';
```

Au-dessus de `EXPORT_COLUMNS`, ajouter :

```ts
/** Vocabulaire statut — même contenu que table-columns.tsx:19 (non exporté là-bas ; la vue Table reste intouchée). */
const STATUS_LABELS: Record<string, string> = {
  published: 'Publiée', draft: 'Brouillon', hidden: 'Hors ligne', archived: 'Archivée',
};

const PHONE_KINDS = new Set(['phone', 'tel', 'telephone', 'telephone_fixe']);
const MOBILE_KINDS = new Set(['mobile', 'telephone_mobile']);

function firstPublicContact(d: ParsedObjectDetail, match: (kindCode: string) => boolean): string {
  return d.contacts.public.find((c) => match(c.kindCode))?.value ?? '';
}
function contactLine(c: { kind: string; value: string }): string {
  return c.kind ? `${c.kind} : ${c.value}` : c.value;
}
```

Remplacer la ligne `// PLAN-TACHE-5-ICI` par les colonnes (le marqueur `// PLAN-TACHE-6-ICI` reçoit la suite) :

```ts
  // ---------- Identité ----------
  { id: 'id', label: 'Identifiant', group: 'identite', clearance: 'public', value: (d) => d.identity.id },
  { id: 'name', label: 'Nom', group: 'identite', clearance: 'public', value: (d) => d.identity.name },
  { id: 'type_code', label: 'Code type', group: 'identite', clearance: 'public', value: (d) => d.identity.type },
  { id: 'type', label: 'Type', group: 'identite', clearance: 'public', value: (d) => resolveTypeLabel(d.identity.type) },
  { id: 'status', label: 'Statut', group: 'identite', clearance: 'public', value: (d) => STATUS_LABELS[d.identity.status] ?? d.identity.status },
  { id: 'commercial_visibility', label: 'Visibilité commerciale', group: 'identite', clearance: 'org', value: (d) => d.identity.commercialVisibility },
  { id: 'region_code', label: 'Territoire', group: 'identite', clearance: 'public', value: (d) => d.identity.regionCode },
  { id: 'created_at', label: 'Créée le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.createdAt) },
  { id: 'updated_at', label: 'Mise à jour le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.updatedAt) },
  { id: 'published_at', label: 'Publiée le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.publishedAt) },
  { id: 'taxonomy', label: 'Sous-catégorie', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'taxonomy')) },
  { id: 'tags', label: 'Étiquettes', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'tags')) },
  { id: 'environment_tags', label: 'Cadre & environnement', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'environment')) },

  // ---------- Localisation ----------
  { id: 'address', label: 'Adresse', group: 'localisation', clearance: 'public', value: (d) => d.location?.address ?? '' },
  { id: 'city', label: 'Commune', group: 'localisation', clearance: 'public', value: (d) => d.location?.city ?? '' },
  { id: 'postcode', label: 'Code postal', group: 'localisation', clearance: 'public', value: (d) => d.location?.postcode ?? '' },
  { id: 'lieu_dit', label: 'Lieu-dit', group: 'localisation', clearance: 'public', value: (d) => d.location?.lieuDit ?? '' },
  { id: 'direction', label: 'Accès / itinéraire', group: 'localisation', clearance: 'public', value: (d) => d.location?.direction ?? '' },
  { id: 'location_label', label: 'Localisation (ligne)', group: 'localisation', clearance: 'public', value: (d) => d.location?.label ?? '' },
  // R1 — les DEUX seules colonnes numériques du registre (cellType 'number', valeur number|null).
  { id: 'latitude', label: 'Latitude', group: 'localisation', clearance: 'public', cellType: 'number', value: (d) => d.location?.latitude ?? null },
  { id: 'longitude', label: 'Longitude', group: 'localisation', clearance: 'public', cellType: 'number', value: (d) => d.location?.longitude ?? null },
  { id: 'google_maps_url', label: 'Lien Google Maps', group: 'localisation', clearance: 'public', value: (d) => d.location?.googleMapsUrl ?? '' },
  { id: 'directions_url', label: 'Lien itinéraire', group: 'localisation', clearance: 'public', value: (d) => d.location?.directionsUrl ?? '' },
  { id: 'code_insee', label: 'Code INSEE', group: 'localisation', clearance: 'public', value: (d) => rawStr(d, 'address', 'code_insee') },
  { id: 'altitude_m', label: 'Altitude (m)', group: 'localisation', clearance: 'public', value: (d) => rawStr(d, 'location', 'altitude_m') },
  { id: 'zones', label: 'Communes desservies', group: 'localisation', clearance: 'public', value: (d) => namedList(d.raw.object_zone) },
  { id: 'places_count', label: 'Nombre de sous-lieux', group: 'localisation', clearance: 'public', value: (d) => (d.text.places.length ? String(d.text.places.length) : '') },
  { id: 'places', label: 'Sous-lieux', group: 'localisation', clearance: 'public', value: (d) => joinParts(d.text.places.map((p) => p.name)) },

  // ---------- Contacts ----------
  { id: 'phone', label: 'Téléphone', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => PHONE_KINDS.has(k)) },
  { id: 'mobile', label: 'Mobile', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => MOBILE_KINDS.has(k)) },
  { id: 'email', label: 'E-mail', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => k === 'email') },
  { id: 'website', label: 'Site web', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => k === 'website') },
  { id: 'contacts_public', label: 'Contacts publics', group: 'contacts', clearance: 'public', value: (d) => joinParts(d.contacts.public.map(contactLine)) },
  { id: 'contacts_object', label: 'Contacts de la fiche (tous)', group: 'contacts', clearance: 'org', value: (d) => joinParts(d.contacts.object.map(contactLine)) },
  { id: 'contacts_orgs', label: 'Contacts organisations', group: 'contacts', clearance: 'org', value: (d) => joinParts(d.contacts.organizations.map(contactLine)) },
  { id: 'web_channels', label: 'Réseaux & distribution', group: 'contacts', clearance: 'public', value: (d) => joinParts(rawList(d, 'web_channels').map((w) => joinParts([readNamedValue(w.platform, ''), typeof w.url === 'string' ? w.url : ''], ' : '))) },
  { id: 'spoken_languages', label: 'Langues parlées', group: 'contacts', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'languages')) },

  // ---------- Descriptions ----------
  { id: 'chapo', label: 'Accroche', group: 'descriptions', clearance: 'public', value: (d) => d.text.chapo },
  { id: 'description', label: 'Description', group: 'descriptions', clearance: 'public', value: (d) => d.text.description },
  { id: 'description_adapted', label: 'Description adaptée', group: 'descriptions', clearance: 'public', value: (d) => d.text.adaptedDescription },
  { id: 'description_mobile', label: 'Description mobile', group: 'descriptions', clearance: 'public', value: (d) => d.text.mobileDescription },
  { id: 'description_edition', label: 'Description édition', group: 'descriptions', clearance: 'public', value: (d) => d.text.editorialDescription },
  { id: 'description_hors_zone', label: 'Offre hors zone', group: 'descriptions', clearance: 'public', value: (d) => rawStr(d, 'description_offre_hors_zone') },
  { id: 'sanitary_measures', label: 'Mesures sanitaires', group: 'descriptions', clearance: 'public', value: (d) => rawStr(d, 'sanitary_measures') },
  { id: 'descriptions_langs', label: 'Langues de description', group: 'descriptions', clearance: 'public', value: (d) => joinParts([...new Set(d.text.descriptions.map((x) => x.language))]) },
  // PLAN-TACHE-6-ICI
```

**Interdits vérifiés ici :** pas de `description_md`/`chapo_md` (Markdown brut = legs éditeur, jamais dans un export de diffusion — spec §5) ; pas de `is_editing`/`updated_at_source` (bruit interne sans consommateur identifié) ; pas de colonnes notes.

- [ ] **Step 4 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts && npm run typecheck
git add src/services/export/export-columns.ts src/services/export/export-columns.test.ts
git commit -m "feat(export): registre — groupes identite, localisation, contacts, descriptions"
```

---

### Tâche 6 : registre — groupes Labels, Équipements, Capacité, Tarifs, Horaires, Médias

**Files:**
- Modify: `bertel-tourism-ui/src/services/export/export-columns.ts` (remplacer `// PLAN-TACHE-6-ICI`)
- Test: `bertel-tourism-ui/src/services/export/export-columns.test.ts` (étendre)

- [ ] **Step 1 : tests d'abord**

```ts
describe('registre — labels/équipements/capacité/tarifs/horaires/médias (§208)', () => {
  it('labels & classements', () => {
    expect(val('classifications')).toContain('3 étoiles');
    expect(val('sustainability_labels')).toContain('Clef Verte');
  });
  it('équipements et politiques', () => {
    expect(val('amenities')).toBe('Wi-Fi | Piscine');
    expect(val('payment_methods')).toBe('Carte bancaire');
    expect(val('pets_accepted')).toBe('Oui');
    expect(val('pets_conditions')).toContain('Petits chiens');
  });
  it('tri-état animaux : null ⇒ cellule vide, jamais « Non » (§133)', () => {
    const noPet = buildFixtureDetail({ pet_policy: null });
    expect(getExportColumn('pets_accepted')!.value(noPet, EMPTY_CTX)).toBe('');
  });
  it('capacité', () => {
    expect(val('capacity_max')).toContain('40');
    expect(val('capacity')).toContain('Chambres');
    expect(val('group_min')).toBe('10');
  });
  it("tarifs — 'n/a' n'entre jamais dans un min (piège maison)", () => {
    expect(val('price_min')).toBe('90');
    expect(val('prices')).toContain('Chambre double');
    expect(val('prices')).not.toContain('n/a');
  });
  it('médias — la privée est comptée à part, la couverture est la principale', () => {
    expect(val('photo_main')).toBe('https://cdn/img1.jpg');
    expect(val('photo_main_credit')).toBe('OTI Sud');
    expect(val('media_count')).toBe('2');
    expect(val('media_private_count')).toBe('1');
  });
});
```

- [ ] **Step 2 : vérifier l'échec** — même commande que Tâche 5. Attendu : FAIL.

- [ ] **Step 3 : implémenter**

Helpers additionnels au-dessus de `EXPORT_COLUMNS` :

```ts
function priceAmounts(d: ParsedObjectDetail): number[] {
  // object_price.amount vaut la CHAÎNE 'n/a' quand absent — filtrer avant tout Math.min (piège maison).
  return d.operations.prices.map((p) => Number(p.amount)).filter((n) => Number.isFinite(n));
}
function priceLine(p: { label: string; amount: string; currency: string; periodLabel: string }): string {
  const amount = Number.isFinite(Number(p.amount)) ? `${p.amount} ${p.currency || 'EUR'}` : '';
  return joinParts([p.label, amount, p.periodLabel], ' — ');
}
function triState(value: boolean | null | undefined, yes: string, no: string): string {
  return value == null ? '' : value ? yes : no;
}
```

Remplacer `// PLAN-TACHE-6-ICI` par (marqueur suivant en queue) :

```ts
  // ---------- Labels & classements ----------
  { id: 'classifications', label: 'Classements & labels', group: 'labels', clearance: 'public', value: (d) => joinParts(groupItems(d, 'classifications').map((i) => joinParts([i.label, i.meta], ' '))) },
  { id: 'labels_neutral', label: 'Labels', group: 'labels', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'labels')) },
  { id: 'badges', label: 'Badges', group: 'labels', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'badges')) },
  { id: 'sustainability_labels', label: 'Labels durabilité', group: 'labels', clearance: 'public', value: (d) => itemLabels(d.taxonomy.sustainability.labels) },
  { id: 'sustainability_actions', label: 'Actions durabilité', group: 'labels', clearance: 'public', value: (d) => itemLabels(d.taxonomy.sustainability.actions) },
  { id: 'accessibility_labels', label: 'Labels accessibilité', group: 'labels', clearance: 'public', value: (d) => namedList(d.raw.accessibility_labels) },
  { id: 'disability_types', label: 'Handicaps couverts', group: 'labels', clearance: 'public', value: (d) => joinParts(rawList(d, 'accessibility_labels').flatMap((l) => (Array.isArray(l.disability_types_covered) ? (l.disability_types_covered as unknown[]).map((t) => DISABILITY_LABELS[String(t)] ?? String(t)) : []))) },

  // ---------- Équipements ----------
  { id: 'amenities', label: 'Équipements', group: 'equipements', clearance: 'public', value: (d) => joinParts(d.taxonomy.amenities) },
  { id: 'amenities_count', label: "Nombre d'équipements", group: 'equipements', clearance: 'public', value: (d) => (d.taxonomy.amenities.length ? String(d.taxonomy.amenities.length) : '') },
  { id: 'payment_methods', label: 'Moyens de paiement', group: 'equipements', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'payments')) },
  { id: 'practices', label: 'Pratiques', group: 'equipements', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'practices')) },
  { id: 'cuisine_types', label: 'Types de cuisine', group: 'equipements', clearance: 'public', value: (d) => namedList(d.raw.cuisine_types) },
  { id: 'dietary_tags', label: 'Régimes alimentaires', group: 'equipements', clearance: 'public', value: (d) => namedList(d.raw.dietary_tags) },
  { id: 'allergens', label: 'Allergènes', group: 'equipements', clearance: 'public', value: (d) => namedList(d.raw.allergens) },

  // ---------- Capacité & politiques ----------
  { id: 'capacity', label: 'Capacités', group: 'capacite', clearance: 'public', value: (d) => joinParts(d.operations.capacities.map((c) => `${c.label} : ${c.value}`)) },
  { id: 'capacity_max', label: 'Capacité maximale', group: 'capacite', clearance: 'public', value: (d) => d.operations.capacities.find((c) => /capacit/i.test(c.label))?.value ?? d.operations.capacities[0]?.value ?? '' },
  { id: 'rooms_count', label: 'Types de chambres', group: 'capacite', clearance: 'public', value: (d) => (d.operations.roomTypes.length ? String(d.operations.roomTypes.length) : '') },
  { id: 'room_types', label: 'Chambres', group: 'capacite', clearance: 'public', value: (d) => joinParts(d.operations.roomTypes.map((r) => joinParts([r.name, r.quantity && `×${r.quantity}`, r.capacityAdults && `${r.capacityAdults} pers.`], ' '))) },
  { id: 'meeting_rooms_count', label: 'Salles de séminaire', group: 'capacite', clearance: 'public', value: (d) => (d.operations.meetingRooms.length ? String(d.operations.meetingRooms.length) : '') },
  { id: 'meeting_rooms', label: 'Salles (détail)', group: 'capacite', clearance: 'public', value: (d) => joinParts(d.operations.meetingRooms.map((m) => joinParts([m.name, m.areaM2 && `${m.areaM2} m²`, m.capacityTheatre && `théâtre ${m.capacityTheatre}`], ' — '))) },
  { id: 'group_min', label: 'Groupe — taille min', group: 'capacite', clearance: 'public', value: (d) => d.operations.groupPolicy?.minSize ?? '' },
  { id: 'group_max', label: 'Groupe — taille max', group: 'capacite', clearance: 'public', value: (d) => d.operations.groupPolicy?.maxSize ?? '' },
  { id: 'group_only', label: 'Groupes uniquement', group: 'capacite', clearance: 'public', value: (d) => (d.operations.groupPolicy ? triState(d.operations.groupPolicy.groupOnly, 'Oui', 'Non') : '') },
  { id: 'group_notes', label: 'Groupe — conditions', group: 'capacite', clearance: 'public', value: (d) => d.operations.groupPolicy?.notes ?? '' },
  { id: 'pets_accepted', label: 'Animaux acceptés', group: 'capacite', clearance: 'public', value: (d) => triState(d.operations.petPolicy?.accepted, 'Oui', 'Non') },
  { id: 'pets_conditions', label: 'Animaux — conditions', group: 'capacite', clearance: 'public', value: (d) => joinParts(d.operations.petPolicy?.details ?? []) },
  { id: 'checkin', label: "Heure d'arrivée", group: 'capacite', clearance: 'public', value: (d) => joinParts([rawStr(d, 'stay_policy', 'checkin_from'), rawStr(d, 'stay_policy', 'checkin_to')], ' – ') },
  { id: 'checkout', label: 'Heure de départ', group: 'capacite', clearance: 'public', value: (d) => rawStr(d, 'stay_policy', 'checkout_until') },

  // ---------- Tarifs ----------
  { id: 'prices', label: 'Tarifs', group: 'tarifs', clearance: 'public', value: (d) => joinParts(d.operations.prices.map(priceLine)) },
  { id: 'price_min', label: 'Tarif minimum', group: 'tarifs', clearance: 'public', value: (d) => { const a = priceAmounts(d); return a.length ? String(Math.min(...a)) : ''; } },
  { id: 'currency', label: 'Devise', group: 'tarifs', clearance: 'public', value: (d) => d.operations.prices.find((p) => p.currency)?.currency ?? '' },
  { id: 'discounts_count', label: 'Réductions (nombre)', group: 'tarifs', clearance: 'public', value: (d) => (d.operations.discounts.length ? String(d.operations.discounts.length) : '') },
  { id: 'discounts', label: 'Réductions', group: 'tarifs', clearance: 'public', value: (d) => joinParts(d.operations.discounts.map((x) => readNamedValue(x, ''))) },
  { id: 'promotions', label: 'Promotions', group: 'tarifs', clearance: 'org', value: (d) => namedList(d.raw.promotions) },

  // ---------- Horaires ----------
  { id: 'openings', label: "Horaires d'ouverture", group: 'horaires', clearance: 'public', value: (d) => joinParts(d.operations.openings.map(openingToText)) },
  { id: 'openings_count', label: "Périodes d'ouverture", group: 'horaires', clearance: 'public', value: (d) => (d.operations.openings.length ? String(d.operations.openings.length) : '') },
  { id: 'open_all_year', label: "Ouvert toute l'année", group: 'horaires', clearance: 'public', value: (d) => (d.operations.openings.length === 0 ? '' : d.operations.openings.some((o) => o.allYears) ? 'Oui' : 'Non') },

  // ---------- Médias ----------
  { id: 'photo_main', label: 'Photo principale (URL)', group: 'medias', clearance: 'public', value: (d) => d.media.hero?.url ?? '' },
  { id: 'photo_main_credit', label: 'Crédit photo principale', group: 'medias', clearance: 'public', value: (d) => d.media.hero?.credit ?? '' },
  { id: 'media_count', label: 'Nombre de médias', group: 'medias', clearance: 'public', value: (d) => (d.media.items.length ? String(d.media.items.length) : '') },
  { id: 'media_urls', label: 'URLs des médias', group: 'medias', clearance: 'public', value: (d) => joinParts(d.media.items.map((m) => m.url)) },
  { id: 'media_credits', label: 'Crédits médias', group: 'medias', clearance: 'public', value: (d) => joinParts([...new Set(d.media.items.map((m) => m.credit).filter(Boolean))]) },
  { id: 'media_tags', label: 'Tags médias', group: 'medias', clearance: 'public', value: (d) => joinParts(d.media.tagCloud) },
  { id: 'media_private_count', label: 'Médias non publics', group: 'medias', clearance: 'org', value: (d) => { const n = d.media.items.filter((m) => m.visibility && m.visibility !== 'public').length; return n ? String(n) : ''; } },
  // PLAN-TACHE-7-ICI
```

Et le petit vocabulaire local (au-dessus de `EXPORT_COLUMNS`, à côté de `STATUS_LABELS`) — la seule résolution client sans catalogue (spec §4.3) :

```ts
/** Types de handicap (`domain.ts:81`) — aucune table de libellés côté serveur pour ces 4 codes. */
const DISABILITY_LABELS: Record<string, string> = {
  motor: 'Moteur', hearing: 'Auditif', visual: 'Visuel', cognitive: 'Mental / cognitif',
};
```

Note `capacity_max` : `CapacityItem` ne porte pas `metric_code` (il est retiré au dédoublonnage, utils.ts:1320) — le match se fait sur le libellé (`/capacit/i`), repli premier item. C'est assumé et commenté sur place.

- [ ] **Step 4 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts && npm run typecheck
git add src/services/export/export-columns.ts src/services/export/export-columns.test.ts
git commit -m "feat(export): registre — labels, equipements, capacite, tarifs, horaires, medias"
```

---

### Tâche 7 : registre — Acteur, Organisation, Légal, Liens + niveaux d'autorisation + préréglages

**Files:**
- Modify: `bertel-tourism-ui/src/services/export/export-columns.ts` (remplacer `// PLAN-TACHE-7-ICI` + ajouts en fin de fichier)
- Test: `bertel-tourism-ui/src/services/export/export-columns.test.ts` (étendre)

**Interfaces:**
- Produces (consommés par Tâches 8-11) :
  - `interface ActorCapabilities { actorIdentityAvailable: boolean; actorContactsAvailable: boolean }` + `CLOSED_ACTOR_CAPS` (R2.1)
  - `clearanceLevels(session: { orgId: string | null; canEditObjects: boolean; role: string | null }): Set<ExportClearance>` — **n'émet PAS les capacités acteur** (R2.1 : elles ne sont pas session-dérivées)
  - `availableColumns(session, caps: ActorCapabilities = CLOSED_ACTOR_CAPS): ExportColumnDef[]` — compose les deux autorités ; `caps` **OUVRE** `actor_identity`/`actor_contacts`
  - `type ExportPresetId = 'essentiel' | 'complet' | 'diffusion' | 'custom'`
  - `presetColumnIds(presetId, session, caps = CLOSED_ACTOR_CAPS): string[]` — `diffusion` TOUJOURS recalculé depuis le code (jamais depuis le localStorage)
  - `EXPORT_PRESETS: Array<{ id: ExportPresetId; label: string; locked: boolean }>` (sans `custom`)
  - `purposeRequired(columnIds: string[]): boolean`

- [ ] **Step 1 : tests d'abord**

Ajouter à `export-columns.test.ts` :

```ts
import { availableColumns, clearanceLevels, presetColumnIds, purposeRequired } from './export-columns';
import { ctxWithActorContacts } from './export-fixture.test-utils';

const SESSION_PUBLIC = { orgId: null, canEditObjects: false, role: null };
const SESSION_ORG = { orgId: 'ORGRUN000000000A', canEditObjects: false, role: 'tourism_agent' };
const SESSION_SUPER = { orgId: 'ORGRUN000000000A', canEditObjects: true, role: 'super_admin' };

describe('registre — acteur/organisation/légal/liens + clearance + préréglages (§208)', () => {
  it('acteur — nom/rôle publics depuis la fiche ; coordonnées UNIQUEMENT depuis le contexte journalisé', () => {
    expect(val('actor_names')).toBe('Jean Payet');
    expect(val('actor_roles')).toBe('Exploitant');
    // Sans contexte (pas d'appel journalisé) : les colonnes gardées rendent '' —
    // même si le payload batch portait des contacts, on ne les lit JAMAIS ici.
    expect(val('actor_mobile')).toBe('');
    expect(val('actor_summary')).toBe('');
    const ctx = ctxWithActorContacts();
    expect(getExportColumn('actor_mobile')!.value(d, ctx)).toBe('0692 11 22 33');
    expect(getExportColumn('actor_email')!.value(d, ctx)).toBe('jean.payet@exemple.re');
    expect(getExportColumn('actor_address')!.value(d, ctx)).toBe('');
    expect(getExportColumn('actor_summary')!.value(d, ctx)).toContain('Jean Payet (Exploitant)');
  });
  it('organisation & légal — SIRET public assumé (arbitrage PO), le légal non-public reste org', () => {
    expect(val('publisher')).toBe('OTI du Sud');
    expect(val('siret')).toBe('12345678900011');
    expect(val('legal_records')).toContain('SIRET');
    expect(val('legal_records')).not.toContain('Assurance');
    expect(val('legal_records_all')).toContain('Assurance');
  });
  it('liens & références', () => {
    expect(val('relations_out')).toContain('Site du Volcan');
    expect(val('external_ids')).toBe('berta : B-1234');
  });
  it("AUCUNE colonne ne lit les notes d'équipe (décision PO — garde par sabotage de source)", () => {
    const spy = buildFixtureDetail({ private_note: { id: 'n1', body: 'NOTE-INTERNE-SENTINELLE' }, private_notes: [{ id: 'n1', body: 'NOTE-INTERNE-SENTINELLE' }] });
    for (const col of EXPORT_COLUMNS) {
      expect(col.value(spy, EMPTY_CTX)).not.toContain('NOTE-INTERNE-SENTINELLE');
    }
  });
  it('clearance FILTRE la liste (§205) — sans capacités serveur, AUCUNE colonne acteur (R1)', () => {
    const ids = availableColumns(SESSION_PUBLIC).map((c) => c.id); // caps par défaut = fermé
    expect(ids).toContain('name');
    expect(ids).not.toContain('contacts_object');
    expect(ids).not.toContain('actor_names');   // R1 : identité acteur = droit de consultation, pas « public »
    expect(ids).not.toContain('actor_primary');
    expect(ids).not.toContain('actor_mobile');
    expect(ids).not.toContain('unhandled_keys');
    expect(clearanceLevels(SESSION_SUPER).has('superuser')).toBe(true);
  });
  it('R2.1 — les capacités acteur viennent du SERVEUR, pas de la session : un lecteur SANS ORG peut les recevoir', () => {
    // Persona I3 du test SQL : lien acteur `public` ⇒ identité accessible sans membership.
    const ids = availableColumns(SESSION_PUBLIC, { actorIdentityAvailable: true, actorContactsAvailable: false }).map((c) => c.id);
    expect(ids).toContain('actor_names');
    expect(ids).toContain('actor_primary');
    expect(ids).not.toContain('actor_mobile');   // coordonnées refusées par le serveur
    expect(ids).not.toContain('contacts_object'); // le niveau `org` reste, lui, session-dérivé
  });
  it("R2.1 — symétrique : membre d'ORG mais serveur fermé ⇒ aucune colonne acteur", () => {
    const ids = availableColumns(SESSION_ORG).map((c) => c.id);
    expect(ids).toContain('contacts_object');
    expect(ids).not.toContain('actor_names');
    expect(ids).not.toContain('actor_mobile');
    // clearanceLevels n'émet PLUS les capacités acteur : elles ne sont pas session-dérivées.
    expect(clearanceLevels(SESSION_ORG).has('actor_identity' as never)).toBe(false);
  });
  it('R1 — plusieurs acteurs principaux sont TOUS rendus, joints par « | »', () => {
    const multi = buildFixtureDetail({
      actors: [
        { id: 'a1', display_name: 'Jean Payet', role: { code: 'operator', name: 'Exploitant' }, is_primary: true, visibility: 'partners', contacts: [] },
        { id: 'a2', display_name: 'Marie Hoarau', role: { code: 'guide', name: 'Guide' }, is_primary: true, visibility: 'partners', contacts: [] },
      ],
    });
    expect(getExportColumn('actor_primary')!.value(multi, EMPTY_CTX)).toBe('Jean Payet | Marie Hoarau');
  });
  it('préréglage Diffusion partenaire : STRICTEMENT public, sans le groupe acteur — recalculé du code', () => {
    // Même avec les capacités acteur grandes ouvertes, Diffusion n'en prend aucune.
    const ids = presetColumnIds('diffusion', SESSION_SUPER, { actorIdentityAvailable: true, actorContactsAvailable: true });
    for (const id of ids) {
      const col = getExportColumn(id)!;
      expect(col.clearance).toBe('public');
      expect(col.group).not.toBe('acteur');
    }
  });
  it('préréglage Complet : tout ce que la session permet, HORS groupe acteur (spec §4.6)', () => {
    const ids = presetColumnIds('complet', SESSION_ORG);
    expect(ids).toContain('contacts_object');
    expect(ids.some((id) => getExportColumn(id)!.group === 'acteur')).toBe(false);
  });
  it('purposeRequired : vrai ssi une colonne requiresPurpose est cochée', () => {
    expect(purposeRequired(['name', 'actor_names'])).toBe(false);
    expect(purposeRequired(['name', 'actor_mobile'])).toBe(true);
  });
});
```

- [ ] **Step 2 : vérifier l'échec** — même commande. Attendu : FAIL.

- [ ] **Step 3 : implémenter les 4 groupes**

Helpers additionnels :

```ts
function actorRows(d: ParsedObjectDetail, ctx: ExportContext): ActorContactsRow[] {
  return ctx.actorContacts?.get(d.identity.id) ?? [];
}
function actorChannelValues(d: ParsedObjectDetail, ctx: ExportContext, kindCode: string): string {
  return joinParts(actorRows(d, ctx).flatMap((r) => r.contacts.filter((c) => c.kindCode === kindCode).map((c) => c.value)));
}
/** Valeur d'une ligne legal_records par code de type — lue dans raw (le parser ne remonte pas `value` ; spec §8.3, lecture directe assumée). */
function legalValue(d: ParsedObjectDetail, typeCode: string): string {
  const entry = rawList(d, 'legal_records').find((l) => rawRecord(l.type).code === typeCode);
  if (!entry) return '';
  const value = entry.value;
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value == null ? '' : String(value);
}
function legalLine(l: { label: string; status: string }): string {
  return joinParts([l.label, l.status && `(${l.status})`], ' ');
}
```

Remplacer `// PLAN-TACHE-7-ICI` par :

```ts
  // ---------- Propriétaire / acteur ----------
  // R1 — l'export ne donne jamais plus que la consultation : nom/rôle/principal
  // portent actor_identity (= le droit normal de voir les acteurs ; le serveur
  // filtre déjà les LIGNES par v_can_read_extended OR visibility='public').
  // Coordonnées/note/résumé : actor_contacts + requiresPurpose ⇒ lues UNIQUEMENT
  // depuis ctx.actorContacts (l'appel journalisé api.export_actor_contacts) —
  // jamais depuis la fiche, sinon le journal serait contournable. Même ensemble
  // que la garde 16t.
  { id: 'actor_names', label: 'Acteur — nom', group: 'acteur', clearance: 'actor_identity', value: (d) => joinParts(d.relations.actors.map((a) => a.name)) },
  { id: 'actor_roles', label: 'Acteur — rôle', group: 'acteur', clearance: 'actor_identity', value: (d) => joinParts(d.relations.actors.map((a) => a.role)) },
  // R1 — MULTI-valué : la contrainte permet un principal PAR RÔLE, pas un par fiche.
  { id: 'actor_primary', label: 'Acteur(s) principal(aux)', group: 'acteur', clearance: 'actor_identity', value: (d) => joinParts(d.relations.actors.filter((a) => a.isPrimary).map((a) => a.name)) },
  { id: 'actor_phone', label: 'Acteur — téléphone', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => actorChannelValues(d, ctx, 'phone') },
  { id: 'actor_mobile', label: 'Acteur — mobile', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => actorChannelValues(d, ctx, 'mobile') },
  { id: 'actor_email', label: 'Acteur — e-mail', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => actorChannelValues(d, ctx, 'email') },
  // Colonne créée VIDE aujourd'hui (0 canal address en base) — §150 : la surface suit le modèle, pas la donnée.
  { id: 'actor_address', label: 'Acteur — adresse', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => actorChannelValues(d, ctx, 'address') },
  { id: 'actor_summary', label: 'Propriétaire (résumé)', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => joinParts(actorRows(d, ctx).map((r) => joinParts([
      joinParts([r.displayName, r.roleName && `(${r.roleName})`], ' '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'phone' || c.kindCode === 'mobile').map((c) => c.value), ', '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'email').map((c) => c.value), ', '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'address').map((c) => c.value), ', '),
    ], ' — '))) },
  { id: 'actors_notes', label: 'Acteur — note', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, value: (d, ctx) => joinParts(actorRows(d, ctx).map((r) => r.note)) },

  // ---------- Organisation éditrice ----------
  { id: 'publisher', label: 'Organisation éditrice', group: 'organisation', clearance: 'public', value: (d) => (d.relations.orgLinks.find((o) => /publisher|édit/i.test(o.linkType)) ?? d.relations.orgLinks[0])?.name ?? '' },
  { id: 'org_links', label: 'Organisations rattachées', group: 'organisation', clearance: 'public', value: (d) => joinParts(d.relations.orgLinks.map((o) => joinParts([o.name, o.linkType && `(${o.linkType})`], ' '))) },
  { id: 'parent_objects', label: 'Fiches parentes', group: 'organisation', clearance: 'public', value: (d) => joinParts(d.relations.parentObjects.map((o) => o.name)) },
  { id: 'org_emails', label: 'E-mails organisations', group: 'organisation', clearance: 'org', value: (d) => joinParts(d.relations.organizations.flatMap((o) => o.emails)) },
  { id: 'memberships', label: 'Adhésions', group: 'organisation', clearance: 'org', value: (d) => joinParts(d.relations.memberships.map((m) => joinParts([m.name, m.status && `(${m.status})`], ' '))) },
  { id: 'membership_expires', label: 'Adhésion — échéance', group: 'organisation', clearance: 'org', value: (d) => dateFr(d.relations.memberships[0]?.expiresAt) },

  // ---------- Légal ----------
  // SIRET/SIREN : publics ASSUMÉS (is_public=TRUE en base, arbitrage PO 2026-07-31 —
  // mémoire siret-siren-publics-arbitrage). Le reste du bloc suit ref_legal_type.is_public.
  { id: 'siret', label: 'SIRET', group: 'legal', clearance: 'public', value: (d) => legalValue(d, 'siret') },
  { id: 'legal_records', label: 'Mentions légales (publiques)', group: 'legal', clearance: 'public', value: (d) => joinParts(d.internal.legalRecords.filter((l) => l.isPublic).map(legalLine)) },
  { id: 'legal_records_all', label: 'Mentions légales (tout)', group: 'legal', clearance: 'org', value: (d) => joinParts(d.internal.legalRecords.map(legalLine)) },
  { id: 'legal_validity', label: 'Validité des documents', group: 'legal', clearance: 'org', value: (d) => joinParts(d.internal.legalRecords.map((l) => joinParts([l.label, l.validityMode], ' : '))) },
  { id: 'legal_expiring', label: 'Documents à échéance (<90 j)', group: 'legal', clearance: 'org', value: (d) => joinParts(d.internal.legalRecords.filter((l) => l.daysUntilExpiry !== '' && Number(l.daysUntilExpiry) < 90).map((l) => l.label)) },

  // ---------- Liens & références ----------
  { id: 'relations_out', label: 'Relations sortantes', group: 'liens', clearance: 'public', value: (d) => joinParts(d.relations.outgoing.map((r) => joinParts([r.name, r.relationship && `(${r.relationship})`], ' '))) },
  { id: 'relations_in', label: 'Relations entrantes', group: 'liens', clearance: 'public', value: (d) => joinParts(d.relations.incoming.map((r) => joinParts([r.name, r.relationship && `(${r.relationship})`], ' '))) },
  { id: 'external_ids', label: 'Identifiants externes', group: 'liens', clearance: 'org', value: (d) => joinParts(d.internal.externalIds.map((e) => joinParts([e.source, e.externalId], ' : '))) },
  { id: 'origins', label: "Sources d'import", group: 'liens', clearance: 'org', value: (d) => joinParts(d.internal.origins.map((o) => readNamedValue(o, ''))) },
  { id: 'iti_distance_km', label: 'Distance (km)', group: 'liens', clearance: 'public', value: (d) => d.itinerary.summary?.distanceKm ?? '' },
  { id: 'iti_duration_h', label: 'Durée (h)', group: 'liens', clearance: 'public', value: (d) => d.itinerary.summary?.durationHours ?? '' },
  { id: 'iti_difficulty', label: 'Difficulté', group: 'liens', clearance: 'public', value: (d) => d.itinerary.summary?.difficulty ?? '' },
  { id: 'iti_elevation', label: 'Dénivelé positif (m)', group: 'liens', clearance: 'public', value: (d) => d.itinerary.summary?.elevationGain ?? '' },
  { id: 'iti_is_loop', label: 'Boucle', group: 'liens', clearance: 'public', value: (d) => triState(d.itinerary.summary?.isLoop, 'Oui', 'Non') },
  { id: 'iti_stages', label: "Nombre d'étapes", group: 'liens', clearance: 'public', value: (d) => { const n = d.itinerary.summary?.stagesCount ?? 0; return n ? String(n) : ''; } },
  { id: 'iti_open_status', label: 'État du sentier', group: 'liens', clearance: 'public', value: (d) => rawStr(d, 'itinerary', 'open_status') },
  { id: 'fma_occurrences_count', label: "Dates d'événement (nombre)", group: 'liens', clearance: 'public', value: (d) => (d.itinerary.fmaOccurrences.length ? String(d.itinerary.fmaOccurrences.length) : '') },
  { id: 'unhandled_keys', label: 'Clés non traitées (diagnostic)', group: 'liens', clearance: 'superuser', value: (d) => joinParts(d.coverage.unhandledKeys) },
```

Puis, **en fin de fichier**, les niveaux et préréglages :

```ts
// ---------- Niveaux d'autorisation & préréglages ----------

/** R2.1 — verdict du préflight serveur sur LA SÉLECTION. Fermé par défaut. */
export interface ActorCapabilities {
  actorIdentityAvailable: boolean;
  actorContactsAvailable: boolean;
}
export const CLOSED_ACTOR_CAPS: ActorCapabilities = {
  actorIdentityAvailable: false,
  actorContactsAvailable: false,
};

/**
 * R2.1 — DEUX AUTORITÉS DISJOINTES, et c'est le point clé :
 *  - `clearanceLevels` décide des niveaux DÉRIVÉS DE LA SESSION : public, org,
 *    editor, superuser. Il ne dit RIEN des capacités acteur.
 *  - le PRÉFLIGHT SERVEUR (`api.export_actor_capabilities`) décide SEUL de
 *    `actor_identity` / `actor_contacts`.
 * Pourquoi disjointes et non superposées : le droit sur les acteurs est PAR
 * FICHE (extended OU lien `public` / ORG publisher), pas par session. Un lecteur
 * SANS ORG a légitimement accès à l'identité des acteurs d'une fiche à lien
 * public — si la session filtrait d'abord, le préflight ne pourrait plus que
 * restreindre une liste déjà amputée, et ce lecteur ne verrait jamais la
 * colonne (persona I3 du test SQL, mort-né côté UI). Le serveur doit pouvoir
 * OUVRIR, pas seulement fermer.
 * Aucune des deux n'est la garde : le RPC journalisé 16t refuse fiche par fiche.
 */
export function clearanceLevels(session: { orgId: string | null; canEditObjects: boolean; role: string | null }): Set<ExportClearance> {
  const levels = new Set<ExportClearance>(['public']);
  if (session.orgId) levels.add('org');
  if (session.canEditObjects) levels.add('editor');
  if (session.role === 'super_admin') {
    levels.add('superuser');
    levels.add('org');
  }
  return levels;
}

/**
 * L'offre de la modale. FILTRE (§205) — jamais un masquage d'options qui
 * resteraient dans l'état. Les clearances acteur viennent du préflight, tout le
 * reste de la session. `caps` par défaut FERMÉ : un appelant qui l'oublie
 * n'ouvre rien (fail-closed).
 */
export function availableColumns(
  session: { orgId: string | null; canEditObjects: boolean; role: string | null },
  caps: ActorCapabilities = CLOSED_ACTOR_CAPS,
): ExportColumnDef[] {
  const levels = clearanceLevels(session);
  return EXPORT_COLUMNS.filter((c) => {
    if (c.clearance === 'actor_identity') return caps.actorIdentityAvailable;
    if (c.clearance === 'actor_contacts') return caps.actorContactsAvailable;
    return levels.has(c.clearance);
  });
}

export type ExportPresetId = 'essentiel' | 'complet' | 'diffusion' | 'custom';

export const EXPORT_PRESETS: Array<{ id: Exclude<ExportPresetId, 'custom'>; label: string; locked: boolean }> = [
  { id: 'essentiel', label: 'Essentiel', locked: false },
  { id: 'complet', label: 'Complet', locked: false },
  // Verrouillé : c'est ce qui rend l'arbitrage RGPD visible dans l'outil (spec §4.6).
  { id: 'diffusion', label: 'Diffusion partenaire', locked: true },
];

const ESSENTIEL_IDS = [
  'id', 'name', 'type', 'taxonomy', 'status', 'city', 'postcode', 'address',
  'phone', 'mobile', 'email', 'website', 'chapo', 'classifications', 'publisher', 'updated_at',
];

export function presetColumnIds(
  presetId: ExportPresetId,
  session: { orgId: string | null; canEditObjects: boolean; role: string | null },
  caps: ActorCapabilities = CLOSED_ACTOR_CAPS,
): string[] {
  const allowed = availableColumns(session, caps);
  switch (presetId) {
    case 'essentiel':
      return ESSENTIEL_IDS.filter((id) => allowed.some((c) => c.id === id));
    case 'complet':
      // Hors groupe acteur (spec §4.6) : cocher une colonne à finalité ne doit
      // jamais arriver par un préréglage — c'est un geste explicite.
      return allowed.filter((c) => c.group !== 'acteur').map((c) => c.id);
    case 'diffusion':
      // TOUJOURS recalculé du code — jamais restauré du localStorage (préréglage verrouillé).
      return EXPORT_COLUMNS.filter((c) => c.clearance === 'public' && c.group !== 'acteur').map((c) => c.id);
    default:
      return [];
  }
}

export function purposeRequired(columnIds: string[]): boolean {
  return columnIds.some((id) => getExportColumn(id)?.requiresPurpose === true);
}
```

- [ ] **Step 3bis (R1) : annoter `fields` sur TOUTES les colonnes (projection)**

La liste EXACTE des legs gardés par `v_fields` se lit mécaniquement — ne pas la deviner :

```bash
cd "Base de donnée DLL et API" && grep -o "IF v_fields IS NULL OR '[a-z_]*'" api_views_functions.sql | sort -u
```

Règle d'annotation, colonne par colonne (la matrice du T4 Step 0 porte déjà la source) :
- la source de la colonne est un leg listé par le grep ⇒ `fields: ['<nom_du_leg>']`
  (plusieurs legs ⇒ tous : ex. `contacts_public` lit `contacts` ET les contacts
  d'acteurs/orgs du parser ⇒ `fields: ['contacts', 'actors', 'organizations']`) ;
- la source est un bloc NON gardé (clés d'identité, `address`, `location`, blocs
  hors-garde connus : `opening_times`, `menus`, relations…) ⇒ `fields: []`
  (aucun leg gardé requis — c'est ce qui rend la projection agressive) ;
- doute ⇒ OMETTRE `fields` (la projection se désactive pour l'export entier —
  correct par défaut, jamais faux).

Vérification non vacante à ajouter au test :

```ts
  it('R1 — projection : requiredFieldsFor unionne, et une colonne sans fields désactive tout', () => {
    expect(requiredFieldsFor(['name', 'postcode'])).toEqual([]); // identité/adresse : rien à demander
    const withActors = requiredFieldsFor(['name', 'actor_names']);
    expect(withActors).toContain('actors');
    // au moins une colonne du registre déclare fields ⇒ le préréglage Essentiel est projeté
    expect(requiredFieldsFor(presetColumnIds('essentiel', SESSION_ORG))).not.toBeUndefined();
  });
```

- [ ] **Step 4 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-columns.test.ts && npm run typecheck
git add src/services/export/export-columns.ts src/services/export/export-columns.test.ts
git commit -m "feat(export): registre complet — acteur (requiresPurpose), organisation, legal, liens + clearance + prereglages

Les colonnes de coordonnees d'acteur ne lisent QUE le contexte journalise
(api.export_actor_contacts) — jamais la fiche. Diffusion partenaire = verrouille,
recalcule du code. Garde de test : aucune colonne ne lit les notes d'equipe."
```

**Colonnes de la spec délibérément absentes (à consigner au §208, Tâche 18) :** `open_now` et `remplissage` (sources `ObjectCard`, non portées par la fiche complète — différées avec raison), `description_md`/`chapo_md` (legs éditeur), `grade` (déjà dans `classifications` via `meta`), `menus_count`/`fma_occurrences` détaillées (formes de payload non vérifiées — seule la version comptage est livrée), colonnes notes (décision PO).

---

### Tâche 8 : constructeur de classeur + feuille Lisez-moi + orchestrateur de téléchargement

**Files:**
- Create: `bertel-tourism-ui/src/services/export/export-workbook.ts`
- Test: `bertel-tourism-ui/src/services/export/export-workbook.test.ts`

**Interfaces:**
- Consumes: `EXPORT_COLUMNS`/`getExportColumn`/`ExportContext`/`purposeRequired`/`requiredFieldsFor` (T7), `fetchResourceBatches` (T3), `xlsxCell` (T2), `exportActorContacts` (T16 — **mocké ici**, contrat déclaré au squelette).
- Produces:
  - `type CellModel = { value: string | number; type: StringConstructor | NumberConstructor; fontWeight?: 'bold' }` (R1 — number pour lat/lon ; une valeur null devient une cellule texte vide)
  - `interface WorkbookModel { sheets: [CellModel[][], CellModel[][]]; sheetNames: ['Fiches', 'Lisez-moi']; columns: [Array<{width:number}>, Array<{width:number}>] }`
  - `projectRow(detail: ParsedObjectDetail, columns: ExportColumnDef[], ctx: ExportContext): ExportCellValue[]` — l'aplatissement immédiat (R1) : appelé lot par lot, le JSON part au GC ensuite
  - `buildWorkbookModel(input: { rowsById: Map<string, ExportCellValue[]>; orderedIds: string[]; columns: ExportColumnDef[]; requestedCount: number; actorLogIds: string[]; actorAuthorizedCount: number | null; actorDeniedCount: number | null }): WorkbookModel`
  - `runSelectionXlsxExport(input: { ids: string[]; columnIds: string[]; langPrefs: string[]; purpose: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<{ exported: number; requested: number }>`
- **R1 — ordre d'exécution de l'orchestrateur :** (1) lots ACTEUR d'abord si nécessaires (légers, ils construisent le ctx complet) ; (2) lots ressources en streaming, chaque lot **immédiatement projeté** en `ExportCellValue[]` puis JSON libéré ; (3) UN SEUL classeur à la fin, seulement si TOUS les lots ont réussi — un lot en échec ⇒ aucun fichier (les journaux acteur déjà écrits restent : la donnée a atteint le navigateur).

- [ ] **Step 1 : tests d'abord**

Créer `export-workbook.test.ts` :

```ts
import { buildWorkbookModel, projectRow } from './export-workbook';
import { getExportColumn } from './export-columns';
import { buildFixtureDetail, EMPTY_CTX } from './export-fixture.test-utils';

const cols = (ids: string[]) => ids.map((id) => getExportColumn(id)!);

describe('buildWorkbookModel (§208/R1) — le test RELIT les cellules (garde non vacante)', () => {
  const detail = buildFixtureDetail();
  const columns = cols(['id', 'name', 'postcode', 'latitude', 'amenities']);
  const rowsById = new Map([['HOTRUN0000000TST', projectRow(detail, columns, EMPTY_CTX)]]);
  const model = buildWorkbookModel({
    rowsById,
    orderedIds: ['HOTRUN0000000TST', 'ID-NON-LISIBLE'],
    columns,
    requestedCount: 2,
    actorLogIds: [],
    actorAuthorizedCount: null,
    actorDeniedCount: null,
  });

  it('feuille Fiches : en-têtes FR en gras, une ligne par fiche lisible, ordre de sélection', () => {
    const [fiches] = model.sheets;
    expect(fiches[0].map((c) => c.value)).toEqual(['Identifiant', 'Nom', 'Code postal', 'Latitude', 'Équipements']);
    expect(fiches[0].every((c) => c.fontWeight === 'bold')).toBe(true);
    expect(fiches).toHaveLength(2); // 1 en-tête + 1 fiche (la non-lisible est absente, pas une ligne vide)
    expect(fiches[1].map((c) => c.value)).toEqual(['HOTRUN0000000TST', 'Hôtel Témoin', '97418', -21.2783, 'Wi-Fi | Piscine']);
  });
  it('R1 — typage par colonne : postcode String (zéro initial), latitude Number', () => {
    const [fiches] = model.sheets;
    expect(fiches[1][2].type).toBe(String);   // postcode
    expect(fiches[1][3].type).toBe(Number);   // latitude
    expect(typeof fiches[1][3].value).toBe('number');
  });
  it('une latitude absente rend une cellule TEXTE vide, pas un zéro', () => {
    const noLoc = buildFixtureDetail({ location: {} });
    const row = projectRow(noLoc, columns, EMPTY_CTX);
    const m = buildWorkbookModel({ rowsById: new Map([['X', row]]), orderedIds: ['X'], columns, requestedCount: 1, actorLogIds: [], actorAuthorizedCount: null, actorDeniedCount: null });
    expect(m.sheets[0][1][3].type).toBe(String);
    expect(m.sheets[0][1][3].value).toBe('');
  });
  it('Lisez-moi : périmètre honnête (1 fiche sur 2) + dictionnaire des colonnes retenues', () => {
    const flat = model.sheets[1].map((r) => r.map((c) => String(c.value)).join(' ')).join('\n');
    expect(flat).toContain('1 fiche exportée sur 2 sélectionnées');
    expect(flat).toContain('Identifiant');
    expect(flat).not.toContain('journal'); // pas de colonnes acteur ⇒ pas de mention de traçabilité
  });
  it('R1 — traçabilité multi-lots : TOUS les logId + comptes autorisées/refusées', () => {
    const actorColumns = cols(['id', 'actor_mobile']);
    const withActor = buildWorkbookModel({
      rowsById: new Map([['HOTRUN0000000TST', projectRow(detail, actorColumns, EMPTY_CTX)]]),
      orderedIds: ['HOTRUN0000000TST'],
      columns: actorColumns, requestedCount: 1,
      actorLogIds: ['journal-lot-1', 'journal-lot-2'],
      actorAuthorizedCount: 700, actorDeniedCount: 140,
    });
    const flat = withActor.sheets[1].map((r) => r.map((c) => String(c.value)).join(' ')).join('\n');
    expect(flat).toContain('journal-lot-1');
    expect(flat).toContain('journal-lot-2');
    expect(flat).toContain('700');    // autorisées
    expect(flat).toContain('140');    // refusées
  });
  it('largeur de colonne bornée [10, 60] selon le contenu', () => {
    for (const col of model.columns[0]) {
      expect(col.width).toBeGreaterThanOrEqual(10);
      expect(col.width).toBeLessThanOrEqual(60);
    }
  });
});
```

- [ ] **Step 2 : vérifier l'échec** — `npm run test:run -- src/services/export/export-workbook.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : implémenter**

Créer `export-workbook.ts` :

```ts
import { xlsxCell } from '@/lib/safe-output';
import type { ParsedObjectDetail } from '../object-detail-parser';
import {
  getExportColumn, purposeRequired, requiredFieldsFor,
  type ExportCellValue, type ExportColumnDef, type ExportContext,
} from './export-columns';
import { chunkIds, fetchResourceBatches } from './export-fetch';
import { ACTOR_EXPORT_BATCH, exportActorContacts } from './export-actor-contacts';

/** R1 — cellule texte OU numérique. Une valeur null devient une cellule texte vide. */
export interface CellModel { value: string | number; type: StringConstructor | NumberConstructor; fontWeight?: 'bold' }
export interface WorkbookModel {
  sheets: [CellModel[][], CellModel[][]];
  sheetNames: ['Fiches', 'Lisez-moi'];
  columns: [Array<{ width: number }>, Array<{ width: number }>];
}

const header = (value: string): CellModel => ({ value: xlsxCell(value), type: String, fontWeight: 'bold' });
const text = (value: string): CellModel => ({ value: xlsxCell(value), type: String });

function toCell(value: ExportCellValue, col: ExportColumnDef): CellModel {
  if (col.cellType === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    return { value, type: Number };
  }
  return text(value == null ? '' : String(value));
}

/** R1 — aplatissement immédiat : une fiche → une ligne de valeurs finales. Appelé lot par lot ; le ParsedObjectDetail part au GC ensuite. */
export function projectRow(detail: ParsedObjectDetail, columns: ExportColumnDef[], ctx: ExportContext): ExportCellValue[] {
  return columns.map((c) => c.value(detail, ctx));
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function buildWorkbookModel(input: {
  rowsById: Map<string, ExportCellValue[]>;
  orderedIds: string[];
  columns: ExportColumnDef[];
  requestedCount: number;
  actorLogIds: string[];
  actorAuthorizedCount: number | null;
  actorDeniedCount: number | null;
}): WorkbookModel {
  const { columns } = input;

  // Une ligne par fiche LISIBLE, dans l'ordre de la sélection. Un id non lisible
  // est ABSENT (pas une ligne vide) — le décompte honnête vit dans Lisez-moi.
  const fiches: CellModel[][] = [columns.map((c) => header(c.label))];
  for (const id of input.orderedIds) {
    const row = input.rowsById.get(id);
    if (!row) continue;
    // Piloté par les COLONNES (pas par la ligne) : une ligne trop courte/longue
    // ne peut jamais désaligner le typage des cellules.
    fiches.push(columns.map((col, i) => toCell(row[i] ?? null, col)));
  }

  const widths = columns.map((_, colIndex) => {
    const max = fiches.reduce((acc, row) => Math.max(acc, String(row[colIndex]?.value ?? '').length), 0);
    return { width: Math.min(60, Math.max(10, max + 2)) };
  });

  const exported = fiches.length - 1;
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;
  const lisezMoi: CellModel[][] = [
    [header('Export Bertel — sélection Exploreur')],
    [text('Généré le'), text(DATE_FMT.format(new Date()))],
    [text('Périmètre'), text(`${plural(exported, 'fiche exportée')} sur ${plural(input.requestedCount, 'sélectionnée')}`)],
    [text('')],
    [header('Colonne'), header('Contenu')],
    ...columns.map((c) => [text(c.label), text(`${c.group} · ${c.requiresPurpose ? 'accès tracé (journal)' : 'standard'}`)]),
  ];
  if (input.actorLogIds.length > 0) {
    lisezMoi.push(
      [text('')],
      [text('Traçabilité'), text(
        `Ce fichier contient des coordonnées de personnes — export inscrit au journal, ${plural(input.actorLogIds.length, 'lot')} : ${input.actorLogIds.join(', ')}. Ne pas rediffuser hors de votre organisation.`,
      )],
      [text('Coordonnées — fiches autorisées'), text(input.actorAuthorizedCount == null ? '' : String(input.actorAuthorizedCount))],
      [text('Coordonnées — fiches refusées'), text(input.actorDeniedCount == null ? '' : String(input.actorDeniedCount))],
    );
  }

  return {
    sheets: [fiches, lisezMoi],
    sheetNames: ['Fiches', 'Lisez-moi'],
    columns: [widths, [{ width: 32 }, { width: 90 }]],
  };
}

/**
 * Orchestrateur complet (R1) :
 *  1. lots ACTEUR d'abord si une colonne à finalité est cochée (légers, set-based,
 *     journalisés — export_run_id partagé entre les lots) ;
 *  2. lots ressources en streaming (concurrence 2), chaque lot IMMÉDIATEMENT
 *     projeté en valeurs finales puis JSON libéré — jamais 10,5 Mo accumulés ;
 *  3. UN SEUL classeur, construit seulement si TOUS les lots ont réussi. Un lot
 *     en échec ⇒ aucun fichier ; les journaux acteur déjà écrits RESTENT (la
 *     donnée a réellement atteint le navigateur — le journal dit la vérité).
 * Écriture via write-excel-file en IMPORT DYNAMIQUE (précédent pdf-rasterize.ts) ;
 * CSP prod sans unsafe-eval : lib auditée, ne pas la remplacer sans refaire l'audit.
 */
export async function runSelectionXlsxExport(input: {
  ids: string[];
  columnIds: string[];
  langPrefs: string[];
  purpose: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ exported: number; requested: number }> {
  const columns = input.columnIds
    .map((id) => getExportColumn(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const orderedIds = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];

  // (1) Coordonnées d'acteur — AVANT les ressources : le ctx doit être complet
  // au moment de la projection immédiate des lots.
  let ctx: ExportContext = { actorContacts: null };
  let actorLogIds: string[] = [];
  let actorAuthorizedCount: number | null = null;
  let actorDeniedCount: number | null = null;
  if (purposeRequired(input.columnIds)) {
    const result = await exportActorContacts(orderedIds, input.purpose, {
      batchSize: ACTOR_EXPORT_BATCH,
      signal: input.signal,
    });
    ctx = { actorContacts: result.rows };
    actorLogIds = result.logIds;
    actorAuthorizedCount = result.authorizedObjectIds.length;
    actorDeniedCount = result.deniedObjectIds.length;
  }

  // (2) Ressources en streaming + projection immédiate (fusion par object_id).
  const rowsById = new Map<string, ExportCellValue[]>();
  await fetchResourceBatches(orderedIds, input.langPrefs, {
    fields: requiredFieldsFor(input.columnIds),
    signal: input.signal,
    onProgress: input.onProgress,
    onBatch: (entries) => {
      for (const [id, detail] of entries) {
        rowsById.set(id, projectRow(detail, columns, ctx));
      }
      // Les ParsedObjectDetail de ce lot ne sont référencés nulle part ailleurs :
      // ils partent au GC ici — c'est l'aplatissement immédiat R1.
    },
  });

  // (3) Un seul classeur, après la réussite de TOUS les lots.
  const model = buildWorkbookModel({
    rowsById,
    orderedIds,
    columns,
    requestedCount: chunkIds(input.ids).reduce((n, c) => n + c.length, 0),
    actorLogIds,
    actorAuthorizedCount,
    actorDeniedCount,
  });

  const { default: writeXlsxFile } = await import('write-excel-file');
  const today = new Date().toISOString().slice(0, 10);
  await writeXlsxFile(model.sheets as never, {
    sheets: model.sheetNames as unknown as string[],
    columns: model.columns as never,
    stickyRowsCount: 1,
    fileName: `export_bertel_${today}.xlsx`,
  });
  return { exported: model.sheets[0].length - 1, requested: input.ids.length };
}
```

Créer aussi le **squelette** `src/services/export/export-actor-contacts.ts` pour que la Tâche 8 compile (le corps réel vient en Tâche 16, APRÈS le SQL — jusque-là il refuse de servir) :

```ts
import type { ActorContactsRow } from './export-columns';

export const ACTOR_EXPORT_BATCH = 500; // plafond PAR APPEL du RPC (16t) — au-delà on découpe : N lignes de journal, pas une. Aucun plafond fonctionnel d'export (R1).

/** R1 — résultat AGRÉGÉ des lots : tous partagent un export_run_id ; chaque lot a son logId ; les refus sont nommés. */
export interface ActorContactsExportResult {
  rows: Map<string, ActorContactsRow[]>;
  exportRunId: string;
  logIds: string[];
  authorizedObjectIds: string[];
  deniedObjectIds: string[];
}

export async function exportActorContacts(
  _ids: string[],
  _purpose: string,
  _opts: { batchSize?: number; signal?: AbortSignal } = {},
): Promise<ActorContactsExportResult> {
  // Tâche 16 branche le RPC api.export_actor_contacts (migration 16t). D'ici là :
  // refuser explicitement plutôt que rendre un export silencieusement vide.
  throw new Error("Export des coordonnées d'acteur indisponible (migration 16t non déployée).");
}
```

- [ ] **Step 4 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/services/export/export-workbook.test.ts && npm run typecheck
git add src/services/export/export-workbook.ts src/services/export/export-workbook.test.ts src/services/export/export-actor-contacts.ts
git commit -m "feat(export): classeur (cellules typees text/number) + Lisez-moi multi-lots + orchestrateur streamant

R1 : projection immediate lot par lot (JSON libere), acteurs d'abord (ctx complet),
UN classeur apres reussite de TOUS les lots — un echec = aucun fichier. Le test
relit les cellules : postcode String (zero initial), latitude Number, decompte
demandees/exportees, tous les logId + comptes autorisees/refusees en Lisez-moi."
```

---

### Tâche 9 : store persistant des préférences d'export

**Files:**
- Create: `bertel-tourism-ui/src/store/explorer-export-store.ts`
- Test: `bertel-tourism-ui/src/store/explorer-export-store.test.ts`

**Interfaces:**
- Consumes: `EXPORT_COLUMN_IDS`, `presetColumnIds`, `ExportPresetId`, `ActorCapabilities`/`CLOSED_ACTOR_CAPS` (T7).
- Produces: `useExplorerExportStore` — état `{ presetId: ExportPresetId; columnIds: string[] }`, actions `applyPreset(presetId, session, caps?)`, `toggleColumn(id)`, `setColumns(ids)`. **R2.1 :** `caps` est optionnel et **fermé par défaut** — un préréglage appliqué avant la réponse du préflight ne coche aucune colonne acteur.

- [ ] **Step 1 : tests d'abord**

```ts
import { useExplorerExportStore } from './explorer-export-store';

const SESSION = { orgId: 'ORG', canEditObjects: true, role: 'super_admin' };

describe('explorer-export-store (§208) — même mécanique que explorer-view-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useExplorerExportStore.setState({ presetId: 'essentiel', columnIds: [] });
    useExplorerExportStore.getState().applyPreset('essentiel', SESSION);
  });

  it('applyPreset remplit les colonnes ; toggle bascule en custom', () => {
    const state = useExplorerExportStore.getState();
    expect(state.columnIds).toContain('name');
    state.toggleColumn('latitude');
    expect(useExplorerExportStore.getState().presetId).toBe('custom');
    expect(useExplorerExportStore.getState().columnIds).toContain('latitude');
  });

  it('garde « jamais 0 colonne » : décocher la dernière est refusé', () => {
    useExplorerExportStore.getState().setColumns(['name']);
    useExplorerExportStore.getState().toggleColumn('name');
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name']);
  });

  it('merge filtre les ids inconnus (renommage futur) et retombe sur essentiel si vide', () => {
    // simule une restauration corrompue
    useExplorerExportStore.getState().setColumns(['colonne_disparue', 'name']);
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name']);
  });
});
```

- [ ] **Step 2 : échec** — `npm run test:run -- src/store/explorer-export-store.test.ts`. FAIL attendu.

- [ ] **Step 3 : implémenter**

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  CLOSED_ACTOR_CAPS, EXPORT_COLUMN_IDS, presetColumnIds,
  type ActorCapabilities, type ExportPresetId,
} from '../services/export/export-columns';

/**
 * §208 — préférences de l'export Excel, mémorisées SUR LE POSTE (même mécanique
 * que explorer-view-store : persist + merge qui filtre les ids inconnus et
 * retombe sur le défaut si vide ; garde « jamais 0 colonne »).
 * Le préréglage « diffusion » n'est JAMAIS restauré tel quel : la modale le
 * recalcule du code à chaque ouverture (préréglage verrouillé).
 */
interface ExplorerExportState {
  presetId: ExportPresetId;
  columnIds: string[];
  /** R2.1 — `caps` vient du préflight serveur ; fermé par défaut (aucune colonne acteur cochée avant sa réponse). */
  applyPreset: (
    presetId: ExportPresetId,
    session: { orgId: string | null; canEditObjects: boolean; role: string | null },
    caps?: ActorCapabilities,
  ) => void;
  toggleColumn: (id: string) => void;
  setColumns: (ids: string[]) => void;
}

function sanitize(ids: string[]): string[] {
  return ids.filter((id) => EXPORT_COLUMN_IDS.includes(id));
}

export const useExplorerExportStore = create<ExplorerExportState>()(
  persist(
    (set) => ({
      presetId: 'essentiel',
      columnIds: [],
      applyPreset: (presetId, session, caps = CLOSED_ACTOR_CAPS) =>
        set({ presetId, columnIds: presetId === 'custom' ? [] : presetColumnIds(presetId, session, caps) }),
      toggleColumn: (id) =>
        set((state) => {
          if (!EXPORT_COLUMN_IDS.includes(id)) return state;
          if (state.columnIds.includes(id)) {
            if (state.columnIds.length === 1) return state; // jamais 0 colonne
            return { presetId: 'custom', columnIds: state.columnIds.filter((x) => x !== id) };
          }
          // ré-insertion à la position canonique du registre (même geste que la vue Table)
          const canonical = EXPORT_COLUMN_IDS.indexOf(id);
          const at = state.columnIds.findIndex((x) => EXPORT_COLUMN_IDS.indexOf(x) > canonical);
          const columnIds = at < 0 ? [...state.columnIds, id] : [...state.columnIds.slice(0, at), id, ...state.columnIds.slice(at)];
          return { presetId: 'custom', columnIds };
        }),
      setColumns: (ids) => set({ presetId: 'custom', columnIds: sanitize(ids) }),
    }),
    {
      name: 'bertel-explorer-export',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ presetId: state.presetId, columnIds: state.columnIds }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ExplorerExportState> | undefined) ?? {};
        const columnIds = Array.isArray(saved.columnIds) ? sanitize(saved.columnIds) : current.columnIds;
        return { ...current, ...saved, columnIds };
      },
    },
  ),
);
```

- [ ] **Step 4 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/store/explorer-export-store.test.ts && npm run typecheck
git add src/store/explorer-export-store.ts src/store/explorer-export-store.test.ts
git commit -m "feat(export): store persistant des colonnes d'export (localStorage, garde jamais-0, ids inconnus filtres)"
```

---

### Tâche 10 : variante large de `Modal` + composant `ExportExcelModal`

**Files:**
- Modify: `bertel-tourism-ui/src/components/common/Modal.tsx:68-82,155`
- Modify: `bertel-tourism-ui/src/styles.css` (~l.4127, bloc `.app-modal`)
- Create: `bertel-tourism-ui/src/features/explorer/export/ExportExcelModal.tsx`
- Test: `bertel-tourism-ui/src/features/explorer/export/ExportExcelModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` (piège documenté `Modal.tsx:10-12` : ne PAS entourer d'un `if (!open) return null`), `FilterColumnGroup` (`src/components/common/FilterColumnGroup.tsx:16`, prop `collapsible`), stores T9 + session, `runSelectionXlsxExport` (T8), `availableColumns`/`EXPORT_PRESETS`/`presetColumnIds`/`purposeRequired`/`EXPORT_GROUP_LABELS` (T7), `getExportActorCapabilities` (rpc.ts — ajouté ICI, Step 4a).
- Produces: `ExportExcelModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })` — consommé par la Tâche 11. `Modal` gagne `size?: 'default' | 'wide'`. `getExportActorCapabilities(objectIds): Promise<{ actorIdentityAvailable: boolean; actorContactsAvailable: boolean }>` (export de rpc.ts).
- **R2 — préflight des capacités acteur :** à l'ouverture, la modale interroge `api.export_actor_capabilities(selectedObjectIds)` et ne propose les colonnes `actor_identity` / `actor_contacts` que si le serveur dit qu'AU MOINS une fiche de la sélection y donne accès. Échec ou RPC absent (avant 16t) ⇒ `{false, false}` — **offre fail-closed**, jamais un crash ni une offre par défaut. Ce préflight est de l'ergonomie : la garde reste 16t, fiche par fiche.

- [ ] **Step 1 : variante large de Modal (pas de TDD — 3 lignes de CSS + 1 prop)**

Dans `Modal.tsx`, ajouter la prop `size` :

```ts
  variant = 'modal',
  size = 'default',
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
  /** 'wide' = 720px (sélecteur de colonnes d'export §208) — la carte centrée par défaut fait 520px. */
  size?: 'default' | 'wide';
}) {
```

Ligne 155, composer la classe :

```ts
        className={cn(
          variant === 'drawer' ? 'app-modal app-modal--drawer' : 'app-modal',
          size === 'wide' && 'app-modal--wide',
        )}
```

(ajouter `import { cn } from '@/lib/utils';` en tête si absent). Dans `styles.css`, juste après le bloc `.app-modal--drawer` (~l.4196) :

```css
/* §208 — variante large (sélecteur de colonnes d'export). */
.app-modal--wide { max-width: 720px; }
```

- [ ] **Step 2 : tests du composant (échec attendu)**

Créer `ExportExcelModal.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportExcelModal } from './ExportExcelModal';
import { useExplorerStore } from '../../../store/explorer-store';
import { useSessionStore } from '../../../store/session-store';
import { useExplorerExportStore } from '../../../store/explorer-export-store';
import { runSelectionXlsxExport } from '../../../services/export/export-workbook';
import { getExportActorCapabilities } from '../../../services/rpc';

jest.mock('../../../services/export/export-workbook', () => ({ runSelectionXlsxExport: jest.fn() }));
jest.mock('../../../services/rpc', () => ({ getExportActorCapabilities: jest.fn() }));
const mockRun = runSelectionXlsxExport as jest.Mock;
const mockCaps = getExportActorCapabilities as jest.Mock;

function setup(session: Partial<ReturnType<typeof useSessionStore.getState>> = {}) {
  const merged = { orgId: 'ORG', orgName: 'OTI du Sud', canEditObjects: true, role: 'tourism_agent', langPrefs: ['fr'], ...session };
  useExplorerStore.setState({ selectedObjectIds: ['a', 'b', 'c'] });
  useSessionStore.setState(merged);
  useExplorerExportStore.setState({ presetId: 'essentiel', columnIds: [] });
  // Le préréglage initial part de la session RÉELLE du cas (pas d'ORG codée en
  // dur) et SANS caps : les colonnes acteur ne sont jamais pré-cochées — le
  // préflight ouvre l'OFFRE, il ne coche rien.
  useExplorerExportStore.getState().applyPreset('essentiel', {
    orgId: merged.orgId, canEditObjects: merged.canEditObjects, role: merged.role,
  });
  return render(<ExportExcelModal open onOpenChange={jest.fn()} />);
}

describe('ExportExcelModal (§208)', () => {
  beforeEach(() => {
    mockRun.mockReset().mockResolvedValue({ exported: 3, requested: 3 });
    // R2 : par défaut le préflight ouvre tout (membre publisher) — les cas contraires le surchargent.
    mockCaps.mockReset().mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: true });
  });

  it('affiche le compte, les 3 préréglages et les groupes repliables', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.getByText(/3 fiches sélectionnées/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Essentiel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diffusion partenaire/ })).toBeInTheDocument();
  });

  it("un lecteur sans ORG ne voit PAS les colonnes org (clearance filtre l'offre, §205)", () => {
    setup({ orgId: null, canEditObjects: false, role: null });
    expect(screen.queryByLabelText(/Contacts de la fiche \(tous\)/)).toBeNull();
  });

  it('R2 — préflight serveur : capacités refusées ⇒ colonnes acteur ABSENTES malgré la session ORG', async () => {
    mockCaps.mockResolvedValue({ actorIdentityAvailable: false, actorContactsAvailable: false });
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(mockCaps).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2 — identité disponible mais pas les coordonnées : nom/rôle offerts, mobile absent', async () => {
    mockCaps.mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: false });
    setup();
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2.1 — persona I3 : lecteur SANS ORG + identité accordée par le serveur ⇒ « Acteur — nom » VISIBLE', async () => {
    // C'est le cas que la R2 laissait mort-né : la session filtrait avant le préflight.
    mockCaps.mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: false });
    setup({ orgId: null, orgName: null, canEditObjects: false, role: null });
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Acteur\(s\) principal\(aux\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
    // Le niveau `org`, lui, reste session-dérivé : toujours absent pour ce lecteur.
    expect(screen.queryByLabelText(/Contacts de la fiche \(tous\)/)).toBeNull();
  });

  it('R2 — préflight en échec (ex. 16t pas encore déployée) : offre FAIL-CLOSED, pas de crash', async () => {
    mockCaps.mockRejectedValue(new Error('function api.export_actor_capabilities does not exist'));
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.getByLabelText(/^Nom$/)).toBeInTheDocument(); // le reste de la modale vit normalement
  });

  it('sans colonne à finalité : télécharge directement, sans champ finalité', async () => {
    setup();
    expect(screen.queryByLabelText(/Finalité/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ ids: ['a', 'b', 'c'], purpose: '' }));
  });

  it('avec une colonne acteur gardée cochée : la finalité devient obligatoire', async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/Acteur — mobile/));
    const download = screen.getByRole('button', { name: /Télécharger/ });
    expect(download).toBeDisabled(); // finalité vide ⇒ pas d'export
    await userEvent.type(screen.getByLabelText(/Finalité/), 'Campagne relance adhésions 2026');
    expect(download).toBeEnabled();
    await userEvent.click(download);
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'Campagne relance adhésions 2026' }));
  });

  it('préréglage Diffusion : cases désactivées (verrouillé), colonnes recalculées du code', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Diffusion partenaire/ }));
    const nameBox = screen.getByLabelText<HTMLInputElement>(/^Nom$/);
    expect(nameBox).toBeChecked();
    expect(nameBox).toBeDisabled();
  });
});
```

- [ ] **Step 3 : échec** — `npm run test:run -- src/features/explorer/export/ExportExcelModal.test.tsx`. FAIL attendu.

- [ ] **Step 4a (R2) : le service de préflight dans `rpc.ts`**

Ajouter dans `src/services/rpc.ts` (même zone que `getObjectResourcesBatch`) :

```ts
/**
 * R2 — préflight de l'offre de colonnes acteur : le SERVEUR dit si la sélection
 * donne accès à l'identité / aux coordonnées (mêmes prédicats que les gates).
 * ERGONOMIE seulement — la garde reste 16t, fiche par fiche. Tout échec (RPC
 * absent avant 16t, réseau) rend {false, false} : offre fail-closed, jamais
 * un crash ni une offre par défaut.
 */
export async function getExportActorCapabilities(
  objectIds: string[],
): Promise<{ actorIdentityAvailable: boolean; actorContactsAvailable: boolean }> {
  const closed = { actorIdentityAvailable: false, actorContactsAvailable: false };
  const client = requireRpcClient();
  if (!client) return closed;
  try {
    const { data, error } = await client.schema('api').rpc('export_actor_capabilities', {
      p_object_ids: objectIds,
    });
    if (error) return closed;
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      actorIdentityAvailable: payload.actor_identity_available === true,
      actorContactsAvailable: payload.actor_contacts_available === true,
    };
  } catch {
    return closed;
  }
}
```

- [ ] **Step 4 : implémenter le composant**

Créer `ExportExcelModal.tsx` :

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { FilterColumnGroup } from '../../../components/common/FilterColumnGroup';
import { useExplorerStore } from '../../../store/explorer-store';
import { useSessionStore } from '../../../store/session-store';
import { useExplorerExportStore } from '../../../store/explorer-export-store';
import {
  availableColumns, EXPORT_GROUP_LABELS, EXPORT_PRESETS, presetColumnIds, purposeRequired,
  type ExportColumnDef, type ExportGroupId,
} from '../../../services/export/export-columns';
import { runSelectionXlsxExport } from '../../../services/export/export-workbook';
import { getExportActorCapabilities } from '../../../services/rpc';
import { cn } from '@/lib/utils';

/** R2 — capacités acteur par défaut : FERMÉES tant que le serveur n'a pas répondu. */
const CLOSED_CAPS = { actorIdentityAvailable: false, actorContactsAvailable: false };

/**
 * §208 — modale de l'export Excel de la sélection. L'offre de colonnes est
 * FILTRÉE par le niveau de session (jamais masquée-mais-active, §205) ; la
 * GARDE reste serveur (RLS + 16t). « Diffusion partenaire » est verrouillé et
 * recalculé du code à chaque sélection du préréglage. Une colonne à finalité
 * cochée ⇒ champ Finalité obligatoire + export journalisé (Lisez-moi porte
 * l'identifiant de journal).
 */
export function ExportExcelModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const selectedObjectIds = useExplorerStore((s) => s.selectedObjectIds);
  const langPrefs = useSessionStore((s) => s.langPrefs);
  const session = useSessionStore((s) => ({ orgId: s.orgId, canEditObjects: s.canEditObjects, role: s.role }));
  const { presetId, columnIds, applyPreset, toggleColumn } = useExplorerExportStore();

  const [purpose, setPurpose] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [caps, setCaps] = useState(CLOSED_CAPS);
  const abortRef = useRef<AbortController | null>(null);

  // R2 — préflight serveur à l'ouverture : l'offre de colonnes acteur suit la
  // consultation RÉELLE de la sélection (mêmes prédicats que les gates). Échec
  // ⇒ fermé. Garde anti-course : une réponse d'une sélection périmée est ignorée.
  useEffect(() => {
    if (!open || selectedObjectIds.length === 0) {
      setCaps(CLOSED_CAPS);
      return;
    }
    let stale = false;
    setCaps(CLOSED_CAPS);
    getExportActorCapabilities(selectedObjectIds)
      .then((result) => { if (!stale) setCaps(result); })
      .catch(() => { if (!stale) setCaps(CLOSED_CAPS); });
    return () => { stale = true; };
  }, [open, selectedObjectIds]);

  // R2.1 — `caps` est passé À availableColumns (il OUVRE les clearances acteur),
  // il ne filtre pas une liste déjà amputée par la session.
  const offered = useMemo(() => availableColumns(session, caps), [session, caps]);
  const locked = presetId === 'diffusion';
  // Verrouillé ⇒ on ignore l'état persisté et on recalcule (jamais restauré du localStorage).
  const effectiveIds = locked ? presetColumnIds('diffusion', session, caps) : columnIds.filter((id) => offered.some((c) => c.id === id));
  const needsPurpose = purposeRequired(effectiveIds);
  const exporting = progress !== null;
  // R1 : 5 caractères minimum — le serveur revalide (REASON_REQUIRED), la modale n'est que l'ergonomie.
  const canDownload = effectiveIds.length > 0 && !exporting && (!needsPurpose || purpose.trim().length >= 5);

  const byGroup = useMemo(() => {
    const map = new Map<ExportGroupId, ExportColumnDef[]>();
    for (const col of offered) {
      map.set(col.group, [...(map.get(col.group) ?? []), col]);
    }
    return map;
  }, [offered]);

  async function handleDownload() {
    if (!canDownload) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: selectedObjectIds.length });
    try {
      const { exported, requested } = await runSelectionXlsxExport({
        ids: selectedObjectIds,
        columnIds: effectiveIds,
        langPrefs,
        purpose: needsPurpose ? purpose.trim() : '',
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      });
      toast.success(`Export terminé — ${exported} fiche${exported > 1 ? 's' : ''} sur ${requested}.`);
      onOpenChange(false);
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "L'export a échoué.");
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <Modal open={open} title="Exporter en Excel" onOpenChange={onOpenChange} size="wide"
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-ink-3">
            {exporting
              ? `Chargement ${progress.done}/${progress.total}…`
              : `${effectiveIds.length} colonne${effectiveIds.length > 1 ? 's' : ''} · ${selectedObjectIds.length} ligne${selectedObjectIds.length > 1 ? 's' : ''}`}
          </span>
          {exporting ? (
            <button type="button" className="btn btn--ghost" onClick={handleCancel}>Annuler l'export</button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>Annuler</button>
          )}
          <button type="button" className="btn btn--primary" disabled={!canDownload} onClick={() => void handleDownload()}>
            <Download size={14} aria-hidden /> Télécharger .xlsx
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-ink-3">
        {selectedObjectIds.length} fiche{selectedObjectIds.length > 1 ? 's' : ''} sélectionnée{selectedObjectIds.length > 1 ? 's' : ''} — une ligne par fiche, valeurs en clair.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Partir d'un modèle">
        {EXPORT_PRESETS.map((preset) => (
          <button key={preset.id} type="button"
            className={cn('rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold transition',
              presetId === preset.id ? 'border-teal bg-teal-soft text-teal' : 'border-line text-ink-3 hover:text-ink')}
            onClick={() => applyPreset(preset.id, session, caps)}
          >
            {preset.label}{preset.locked ? ' 🔒' : ''}
          </button>
        ))}
      </div>

      {byGroup.size === 0 ? null : [...byGroup.entries()].map(([groupId, cols]) => {
        const checkedCount = cols.filter((c) => effectiveIds.includes(c.id)).length;
        return (
          <FilterColumnGroup key={groupId} label={EXPORT_GROUP_LABELS[groupId]} count={checkedCount || undefined} collapsible defaultOpen={checkedCount > 0}>
            <div className="grid grid-cols-2 gap-x-4">
              {cols.map((col) => (
                <label key={col.id} className={cn('flex items-center gap-2 py-0.5 text-[12.5px]', locked ? 'text-ink-4' : 'text-ink')}>
                  <input type="checkbox" checked={effectiveIds.includes(col.id)} disabled={locked} onChange={() => toggleColumn(col.id)} />
                  {col.label}
                  {col.requiresPurpose ? <span className="rounded-[6px] bg-orange-soft px-1.5 text-[10.5px] font-semibold text-orange">tracé</span> : null}
                </label>
              ))}
            </div>
          </FilterColumnGroup>
        );
      })}

      {needsPurpose ? (
        <div className="rounded-[10px] border border-orange/40 bg-orange-soft/40 p-3">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink" htmlFor="export-purpose">
            Finalité de l'export (obligatoire — inscrite au journal)
            <textarea id="export-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="rounded-[8px] border border-line bg-surface p-2 text-[12.5px] font-normal"
              placeholder="Campagne relance adhésions 2026" />
          </label>
          <p className="mt-1 text-[11.5px] text-ink-3">
            Colonnes réservées à votre organisation — cet export de coordonnées est tracé (qui, quand, quelles fiches).
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
```

Ajustements permis à l'implémentation (mêmes assertions) : classes utilitaires exactes (`btn btn--primary` etc. — reprendre celles du footer d'une modale existante, ex. `CreateOrgDialog`/`ProfileEditModal`, plutôt qu'en inventer), et l'`aria-label` du dialog vient du `title` de `Modal`.

- [ ] **Step 5 : vert + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/features/explorer/export/ExportExcelModal.test.tsx src/components/common/Modal.test.tsx && npm run typecheck
git add src/components/common/Modal.tsx src/styles.css src/services/rpc.ts src/features/explorer/export/ExportExcelModal.tsx src/features/explorer/export/ExportExcelModal.test.tsx
git commit -m "feat(export): modale de colonnes + preflight serveur des capacites acteur (R2)

Modal wide 720px, groupes repliables, 3 prereglages, finalite >= 5 caracteres.
L'offre des colonnes acteur suit la consultation REELLE de la selection
(api.export_actor_capabilities, memes predicats que les gates) — fail-closed
avant 16t ou sur echec ; la garde reste serveur, fiche par fiche."
```

---

### Tâche 11 : câblage `SelectionBar` — Excel remplace CSV, suppression de l'ancien export

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/SelectionBar.tsx:7,10,32,90-98,169-177`
- Delete: `bertel-tourism-ui/src/services/selection-export.ts`
- Test: `bertel-tourism-ui/src/components/explorer/SelectionBar.test.tsx:12-13,28-29,38-41`

**Interfaces:**
- Consumes: `ExportExcelModal` (T10).

- [ ] **Step 1 : adapter les tests d'abord**

Dans `SelectionBar.test.tsx` :
1. supprimer la ligne 12 `jest.mock('@/services/selection-export', …)` ;
2. ajouter `jest.mock('@/features/explorer/export/ExportExcelModal', () => ({ ExportExcelModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Exporter en Excel" /> : null) }));`
3. remplacer toute attente `/CSV/` par `/Excel/` (lignes 28 et 38) ;
4. ajouter un cas :

```tsx
  it('« Excel » ouvre la modale de sélection de colonnes', async () => {
    useExplorerStore.setState({ selectedObjectIds: ['obj-1'] });
    render(<SelectionBar />);
    await userEvent.click(screen.getByRole('button', { name: /Excel/ }));
    expect(screen.getByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2 : échec** — `npm run test:run -- src/components/explorer/SelectionBar.test.tsx`. FAIL attendu.

- [ ] **Step 3 : câbler**

Dans `SelectionBar.tsx` :
1. ligne 7 : remplacer `Download` par `FileSpreadsheet` dans l'import lucide (le bouton change d'icône) ;
2. ligne 10 : **supprimer** `import { exportSelectedObjectsCsv } from '@/services/selection-export';` et ajouter `import { ExportExcelModal } from '@/features/explorer/export/ExportExcelModal';`
3. ligne 32 : remplacer `const [exporting, setExporting] = useState(false);` par `const [exportOpen, setExportOpen] = useState(false);`
4. lignes 90-98 : **supprimer** entièrement `handleExportCsv` ;
5. lignes 169-177 (le bouton CSV) : remplacer par :

```tsx
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            title="Exporter la sélection en Excel (choix des colonnes)"
            className={enabledAction}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            Excel
          </button>
```

6. juste avant le portail d'impression (fin du JSX, ~l.203), monter la modale — **sans** `if (!open)` (piège Modal) :

```tsx
      {/* §208 : export Excel de la sélection — Modal gère lui-même son cycle de présence. */}
      <ExportExcelModal open={exportOpen} onOpenChange={setExportOpen} />
```

7. mettre à jour le commentaire d'en-tête du composant (l.17-26) : « Imprimer / CSV / Vider » devient « Imprimer / Excel / Vider ».

- [ ] **Step 4 : supprimer l'ancien export et vérifier qu'il n'a plus d'appelant**

```bash
cd bertel-tourism-ui && grep -rn "selection-export" src && echo "ENCORE DES APPELANTS — NE PAS SUPPRIMER" || rm src/services/selection-export.ts
```

Attendu : aucun appelant restant, fichier supprimé. (`raw_json` et le bug `city`/`address` vides sur 100 % des fiches partent avec lui — spec §1.)

- [ ] **Step 5 : suite complète explorer + typecheck + commit**

```bash
cd bertel-tourism-ui && npm run test:run -- src/components/explorer && npm run typecheck
git add -A src/components/explorer/SelectionBar.tsx src/components/explorer/SelectionBar.test.tsx src/services/selection-export.ts
git commit -m "feat(export): le bouton CSV de la barre de selection devient Excel (modale de colonnes)

Supprime exportSelectedObjectsCsv : colonne raw_json (fiche entiere en JSON
dans une cellule) et colonnes city/address vides sur 100% des fiches (lecture
raw.location au lieu de raw.address) — l'export Excel repart du registre."
```

- [ ] **Step 6 : vérification visuelle (preview)**

Lancer le dev server (préview du projet), ouvrir l'Exploreur, sélectionner 2-3 fiches : la barre montre « Excel » ; le clic ouvre la modale ; « Essentiel » coché par défaut ; télécharger produit un fichier qui s'ouvre. En profiter pour vérifier le rendu de la variante wide. (La partie acteur reste volontairement en erreur explicite tant que 16t n'est pas déployée — Tâche 8, squelette.)

---

### Tâche 12 : migration 16t — garde acteur, journal immuable, RPC d'export journalisé

**Files:**
- Create: `Base de donnée DLL et API/migration_actor_contacts_org_gate.sql`
- Modify (R2.1, Step 1bis — **une seule ligne chacun**, aucun corps touché) : `Base de donnée DLL et API/rls_policies.sql` (`SET search_path` de `api.current_user_extended_object_ids`), `Base de donnée DLL et API/migration_crm_module.sql` (idem pour `api.current_user_crm_object_ids`)

**Interfaces:**
- Consumes: `api.current_user_crm_object_ids()` (`migration_crm_module.sql:269` — « objets dont une ORG du membership actif est publisher », le périmètre PO mot pour mot — RÉUTILISÉ, pas réinventé), `object_deletion_log` comme modèle de journal (`migration_object_hard_delete.sql`), `app_user_profile.role`.
- Produces (5 surfaces, chacune avec son `REVOKE`) :
  - `api.can_read_actor_contacts(text) → boolean` — la garde (consommée par T13)
  - `api.export_actor_capabilities(text[]) → jsonb` — le préflight R2 (consommé par T10 via `getExportActorCapabilities`)
  - table `actor_contact_export_log` — le journal multi-ORG (lu par T14)
  - `api.export_actor_contacts(text[], text, text, uuid, int, int) → jsonb` — l'export journalisé (consommé par T16)
  - `ALTER FUNCTION` sur les 2 feuilles d'autorisation (R2.1, Step 1bis) + `REVOKE/GRANT` d'hygiène sur `get_object_resources_batch`
- **Interdits :** aucun bras `auth.role() IN ('service_role', …)` dans la garde — les routes partenaires appellent en service-role, ce bras dirait TRUE au seul chemin qui fuit. Une clé de service n'est pas une personne.

- [ ] **Step 1 : créer le fichier de migration**

Créer `Base de donnée DLL et API/migration_actor_contacts_org_gate.sql` avec EXACTEMENT ce contenu :

```sql
-- =====================================================================
-- 16t — §208 : garde serveur des coordonnées d'ACTEUR + journal d'export
-- =====================================================================
-- Contexte (décision log §208, spec 2026-07-31-explorer-export-excel-design.md §4.5) :
--   actor_channel n'a NI is_public NI visibility ; la seule garde est portée par
--   le LIEN (actor_object_role.visibility, DEFAULT 'public'), en tout-ou-rien.
--   api.get_object_resource est SECURITY DEFINER : il contourne la RLS
--   d'actor_channel, et render.actor_lines fuit des noms de personnes à anon
--   (mesuré : 760 objets publiés). Classe §49 : un drapeau de champ COMPOSE,
--   il ne se substitue jamais.
-- Arbitrage PO : coordonnées d'acteur complètes RÉSERVÉES aux membres de l'ORG
--   éditrice (publisher), export JOURNALISÉ avec finalité.
-- Pièges honorés : pas de bras auth.role()='service_role' (les routes partenaires
--   appellent en service-role — une clé de service n'est pas une personne) ;
--   COALESCE(…, FALSE) (sondes à trois valeurs, §204) ; gen_random_uuid()
--   (search_path restreint) ; tableau EN VALEUR (= ANY(v_scope), jamais
--   ANY((SELECT …)) — 42883) ; REVOKE FROM PUBLIC sur toute fonction neuve.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. La garde : l'appelant est-il membre d'une ORG éditrice de la fiche ?
--    Périmètre RÉUTILISÉ : api.current_user_crm_object_ids() (8z) = objets
--    dont une ORG du membership actif est publisher. Bras superuser par
--    app_user_profile.role — PAS api.is_platform_superuser() (son premier
--    bras est auth.role() IN ('service_role','admin')).
--    auth.uid() est NULL hors contexte HTTP ET en service-role ⇒ le CASE
--    court-circuite AVANT toute lecture (sonde paresseuse, §204).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.can_read_actor_contacts(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
-- R2.1 — search_path SÛR pour une fonction DEFINER : `pg_temp` EXPLICITEMENT EN
-- DERNIER. Sans lui, PostgreSQL cherche le schéma temporaire EN PREMIER pour les
-- relations (doc CREATE FUNCTION §Security), donc un `CREATE TEMP TABLE
-- app_user_profile` par n'importe quel `authenticated` masquerait la table qui
-- décide ici du statut superuser. Les relations sont EN PLUS schéma-qualifiées :
-- ceinture (search_path) + bretelles (qualification).
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN FALSE
    ELSE COALESCE(
           EXISTS (SELECT 1 FROM public.app_user_profile p
                    WHERE p.id = (SELECT auth.uid())
                      AND p.role IN ('owner','super_admin'))
        OR p_object_id IN (SELECT api.current_user_crm_object_ids()),
         FALSE)
  END;
$$;

REVOKE ALL     ON FUNCTION api.can_read_actor_contacts(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.can_read_actor_contacts(text) TO   authenticated, service_role;
-- service_role a EXECUTE (les legs DEFINER/INVOKER l'évaluent sous ce rôle)
-- mais la fonction lui répond FALSE (auth.uid() NULL) — c'est le comportement voulu.

-- ---------------------------------------------------------------------
-- 1bis. Préflight des capacités acteur (R2) : la modale d'export demande au
--    SERVEUR si la sélection donne accès à l'identité / aux coordonnées des
--    acteurs — l'offre de colonnes suit la consultation réelle, pas un proxy
--    « membre d'une ORG ». Booléens AGRÉGÉS sur la sélection (∃ une fiche
--    accessible ⇒ true : les fiches refusées resteront vides, sélection mixte
--    assumée). ERGONOMIE seulement : export_actor_contacts refait les contrôles
--    fiche par fiche — ce préflight n'est jamais une garde.
--    Mêmes prédicats que les gates réels : identité ⇔ extended OU lien public
--    (l'arm du leg actors) ; coordonnées ⇔ can_read_actor_contacts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.export_actor_capabilities(p_object_ids text[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp   -- R2.1 : pg_temp EN DERNIER
AS $$
  WITH ids AS (
    SELECT DISTINCT btrim(t.id) AS id
      FROM unnest(p_object_ids) AS t(id)
     WHERE btrim(coalesce(t.id, '')) <> ''
  ),
  super AS (
    SELECT EXISTS (SELECT 1 FROM public.app_user_profile p
                    WHERE p.id = (SELECT auth.uid())
                      AND p.role IN ('owner','super_admin')) AS ok
  )
  SELECT jsonb_build_object(
    'actor_identity_available',
      COALESCE((SELECT ok FROM super), FALSE)
      OR EXISTS (
        SELECT 1 FROM ids i
         WHERE i.id IN (SELECT api.current_user_extended_object_ids())
            OR EXISTS (SELECT 1 FROM public.actor_object_role aor
                        WHERE aor.object_id = i.id AND aor.visibility = 'public')),
    'actor_contacts_available',
      COALESCE((SELECT ok FROM super), FALSE)
      OR EXISTS (
        SELECT 1 FROM ids i
         WHERE i.id IN (SELECT api.current_user_crm_object_ids()))
  );
$$;

REVOKE ALL     ON FUNCTION api.export_actor_capabilities(text[]) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_capabilities(text[]) TO   authenticated;

-- ---------------------------------------------------------------------
-- 2. Journal IMMUABLE des exports de coordonnées (modèle : object_deletion_log).
--    Pas de FK vers object ni actor : la ligne survit à rpc_delete_object et à
--    l'effacement RGPD art. 17. AUCUNE VALEUR de coordonnée n'y entre jamais —
--    qui, quand, combien, quels ids, quels TYPES de canaux. Pas les valeurs.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actor_contact_export_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- R1 : tous les LOTS d'un même export logique partagent export_run_id (fourni
  -- par le client, sinon généré) ; batch_index/batch_count situent le lot.
  export_run_id   UUID NOT NULL,
  batch_index     INT  NOT NULL DEFAULT 1,
  batch_count     INT  NOT NULL DEFAULT 1,
  performed_by    UUID,
  performed_org   TEXT,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT NOT NULL,
  format          TEXT,
  object_count    INT  NOT NULL DEFAULT 0,
  actor_count     INT  NOT NULL DEFAULT 0,
  channel_count   INT  NOT NULL DEFAULT 0,
  object_ids      TEXT[] NOT NULL DEFAULT '{}',
  denied_object_ids TEXT[] NOT NULL DEFAULT '{}',
  actor_ids       UUID[] NOT NULL DEFAULT '{}',
  channel_kinds   TEXT[] NOT NULL DEFAULT '{}',
  identity_fields TEXT[] NOT NULL DEFAULT '{}',
  -- R1 multi-ORG : QUELLES ORG publisher ont permis l'accès (bras RLS de lecture)
  -- + l'attribution détaillée objet↔ORG. current_user_crm_object_ids() ne le dit pas.
  org_object_ids  TEXT[] NOT NULL DEFAULT '{}',
  org_attributions JSONB NOT NULL DEFAULT '[]',
  report          JSONB
);

COMMENT ON TABLE actor_contact_export_log IS
  'Journal immuable des exports de coordonnées d''acteur (§208). Écrit uniquement par api.export_actor_contacts ; aucune valeur de coordonnée n''y figure ; survit à la suppression des objets/acteurs (pas de FK). export_run_id relie les lots d''un même export ; org_object_ids/org_attributions disent quelle ORG publisher a autorisé quoi (multi-ORG).';

CREATE INDEX IF NOT EXISTS idx_acel_at    ON actor_contact_export_log (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_by    ON actor_contact_export_log (performed_by, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_run   ON actor_contact_export_log (export_run_id);
CREATE INDEX IF NOT EXISTS idx_acel_actor ON actor_contact_export_log USING GIN (actor_ids);

ALTER TABLE actor_contact_export_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actor_contact_export_log_read ON actor_contact_export_log;
-- R1 : l'admin d'ORG lit les exports où SON ORG a autorisé au moins une fiche
-- (org_object_ids), pas seulement ceux dont l'exportateur avait son ORG active —
-- sans quoi la politique serait ambiguë à plusieurs ORG.
CREATE POLICY actor_contact_export_log_read ON actor_contact_export_log
  FOR SELECT TO authenticated USING (
    (SELECT api.is_platform_superuser())
    OR ((SELECT api.current_user_admin_rank()) IS NOT NULL
        AND (SELECT api.current_user_org_id()) = ANY(actor_contact_export_log.org_object_ids))
  );
-- Pas de policy INSERT/UPDATE/DELETE : seul le RPC DEFINER écrit ; per-command, jamais FOR ALL.
REVOKE ALL    ON actor_contact_export_log FROM PUBLIC, anon;
GRANT  SELECT ON actor_contact_export_log TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. L'export : autorise-une-fois (§36 — la liste d'ids du client n'est jamais
--    de confiance) + journalisation DANS LA MÊME TRANSACTION que la lecture.
--    Plafond dur 500 : aspirer le corpus produit N lignes de journal, pas une.
--    PAS de GRANT à service_role : un export doit être imputable à une personne.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.export_actor_contacts(
  p_object_ids    text[],
  p_reason        text,
  p_format        text DEFAULT 'xlsx',
  p_export_run_id uuid DEFAULT NULL,   -- R1 : partagé entre les lots d'un même export ; NULL = généré
  p_batch_index   int  DEFAULT 1,
  p_batch_count   int  DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp   -- R2.1 : pg_temp EN DERNIER
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_super     boolean;
  v_org       text;
  v_ids       text[];
  v_scope     text[];
  v_denied    text[];
  v_rows      jsonb;
  v_actors    uuid[];
  v_channels  bigint;
  v_kinds     text[];
  v_org_ids   text[];
  v_org_attr  jsonb;
  v_run_id    uuid := COALESCE(p_export_run_id, gen_random_uuid());
  v_log_id    uuid := gen_random_uuid();  -- search_path restreint : jamais uuid_generate_v4()
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT' USING ERRCODE = '42501';
  END IF;
  -- R1 : la finalité est validée SERVEUR (la modale seule n'est pas une protection).
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: finalite de 5 caracteres minimum' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG: 500 caracteres maximum' USING ERRCODE = '22023';
  END IF;
  IF lower(coalesce(p_format, '')) NOT IN ('xlsx', 'csv') THEN
    RAISE EXCEPTION 'FORMAT_INVALID: xlsx ou csv' USING ERRCODE = '22023';
  END IF;
  IF p_batch_index < 1 OR p_batch_count < 1 OR p_batch_index > p_batch_count THEN
    RAISE EXCEPTION 'BATCH_META_INVALID' USING ERRCODE = '22023';
  END IF;

  -- R1 : dédoublonnage et nettoyage CÔTÉ SERVEUR, plafond appliqué APRÈS.
  SELECT COALESCE(array_agg(DISTINCT btrim(t.id)), '{}') INTO v_ids
    FROM unnest(p_object_ids) AS t(id)
   WHERE btrim(coalesce(t.id, '')) <> '';
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'EMPTY_SELECTION' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_ids, 1) > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE: 500 max apres dedoublonnage (recu %)', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  -- R2.1 : relations schéma-qualifiées (pg_temp ne peut plus masquer la table
  -- qui décide du statut superuser, ni celles du périmètre).
  v_super := EXISTS (SELECT 1 FROM public.app_user_profile p
                      WHERE p.id = v_caller AND p.role IN ('owner','super_admin'));
  v_org := api.current_user_org_id();

  -- Autorise-une-fois : on réduit la demande au périmètre de l'appelant, PAR FICHE.
  IF v_super THEN
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_scope
      FROM unnest(v_ids) AS t(id)
     WHERE EXISTS (SELECT 1 FROM public.object o WHERE o.id = t.id);
  ELSE
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_scope
      FROM unnest(v_ids) AS t(id)
     WHERE t.id IN (SELECT api.current_user_crm_object_ids());
  END IF;

  -- R1 : sélection MIXTE = on sert l'autorisé et on NOMME le refusé (le fichier
  -- n'échoue pas) ; tout-refusé = FORBIDDEN.
  SELECT COALESCE(array_agg(t.id), '{}') INTO v_denied
    FROM unnest(v_ids) AS t(id)
   WHERE NOT (t.id = ANY(v_scope));
  IF coalesce(array_length(v_scope, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- R1 multi-ORG : QUELLE ORG publisher autorise chaque fiche du périmètre.
  -- Pour un superuser sans membership, l'attribution retombe sur la/les ORG
  -- publisher de la fiche (granted_via = 'superuser' dans report).
  SELECT COALESCE(array_agg(DISTINCT ool.org_object_id), '{}'),
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object('object_id', ool.object_id, 'org_object_id', ool.org_object_id)), '[]')
    INTO v_org_ids, v_org_attr
    FROM public.object_org_link ool
    JOIN public.ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
   WHERE ool.object_id = ANY(v_scope)
     AND (v_super OR ool.org_object_id IN (
           SELECT uom.org_object_id FROM public.user_org_membership uom
            WHERE uom.user_id = v_caller AND uom.is_active = TRUE));

  SELECT COALESCE(jsonb_agg(r.line ORDER BY r.object_id, r.is_primary DESC, r.display_name), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT r.actor_id), '{}'::uuid[]),
         COALESCE(sum(r.n_channels), 0)
    INTO v_rows, v_actors, v_channels
    FROM (
      SELECT aor.object_id, a.id AS actor_id, a.display_name, aor.is_primary,
             COALESCE(ch.n, 0) AS n_channels,
             jsonb_build_object(
               'object_id',    aor.object_id,
               'object_name',  o.name,
               'actor_id',     a.id,
               'display_name', a.display_name,
               'first_name',   a.first_name,
               'last_name',    a.last_name,
               'role_code',    rar.code,
               'role_name',    rar.name,
               'is_primary',   aor.is_primary,
               'note',         aor.note,
               'valid_from',   aor.valid_from,
               'valid_to',     aor.valid_to,
               'contacts',     COALESCE(ch.items, '[]'::jsonb)
             ) AS line
        FROM actor_object_role aor
        JOIN object o ON o.id = aor.object_id
        JOIN actor  a ON a.id = aor.actor_id
        LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'kind_code',  rck.code,
                   'kind_name',  rck.name,
                   'value',      ac.value,
                   'is_primary', ac.is_primary,
                   'role_code',  rcr.code
                 ) ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at) AS items,
                 count(*) AS n
            FROM actor_channel ac
            JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
            LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
           WHERE ac.actor_id = a.id
        ) ch ON TRUE
       WHERE aor.object_id = ANY(v_scope)   -- valeur tableau, jamais ANY((SELECT …)) : 42883
    ) r;

  SELECT COALESCE(array_agg(DISTINCT rck.code), '{}') INTO v_kinds
    FROM actor_object_role aor
    JOIN actor_channel ac          ON ac.actor_id = aor.actor_id
    JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
   WHERE aor.object_id = ANY(v_scope);

  INSERT INTO actor_contact_export_log(
    id, export_run_id, batch_index, batch_count,
    performed_by, performed_org, reason, format,
    object_count, actor_count, channel_count,
    object_ids, denied_object_ids, actor_ids, channel_kinds, identity_fields,
    org_object_ids, org_attributions, report)
  VALUES (
    v_log_id, v_run_id, p_batch_index, p_batch_count,
    v_caller, v_org, btrim(p_reason), lower(p_format),
    coalesce(array_length(v_scope, 1), 0), coalesce(array_length(v_actors, 1), 0), v_channels,
    v_scope, v_denied, v_actors, v_kinds,
    ARRAY['display_name','first_name','last_name','role','note','validity'],
    v_org_ids, v_org_attr,
    jsonb_build_object(
      'requested_count', array_length(v_ids, 1),
      'granted_count',   array_length(v_scope, 1),
      'denied_count',    coalesce(array_length(v_denied, 1), 0),
      'granted_via',     CASE WHEN v_super THEN 'superuser' ELSE 'org_membership' END));

  RETURN jsonb_build_object(
    'log_id',                v_log_id,
    'export_run_id',         v_run_id,
    'batch_index',           p_batch_index,
    'batch_count',           p_batch_count,
    'exported_at',           now(),
    'authorized_object_ids', to_jsonb(v_scope),
    'denied_object_ids',     to_jsonb(v_denied),
    'object_count',          coalesce(array_length(v_scope, 1), 0),
    'actor_count',           coalesce(array_length(v_actors, 1), 0),
    'channel_count',         v_channels,
    'rows',                  v_rows);
END;
$$;

-- R1 : REVOKE explicite de service_role EN PLUS de PUBLIC/anon — un export de PII
-- est imputable à une personne, jamais à une clé.
REVOKE ALL     ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) TO   authenticated;

-- ---------------------------------------------------------------------
-- 4. Hygiène §208 : l'EXECUTE de get_object_resources_batch n'était porté que
--    par le PUBLIC implicite (proacl NULL). Iso-fonctionnel pour l'app
--    (authenticated), retiré à anon (0 consommateur documenté, 0 appelant).
--    ⚠ Ne JAMAIS reproduire ce REVOKE sur api.get_object_resource sans
--    re-GRANT explicite à anon ET service_role (routes partenaires).
-- ---------------------------------------------------------------------
REVOKE ALL     ON FUNCTION api.get_object_resources_batch(text[], text[], text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.get_object_resources_batch(text[], text[], text, jsonb) TO authenticated, service_role;

COMMIT;

-- Trois fonctions api neuves exposées PostgREST (can_read_actor_contacts,
-- export_actor_capabilities, export_actor_contacts) :
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 1bis (R2.1) : durcir le `search_path` des DEUX feuilles d'autorisation**

Les trois fonctions ci-dessus délèguent leur décision à `api.current_user_crm_object_ids()`
et `api.current_user_extended_object_ids()` — toutes deux `SECURITY DEFINER` avec
`SET search_path = public, api, auth` et des relations **non qualifiées**
(`user_org_membership`, `object_org_link`, `actor_object_role`). Un durcissement qui
s'arrêterait aux fonctions neuves serait cosmétique : la décision réelle se prend dans
ces feuilles, et `CREATE TEMP TABLE user_org_membership` y accorderait le périmètre
CRM sur n'importe quel objet.

**On corrige le `search_path` par `ALTER FUNCTION`, jamais en réécrivant les corps** —
zéro risque de transcription sur des fonctions consommées par des dizaines de policies.
Ajouter à la migration, **avant le `COMMIT`** :

```sql
-- ---------------------------------------------------------------------
-- 1ter. R2.1 — durcissement du search_path des DEUX feuilles d'autorisation
--    dont dépendent les fonctions ci-dessus. ALTER FUNCTION ne touche PAS le
--    corps (aucun risque de transcription) : il ne fait que placer `pg_temp`
--    explicitement EN DERNIER, là où PostgreSQL le cherchait EN PREMIER pour
--    les relations. Iso-fonctionnel pour tout usage légitime.
--    ⚠ Ces deux fonctions sont consommées par de nombreuses policies RLS —
--    ne PAS les recréer ici, seulement les altérer.
-- ---------------------------------------------------------------------
ALTER FUNCTION api.current_user_crm_object_ids()
  SET search_path = pg_catalog, public, api, auth, pg_temp;
ALTER FUNCTION api.current_user_extended_object_ids()
  SET search_path = pg_catalog, public, api, auth, pg_temp;
```

Puis **corriger les SOURCES** pour qu'une base fraîche naisse durcie (invariant
d'intégrité de déploiement — sinon `rls_policies.sql` recrée la forme faible et
seule la migration tardive la rattrape) :

- `Base de donnée DLL et API/rls_policies.sql` — la ligne `SET search_path = public, api, auth`
  de `api.current_user_extended_object_ids()` devient
  `SET search_path = pg_catalog, public, api, auth, pg_temp`.
- `Base de donnée DLL et API/migration_crm_module.sql` — idem pour
  `api.current_user_crm_object_ids()`.

Localiser par `grep -n -A3 "FUNCTION api.current_user_extended_object_ids"` etc. —
**une seule ligne change par fichier**, aucun corps n'est touché.

> **Reste hors périmètre, à consigner au §208 (T18) :** ~105 fonctions
> `SECURITY DEFINER` du dépôt portent un `search_path` sans `pg_temp`
> (`grep -c "SET search_path" *.sql` : 126 occurrences de la forme
> `public, api, auth` à elle seule ; `pg_temp` n'apparaît que 2 fois dans tout
> le dépôt). C'est une dette **antérieure et générale**, pas introduite ici :
> la corriger entièrement est une passe dédiée (balayage catalogue + test de
> non-régression par policy). Cette passe durcit **la chaîne qu'elle utilise**,
> et le dit.

- [ ] **Step 2 : contrôles statiques**

```bash
cd "Base de donnée DLL et API" && grep -n "uuid_generate_v4\|ANY((SELECT\|FOR ALL" migration_actor_contacts_org_gate.sql; grep -c "REVOKE ALL" migration_actor_contacts_org_gate.sql
```

Attendu : la première commande ne renvoie RIEN (aucun des trois interdits) ; la
seconde renvoie `5` — un REVOKE par surface neuve : garde (1), préflight (1bis),
journal (2), RPC export (3), hygiène batch (4). Si le compte diffère, une surface
est née sans son REVOKE : la trouver avant de continuer.

- [ ] **Step 3 : commit**

```bash
git add "Base de donnée DLL et API/migration_actor_contacts_org_gate.sql" "Base de donnée DLL et API/rls_policies.sql" "Base de donnée DLL et API/migration_crm_module.sql"
git commit -m "feat(sql): 16t — garde + preflight + journal + RPC export journalise, search_path durci (pg_temp en dernier)

Perimetre reutilise (current_user_crm_object_ids = ORG publisher du membership).
Pas de bras service_role dans la garde (les routes partenaires appellent en
service-role — une cle de service n'est pas une personne). Preflight R2 : la
modale offre les colonnes acteur selon la consultation REELLE de la selection
(memes predicats que les gates — jamais une garde, l'export refait fiche par
fiche). Journal multi-ORG sans aucune valeur de coordonnee, sans FK.
R2.1 : search_path sur (pg_catalog, ..., pg_temp EN DERNIER) + relations
schema-qualifiees sur les 3 fonctions neuves, et ALTER FUNCTION sur les 2
feuilles d'autorisation dont elles dependent (corps intouches ; sources
corrigees pour qu'une base fraiche naisse durcie). Sans cela, un CREATE TEMP
TABLE app_user_profile / user_org_membership par n'importe quel authenticated
masquait la relation qui decide du statut superuser et du perimetre CRM."
```

---

### Tâche 13 : patch des trois voies qui fuient dans `api_views_functions.sql`

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` — **4 sites, tous dans `get_object_resource`** : DECLARE (~l.3022), leg `actors` (~l.4023-4080), `render.actor_lines` (~l.5262-5279), `render.contact_lines` (~l.5030-5048).
- **INTERDIT (R1/R2)** : `get_object_with_deep_data` et `get_objects_with_deep_data` (~l.7203-7360) ne sont modifiées par AUCUN step — le Step 5 le PROUVE par comparaison de leurs définitions complètes.

⚠ Les numéros de ligne bougent à chaque édition : localiser par `grep -n`, jamais de tête.

- [ ] **Step 1 : DECLARE — la sonde paresseuse**

Localiser `v_can_read_extended BOOLEAN := FALSE;` (grep). Ajouter juste dessous :

```sql
  v_actor_contacts BOOLEAN := NULL;  -- §208/16t : sonde PARESSEUSE (évaluée une fois, seulement si le leg actors/render est demandé)
```

- [ ] **Step 2 : leg structuré `actors`**

Localiser `-- Actors (enriched with contacts)`. Remplacer le bloc `IF v_fields IS NULL OR 'actors' = ANY(v_fields) THEN … END IF;` par :

```sql
  -- Actors (enriched with contacts)
  -- §208/16t : les LIGNES restent gardées par la visibilité du lien (v_can_read_extended
  -- OR visibility='public'), mais la PII (prénom/nom/genre/note) et les CANAUX
  -- (actor_channel — ni is_public ni visibility, classe §49) exigent en plus
  -- api.can_read_actor_contacts (membre d'une ORG publisher de la fiche, jamais
  -- auth.role()). CASE court-circuite (§197) : la corrélée actor_channel n'est
  -- JAMAIS exécutée sur le chemin public. contacts_restricted distingue
  -- « réservé » de « pas saisi » (tableau vide ≠ champ absent).
  IF v_fields IS NULL OR 'actors' = ANY(v_fields) THEN
    IF v_actor_contacts IS NULL THEN
      v_actor_contacts := COALESCE(api.can_read_actor_contacts(p_object_id), FALSE);
    END IF;
    js := js || jsonb_build_object(
      'actors',
      COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'display_name', a.display_name,
          'first_name', CASE WHEN v_actor_contacts THEN a.first_name END,
          'last_name',  CASE WHEN v_actor_contacts THEN a.last_name END,
          'gender',     CASE WHEN v_actor_contacts THEN a.gender END,
          'role', jsonb_build_object(
            'id', aor.role_id,
            'code', rar.code,
            'name', rar.name
          ),
          'is_primary', aor.is_primary,
          'valid_from', aor.valid_from,
          'valid_to', aor.valid_to,
          'visibility', aor.visibility,
          'note', CASE WHEN v_actor_contacts THEN aor.note END,
          'contacts_restricted', NOT v_actor_contacts,
          'contacts', CASE WHEN NOT v_actor_contacts THEN '[]'::jsonb ELSE COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ac.id,
                'kind', jsonb_build_object(
                  'code', rck.code,
                  'name', rck.name,
                  'description', rck.description,
                  'icon_url', rck.icon_url
                ),
                'value', ac.value,
                'is_primary', ac.is_primary,
                'role', jsonb_build_object(
                  'code', rcr.code,
                  'name', rcr.name
                ),
                'position', ac.position,
                'extra', ac.extra
              )
              ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
            )
            FROM actor_channel ac
            JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
            LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
            WHERE ac.actor_id = a.id
          ), '[]'::jsonb) END
        )
        ORDER BY aor.is_primary DESC, aor.valid_from DESC, a.display_name
      )
      FROM actor a
      JOIN actor_object_role aor ON aor.actor_id = a.id
      LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
      WHERE aor.object_id = obj.id
        AND (v_can_read_extended OR aor.visibility = 'public')
    ), '[]'::jsonb)
    );
  END IF;
```

- [ ] **Step 3 : `render.actor_lines` — la fuite mesurée (760 fiches)**

Localiser `v_render := v_render || jsonb_build_object('actor_lines'`. Dans le sous-select `FROM actor a JOIN actor_object_role aor …` au-dessus, remplacer :

```sql
        WHERE aor.object_id = obj.id
```

par :

```sql
        -- §208/16t : même garde de LIGNE que le leg structuré — avant ce patch,
        -- actor_lines livrait des noms de personnes physiques à anon (760 fiches).
        WHERE aor.object_id = obj.id
          AND (v_can_read_extended OR aor.visibility = 'public')
```

(Uniquement dans le bloc `actor_lines` — le grep doit tomber sur `AS line_text,` avec `display_name` : c'est le bon sous-select.)

- [ ] **Step 4 : `render.contact_lines` — même classe**

Localiser `jsonb_build_object('contact_lines'`. Dans son sous-select `FROM contact_channel c …`, remplacer :

```sql
        WHERE c.object_id = obj.id
```

par :

```sql
        -- §208 : composer le drapeau champ AVEC l'arm publié (§49) — comme le leg structuré.
        WHERE c.object_id = obj.id
          AND (v_can_read_extended OR c.is_public IS TRUE)
```

- [ ] **Step 5 (R1) : NE PAS toucher `get_objects_with_deep_data` — vérifier qu'elle est intacte**

**Décision de revue R1 : les fonctions deep (`get_object_with_deep_data`,
`get_objects_with_deep_data`) sont HORS PÉRIMÈTRE.** L'export ne passe pas par elles
(chemin : modale → service → `get_object_resources_batch` → `get_object_resource`),
et les patcher cascaderait sur le tiroir, l'éditeur, l'impression et tous les
consommateurs de `getObjectResource`. État des lieux honnête, à consigner au §208
comme dette distincte : leur latéral acteurs émet la PII sans gate, mais elles sont
`SECURITY INVOKER` (la RLS d'`actor_channel` vide les canaux pour `authenticated`)
et n'ont **aucun appelant service-role** (vérifié : les routes partenaires appellent
`get_object_resource`). Cette dette n'entre dans cette passe QUE si les tests
démontrent une régression réellement introduite par 16t.

Vérification mécanique — **comparaison des DÉFINITIONS COMPLÈTES entre HEAD et
l'arbre de travail** (R2 : un `git diff | grep deep_data` raterait une modification
au milieu du corps si le nom de la fonction n'apparaît pas dans le contexte du diff) :

```bash
cd "Base de donnée DLL et API"
mkdir -p /tmp/deep-proof
git show HEAD:./api_views_functions.sql | awk '/CREATE OR REPLACE FUNCTION api\.get_object_with_deep_data\(/,/^\$\$;$/' > /tmp/deep-proof/single.head.sql
awk '/CREATE OR REPLACE FUNCTION api\.get_object_with_deep_data\(/,/^\$\$;$/' api_views_functions.sql > /tmp/deep-proof/single.work.sql
git show HEAD:./api_views_functions.sql | awk '/CREATE OR REPLACE FUNCTION api\.get_objects_with_deep_data\(/,/^\$\$;$/' > /tmp/deep-proof/batch.head.sql
awk '/CREATE OR REPLACE FUNCTION api\.get_objects_with_deep_data\(/,/^\$\$;$/' api_views_functions.sql > /tmp/deep-proof/batch.work.sql
diff -u /tmp/deep-proof/single.head.sql /tmp/deep-proof/single.work.sql && diff -u /tmp/deep-proof/batch.head.sql /tmp/deep-proof/batch.work.sql && echo "OK — les 2 fonctions deep sont IDENTIQUES a HEAD"
wc -l /tmp/deep-proof/*.head.sql   # garde de non-vacuite : les extraits ne doivent PAS etre vides
```

Attendu : les deux `diff` muets + la ligne `OK — …`, ET des extraits non vides (si
`wc -l` montre 0, le motif awk n'a rien capturé et la preuve est VACANTE — corriger
le motif avant de conclure). Si un `diff` sort quelque chose : annuler cet édit
avant de continuer. Le test SQL de la Tâche 14 (assertion H) reste en COMPLÉMENT :
il fige côté base que `pg_proc.prosrc` ne référence pas la garde — il ne prouve pas
l'identité, c'est cette comparaison-ci qui la prouve.

- [ ] **Step 6 : inventaire exhaustif des émetteurs d'`actor_channel`**

```bash
cd "Base de donnée DLL et API" && grep -n "FROM actor_channel\|JOIN actor_channel" api_views_functions.sql migration_actor_contacts_org_gate.sql
```

Pour CHAQUE site listé, vérifier qu'il est soit (a) patché ci-dessus, soit (b) dans une fonction déjà gated (chercher la garde en tête de la fonction porteuse : `is_platform_superuser` / scope CRM / `user_actor_ids`), soit (c) le latéral des fonctions deep — **hors périmètre R1, dette consignée, NE PAS patcher**. Consigner la liste et le verdict par site dans le commit. Si un site n'est ni (a) ni (b) ni (c) : STOP, le signaler avant de continuer.

- [ ] **Step 7 : commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql"
git commit -m "fix(sql): gate 16t sur les 3 voies acteur de get_object_resource (classe §49) — deep_data INTOUCHEE (R1)

Leg actors : PII et canaux sous api.can_read_actor_contacts (sonde paresseuse,
CASE court-circuite — la correlee actor_channel n'est jamais executee sur le
chemin public) + cle contacts_restricted. render.actor_lines : garde de ligne
(fuyait des noms a anon sur 760 fiches publiees). render.contact_lines :
compose is_public avec l'arm publie. get_objects_with_deep_data volontairement
non modifiee (decision de revue R1 — dette distincte consignee au §208)."
```

---

### Tâche 14 : test SQL `test_actor_contacts_org_gate.sql` — personas réelles + sabotage

**Files:**
- Create: `Base de donnée DLL et API/tests/test_actor_contacts_org_gate.sql`

**Règles maison qui s'appliquent (relire avant d'écrire) :** un test ne peut éprouver ces chemins que par `request.jwt.claims` — **jamais `SET ROLE` seul** (sans JWT, `auth.uid()` est NULL : toutes les personas retombent sur « refus » et le test est parfaitement vacant). La garde doit être **non vacante** : témoins insérés + exécution du VRAI RPC + **vérification rouge par sabotage** avant de figer.

- [ ] **Step 1 : créer le fichier de test**

```sql
-- =====================================================================
-- test_actor_contacts_org_gate.sql — garde 16t (§208), personas réelles
-- =====================================================================
-- Personas par request.jwt.claims (JAMAIS SET ROLE seul — auth.uid() NULL
-- rendrait chaque assertion « refus » et le test serait vacant).
-- Fixtures 10xx auto-portées, transaction annulée en fin de fichier.
BEGIN;

-- ---------- Fixtures ----------
-- Un user membre de l'ORG publisher, un user sans membership, une fiche
-- publiée portant un acteur à lien 'partners' avec 2 canaux.
INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000001', 'membre-16t@test.local'),
       ('10000000-0000-4000-8000-000000000002', 'etranger-16t@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user_profile (id, role, display_name)
VALUES ('10000000-0000-4000-8000-000000000001', 'tourism_agent', 'Membre 16t'),
       ('10000000-0000-4000-8000-000000000002', 'tourism_agent', 'Etranger 16t')
ON CONFLICT (id) DO NOTHING;

INSERT INTO object (id, object_type, name, status, region_code)
VALUES ('ORGRUN000000T16T', 'ORG', 'ORG Test 16t', 'published', 'RUN'),
       ('HOTRUN000000T16T', 'HOT', 'Hotel Test 16t', 'published', 'RUN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_config (org_object_id) VALUES ('ORGRUN000000T16T') ON CONFLICT DO NOTHING;

INSERT INTO object_org_link (id, object_id, org_object_id, role_id, is_primary)
SELECT gen_random_uuid(), 'HOTRUN000000T16T', 'ORGRUN000000T16T', r.id, TRUE
FROM ref_org_role r WHERE r.code = 'publisher'
ON CONFLICT DO NOTHING;

INSERT INTO user_org_membership (id, user_id, org_object_id, is_active)
VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'ORGRUN000000T16T', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO actor (id, display_name, first_name, last_name)
VALUES ('20000000-0000-4000-8000-000000000001', 'Jean Temoin', 'Jean', 'Temoin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO actor_object_role (id, actor_id, object_id, role_id, is_primary, visibility)
SELECT gen_random_uuid(), '20000000-0000-4000-8000-000000000001', 'HOTRUN000000T16T', r.id, TRUE, 'partners'
FROM ref_actor_role r WHERE r.code = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO actor_channel (id, actor_id, kind_id, value, is_primary)
SELECT gen_random_uuid(), '20000000-0000-4000-8000-000000000001', k.id, v.value, v.is_primary
FROM (VALUES ('email', 'jean.temoin@sentinelle-16t.test', TRUE),
             ('mobile', '0692SENTINELLE', FALSE)) AS v(kind, value, is_primary)
JOIN ref_code_contact_kind k ON k.code = v.kind
ON CONFLICT DO NOTHING;

-- ---------- Harnais persona ----------
-- Reproduire ce trio avant CHAQUE persona (set_config est local à la txn) :
--   SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"<uuid>"}', true);
--   SET LOCAL ROLE authenticated;
-- puis RESET ROLE; avant la persona suivante.

-- A. MEMBRE de l'ORG publisher : garde TRUE, leg actors complet, export OK + journal.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v jsonb; e jsonb;
BEGIN
  IF NOT COALESCE(api.can_read_actor_contacts('HOTRUN000000T16T'), FALSE) THEN
    RAISE EXCEPTION 'A1 FAIL: le membre publisher doit passer la garde';
  END IF;
  SELECT (api.get_object_resource('HOTRUN000000T16T', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors'->0 INTO v;
  IF v->>'contacts_restricted' IS DISTINCT FROM 'false'
     OR jsonb_array_length(v->'contacts') < 2
     OR v->>'first_name' IS NULL THEN
    RAISE EXCEPTION 'A2 FAIL: membre = contacts + PII visibles, recu %', v;
  END IF;
  e := api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'Test CI 16t', 'xlsx');
  IF (e->>'actor_count')::int < 1 OR jsonb_array_length(e->'rows') < 1 THEN
    RAISE EXCEPTION 'A3 FAIL: export membre vide, recu %', e;
  END IF;
END $$;
RESET ROLE;

-- B. AUTHENTIFIÉ SANS membership : lignes visibles ? Non (lien partners + pas extended) ;
--    export FORBIDDEN ; garde FALSE.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v jsonb; ok boolean := FALSE;
BEGIN
  IF COALESCE(api.can_read_actor_contacts('HOTRUN000000T16T'), FALSE) THEN
    RAISE EXCEPTION 'B1 FAIL: un authentifie sans membership ne passe pas la garde';
  END IF;
  BEGIN
    PERFORM api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'tentative', 'xlsx');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'B2 FAIL: export non-membre devait lever FORBIDDEN'; END IF;
END $$;
RESET ROLE;

-- C. ANON : aucune ligne acteur (lien partners) NI dans le leg NI dans render.actor_lines.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE r jsonb;
BEGIN
  r := api.get_object_resource('HOTRUN000000T16T', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb;
  IF jsonb_array_length(COALESCE(r->'actors', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'C1 FAIL: anon voit des lignes acteur';
  END IF;
  IF r->'render'->'actor_lines' IS NOT NULL
     AND jsonb_array_length(r->'render'->'actor_lines') <> 0 THEN
    RAISE EXCEPTION 'C2 FAIL: render.actor_lines fuit encore des noms a anon (classe §49)';
  END IF;
END $$;
RESET ROLE;

-- D. SERVICE_ROLE (le chemin des routes partenaires) : lignes + noms OK, mais
--    contacts=[] et contacts_restricted=true — LA non-régression du contrat.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v jsonb;
BEGIN
  SELECT (api.get_object_resource('HOTRUN000000T16T', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors'->0 INTO v;
  IF v IS NULL THEN RAISE EXCEPTION 'D1 FAIL: service_role doit voir la ligne acteur'; END IF;
  IF v->>'contacts_restricted' IS DISTINCT FROM 'true'
     OR jsonb_array_length(v->'contacts') <> 0
     OR v->>'first_name' IS NOT NULL THEN
    RAISE EXCEPTION 'D2 FAIL: service_role = ligne sans PII ni canaux (une cle de service n''est pas une personne), recu %', v;
  END IF;
END $$;
RESET ROLE;

-- E. Le journal : 1 ligne pour l'export A3, SANS AUCUNE valeur de coordonnée.
DO $$
DECLARE n int; leak int;
BEGIN
  SELECT count(*) INTO n FROM actor_contact_export_log
   WHERE 'HOTRUN000000T16T' = ANY(object_ids) AND reason = 'Test CI 16t';
  IF n <> 1 THEN RAISE EXCEPTION 'E1 FAIL: attendu 1 ligne de journal, trouve %', n; END IF;
  SELECT count(*) INTO leak FROM actor_contact_export_log
   WHERE report::text LIKE '%sentinelle-16t%' OR report::text LIKE '%SENTINELLE%'
      OR array_to_string(channel_kinds, ',') LIKE '%SENTINELLE%';
  IF leak <> 0 THEN RAISE EXCEPTION 'E2 FAIL: une VALEUR de coordonnee est entree au journal'; END IF;
END $$;

-- F. Gardes d'entrée du RPC (membre) : finalité vide OU trop courte refusée
--    SERVEUR (R1 — la modale seule n'est pas une protection), >500 refusé,
--    format hors liste refusé.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean;
BEGIN
  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], '  ', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'F1 FAIL: raison vide devait etre refusee'; END IF;
  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'abc', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'F1b FAIL: raison < 5 caracteres devait etre refusee SERVEUR'; END IF;
  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY(SELECT 'X' || g::text FROM generate_series(1, 501) g), 'test valide', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'F2 FAIL: 501 ids devait lever BATCH_TOO_LARGE'; END IF;
  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'test valide', 'pdf');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  IF NOT ok THEN RAISE EXCEPTION 'F3 FAIL: format hors liste blanche devait etre refuse'; END IF;
END $$;
RESET ROLE;

-- G (R1). Multi-lots : deux appels avec le MÊME p_export_run_id ⇒ 2 lignes de
--    journal partageant export_run_id ; sélection MIXTE ⇒ denied nommés, pas d'échec.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE run_id uuid := gen_random_uuid(); r1 jsonb; r2 jsonb; n int;
BEGIN
  r1 := api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'Test multi-lots G', 'xlsx', run_id, 1, 2);
  -- lot 2 : sélection MIXTE (une fiche autorisée + une inconnue/hors périmètre)
  r2 := api.export_actor_contacts(ARRAY['HOTRUN000000T16T', 'ZZZINCONNUE00000'], 'Test multi-lots G', 'xlsx', run_id, 2, 2);
  IF (r1->>'export_run_id') <> run_id::text OR (r2->>'export_run_id') <> run_id::text THEN
    RAISE EXCEPTION 'G1 FAIL: les deux lots doivent partager export_run_id';
  END IF;
  IF NOT (r2->'denied_object_ids' ? 'ZZZINCONNUE00000') THEN
    RAISE EXCEPTION 'G2 FAIL: la fiche hors perimetre doit etre NOMMEE dans denied_object_ids, recu %', r2->'denied_object_ids';
  END IF;
  IF NOT (r2->'authorized_object_ids' ? 'HOTRUN000000T16T') THEN
    RAISE EXCEPTION 'G3 FAIL: la fiche autorisee doit etre servie malgre le refus voisin (selection mixte)';
  END IF;
  SELECT count(*) INTO n FROM actor_contact_export_log WHERE export_run_id = run_id;
  IF n <> 2 THEN RAISE EXCEPTION 'G4 FAIL: attendu 2 lignes de journal pour ce run, trouve %', n; END IF;
  -- L'attribution multi-ORG dit QUELLE ORG a autorisé :
  SELECT count(*) INTO n FROM actor_contact_export_log
   WHERE export_run_id = run_id AND 'ORGRUN000000T16T' = ANY(org_object_ids);
  IF n <> 2 THEN RAISE EXCEPTION 'G5 FAIL: org_object_ids doit porter l ORG publisher qui a autorise'; END IF;
END $$;
RESET ROLE;

-- H (R1/R2). Fonctions deep : COMPLÉMENT de la preuve d'identité (qui vit dans
--    T13 Step 5, comparaison des définitions complètes HEAD↔arbre). Ici on fige
--    côté base que la garde 16t n'y est pas référencée — assertion plus faible
--    mais permanente en CI.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'api'
     AND p.proname IN ('get_object_with_deep_data', 'get_objects_with_deep_data')
     AND p.prosrc LIKE '%can_read_actor_contacts%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'H1 FAIL: une fonction deep reference la garde 16t — elles sont HORS PERIMETRE (R1)';
  END IF;
END $$;

-- I (R2). Préflight des capacités acteur : le serveur dit si la SÉLECTION donne
--    accès à l'identité / aux coordonnées — la modale n'offre que ça.
-- I1 : membre publisher ⇒ les deux capacités vraies sur sa fiche.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c jsonb;
BEGIN
  c := api.export_actor_capabilities(ARRAY['HOTRUN000000T16T']);
  IF c->>'actor_identity_available' IS DISTINCT FROM 'true'
     OR c->>'actor_contacts_available' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'I1 FAIL: membre publisher = identite ET coordonnees disponibles, recu %', c;
  END IF;
END $$;
RESET ROLE;
-- I2 : authentifié SANS membership, fiche à liens 'partners' seulement ⇒ les deux false.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c jsonb;
BEGIN
  c := api.export_actor_capabilities(ARRAY['HOTRUN000000T16T']);
  IF c->>'actor_identity_available' IS DISTINCT FROM 'false'
     OR c->>'actor_contacts_available' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'I2 FAIL: lecteur sans acces acteurs = aucune capacite offerte, recu %', c;
  END IF;
END $$;
RESET ROLE;
-- I3 : un lien PUBLIC ouvre l'identité (pas les coordonnées) au même lecteur.
UPDATE actor_object_role SET visibility = 'public'
 WHERE actor_id = '20000000-0000-4000-8000-000000000001' AND object_id = 'HOTRUN000000T16T';
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c jsonb;
BEGIN
  c := api.export_actor_capabilities(ARRAY['HOTRUN000000T16T']);
  IF c->>'actor_identity_available' IS DISTINCT FROM 'true'
     OR c->>'actor_contacts_available' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'I3 FAIL: lien public = identite oui, coordonnees non, recu %', c;
  END IF;
END $$;
RESET ROLE;
UPDATE actor_object_role SET visibility = 'partners'
 WHERE actor_id = '20000000-0000-4000-8000-000000000001' AND object_id = 'HOTRUN000000T16T';

-- J (R2.1). SABOTAGE PAR TABLE TEMPORAIRE : un `authenticated` qui crée une
--    relation temporaire homonyme ne doit RIEN obtenir. Sans `pg_temp` en
--    dernier dans le search_path, PostgreSQL cherche le schéma temporaire EN
--    PREMIER pour les relations — le faux app_user_profile ferait passer
--    l'utilisateur pour un superuser, et le faux user_org_membership lui
--    accorderait le périmètre CRM sur tout le corpus.
--    Ce test DOIT être vérifié rouge en retirant `pg_temp` du search_path.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c jsonb; ok boolean := FALSE;
BEGIN
  -- Faux profil : « je suis owner ».
  CREATE TEMP TABLE app_user_profile (id uuid, role text, display_name text) ON COMMIT DROP;
  INSERT INTO pg_temp.app_user_profile VALUES
    ('10000000-0000-4000-8000-000000000002', 'owner', 'Usurpateur');
  -- Faux membership : « je publie tout ».
  CREATE TEMP TABLE user_org_membership (id uuid, user_id uuid, org_object_id text, is_active boolean) ON COMMIT DROP;
  INSERT INTO pg_temp.user_org_membership VALUES
    (gen_random_uuid(), '10000000-0000-4000-8000-000000000002', 'ORGRUN000000T16T', TRUE);

  IF COALESCE(api.can_read_actor_contacts('HOTRUN000000T16T'), FALSE) THEN
    RAISE EXCEPTION 'J1 FAIL: une table TEMP a fait passer la garde — search_path non sur (pg_temp doit etre EN DERNIER + relations qualifiees)';
  END IF;

  c := api.export_actor_capabilities(ARRAY['HOTRUN000000T16T']);
  IF c->>'actor_contacts_available' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'J2 FAIL: une table TEMP a ouvert les capacites, recu %', c;
  END IF;

  BEGIN
    PERFORM api.export_actor_contacts(ARRAY['HOTRUN000000T16T'], 'Tentative usurpation', 'xlsx');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'J3 FAIL: l export a servi des coordonnees a un usurpateur par table TEMP';
  END IF;
END $$;
RESET ROLE;
DROP TABLE IF EXISTS pg_temp.app_user_profile;
DROP TABLE IF EXISTS pg_temp.user_org_membership;

SELECT 'test_actor_contacts_org_gate: OK' AS result;
ROLLBACK;
```

- [ ] **Step 2 : jouer le test sur une base (transaction annulée — sûr)**

Via le MCP Supabase (`execute_sql`, le fichier entier — il se termine par ROLLBACK) ou `psql "$DATABASE_URL" -f tests/test_actor_contacts_org_gate.sql`. Attendu : `test_actor_contacts_org_gate: OK`. Si une fixture casse sur une contrainte (colonne NOT NULL imprévue d'`auth.users`, code `operator` absent…), adapter la fixture — jamais l'assertion.

- [ ] **Step 3 : VÉRIFICATION ROUGE PAR SABOTAGE — DEUX sabotages obligatoires**

**Sabotage A — la garde du leg contacts :**
1. Dans `api_views_functions.sql`, remettre temporairement `'contacts', COALESCE((…` sans le `CASE` (annuler localement le Step 2 de la Tâche 13 sur ce seul champ) ;
2. rejouer le test → il DOIT tomber sur **D2** (service_role reçoit des canaux) ;
3. restaurer le patch (`git checkout -- "Base de donnée DLL et API/api_views_functions.sql"` puis ré-appliquer si besoin) ;
4. rejouer → OK.

**Sabotage B (R2.1) — le `search_path` sûr :**
1. Dans la migration, retirer `, pg_temp` du `SET search_path` de `api.can_read_actor_contacts` **et** remettre `app_user_profile` non qualifiée dans son corps ; ré-appliquer la seule fonction ;
2. rejouer le test → il DOIT tomber sur **J1** (la table temporaire fait passer la garde) ;
3. **si J1 passe malgré le sabotage, le test est VACANT** — vérifier que le rôle a bien le droit de créer des tables temporaires (`SELECT has_database_privilege('authenticated', current_database(), 'TEMP');` doit rendre `true`) et que la temp table est créée avant l'appel. Ne pas conclure « c'est sûr » sur un test qui ne peut pas échouer ;
4. restaurer, rejouer → OK.

Consigner « vérifié rouge par sabotage (D2 + J1) » dans le message de commit.

- [ ] **Step 4 : commit**

```bash
git add "Base de donnée DLL et API/tests/test_actor_contacts_org_gate.sql"
git commit -m "test(sql): garde 16t — personas jwt.claims, multi-lots run_id, selection mixte, deep intouchee

A membre publisher (contacts+PII+export+journal), B authentifie etranger
(FORBIDDEN), C anon (0 ligne, actor_lines vide), D service_role (ligne sans
PII ni canaux — non-regression du contrat partenaire), F finalite/format/plafond
valides SERVEUR, G export_run_id partage + denied nommes + attribution ORG,
H preuve que les fonctions deep ne referencent pas la garde (R1). Verifie
rouge par sabotage : retirer le CASE du leg contacts fait tomber D2."
```

---

### Tâche 15 : manifeste `ci_fresh_apply.sql` + runbook — insérer 16t ET redresser la dérive

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (entre le bloc `16s-test` et `I4f-final-test`)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (liste ordonnée ~l.229-245 + sections `##`)

Constat vérifié (spec §7) : le libellé `16q` est porté par DEUX puces du runbook (l.231 logos, l.235 tags) ; `migration_classification_scheme_logos.sql` est ABSENTE de `ci_fresh_apply.sql` ; `16r`/`16s` ont leurs sections `##` (l.380, l.420) mais manquent à la liste ordonnée. Insérer 16t sans corriger perpétue la dérive.

- [ ] **Step 1 : `ci_fresh_apply.sql` — ajouter 16u (logos) puis 16t**

Juste APRÈS le bloc `16p/16q-test` (`\ir tests/test_tags_purge_catalog.sql`) et AVANT le bloc `== 16r`, insérer :

```
\echo '== 16u    migration_classification_scheme_logos.sql  (§16q-renommé-16u : icon_url de 19 schemes vers le bucket assets/labels ; garde fail-closed si un code attendu manque ; etait applique live 2026-07-29 mais ABSENT du manifest — derive redressee par 16t/§208) =='
\ir migration_classification_scheme_logos.sql
```

Puis, APRÈS le bloc `16s-test` (`\ir tests/test_classification_labels_expansion.sql`) et AVANT `== I4f-final-test`, insérer :

```
\echo '== 16t    migration_actor_contacts_org_gate.sql  (§208 : garde api.can_read_actor_contacts — membre d une ORG publisher, JAMAIS auth.role() ; PII+canaux du leg actors sous CASE paresseux + contacts_restricted ; render.actor_lines/contact_lines gates (classe §49, fuyait des noms a anon sur 760 fiches) ; journal immuable actor_contact_export_log sans aucune valeur de coordonnee ; RPC export_actor_contacts authorize-once + journalise, plafond 500, authenticated seulement ; REVOKE PUBLIC d hygiene sur get_object_resources_batch ; NOTIFY pgrst) =='
\ir migration_actor_contacts_org_gate.sql

\echo '== 16t-test garde permanente §208 (4 personas par request.jwt.claims : membre/etranger/anon/service_role ; journal 1 ligne sans valeur de coordonnee ; verifie rouge par sabotage D2) =='
\ir tests/test_actor_contacts_org_gate.sql
```

⚠ Ordre requis : 16t APRÈS `api_views_functions.sql` (le patch T13 y vit) et APRÈS `migration_crm_module.sql` (8z, `current_user_crm_object_ids`) — les deux sont très en amont dans le manifest, c'est déjà le cas.

- [ ] **Step 2 : runbook — renumérotation + puces manquantes + section 16t**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md` :
1. l.231 : la puce logos passe de `16q.` à `16u.` — ajouter en tête de puce : « **(renuméroté 16q→16u par §208 : le libellé 16q était porté par deux migrations ; la mémoire/décision log §16q “logos” se lit désormais 16u)** » ;
2. après la puce `16q.` (tags, l.235), insérer deux puces d'une ligne :
   - `16r.` `migration_explorer_remplissage_filter.sql` — filtre Remplissage §204 (détail : section ## 16r plus bas).
   - `16s.` `migration_remove_auberge_collective_scheme.sql` — retrait auberge_collective_stars §206 (détail : section ## 16s plus bas).
3. après la puce PERM1 (l.243), insérer la puce `16t.` (résumé = le `\echo` du Step 1, en prose) ;
4. après la section `## 16s` (~l.420-426), ajouter :

```markdown
## 16t — `migration_actor_contacts_org_gate.sql` (§208, garde coordonnées d'acteur + journal d'export)

Après `api_views_functions.sql` (le leg actors patché y vit) et `migration_crm_module.sql`
(8z — `api.current_user_crm_object_ids`, le périmètre réutilisé). Voir la spec
`docs/superpowers/specs/2026-07-31-explorer-export-excel-design.md` §4.5 et le
décision log §208. `NOTIFY pgrst` requis (**3** fonctions api neuves :
`can_read_actor_contacts`, `export_actor_capabilities`, `export_actor_contacts`).
Durcit aussi le `search_path` (`pg_temp` en dernier) des 2 feuilles d'autorisation
`current_user_crm_object_ids` / `current_user_extended_object_ids` par `ALTER FUNCTION`
— corps intouchés ; les sources `rls_policies.sql` / `migration_crm_module.sql` sont
corrigées en parallèle pour qu'une base fraîche naisse durcie. Test :
`tests/test_actor_contacts_org_gate.sql` (4 personas par request.jwt.claims,
vérifié rouge par sabotage). Consommateur : export Excel de l'Exploreur
(colonnes acteur à finalité) ; rupture partenaire assumée : `actors[].contacts`
devient `[]` + `contacts_restricted: true` sur les routes publiques.
```

- [ ] **Step 3 : contrôle de cohérence du manifeste**

```bash
cd "Base de donnée DLL et API" && grep -o "== 16[a-z-]*" ci_fresh_apply.sql | sort | uniq -c
grep -c "^16[a-z]\." ../docs/SQL_ROLLOUT_RUNBOOK.md
```

Attendu : chaque étape 16x apparaît UNE fois dans ci_fresh_apply (16p, 16q, 16r, 16s, 16t, 16u + leurs -test) ; le runbook n'a plus deux puces `16q.`.

- [ ] **Step 4 : commit + CI**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "chore(sql): manifest — insere 16t + redresse la derive (16q duplique -> logos renumerote 16u, 16r/16s ajoutes a la liste ordonnee, logos enrole en fresh-apply)"
```

Après le push (par le PO), vérifier le workflow `sql-fresh-apply` sur GitHub (`gh run list --workflow sql-fresh-apply --limit 1` puis `gh run watch <id>`). Le gate joue 16t + son test sur base fraîche — c'est LA preuve d'intégrité de déploiement.

---

### Tâche 16 : front acteur — service `exportActorContacts` réel, `contacts_restricted` dans le tiroir, docs partenaires

**Files:**
- Modify: `bertel-tourism-ui/src/services/export/export-actor-contacts.ts` (remplace le squelette T8)
- Test: `bertel-tourism-ui/src/services/export/export-actor-contacts.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-drawer/utils.ts` (interface `ActorItem` l.28-36 + `parseActors`)
- Test: `bertel-tourism-ui/src/features/object-drawer/utils.test.ts` (étendre)
- Modify: `docs/openapi.json`, `docs/guide-partenaires.md`, `docs/Bertel_API_v3.postman_collection.json` (⚠ déjà modifiés dans l'arbre par le chantier Tourinsoft — édits ADDITIFS uniquement, ne rien écraser)

- [ ] **Step 1 : tests du service (échec attendu)**

Créer `export-actor-contacts.test.ts` :

```ts
import { exportActorContacts } from './export-actor-contacts';
import { callExportActorContactsRpc } from '../rpc';

jest.mock('../rpc', () => ({ callExportActorContactsRpc: jest.fn() }));
const mockRpc = callExportActorContactsRpc as jest.Mock;

describe('exportActorContacts (§208/R1)', () => {
  beforeEach(() => mockRpc.mockReset());

  it('découpe par 500, partage le MÊME export_run_id, fusionne lignes + logIds + autorisées/refusées', async () => {
    mockRpc.mockImplementation(async (ids: string[], _reason: string, meta: { exportRunId: string; batchIndex: number; batchCount: number }) => ({
      log_id: `journal-lot-${meta.batchIndex}`,
      export_run_id: meta.exportRunId,
      authorized_object_ids: ids.filter((id) => id !== 'refusee'),
      denied_object_ids: ids.filter((id) => id === 'refusee'),
      rows: ids.slice(0, 1).map((id) => ({
        object_id: id, display_name: 'Jean', role_name: 'Exploitant', is_primary: true, note: '',
        contacts: [{ kind_code: 'mobile', kind_name: 'Mobile', value: '0692', is_primary: true }],
      })),
    }));
    const ids = [...Array.from({ length: 500 }, (_, i) => `id-${i}`), 'refusee'];
    const result = await exportActorContacts(ids, 'Campagne 2026', {});
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][0]).toHaveLength(500);
    // R1 : le run id est GÉNÉRÉ CLIENT et identique sur les deux lots (1/2 puis 2/2)
    const meta1 = mockRpc.mock.calls[0][2];
    const meta2 = mockRpc.mock.calls[1][2];
    expect(meta1.exportRunId).toBe(meta2.exportRunId);
    expect([meta1.batchIndex, meta1.batchCount]).toEqual([1, 2]);
    expect([meta2.batchIndex, meta2.batchCount]).toEqual([2, 2]);
    expect(result.exportRunId).toBe(meta1.exportRunId);
    expect(result.logIds).toEqual(['journal-lot-1', 'journal-lot-2']);
    expect(result.authorizedObjectIds).toHaveLength(500);
    expect(result.deniedObjectIds).toEqual(['refusee']);
    expect(result.rows.get('id-0')?.[0].contacts[0].kindCode).toBe('mobile');
  });

  it("R1 — échec du second lot ⇒ l'appel REJETTE (aucun fichier ne sera produit)", async () => {
    mockRpc
      .mockResolvedValueOnce({ log_id: 'j1', export_run_id: 'run', authorized_object_ids: [], denied_object_ids: [], rows: [] })
      .mockRejectedValueOnce(new Error('timeout'));
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    await expect(exportActorContacts(ids, 'Campagne 2026', {})).rejects.toThrow('timeout');
  });

  it('refuse une finalité vide ou trop courte AVANT tout appel réseau (le serveur revalide)', async () => {
    await expect(exportActorContacts(['a'], '   ', {})).rejects.toThrow(/finalité/i);
    await expect(exportActorContacts(['a'], 'abc', {})).rejects.toThrow(/finalité/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : échec** — `npm run test:run -- src/services/export/export-actor-contacts.test.ts`. FAIL.

- [ ] **Step 3 : implémenter**

Dans `src/services/rpc.ts`, ajouter (même zone que `getObjectResourcesBatch`) :

```ts
/** Appel brut du RPC journalisé 16t — une invocation = UNE ligne de journal (un LOT). Le découpage par 500 et le partage du run id vivent dans export-actor-contacts.ts. */
export async function callExportActorContactsRpc(
  objectIds: string[],
  reason: string,
  meta: { exportRunId: string; batchIndex: number; batchCount: number },
  options: { signal?: AbortSignal } = {},
): Promise<{ log_id: string; export_run_id: string; authorized_object_ids: string[]; denied_object_ids: string[]; rows: unknown[] }> {
  const client = requireRpcClient();
  if (!client) {
    throw new Error("Export des coordonnées d'acteur indisponible en mode démo.");
  }
  let query = client.schema('api').rpc('export_actor_contacts', {
    p_object_ids: objectIds,
    p_reason: reason,
    p_format: 'xlsx',
    p_export_run_id: meta.exportRunId,
    p_batch_index: meta.batchIndex,
    p_batch_count: meta.batchCount,
  });
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    log_id: typeof payload.log_id === 'string' ? payload.log_id : '',
    export_run_id: typeof payload.export_run_id === 'string' ? payload.export_run_id : meta.exportRunId,
    authorized_object_ids: strings(payload.authorized_object_ids),
    denied_object_ids: strings(payload.denied_object_ids),
    rows: Array.isArray(payload.rows) ? payload.rows : [],
  };
}
```

Remplacer le corps du squelette `export-actor-contacts.ts` :

```ts
import { callExportActorContactsRpc } from '../rpc';
import type { ActorContactChannel, ActorContactsRow } from './export-columns';

/** Plafond PAR APPEL du RPC 16t — au-delà on découpe : N lignes de journal, pas une. Aucun plafond fonctionnel (R1). */
export const ACTOR_EXPORT_BATCH = 500;

/** R1 — résultat agrégé des lots (contrat identique au squelette T8, conservé). */
export interface ActorContactsExportResult {
  rows: Map<string, ActorContactsRow[]>;
  exportRunId: string;
  logIds: string[];
  authorizedObjectIds: string[];
  deniedObjectIds: string[];
}

function toChannel(raw: Record<string, unknown>): ActorContactChannel {
  return {
    kindCode: String(raw.kind_code ?? ''),
    kindName: String(raw.kind_name ?? ''),
    value: String(raw.value ?? ''),
    isPrimary: raw.is_primary === true,
  };
}

function toRow(raw: Record<string, unknown>): ActorContactsRow {
  return {
    objectId: String(raw.object_id ?? ''),
    displayName: String(raw.display_name ?? ''),
    roleName: String(raw.role_name ?? ''),
    isPrimary: raw.is_primary === true,
    note: String(raw.note ?? ''),
    contacts: Array.isArray(raw.contacts) ? (raw.contacts as Record<string, unknown>[]).map(toChannel) : [],
  };
}

/**
 * §208/R1 — SEULE voie de lecture des coordonnées d'acteur pour l'export : l'appel
 * journalisé api.export_actor_contacts (16t). Les colonnes requiresPurpose du
 * registre ne lisent QUE le résultat de cette fonction — jamais la fiche batch
 * (le journal serait contournable). Tous les lots partagent un export_run_id
 * GÉNÉRÉ CLIENT ; chaque lot a sa ligne de journal (logId). Fusion par object_id.
 * Un lot en échec ⇒ throw : l'orchestrateur ne produit AUCUN fichier (les journaux
 * des lots déjà réussis restent — la donnée a atteint le navigateur).
 */
export async function exportActorContacts(
  ids: string[],
  purpose: string,
  opts: { batchSize?: number; signal?: AbortSignal } = {},
): Promise<ActorContactsExportResult> {
  const cleanPurpose = purpose.trim();
  if (cleanPurpose.length < 5) {
    throw new Error("La finalité de l'export est obligatoire (5 caractères minimum — elle est inscrite au journal).");
  }
  const size = opts.batchSize ?? ACTOR_EXPORT_BATCH;
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const exportRunId = crypto.randomUUID();
  const batchCount = Math.max(1, Math.ceil(clean.length / size));

  const rows = new Map<string, ActorContactsRow[]>();
  const logIds: string[] = [];
  const authorized = new Set<string>();
  const denied = new Set<string>();

  for (let i = 0; i < clean.length; i += size) {
    if (opts.signal?.aborted) throw new Error('Export annulé.');
    const chunk = clean.slice(i, i + size);
    const result = await callExportActorContactsRpc(chunk, cleanPurpose, {
      exportRunId,
      batchIndex: Math.floor(i / size) + 1,
      batchCount,
    }, { signal: opts.signal });
    if (result.log_id) logIds.push(result.log_id);
    result.authorized_object_ids.forEach((id) => authorized.add(id));
    result.denied_object_ids.forEach((id) => denied.add(id));
    for (const rawRow of result.rows) {
      const row = toRow(rawRow as Record<string, unknown>);
      if (!row.objectId) continue;
      rows.set(row.objectId, [...(rows.get(row.objectId) ?? []), row]);
    }
  }
  return {
    rows,
    exportRunId,
    logIds,
    authorizedObjectIds: [...authorized],
    deniedObjectIds: [...denied],
  };
}
```

Vert : `npm run test:run -- src/services/export/export-actor-contacts.test.ts src/services/export/export-workbook.test.ts` (le mock du workbook reste valable — même signature).

- [ ] **Step 4 : `contacts_restricted` dans le tiroir (jamais un vide silencieux)**

Dans `src/features/object-drawer/utils.ts` :
1. interface `ActorItem` (l.28-36) — ajouter `contactsRestricted: boolean;` ;
2. dans `parseActors` (localiser `export function parseActors`), à l'endroit où chaque acteur est construit, lire la clé : `contactsRestricted: record.contacts_restricted === true,` ;
3. test à ajouter dans `utils.test.ts` :

```ts
it('§208 — contacts_restricted est distinct de « pas de contact saisi »', () => {
  const [restricted] = parseActors({ actors: [{ id: 'a1', display_name: 'X', contacts: [], contacts_restricted: true }] });
  const [empty] = parseActors({ actors: [{ id: 'a2', display_name: 'Y', contacts: [] }] });
  expect(restricted.contactsRestricted).toBe(true);
  expect(empty.contactsRestricted).toBe(false);
});
```

4. dans le rendu du tiroir qui liste les contacts d'acteur (chercher le consommateur de `actor.contacts` dans `ObjectDetailView.tsx`), afficher, quand `contactsRestricted && contacts.length === 0` : `Coordonnées réservées à l'organisation éditrice.` (texte simple, pas un état d'erreur). Le parser du workspace (`object-workspace-parser.ts:3438`, compteur de complétude) n'est PAS modifié — impact nul à une seule ORG ; consigné comme différé au §208.

- [ ] **Step 5 : docs partenaires (édits additifs — fichiers déjà modifiés par Tourinsoft)**

1. `docs/openapi.json` : dans le schéma de l'item acteur (chercher `"actors"`), ajouter la propriété `contacts_restricted` : `{ "type": "boolean", "description": "TRUE lorsque les coordonnées de l'acteur sont réservées aux membres de l'organisation éditrice (§208) ; contacts est alors []." }` ;
2. `docs/guide-partenaires.md` : à la ligne du champ `actors` (l.198), compléter : « Depuis §208, `contacts` est vide (`[]`) et `contacts_restricted` vaut `true` pour les appels partenaires : les coordonnées personnelles des acteurs ne sortent plus par l'API publique. Les contacts de l'ÉTABLISSEMENT (`contacts`) sont inchangés. » ;
3. `docs/Bertel_API_v3.postman_collection.json` : mettre à jour l'exemple de réponse portant `"actors"` pour montrer `"contacts": [], "contacts_restricted": true`.
4. Vérifier qu'aucune modification Tourinsoft voisine n'est perdue : `git diff docs/ | grep -c "^-"` doit ne montrer QUE des retraits voulus par CETTE tâche (aucun sur les blocs tourinsoft).

- [ ] **Step 6 : suite complète + commit**

```bash
cd bertel-tourism-ui && npm run test:run && npm run typecheck
git add src/services/rpc.ts src/services/export/export-actor-contacts.ts src/services/export/export-actor-contacts.test.ts src/features/object-drawer/utils.ts src/features/object-drawer/utils.test.ts src/features/object-drawer/ObjectDetailView.tsx ../docs/openapi.json ../docs/guide-partenaires.md ../docs/Bertel_API_v3.postman_collection.json
git commit -m "feat(export): service exportActorContacts (decoupage 500, journal par lot) + contacts_restricted dans le tiroir + contrat partenaire documente"
```

---

### Tâche 17 : application LIVE (base de production) — nécessite l'accord du PO

⚠ **Ne pas exécuter sans le feu vert explicite du PO.** Le patch T13 change le contrat partenaire (`actors[].contacts` → `[]`). Ordre impératif : SQL live D'ABORD, déploiement front ENSUITE (le front sans 16t affiche l'erreur explicite du squelette pour les colonnes acteur ; l'inverse — 16t sans front — est inoffensif).

- [ ] **Step 1 : appliquer la migration 16t**

Via MCP Supabase : `apply_migration` avec `name: "actor_contacts_org_gate_16t"` et le contenu INTÉGRAL de `migration_actor_contacts_org_gate.sql` (sans le `NOTIFY` final si l'outil le refuse — le rejouer via `execute_sql`).

- [ ] **Step 2 : redéployer les fonctions patchées**

Le patch T13 vit dans `api_views_functions.sql`, trop gros pour un apply complet.
Recette maison (mémoire §106) : `.tmp_pgapply/apply_range.cjs` applique une PLAGE de
lignes via Node pg. **UNE SEULE fonction est redéployée : `get_object_resource`** —
les fonctions deep sont hors périmètre (R1/R2), les redéployer serait précisément
la modification interdite. Localiser les bornes AU MOMENT de l'apply (elles ont bougé) :

```bash
cd "Base de donnée DLL et API" && grep -n "CREATE OR REPLACE FUNCTION api.get_object_resource(" api_views_functions.sql
grep -n "^\$\$;" api_views_functions.sql | head -80   # repérer la fin de la fonction
node ../.tmp_pgapply/apply_range.cjs api_views_functions.sql <debut_resource> <fin_resource>
```

Puis `NOTIFY pgrst, 'reload schema';` via `execute_sql`. Contre-preuve immédiate en
live (R2) : `SELECT proname, md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='api' AND proname LIKE '%deep_data%';`
avant ET après l'apply — les deux hash doivent être IDENTIQUES.

- [ ] **Step 3 : vérifications live (lecture seule)**

```sql
-- 1. La fuite est fermée (anon, fiche publiée avec acteurs) :
SET ROLE anon;
SELECT (api.get_object_resource('<un id des 760>', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb)->'render'->'actor_lines';
RESET ROLE;  -- attendu : [] ou NULL
-- 2. service_role : contacts [] + contacts_restricted true (contrat partenaire) ;
-- 3. le test CI complet : rejouer tests/test_actor_contacts_org_gate.sql (il ROLLBACK) ;
-- 4. advisors : get_advisors — le WARN security_definer sur export_actor_contacts est ATTENDU (§36).
```

- [ ] **Step 4 : valider le plafond 500 SOUS le timeout (R1 — hypothèse à mesurer, pas à croire)**

En persona `authenticated` réelle (pas superuser sans timeout), chronométrer un lot
plein : `SELECT api.export_actor_contacts(ARRAY(SELECT id FROM object WHERE status='published' LIMIT 500), 'Mesure plafond 16t', 'xlsx');`
dans une transaction **annulée** (BEGIN … ROLLBACK — le journal du test part avec).
Attendu : < 4 s (marge ×2 sous le `statement_timeout` de 8 s). Si > 4 s : descendre
`ACTOR_EXPORT_BATCH` (front) à 250 et consigner la mesure au §208. Ne PAS figer 500
dans la doc partenaire avant cette mesure.

- [ ] **Step 5 : benchmark des cibles d'acceptation (R1)**

Depuis l'app en conditions réelles (La Réunion, machine bureautique) : mesurer et
consigner au §208 — 50 fiches (cible 2-5 s), 200 fiches (5-10 s), corpus entier en
colonnes usuelles (15-25 s), corpus entier toutes colonnes + acteurs (< 30 s). Si les
cibles sont ratées avec projection + concurrence 2 + aplatissement immédiat en place :
consigner les chiffres RÉELS et annoncer honnêtement la durée dans l'UI (le message de
progression suffit) — ne pas sur-optimiser sans mesure.

- [ ] **Step 6 : smoke test app**

Sur l'app (compte membre OTI) : sélectionner 3 fiches → Excel → cocher « Acteur — mobile » → finalité → télécharger. Vérifier : le fichier porte les mobiles ; `SELECT reason, export_run_id, batch_index, batch_count, object_count, actor_count FROM actor_contact_export_log ORDER BY performed_at DESC LIMIT 2;` montre la/les lignes du run. Côté partenaire : `curl` de la route publique d'une fiche à acteurs → `"contacts": []` + `"contacts_restricted": true`.

---

### Tâche 18 : documentation de clôture

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée `## §208`)
- Modify: `.claude/WORKFLOW.md` (tableau des différés)
- Modify: `CLAUDE.md` (proposition d'invariant — à faire valider par le PO)

- [ ] **Step 1 : décision log §208**

Rédiger `## §208` avec, a minima : le remplacement CSV→Excel (raw_json + city/address vides = bugs constatés) ; le registre unique et ses 4 écrivains d'origine ; les arbitrages PO (sélection seule, cellules lisibles, préréglages poste, acteur réservé ORG + journalisé, notes jamais, SIRET public, colonnes vides proposées §150) ; les mesures prod (846 objets, 0 lien acteur public, 0 adresse, coûts batch) ; la garde 16t et la fuite `render.actor_lines` fermée ; la renumérotation 16q-logos→16u ; **les corrections R1 de revue** : capacités `actor_identity`/`actor_contacts` (l'export ne donne jamais plus que la consultation), fusion multi-lots par `object_id` + `export_run_id`, journal multi-ORG (`org_object_ids`/`org_attributions`), cellules typées (lat/lon Number), `actor_primary` multi-valué, projection `fields` + concurrence 2 + aplatissement immédiat, cibles de temps mesurées ; les DIFFÉRÉS avec raison : **divergence deep↔resource sur les acteurs (R1 — deep intouchée : INVOKER, RLS vide les canaux pour authenticated, 0 appelant service-role ; à reprendre si un appelant service-role du deep apparaît)**, `open_now`/`remplissage` (source ObjectCard), onglets normalisés, `is_public` sur `actor_channel` (le vrai correctif de modèle), workspace-parser `contacts_restricted` (compteur §17, impact nul à une ORG), unification `ColumnDef<TSource>` avec la vue Table, montage SelectionBar mobile.

- [ ] **Step 2 : WORKFLOW.md**

Ajouter au tableau des différés : « `actor_channel.is_public` (le correctif de modèle §208 — aligne acteur sur contact_channel et rend l'AIPD honnête) | 16t couvre le besoin immédiat | passe modèle + saisie OTI » ; « Colonnes export `open_now`/`remplissage` | source ObjectCard non portée par la fiche | jonction carte Explorer ou émission par le RPC fiche » ; **« `search_path` sans `pg_temp` sur ~105 fonctions `SECURITY DEFINER` (R2.1 — `pg_temp` n'apparaît que 2 fois dans tout le dépôt ; une table temporaire homonyme peut masquer une relation non qualifiée dans une fonction privilégiée) | dette antérieure et générale ; §208 a durci la chaîne qu'il utilise (3 neuves + 2 feuilles) | passe dédiée : balayage catalogue `pg_proc.proconfig` + qualification des relations sensibles + test de non-régression par policy »** ; **« divergence deep↔resource sur les acteurs (le latéral de `get_objects_with_deep_data` émet la PII sans gate) | R1 : hors périmètre, INVOKER + RLS vide les canaux pour `authenticated` + 0 appelant service-role | dès qu'un appelant service-role du deep apparaît »**.

- [ ] **Step 3 : proposition CLAUDE.md (validation PO)**

Proposer **trois** invariants :
1. « **Une garde d'accès aux données personnelles ne s'appuie jamais sur `auth.role()`** — la clé de service n'est pas une personne ; les routes partenaires appellent en service-role et un bras `service_role` dirait TRUE au seul chemin qui fuit. Sonder l'identité (`auth.uid()` + membership), court-circuiter par `CASE` quand `auth.uid()` est NULL. »
2. « **Toute fonction `SECURITY DEFINER` porte `pg_temp` EN DERNIER dans son `search_path` et schéma-qualifie ses relations sensibles.** Sans `pg_temp` explicite, PostgreSQL cherche le schéma temporaire *en premier* pour les relations : un `CREATE TEMP TABLE app_user_profile` par n'importe quel `authenticated` masque la table qui décide de l'autorisation. Forme : `SET search_path = pg_catalog, public, api, auth, pg_temp`. Dette antérieure : ~105 fonctions du dépôt ne l'ont pas (§208 a durci sa propre chaîne). »
3. Une ligne dans la section export : « Tout export tabulaire passe par le registre `export-columns.ts` et par `csvCell`/`xlsxCell` — jamais un écrivain ad hoc. **Une offre de colonnes dérivée d'une session est un filtre grossier, jamais une garde : quand le droit est par fiche (acteurs), c'est un préflight serveur qui décide, et il doit pouvoir OUVRIR autant que fermer.** »

- [ ] **Step 4 : commit final**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md CLAUDE.md
git commit -m "docs(§208): decision log export Excel + garde 16t, differes traces, invariant propose"
```

---

## Auto-revue du plan (faite à l'écriture, mise à jour R1)

- **Couverture spec :** §0 R1 → intégré en place (voir « Révision R1 » en tête) ; §1-2 → T1-T11 ; §3.2 (REVOKE hygiène) → T12 Step 4 ; §3.4 fuite → T13/T14/T17 ; §4.5 → T12-T14/T16 ; §4.6 modale → T10 ; §6 vérifications → T1 (témoin Excel), T14 (personas+sabotage+multi-lots+deep intouchée), tests relisant les cellules (T8) ; §7 manifeste/dérive → T15 ; §8 risques → T1 (risque 1), T13 Step 6 (« autres émetteurs »), T16 Step 5 (collision docs), T17 Steps 4-5 (plafond 500 + cibles de temps).
- **Couverture R1 point par point :** capacités → T4/T7/T10 ; deep intouchée + preuve → T13 Step 5 + T14 H ; multi-lots/`export_run_id`/fusion par id → T3/T8/T12/T16 + T14 G ; contrat sécurité RPC (REVOKE service_role, finalité serveur 5-500, dédoublonnage serveur, format liste blanche) → T12 + T14 F ; journal multi-ORG → T12 + T14 G5 ; cellules typées + lat/lon Number → T4/T5/T8 ; `actor_primary` multi → T7 ; matrice avant code → T4 Step 0 (STOP PO) ; projection `fields` → T4/T7 Step 3bis/T8 ; concurrence 2 → T3 ; aplatissement immédiat → T8 ; échec d'un lot ⇒ aucun fichier → T8/T16 ; annulation entre lots → T3/T16 ; cibles de temps → T17 Step 5.
- **Couverture R2 :** contradiction T13 levée (liste des fichiers purgée du deep) ; vestige T17 Step 2 corrigé (le redéploiement live du deep était la modification interdite elle-même) ; preuve d'identité des fonctions deep par diff des définitions complètes HEAD↔arbre avec garde de non-vacuité (`wc -l`), `prosrc` en complément ; préflight `export_actor_capabilities` (SQL T12 §1bis + personas I1-I3 en T14 + service fail-closed T10 Step 4a + 3 cas RTL T10).
- **Couverture R2.1 :** capacités acteur retirées de `clearanceLevels` et décidées par le seul préflight, `availableColumns(session, caps)`/`presetColumnIds(…, caps)`/`applyPreset(…, caps)` threadés avec défaut fermé (T4/T7/T9/T10) + 2 tests unitaires (ouverture sans ORG, fermeture avec ORG) + 1 cas RTL persona I3 ; `search_path` durci sur les 3 fonctions neuves (créées) et les 2 feuilles (par `ALTER FUNCTION`, corps intouchés) + sources corrigées (T12 Step 1bis) + relations qualifiées + sabotage temp-table (T14 J, vérifié rouge en T14 Step 3 sabotage B) ; T12 Produces liste les 5 surfaces ; runbook « 3 fonctions api neuves ».
- **Écarts assumés vs revue (consignés §208, T18) :** `cellType` implémenté en champ optionnel (défaut `text`) plutôt qu'obligatoire — équivalent, moins de bruit ; la sélection mixte tolérée par le RPC sauf tout-refusé (`FORBIDDEN`), conformément à « les lignes autorisées sont remplies » ; le préflight rend des booléens AGRÉGÉS sur la sélection (∃ une fiche accessible ⇒ colonne offerte, les fiches refusées restent vides — cohérent avec la sélection mixte).
- **Cohérence de types vérifiée :** `ActorContactsRow`/`ActorContactChannel`/`ExportCellValue`/`ActorCapabilities`/`CLOSED_ACTOR_CAPS` définis en T4/T7, consommés T7/T8/T9/T10/T16 ; `ActorContactsExportResult` identique T8 (squelette) / T16 (réel) ; `runSelectionXlsxExport` signature identique T8/T10 ; `callExportActorContactsRpc(ids, reason, meta, options)` identique T16 service/test ; `availableColumns(session, caps?)` et `presetColumnIds(presetId, session, caps?)` identiques T7/T9/T10 (caps optionnel, défaut fermé) ; `applyPreset(presetId, session, caps?)` identique T9/T10 ; `getExportActorCapabilities` rend `{actorIdentityAvailable, actorContactsAvailable}` = `ActorCapabilities` (T10) ; `requiredFieldsFor` défini T4, testé T7 Step 3bis, consommé T8.
- **Ordre d'exécution :** T1→T11 livrables sans SQL (les colonnes acteur échouent explicitement — squelette T8) ; T12→T15 = le SQL ; T16 branche le réel ; T17 séquence live (SQL avant front) + mesures ; T18 clôture. Un déploiement front AVANT 16t est sûr (erreur explicite, pas de fuite nouvelle). **Deux STOP PO :** T4 Step 0 (matrice) et T17 (live).

