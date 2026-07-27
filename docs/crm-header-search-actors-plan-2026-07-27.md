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
5. **Seuil + debounce** : ≥ 2 caractères (identique à `search_actors`), debounce 250 ms.
   < 2 caractères ⇒ aucun filtre de recherche envoyé.
6. **Mode démo** (client Supabase absent) : les fixtures restent non filtrées, comme les filtres
   sujet/statut/période aujourd'hui. Inertie **existante**, documentée, non aggravée.

---

## 3. Lot A — Backend : `p_search` sur `api.list_crm_directory`

**Fichier** : nouvelle migration `Base de donnée DLL et API/migration_crm_directory_search.sql`
(la définition courante vit dans `migration_crm_module.sql`, manifest 8z — on ne la ré-applique pas
en entier ; le manifest fait autorité par ordre d'application, cf. CLAUDE.md « Deploy integrity »).

### Contrat

```
DROP FUNCTION IF EXISTS api.list_crm_directory(text, text, timestamptz, timestamptz);
CREATE FUNCTION api.list_crm_directory(
  p_topic_code text DEFAULT NULL,
  p_status     text DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_search     text DEFAULT NULL          -- ← nouveau
) RETURNS jsonb …
```

Le `DROP` de l'ancienne arité est **obligatoire** : sans lui, les deux surcharges coexistent et
PostgREST devient ambigu (même leçon que `list_crm_timeline`, en-tête `migration_crm_module.sql`).
Rejouer les `REVOKE`/`GRANT` sur la **nouvelle** signature (`… , text)` → `authenticated, service_role`).

### Prédicat (ajouté dans le CTE `base`, donc il élague **avant** les LATERAL d'agrégats)

- Garde : `btrim(p_search)` de longueur < 2 ⇒ traité comme `NULL` (pas de filtre, pas d'erreur).
- `v_pattern := '%' || <unaccent+lower+échappement \ % _> || '%'` — **échappement `LIKE` repris de
  `api.search_actors`** (un `%` saisi ne doit pas énumérer la table).
- `v_digits := regexp_replace(p_search, '\D', '', 'g')` — branche téléphone activée seulement si
  `length(v_digits) >= 4` (évite qu'un « 06 » isolé matche tout).
- L'acteur est retenu si **au moins une** des conditions suivantes est vraie :
  1. `a.display_name_normalized LIKE v_pattern` OU `a.first_name_normalized LIKE v_pattern`
     OU `a.last_name_normalized LIKE v_pattern` ;
  2. `EXISTS` un lien `actor_object_role` **dans le périmètre `v_scope`** dont
     `immutable_unaccent(lower(o.name)) LIKE v_pattern` (nom d'établissement rattaché) ;
  3. `EXISTS` un `actor_channel` de l'acteur avec :
     - `kind ∈ {email}` et `lower(value) LIKE v_pattern`, **ou**
     - `kind ∈ {phone, mobile, sms, whatsapp}` et
       `regexp_replace(value,'\D','','g') LIKE '%'||v_digits||'%'` (branche téléphone).
- `v_filtered` inclut désormais `p_search` **uniquement pour la règle d'inclusion des acteurs**
  (≥1 interaction correspondante) ? → **NON** : la recherche ne doit **pas** exiger d'interaction.
  Garder `v_filtered := (topic|status|from|to)` tel quel et appliquer `p_search` comme un
  prédicat **indépendant** sur `base`. Un acteur « lien seul », sans interaction, doit rester
  trouvable par son nom ou son téléphone.

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
- `Base de donnée DLL et API/tests/test_crm_directory_search.sql` (gate CI fresh-apply) :
  1. match par `display_name` ; 2. par `first_name` ; 3. par `last_name` ;
  4. par nom d'établissement rattaché ; 5. par e-mail exact et partiel ;
  6. par téléphone saisi **avec** espaces et **sans** espaces (le cas `06 92 …` vs `0692…`) ;
  7. `p_search := '%'` ne renvoie pas tout (échappement) ;
  8. `p_search := 'a'` (< 2 car.) = même résultat que `NULL` ;
  9. un acteur **sans interaction** reste trouvable par son nom ;
  10. aucun acteur hors périmètre n'apparaît (persona non-superuser).
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

### B4. `CrmAnnuaire.tsx`
- Supprimer le `useState('')` local, le `<label className="crm-search">` et `matchesSearch`
  (le filtrage devient serveur) ; `rows` = `entries`.
- Lire la recherche du store + debounce 250 ms (petit `useDebouncedValue` local ou
  `src/hooks/useDebouncedValue.ts` si on veut le partager — 8 lignes).
- Injecter `search` dans `filters` **et** dans `hasFilters` ⇒ la clé passe sur
  `['crm-directory', filters]`, la clé nue `['crm-directory']` reste celle du shell / des datalists
  (invariant existant à ne pas casser). `keepPreviousData` déjà en place ⇒ pas de collapse.
- États vides : distinguer « annuaire vide » / « aucun résultat pour cette recherche » (le test
  actuel `entries.length === 0 && !hasFilters && !search.trim()` reste valable, `search` venant
  désormais du store).
- La note « Filtres appliqués aux compteurs » : la garder, mais ne l'afficher pour la recherche
  que si un autre filtre est actif OU adapter le libellé (la recherche restreint aussi les KPI —
  comportement voulu et cohérent).

### B5. `CrmPage.tsx`
- Effet de portée (décision 3) : au passage `search` vide → non-vide, `setNav({ view: 'annuaire' })`
  (sort du drill-in et des autres onglets). Aucun effet quand la recherche se vide.

### B6. CSS
- Retirer la règle `.crm-search` devenue morte (grep avant suppression : vérifier qu'aucune autre
  vue CRM ne l'utilise).

---

## 5. Tests (TDD — rouge d'abord)

| Fichier | Ce qu'il verrouille |
|---|---|
| `tests/test_crm_directory_search.sql` (nouveau) | les 10 assertions du §3 (gate CI fresh-apply) |
| `src/components/layout/TopBar.test.tsx` (**nouveau** — aucun test n'existe) | sur `/crm` la frappe écrit dans le store CRM et **pas** dans l'Explorer ; hors `/crm` l'inverse ; placeholder contextuel |
| `src/features/crm/CrmAnnuaire.test.tsx` | la recherche du store part bien en `p_search` (après debounce) ; < 2 car. ⇒ pas de `p_search` ; plus de champ local ; état vide « aucun résultat » |
| `src/services/crm.test.ts` | `listCrmDirectory({search})` passe `p_search` ; absent ⇒ `null` |
| `src/views/CrmPage.test.tsx` | taper depuis *Tâches* / un drill-in ramène sur l'onglet Acteurs |

Puis : suite Jest complète + `tsc --noEmit`, et vérification dans l'app en marche (données réelles,
pas de mock) — recherche par établissement, par prénom, par e-mail, par téléphone avec et sans
espaces.

---

## 6. Ordre d'exécution & commits

1. **A1** SQL : migration + test SQL + manifest + runbook → application live → vérif via MCP.
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
| Rupture de la clé `['crm-directory']` partagée (shell, datalists, vue établissement) | `search` compte dans `hasFilters` ⇒ toujours sur la clé dérivée |
| `%` / `_` saisis énumérant la table | échappement `LIKE` repris de `api.search_actors` + seuil 2 car. |
| Téléphones formatés différemment | normalisation digits **des deux côtés** + assertion CI dédiée |
| Fuite PII | prédicat **dans** le périmètre existant, aucune valeur de canal ajoutée au JSON |
