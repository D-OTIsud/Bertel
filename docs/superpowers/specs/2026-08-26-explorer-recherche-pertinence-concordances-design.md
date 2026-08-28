# Exploreur — pertinence de la recherche, coût du fan-out, concordances directes

**Date** : 2026-08-26 · **Statut** : design validé (PO, en session) · **Périmètre** : `bertel-tourism-ui` + `Base de donnée DLL et API`

## Problème (mesuré sur la prod, 2026-08-26)

Saisie « le jardin créole » : deux fiches publiées portent exactement ce nom
(`HLORUN00000001CA` HLO, `LOIRUN00000000VI` LOI).

1. **Le classement ment.** Le serveur classe le HLO premier (`relevance` 2.2577) mais la RPC
   n'émet pas `relevance` par carte ; `sortExplorerCards` retombe sur l'ordre alphabétique et
   affiche « A la Kaz Ti Zozeff » en tête. Et même côté serveur, l'homonyme LOI tombe 5ᵉ
   (2.1266) derrière du bruit : `ts_rank` récompense la densité du document, pas l'exactitude
   du nom — aucun bonus « le nom EST la requête ».
2. **La frappe validée coûte ~2,3 s.** Le match plein texte lui-même coûte ~10 ms ; le reste
   est un socle de ~104 ms par appel (fonction `SECURITY DEFINER` non inlinée, planification
   par appel — classe §204) multiplié par le fan-out : 7 RPC cartes + 7 RPC marqueurs
   (marqueurs lancés même en vue Liste), concurrence 2, latence Réunion↔Supabase
   ~220-310 ms/AR, + 250 ms de debounce.
3. **Aucun pré-résultat.** Une concordance directe de nom (~20 ms via
   `idx_object_name_normalized_trgm`) n'est affichée qu'au terme du chemin lourd.

## Décisions produit (arbitrées en session)

- Lot C : **les deux surfaces** (menu sous la barre **ET** bandeau en tête de résultats),
  nourries par **une seule** requête.
- Lot B : **B1 + B2** (gating marqueurs **et** mode appel-fusionné).
- Ordre de livraison : **A → B1 → C → B2** — du plus sûr au plus structurel, un commit par
  incrément vérifié.
- Le chantier part de `master` (la branche `codex/fix-document-type-list` porte un chantier
  CRM en cours) ; commits par pathspec, aucun fichier commun avec le chantier CRM.

---

## Lot A — le classement dit la vérité

### A1. SQL — bonus nom dans `api.get_filtered_object_ids`

Ajouter à l'expression `relevance` (bloc §109/§197, `api_views_functions.sql` ~l.1456) un
**bonus nom à 3 niveaux étanches**, calculé sur `src.name_normalized` vs
`btrim(api.norm_search(p_search))` :

| condition (sur le nom normalisé) | bonus | étage résultant (plein texte = 2 + ts_rank plafonné ∈ [2,3)) |
|---|---|---|
| égalité stricte | +3.0 | [5, 6) |
| préfixe (`LIKE norm \|\| '%'`) | +2.0 | [4, 5) |
| contenu (`LIKE '%' \|\| norm \|\| '%'`) | +1.0 | [3, 4) |
| sinon | +0 | [2, 3) plein texte pur ; [0, 1] flou |

- **Étanchéité garantie par construction** : bonus espacés de 1.0 entier ET `ts_rank`
  plafonné à 0.99 (`LEAST(ts_rank(...), 0.99)` — `ts_rank` n'est pas borné à 1 en théorie ;
  sans plafond, un document dense pourrait faire sauter un étage).
- Le bonus s'ajoute **au bras plein texte uniquement** (la fiche a déjà matché) ; le bras
  flou (repli §197) garde son échelle [0,1] — les étages ne se croisent jamais.
- `name_normalized` est présent dans **les deux bras** de `source_rows` (vérifié :
  colonne du MV `internal.mv_filtered_objects` ET de `object`) → aucun DROP/CREATE de MV.
- Coût : évalué dans la liste SELECT, donc **post-filtrage**, sur les survivantes uniquement
  (~70 lignes pour la requête témoin). Les wildcards LIKE de la saisie sont échappés.
- Préfixe/contenu se testent sur la saisie **entière** normalisée (pas par mot) : c'est un
  bonus d'exactitude, le rappel reste porté par le plein texte.

### A2. SQL — émettre `relevance` par carte

`api.list_object_resources_filtered_page` attache déjà `label_match` par position
(~l.6440). Attacher `relevance` par la même mécanique :
`item.value || jsonb_build_object('relevance', p.relevance)` (toujours émis ; 0 sans terme).

### A3. Front — le tri honore la pertinence

- `ObjectCard` gagne `relevance?: number` ([domain.ts](bertel-tourism-ui/src/types/domain.ts)) ;
  `normalizeExplorerCards` le laisse passer.
- `sortExplorerCards` ([facets.ts:866](bertel-tourism-ui/src/utils/facets.ts:866)) : clés dans
  l'ordre `label_rank` (inchangé — n'existe que si filtre label) → **`relevance` DESC** →
  nom → id. Sans recherche, `relevance` = 0 partout ⇒ ordre alphabétique actuel préservé
  à l'identique (contrat §109).
- La pertinence est comparable entre buckets (même formule) — le tri global inter-buckets
  redevient celui du serveur.

### Hors périmètre A

`list_object_markers` garde son ordre (la carte n'a pas d'ordre visible).

---

## Lot B1 — marqueurs seulement quand la carte est visible

`useExplorerMarkersQuery` ([useExplorerQueries.ts](bertel-tourism-ui/src/hooks/useExplorerQueries.ts))
gagne un paramètre `enabled`, calculé dans `ExplorerPage` :

- desktop : `viewMode === 'map' || viewMode === 'split'`
- mobile (`isCompactExplorer`) : `activeMobilePanel === 'map'`

`keepPreviousData` conserve les marqueurs au basculement de vue (pas de flash). La palette
⌘K appelle le **service** `listObjectMarkers` directement, pas le hook — non affectée par B1
(elle bascule en C). Effet : frappe validée en vue Liste/Table = 7 appels au lieu de 14.

---

## Lot C — concordances directes pendant la frappe

### C1. RPC `api.search_objects_by_name(p_term text, p_limit int DEFAULT 8)`

Nouveau fichier `migration_search_objects_by_name.sql` (+ manifest + runbook).

- `RETURNS TABLE(id text, name text, object_type object_type, status object_status,
  city text, image_url text)` — payload mince, aucune i18n (nom canonique, comme les
  marqueurs).
- `STABLE SECURITY DEFINER`, `SET search_path = pg_catalog, public, api, internal, extensions`,
  **`REVOKE ALL FROM PUBLIC`** (obligatoire §204) + `GRANT EXECUTE TO anon, authenticated`.
- Garde d'entrée : terme normalisé `btrim(api.norm_search(p_term))` ; longueur < 2 ⇒ ensemble
  vide. Wildcards LIKE échappés (`\`, `%`, `_`, avec `ESCAPE '\'`). `p_limit` borné
  `LEAST(GREATEST(p_limit,1),20)`.
- Match : `name_normalized LIKE '%' || norm || '%'` (l'index GIN trigramme existant sert
  l'infixe ; mesuré ~20 ms sur le corpus).
- **Périmètre auto-gardé serveur** (le client ne choisit rien — doctrine §205 transposée) :
  `status = 'published'`
  `OR (COALESCE(api.current_user_can_edit_objects(), FALSE) AND status = 'draft'
      AND id IN (SELECT api.current_user_extended_object_ids()))`.
  `COALESCE(..., FALSE)` est obligatoire : la fonction est à trois valeurs (§204).
  `archived`/`hidden` : **jamais** (l'archivé est opt-in de filtre, pas une cible de
  navigation ; cohérent §205).
- Tri : égalité stricte DESC, préfixe DESC, `name_normalized`, `id`.
- `city` : LEFT JOIN `object_location` sur `object_id` (patte objet du XOR) ;
  `image_url` = `object.cached_main_image_url`.
- Ce RPC cherche dans **tout le corpus visible, indépendamment des filtres actifs de
  l'Exploreur** : c'est de la navigation (« je veux LA fiche »), pas du filtrage.

### C2. Service + hook partagé

- Service `searchObjectsByName(term, signal)` (nouveau, `src/services/`) → lignes typées.
- Hook `useNameMatchQuery(term)` : debounce **150 ms** (plus court que les 250 ms de la
  requête lourde — c'est sa raison d'être), seuil 2 caractères, `signal` d'abandon,
  `keepPreviousData`, `staleTime` court (~30 s). **Une** requête TanStack nourrit les deux
  surfaces (clé partagée).
- Échec = silencieux : les surfaces se masquent, rien ne bloque la recherche lourde
  (aide à la navigation, pas un chemin critique).

### C3. Surface 1 — menu sous la barre de recherche

Dans [TopBar.tsx](bertel-tourism-ui/src/components/layout/TopBar.tsx), **contexte Exploreur
uniquement** (la barre est partagée avec le CRM via `isCrm` — le CRM garde son
comportement §195).

- Combobox ARIA (`role="combobox"` / listbox, flèches ↑↓, Entrée, Échap) ; ouvert quand
  focus + terme ≥ 2 + résultats.
- Ligne : vignette 32 px (repli icône type), nom, libellé type + commune, badge « Brouillon »
  si draft.
- Clic / Entrée sur une ligne → `useUiStore.openDrawer(id)` (le paramètre URL `?fiche=` suit,
  mécanique D25 existante) — **sans toucher aux filtres**.
- Entrée hors sélection → ferme le menu, la recherche complète continue (le store a déjà le
  terme). Pied de menu : « Entrée — lancer la recherche complète ».

### C4. Surface 2 — bandeau en tête des résultats

Dans le panneau résultats ([ResultsList.tsx](bertel-tourism-ui/src/components/explorer/ResultsList.tsx)
ou l'en-tête de la colonne résultats d'`ExplorerPage` — trancher au plan selon le rendu des
3 vues Liste/Table/Split) :

- Visible tant que terme ≥ 2 **et** concordances > 0 — pas seulement pendant le chargement
  (pas de flicker apparition/disparition). Rendu instantané depuis le cache du hook C2.
- Bande compacte de mini-cartes (nom, type · commune, badge Brouillon) ; clic → tiroir.
- Étiquette : « Concordances directes (N) ».

### C5. Palette ⌘K rebranchée

`searchPaletteObjects` ([palette-search.ts](bertel-tourism-ui/src/services/palette-search.ts))
bascule de `listObjectMarkers` vers `searchObjectsByName` : corrige la limite `ponytail:`
documentée (fiches non géolocalisées introuvables) et supprime la résolution de statuts côté
client (le RPC s'auto-garde).

---

## Lot B2 — mode appel-fusionné (dernier, le plus risqué)

Machinerie §125/§210 (`fetchExplorerCardsPage`, curseurs par bucket) — livré seul, avec ses
tests, après A/B1/C.

- **Condition d'armement** : les payloads `buildBucketRpcFilters(filters, bucket)` de tous
  les buckets effectifs sont **deep-equal** (le cas par défaut : aucune facette par-bucket,
  aucun sous-type restreint). Fonction pure testée `canMergeExplorerBuckets(filters)`.
- Armé : **un seul appel** `list_object_resources_filtered_page` avec `p_types` = union des
  types de tous les buckets effectifs ; curseur unique porté par la map existante sous une
  clé synthétique `__ALL__` (élargissement de type localisé — porteur exact tranché au plan).
- Désarmé : chemin par-bucket strictement inchangé.
- `totalCount` / `labelRankCounts` : logique de somme inchangée (une seule entrée).
- La clé de requête TanStack porte déjà les filtres ⇒ aucun mélange fusionné/par-bucket
  entre pages d'une même requête.
- Effet attendu : frappe validée = 1 appel cartes (+ marqueurs si carte visible),
  ~2,3 s → ~0,6 s.

---

## Erreurs et cas limites

- RPC nom en échec → surfaces C masquées, log console, pas de toast.
- Terme < 2 caractères → hook inerte (pas d'appel).
- Abandon (`AbortSignal`) sur changement de terme/démontage — même doctrine que la requête
  lourde (§210).
- Draft d'une autre ORG : jamais rendu (garde serveur, pas UI).
- B2 : un changement de filtre en cours de pagination repart de la page 0 (clé TanStack) —
  un curseur fusionné ne peut pas continuer une pagination par-bucket ni l'inverse.

## Tests (garde non vacante, doctrine §196/§201/§204)

- **SQL** `tests/test_search_objects_by_name.sql` : témoins (2 homonymes publiés + 1 draft
  ORG A + bruit) ; personas via `request.jwt.claims` (§204 — `SET ROLE` seul ne suffit pas) :
  anon → publiés seuls ; membre éditeur ORG A → + son draft ; authentifié inconnu → publiés
  seuls. Exécute la **vraie** RPC et exige l'ensemble exact ET l'ordre (exact avant préfixe).
- **SQL** test lot A : sur les témoins, `get_filtered_object_ids('le jardin créole')` rend
  les 2 homonymes en positions 1-2 par `relevance` ; un terme sans concordance nom garde
  l'échelle [2,3).
- **Jest** : `sortExplorerCards` (relevance prime, 0 partout = ordre actuel intact) ;
  `canMergeExplorerBuckets` ; hook C2 (debounce, seuil, silence sur erreur) ; composants C3/C4
  (RTL : ouverture, clavier, clic → `openDrawer`, badge Brouillon, contexte CRM inerte) ;
  gating B1 (`enabled` selon vue).
- Gate CI fresh-apply étant rouge (différé connu, antérieur) : tests SQL rejoués **à la
  main** sur le déployé, précédent §213 ; ils intègrent le manifest pour le jour où le gate
  reverdit.

## Déploiement (doctrine §213 / §24)

1. SQL d'abord — rétrocompatible (un champ JSON de plus ; l'ancien front l'ignore) :
   `get_filtered_object_ids` + `list_object_resources_filtered_page` redéployées **après
   diff hunk-par-hunk contre le `prosrc` vif** (les fichiers de base agrègent des passes) ;
   nouvelle migration C1 appliquée via MCP.
2. Fold : A1/A2 édités en place dans `api_views_functions.sql` ; C1 = migration listée au
   manifest + runbook.
3. Front ensuite (A3, B1, C2-C5, B2), commits par pathspec sur `master`, suite Jest + `tsc`
   verts à chaque lot.
4. Vérification live : sonde « le jardin créole » (homonymes en 1-2 dans l'UI), compteur
   d'appels réseau avant/après (14 → 7 → 1-2), latence liste mesurée, personas RPC nom.
5. Journal : entrée au décision log (`lot1_mapping_decisions.md`, numéro re-grepé au moment
   de figer), tracker des différés (WORKFLOW.md) mis à jour.

## Différés assumés

- Bonus nom **par mot** (saisie multi-mots partielle) — le bonus C-A1 porte sur la saisie
  entière ; la couverture par mot reste au plein texte.
- Surlignage de la sous-chaîne matchée dans le menu C3 — cosmétique.
- Mise en avant des concordances de **commune** dans les surfaces C — hors demande
  (« dont c'est le nom »).
- B2 pour les **marqueurs** (fusion des 7 appels marqueurs en 1 quand la carte est visible) —
  même mécanique, à évaluer après mesure de B2 cartes.
