# Plan — La recherche du header pilote l'annuaire CRM (acteurs)

**Date** : 2026-07-27 · **Demande PO** : sur `/crm`, le champ de recherche principal du header
(`body > div.app-shell > div > header > label > input`) doit servir de recherche **acteurs**
(sinon il est inutile sur cette page). Périmètre de recherche demandé :
**nom de l'établissement rattaché · nom · prénom · téléphone · e-mail**.

---

## 1. État constaté (vérifié dans le code + la base live)

| Constat | Emplacement |
|---|---|
| Le champ du header écrit dans `useExplorerStore.common.search` — **inerte hors Explorer/Dashboard** (rien ne le lit sur `/crm`) | `src/components/layout/TopBar.tsx:32-33,103-111` |
| L'annuaire CRM a **son propre** champ « Filtrer par nom, établissement, rôle… », état local, filtrage client | `src/features/crm/CrmAnnuaire.tsx:38,86-89,139-146` + `matchesSearch` l.29-34 |
| Ce filtre client ne couvre que `displayName` + `objectName` + `roleName` — **ni prénom, ni téléphone, ni e-mail** (absents du payload de l'annuaire) | `CrmDirectoryEntry`, `src/services/crm.ts:211-231` |
| Les filtres utiles (sujet / statut / période) sont déjà **serveur** et recalculent tous les agrégats + KPI | `api.list_crm_directory`, `Base de donnée DLL et API/migration_crm_module.sql:1011-1160` |
| `actor` porte `first_name` / `last_name` + colonnes générées normalisées (`*_normalized` = `immutable_unaccent(lower(...))`) | `schema_unified.sql` (table `actor`) |
| Téléphones / e-mails vivent dans `actor_channel(kind_id → ref_code_contact_kind)` | `schema_unified.sql:2063-2077` |
| Volumétrie live : **696 acteurs · 1 353 canaux** (672 tél. `phone`/`mobile`, 681 `email`) · 778 liens acteur↔objet · 687 acteurs avec prénom | requête live 2026-07-27 |
| Formats de téléphone **hétérogènes** en base : `0692123456` **et** `06 92 12 34 56` ⇒ un `ILIKE` brut raterait la moitié des saisies | requête live 2026-07-27 |
| Précédent de recherche acteur à réutiliser (garde ≥2 car., échappement `LIKE`, colonnes normalisées, DEFINER) | `api.search_actors`, `migration_actor_links_editor.sql:199-240` |
| **`pg_trgm` déjà installé** + index **GIN trgm déjà en place** sur les 3 colonnes d'identité acteur ET sur `object.name_normalized` ⇒ le fuzzy ne coûte aucune infra nouvelle | `schema_unified.sql:17`, `:4135-4137`, `:3986` |
| `object.name_normalized` est une **colonne générée** — la recalculer via `immutable_unaccent(lower(o.name))` défait l'index | `schema_unified.sql:3986-3987` |

**Conséquence** : la recherche par téléphone/e-mail **ne peut pas** être purement frontend — les
valeurs ne sont pas dans le payload. Deux options écartées :

- *Émettre les canaux dans l'annuaire pour filtrer côté client* → expédie 1 353 valeurs PII
  (tél. + e-mails) en masse sur une vue liste, pour un gain nul. **Non.**
- *Ne garder que nom + établissement (faisable sans backend)* → ne répond pas à la demande. **Non.**

⇒ **Recherche serveur** via un nouveau paramètre `p_search` sur `api.list_crm_directory`, dans la
même veine que les filtres sujet/statut/période déjà en place. La valeur PII sert de **prédicat**,
elle n'est **jamais émise**.

---

## 2. Décisions de conception (à confirmer si désaccord)

1. **Une seule surface de recherche sur `/crm`** : le champ du header. Le champ local de
   l'annuaire est **supprimé** (deux boîtes pour la même chose = propriété dupliquée, cf.
   CLAUDE.md « single-ownership » §48). L'espace libéré reste à la barre de filtres.
2. **État CRM indépendant de l'Explorer** : nouveau petit store `crm-search-store` (zustand,
   **non persisté**). Écrire dans `useExplorerStore.search` depuis `/crm` polluerait la recherche
   Explorer, qui est justement conservée au retour (commit `8e4a9b8`) — régression interdite.
3. **Portée = onglet Acteurs.** Si l'utilisateur tape alors qu'il est sur *Tâches*, *Timeline* ou
   dans un drill-in (fiche acteur / vue établissement), on **revient à l'onglet Acteurs** avec la
   recherche appliquée (transition déclenchée uniquement au passage vide → non-vide, pour ne pas
   séquestrer la navigation).
4. **Placeholder contextuel** : sur `/crm` → « Rechercher un acteur : nom, prénom, établissement,
   téléphone, e-mail… ». Ailleurs : inchangé.
5. **Seuil + debounce** : ≥ 2 caractères pour la sous-chaîne exacte (identique à `search_actors`),
   ≥ 3 pour le fuzzy, debounce 250 ms. < 2 caractères ⇒ **aucun `p_search` envoyé** (pas de
   requête avec `p_search: 'a'`).
6. **Mode démo** (client Supabase absent) : le champ local filtre **aujourd'hui** les fixtures
   (`rows` filtre `entries`, quelle que soit la source). Le supprimer sans compensation rendrait
   la recherche **totalement inerte** en démo — régression réelle. `listCrmDirectory` filtre donc
   les mocks sur nom + prénom + établissement (sous-chaîne, sans fuzzy) ; téléphone/e-mail
   restent non simulés (absents des fixtures). La fonction de match est **déplacée**
   (pas supprimée) de `CrmAnnuaire` vers `services/crm.ts`.
7. **Recherche floue (trigrammes) sur les identités et les établissements uniquement.**
   Téléphone et e-mail restent structurés (chiffres normalisés / sous-chaîne) : un fuzzy sur un
   numéro retourne surtout **la mauvaise personne**. Tolérance e-mail éventuelle plus tard,
   seulement si la saisie contient `@` et avec un seuil élevé.

---

## 3. Lot A — Backend : `p_search` sur `api.list_crm_directory`

**Fichier** : nouvelle migration `Base de donnée DLL et API/migration_crm_directory_search.sql`
(la définition courante vit dans `migration_crm_module.sql`, manifest 8z — on ne la ré-applique pas
en entier ; le manifest fait autorité par ordre d'application, cf. CLAUDE.md « Deploy integrity »).

### Contrat

```
-- Idempotence : DROP de l'arité 4 (celle en production) ET de l'arité 5 (ré-application),
-- puis CREATE OR REPLACE. Sans le DROP de l'arité 4, les deux surcharges coexistent et
-- PostgREST devient ambigu (leçon list_crm_timeline, en-tête migration_crm_module.sql) ;
-- sans le DROP/OR REPLACE de l'arité 5, la migration casse au deuxième passage.
DROP FUNCTION IF EXISTS api.list_crm_directory(text, text, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION api.list_crm_directory(
  p_topic_code text DEFAULT NULL,
  p_status     text DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_search     text DEFAULT NULL          -- ← nouveau
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
SET pg_trgm.word_similarity_threshold = 0.45   -- ← voir « seuil déterministe » ci-dessous
```

`REVOKE`/`GRANT` à rejouer sur la **nouvelle** signature (`…, text)` → `authenticated, service_role`),
`REVOKE ALL … FROM PUBLIC, anon` inclus.

### Seuil déterministe (point non couvert par la revue)

L'opérateur `<%` compare à la GUC `pg_trgm.word_similarity_threshold` (défaut 0.6). S'appuyer sur
le défaut rendrait le résultat dépendant d'un réglage d'instance/session — et les assertions CI
non déterministes. Le seuil est donc **figé au niveau de la fonction** via une clause `SET`
(même mécanisme que `SET search_path`) : `<%` reste index-supporté (GIN `gin_trgm_ops` couvre
`LIKE`, `%`, `<%`) **et** le comportement est reproductible. 0.45 est plus permissif que le défaut
— calibrer sur les cas de test réels (`Hoareu`→`Hoarau`) avant de figer.

### Prédicat (dans le CTE `base` — il élague **avant** les LATERAL d'agrégats)

- Garde : `v_q := btrim(p_search)` de longueur < 2 ⇒ traité comme `NULL` (pas de filtre, pas d'erreur).
- `v_text := immutable_unaccent(lower(v_q))` (l'argument gauche du fuzzy, non échappé).
- `v_pattern := '%' || <échappement \ % _ sur v_text> || '%'` — **échappement `LIKE` repris de
  `api.search_actors`** (un `%_` saisi ne doit pas énumérer la table).
- `v_digits := regexp_replace(v_q, '\D', '', 'g')` — branche téléphone activée seulement si
  `length(v_digits) >= 4` (un « 06 » isolé ne doit pas tout matcher).
- `v_fuzzy := (length(v_text) >= 3)` — à 2 caractères, **sous-chaîne exacte uniquement** (les
  trigrammes n'ont pas de sens en dessous).

L'acteur est retenu si **au moins une** des conditions est vraie :

1. **Identité** — `col LIKE v_pattern ESCAPE '\'` **OU** `(v_fuzzy AND v_text <% col)`
   sur `a.display_name_normalized`, `a.first_name_normalized`, `a.last_name_normalized`
   (les trois colonnes générées, **toutes** indexées GIN trgm).
2. **Établissement rattaché** — `EXISTS` un `actor_object_role` **dans le périmètre `v_scope`**
   dont `o.name_normalized LIKE v_pattern ESCAPE '\'` **OU** `(v_fuzzy AND v_text <% o.name_normalized)`.
   ⚠️ Utiliser la colonne générée `object.name_normalized` (index `idx_object_name_normalized_trgm`
   + btree), **jamais** `immutable_unaccent(lower(o.name))` qui recalcule et défait l'index.
3. **Canaux (structuré, sans fuzzy)** — `EXISTS` un `actor_channel` avec :
   - `kind = email` et `lower(value) LIKE v_pattern ESCAPE '\'`, **ou**
   - `kind ∈ {phone, mobile, sms, whatsapp}`, `length(v_digits) >= 4` et
     `regexp_replace(value,'\D','','g') LIKE '%'||v_digits||'%'`.

### Score de pertinence et ordre de rendu (point non couvert par la revue)

L'ordre du tableau JSON **est** l'ordre d'affichage de l'annuaire — aujourd'hui
`last_at DESC NULLS LAST`. Le classement par pertinence ne doit s'appliquer **que** pendant une
recherche, sinon on change silencieusement l'ordre de la vue par défaut.

- `base` calcule `rank` (0 quand `p_search IS NULL`) :

```
GREATEST(
  CASE WHEN a.display_name_normalized LIKE v_pattern ESCAPE '\' THEN 2.0
       WHEN v_fuzzy THEN word_similarity(v_text, a.display_name_normalized) ELSE 0 END,
  … idem first_name / last_name …,
  CASE WHEN <établissement LIKE> THEN 1.8            -- exact établissement < exact identité
       WHEN v_fuzzy THEN 0.9 * <max word_similarity établissement> ELSE 0 END,
  CASE WHEN <match canal> THEN 2.0 ELSE 0 END        -- tél./e-mail = signal fort et non ambigu
)
```

- Tri final : `ORDER BY (p_search IS NOT NULL) , rank DESC, last_at DESC NULLS LAST` — c.-à-d.
  **pertinence puis dernière interaction** en recherche, **chronologique pur** sinon.
- `rank` n'est **pas** émis dans le JSON (aucun consommateur front).
- Ordre des arguments de `word_similarity(a, b)` : `a` = saisie, `b` = colonne (`a <% b` ≡
  `word_similarity(a,b) >= seuil`). L'inverser change la sémantique.

### `p_search` reste indépendant de `v_filtered`

`v_filtered := (topic|status|from|to)` — **inchangé**. La recherche est un prédicat *séparé* sur
`base` : un acteur « lien seul », sans aucune interaction, doit rester trouvable par son nom ou son
téléphone. (C'est le miroir backend de la séparation `hasInteractionFilters` / `hasServerFilters`
côté front, §4.)

> **Périmètre / PII** : le prédicat s'applique **à l'intérieur** du périmètre déjà calculé
> (`v_actor_scope` / `v_scope`). Aucun acteur hors périmètre ne devient trouvable, et aucune valeur
> de canal n'est ajoutée au JSON retourné ⇒ pas de nouvelle classe d'exposition.

> **Perf** : `EXISTS` bornés sur `actor_channel` (1 353 lignes) et `actor_object_role` (778) —
> hors hot path §37. `ponytail:` plafond assumé — si `actor_channel` dépasse ~50 k lignes, ajouter
> une colonne générée `value_digits` + index `GIN pg_trgm` ; pas avant.

> **Limite connue** : un numéro stocké au format international (`+262692…`) ne matche pas une
> saisie locale (`0692…`) — les digits diffèrent. Formats locaux (dominants en base) couverts.
> À documenter dans le journal de décisions, pas à sur-ingénierer.

### Livrables Lot A

- `migration_crm_directory_search.sql` (idempotent, auto-asserting).
- Entrée dans `Base de donnée DLL et API/ci_fresh_apply.sql` (après `8z` / dans l'ordre courant du
  manifest) **et** dans `docs/SQL_ROLLOUT_RUNBOOK.md`.
- `Base de donnée DLL et API/tests/test_crm_directory_search.sql` :
  1. match par `display_name` ; 2. par `first_name` ; 3. par `last_name` ;
  4. par nom d'établissement rattaché ; 5. par e-mail exact et partiel ;
  6. par téléphone saisi **avec** espaces et **sans** espaces (le cas `06 92 …` vs `0692…`) ;
  7. **échappement** : `p_search := '%_'` (2 car., donc au-dessus du seuil) ne renvoie pas tout —
     ❌ **pas** `'%'`, qui fait 1 caractère et vaut `NULL` par contrat (contradiction de la v1) ;
  8. `p_search := 'a'` (< 2 car.) = même résultat que `NULL` (aucun filtre) ;
  9. un acteur **sans interaction** reste trouvable par son nom ;
  10. aucun acteur hors périmètre n'apparaît (**persona non-superuser** — obligatoire : un
      `SECURITY DEFINER` contourne la RLS des tables lues, seul le persona prouve le périmètre) ;
  11. **fuzzy** : `Hoareu` retrouve `Hoarau` ;
  12. **fuzzy** : une transposition dans un nom d'établissement le retrouve ;
  13. accents et casse indifférents (`ÉTABLISSEMENT` ≡ `etablissement`) ;
  14. **classement** : un match exact est rendu **avant** un match flou (ordre du tableau JSON) ;
  15. un nom réellement différent n'est **pas** retourné (le seuil ne part pas en vrille) ;
  16. à **2 caractères**, seule la sous-chaîne exacte joue — aucun résultat flou ;
  17. téléphone / e-mail ne déclenchent **aucun** fuzzy (pas de « mauvaise personne ») ;
  18. sans `p_search`, l'ordre reste **strictement** `last_at DESC NULLS LAST` (non-régression).
- **Branchement CI explicite** : le workflow énumère chaque fichier de test comme une étape
  nommée ([`sql-fresh-apply.yml:229`](../.github/workflows/sql-fresh-apply.yml)) — créer le fichier
  ne suffit pas, il faut **ajouter l'étape** `psql … -f "…/tests/test_crm_directory_search.sql"`.
  Même chose pour le `\ir` de la migration dans `ci_fresh_apply.sql`.
- Application live via MCP `apply_migration` + `NOTIFY pgrst, 'reload schema'`.

---

## 4. Lot B — Frontend

### B1. Store de recherche CRM
`src/store/crm-search-store.ts` — zustand minimal, non persisté :
`{ search: string; setSearch: (v: string) => void }`.

### B2. `TopBar.tsx`
- `const isCrm = pathname === '/crm' || pathname?.startsWith('/crm/')`.
- Brancher `value` / `onChange` sur le store CRM quand `isCrm`, sinon sur l'Explorer (inchangé).
- Placeholder contextuel (décision 4). `aria-label` explicite du champ.
- Le bouton ⌘K et le reste du header ne bougent pas.

### B3. `services/crm.ts`
- `CrmDirectoryFilters` += `search?: string`.
- `listCrmDirectory` passe `p_search: filters.search ?? null`.
- **Mode démo** : `matchesSearch` **déplacé** ici depuis `CrmAnnuaire` (réutilisé, pas supprimé) et
  appliqué à `mockCrmDirectory` sur nom / prénom / établissement quand `filters.search` est posé —
  sinon la recherche devient totalement inerte en démo (régression, cf. décision 6).

### B4. `CrmAnnuaire.tsx`

Supprimer le `useState('')` local et le `<label className="crm-search">` ; `rows` = `entries`
(le filtrage part au serveur). Lire la recherche du store + debounce 250 ms.

**Trois notions distinctes** — les confondre dans un seul `hasFilters` rend des libellés faux
(la recherche restreint les **acteurs**, elle ne filtre pas leurs **interactions**) :

```ts
const effectiveSearch =
  debouncedSearch.trim().length >= 2 ? debouncedSearch.trim() : undefined;

const hasInteractionFilters =
  Boolean(topicCode) || status !== undefined || from !== undefined;

const hasServerFilters = hasInteractionFilters || effectiveSearch !== undefined;
```

| Notion | Ce qu'elle pilote |
|---|---|
| `effectiveSearch` | le paramètre `p_search` — et **rien n'est envoyé** sous 2 caractères |
| `hasServerFilters` | la clé React Query (`['crm-directory', filters]` vs la clé nue du shell), le ratio « X / Y » du KPI *Acteurs suivis*, le choix d'état vide |
| `hasInteractionFilters` | le libellé « **X sur la sélection** » de la colonne Interactions **et** la note « les acteurs sans interaction correspondante sont masqués » — faux sous une simple recherche |

- La clé nue `['crm-directory']` doit rester celle du shell / des datalists (invariant existant) ⇒
  toute recherche active bascule sur la clé dérivée. `keepPreviousData` est déjà en place.
- États vides : « annuaire vide » (aucune donnée, CTA) vs « aucun résultat » (recherche/filtre,
  sans CTA) — arbitrer sur `hasServerFilters`.
- KPI *Interactions* : son libellé dépend de `from`, pas de la recherche — inchangé.

### B5. `CrmPage.tsx`
- Effet de portée (décision 3) : `setNav({ view: 'annuaire' })` quand la recherche **effective**
  franchit le seuil (`undefined` → ≥ 2 caractères), **pas** au premier caractère non vide — sinon
  taper `M` depuis *Tâches* éjecte l'utilisateur alors qu'aucune recherche n'est encore appliquée.
  Aucun effet quand la recherche se vide.

### B6. CSS
- Retirer la règle `.crm-search` devenue morte (grep avant suppression : vérifier qu'aucune autre
  vue CRM ne l'utilise).

---

## 5. Tests (TDD — rouge d'abord)

| Fichier | Ce qu'il verrouille |
|---|---|
| `tests/test_crm_directory_search.sql` (nouveau) | les **18** assertions du §3 — **+ l'étape dédiée dans `sql-fresh-apply.yml`**, sinon le fichier n'est jamais exécuté |
| `src/components/layout/TopBar.test.tsx` (**nouveau** — aucun test n'existe) | sur `/crm` la frappe écrit dans le store CRM et **pas** dans l'Explorer ; hors `/crm` l'inverse ; placeholder contextuel |
| `src/features/crm/CrmAnnuaire.test.tsx` | `p_search` envoyé après debounce ; < 2 car. ⇒ **aucun** `p_search` ; plus de champ local ; une recherche seule n'affiche **pas** « sur la sélection » ni la note « acteurs masqués » (`hasInteractionFilters`) ; état vide « aucun résultat » |
| `src/services/crm.test.ts` | `listCrmDirectory({search})` passe `p_search` ; absent ⇒ `null` ; **mode démo** : les fixtures sont filtrées par nom / prénom / établissement |
| `src/views/CrmPage.test.tsx` | 1 caractère depuis *Tâches* ⇒ **on reste** sur *Tâches* ; 2 caractères ⇒ retour à l'onglet Acteurs |

Puis : suite Jest complète + `tsc --noEmit`, et vérification dans l'app en marche (données réelles,
pas de mock) — recherche par établissement, par prénom, par e-mail, par téléphone avec et sans
espaces.

---

## 6. Ordre d'exécution & commits

0. **A0** Calibration du seuil trigramme sur les **données live** (lecture seule, via MCP) :
   mesurer `word_similarity` sur les cas 11/12/15 (fautes réelles vs noms voisins mais distincts)
   et arrêter la valeur de `pg_trgm.word_similarity_threshold` avant d'écrire les assertions.
   Sans ça, les tests figent un seuil choisi au doigt mouillé.
1. **A1** SQL : migration + test SQL + `\ir` dans `ci_fresh_apply.sql` + **étape dans
   `sql-fresh-apply.yml`** + runbook → application live → vérif via MCP.
   *Commit* `feat(crm): recherche serveur p_search sur list_crm_directory (nom, prénom, établissement, tél., e-mail)`
2. **B1–B3** store + TopBar + service (+ leurs tests). *Commit* `feat(crm): le champ de recherche du header pilote l'annuaire acteurs`
3. **B4–B6** annuaire branché serveur, champ local retiré, portée d'onglet, CSS.
   *Commit* `refactor(crm): une seule surface de recherche dans l'annuaire (champ header)`
4. Journal : entrée `§…` dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
   (contrat `p_search`, décisions 1–6, limite format international, plafond ponytail),
   puis rafraîchir la mémoire MCP. Mettre à jour `docs/db-graph`/`graphify` si la RPC y figure.

---

## 7. Risques & points de vigilance

| Risque | Parade |
|---|---|
| Surcharge PostgREST ambiguë si l'ancienne arité survit | `DROP FUNCTION … (text,text,timestamptz,timestamptz)` explicite avant `CREATE` + `NOTIFY pgrst` |
| Pollution de la recherche Explorer (perte du retour Explorer, `8e4a9b8`) | store CRM **séparé**, testé dans `TopBar.test.tsx` |
| Rupture de la clé `['crm-directory']` partagée (shell, datalists, vue établissement) | `effectiveSearch` compte dans `hasServerFilters` ⇒ toujours sur la clé dérivée |
| `%` / `_` saisis énumérant la table | échappement `LIKE` repris de `api.search_actors` + seuil 2 car. (test avec `'%_'`, pas `'%'`) |
| Téléphones formatés différemment | normalisation digits **des deux côtés** + assertion CI dédiée |
| Fuite PII | prédicat **dans** le périmètre existant, aucune valeur de canal ajoutée au JSON — **prouvé par le test persona**, indispensable puisqu'un `SECURITY DEFINER` contourne la RLS des tables lues |
| Fuzzy trop permissif (bruit) ou trop strict (`Hoareu` ne trouve rien) | seuil **figé dans la fonction** (`SET pg_trgm.word_similarity_threshold`), calibré sur les cas 11/12/15, testé dans les deux sens |
| Ordre par défaut de l'annuaire changé silencieusement | `rank` neutre hors recherche + assertion 18 (`last_at DESC` strict sans `p_search`) |
| Recherche inerte en mode démo | `matchesSearch` déplacé dans `services/crm.ts` et appliqué aux fixtures |
| Test SQL créé mais jamais exécuté | étape nommée ajoutée dans `sql-fresh-apply.yml` (le workflow n'auto-découvre pas) |
| Migration non rejouable | `DROP` arité 4 **et** `CREATE OR REPLACE` arité 5 |
