# Design — §06 Restaurant « Cuisine, cartes & service » : séparation des 3 concepts

- **Date** : 2026-06-21
- **Type** : object_type RES (restaurant) — modèle, SQL, éditeur, upload, vocabulaire
- **Statut** : design approuvé (PO) — périmètre élargi aux 3 concepts, prêt pour plan d'implémentation
- **Décision log** : à consigner dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (prochain §)

---

## 1. Problème

L'édition d'une fiche **restaurant** (BlockRES, §06 « Cuisine, cartes & service ») **confond trois concepts distincts** que le PO veut séparés. Constat live décisif : `135 RES · 0 object_menu · 0 object_menu_item · 0 object_menu_item_cuisine_type` (toute la base — 0 donnée à migrer).

| # | Concept | C'est quoi | Stocké où (vérifié live) | État éditeur | Verdict |
|---|---------|-----------|--------------------------|--------------|---------|
| **1** | **Carte PDF** | Le restaurateur **dépose un PDF** de sa carte | **Aucune colonne document** sur `object_menu`/`object`. Infra `ref_document` (+ `valid_from/valid_to`) + `/api/document/upload` existe (§08/§18) mais **aucun lien** restaurant→document | Dropzone « Déposer un PDF » = **factice** (crée une ligne menu vide) | **Non modélisé + UI mensongère** |
| **2** | **Carte structurée** | Saisie **item par item** : sections → plats (nom, prix, description, régimes, allergènes) | `object_menu(object_id, category_id, name, description, is_active, visibility, position)` → `object_menu_item(menu_id, name, description, price, currency, kind_id, unit_id, media_id, is_available, position)` + liens dietary/allergen — **support complet**, saver nesté existant | Expose seulement **nom de section + catégorie + actif** ; aucune saisie de plat | **Modélisé + saver OK, UI manquante** |
| **3** | **Cuisine proposée** | Facette **globale de recherche** (créole, française…), pas liée à un plat | `object_menu_item_cuisine_type` (niveau plat) → cible **`object_cuisine_type`** (niveau objet) | **Write-trap** : bind sur `menus.items[0].items[0]` (1er plat inexistant) → `onChange` no-op silencieux | **Le bug signalé** |

Symptômes rapportés par le PO :
- libellé « Identité culinaire » trompeur (coiffe une note « géré en §07 », pas la cuisine) ;
- choisir une cuisine ne l'ajoute pas (write-trap pour 100 % des restaurants) ;
- « Métropolitaine » au lieu de « Française » ;
- catalogue de cuisine incomplet.

### Cause racine
Le modèle **dérive** la cuisine du restaurant depuis ses plats, et la carte (PDF vs structurée) n'est pas distinguée. Résultat : la cuisine ne peut être saisie sans construire un menu, le PDF n'est pas câblé, et l'item-par-item n'est pas exposé.

### Alternatives écartées (vérifiées)
- **Réutiliser `object_taxonomy(domain='cuisine_type')`** pour la cuisine : écarté. `object_taxonomy` (826 lignes) ne porte que des domaines `taxonomy_*` (arbre taxonomique §57) ; pas de colonne `position` (donc pas de « cuisine principale ») ; l'y mettre détournerait un autre concept.
- **Auto-créer un menu/plat caché** pour porter la cuisine : écarté (pollue le modèle menu).
- **Garder la cuisine couplée aux plats** : écarté (impossible de déclarer une cuisine sans menu).

---

## 2. Décision — modèle cible à 3 concepts séparés

§06 se réorganise en **trois blocs indépendants** (chacun fonctionne seul) + les pointeurs §07/§14 en bas :

- **Bloc A — Cuisines proposées** (#3) → table niveau-objet `object_cuisine_type`, découplée des menus.
- **Bloc B — Carte structurée** (#2) → éditeur item-par-item sur `object_menu`/`object_menu_item` (modèle + saver existants ; UI à construire).
- **Bloc C — Cartes PDF** (#1) → vrai upload via `ref_document` + table de lien `object_document`, avec dates de validité.

---

## 3. Volet A — Cuisine niveau-objet (#3)

### 3.1 Schéma
```sql
CREATE TABLE IF NOT EXISTS object_cuisine_type (
  object_id       TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  cuisine_type_id UUID NOT NULL REFERENCES ref_code_cuisine_type(id) ON DELETE CASCADE,
  position        INT  NOT NULL DEFAULT 1,   -- 1 = cuisine principale
  PRIMARY KEY (object_id, cuisine_type_id)
);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_object ON object_cuisine_type(object_id);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_type   ON object_cuisine_type(cuisine_type_id);
```
- `object_id` est **TEXT** (les ids `object` sont TEXT, ex. `RESRUN…` — vérifié live). Forme calquée sur `object_amenity`/`object_environment_tag` (descriptor-link générique), **non** enrôlée dans `ref_facet_registry` (descripteur, pas facette type-spécifique ; gating RES = éditeur, comme amenities/tags).
- `position` porte « la 1ère = principale » (ordre de sélection).

### 3.2 RLS (invariants §38 / per-command)
- `ENABLE ROW LEVEL SECURITY`.
- **Lecture** forme split §38 (pas `USING(true)`) :
  `(EXISTS (SELECT 1 FROM object o WHERE o.id = object_cuisine_type.object_id AND o.status='published')) OR object_cuisine_type.object_id IN (SELECT api.current_user_extended_object_ids())`.
- **Écriture** per-command `canonical_ins/upd/del_object_cuisine_type` → `api.user_can_write_object_canonical(object_cuisine_type.object_id)` (colonne externe qualifiée — invariant silent-rebinding).
- `GRANT SELECT ON object_cuisine_type TO anon, authenticated, service_role` ; EXECUTE du prédicat déjà global (gotcha P0.3).

### 3.3 Consommateurs SQL repointés (source unique)
- `api.get_object_resource` clé objet `cuisine_types` (bloc RES) → lit `object_cuisine_type` directement (ORDER BY `oct.position`). `get_object_with_deep_data` hérite verbatim (memory §101).
- FMA `associated_restaurants_cuisine_types` → `object_cuisine_type` des restaurants partenaires (`object_relation` `partner_of`).
- `api.search_restaurants_by_cuisine` / `api.search_events_by_restaurant_cuisine` → repointées sur `object_cuisine_type`. `cuisine_counts` (nb de plats/cuisine) n'a plus de sens au niveau objet → **retiré** (ou réduit à présence ; tranché au plan ; vérifier appelants front).

### 3.4 Frontend — module `cuisine` découplé
- Loader `loadObjectWorkspaceCuisine(objectId)` (selects directs `object_cuisine_type` ordonné par `position` + catalogue `ref_code` `cuisine_type`) → `{ codes, options, unavailableReason? }`, **indépendant** de `menus`.
- Saver `saveObjectWorkspaceCuisine` : delete-all + reinsert avec `position=index+1` ; garde-fou `unavailableReason` ⇒ no-op.
- `object-workspace-parser.ts` : nouveau `ObjectWorkspaceCuisineModule` ; `cuisine` ajouté à la draft.

### 3.5 Catalogue `ref_code` `cuisine_type`
- Renommage : `metropolitan` → `name` « **Française** » (code stable ; description ajustée).
- **+14 codes** : Océan Indien `mauricienne, malgache, seychelloise, sino_reunionnaise` · Européennes `creperie, pizzeria, savoyarde, grecque` · Asie/Amériques `vietnamienne, coreenne, mexicaine` · Formats `healthy, bar_a_vin, cafe`. (Salon de thé déjà couvert par `patisserie`.) `position` attribuée (créole/française/traditionnelle en tête).

---

## 4. Volet B — Carte structurée item-par-item (#2)

Le modèle (`object_menu` → `object_menu_item` + liens `object_menu_item_dietary_tag`/`_allergen`) et le **saver nesté `saveObjectWorkspaceMenus`** (PostgREST delete+recreate, écrit déjà sections + plats + dietary + allergen + prix) **existent**. Il manque l'**UI** de saisie des plats.

### 4.1 Éditeur (BlockRES + nouveaux widgets)
- **Sections** (`object_menu`) : cartes compactes (nom + catégorie `ref_code_menu_category` + actif/visibility).
- **Plats** (`object_menu_item`) : par section, « Gérer les plats » → **modale** (préférence PO : compact + modale). La modale liste les plats avec add/edit/remove ; chaque plat éditable = nom, **prix** (+ `currency`, `kind_id`→`ref_code_price_kind`, `unit_id`→`ref_code_price_unit`), **description/contenu**, **régimes** (`dietary_tag`), **allergènes** (`allergen`), `is_available`, `position`.
- Garde-fou `unavailableReason` (module gated/charge échouée) ⇒ pas de clobber.

### 4.2 Découplage cuisine (cohérence avec Volet A)
- `ObjectWorkspaceMenuItem` **perd `cuisineTypeCodes`** ; `ObjectWorkspaceMenusModule` perd `cuisineTypeOptions` (déplacés dans le module `cuisine`).
- Le saver `saveObjectWorkspaceMenus` **n'écrit plus** `object_menu_item_cuisine_type`.
- `get_object_resource` clés `cuisine_types` **nichées par menu/par plat** : laissées en place (retournent `[]` faute d'écriture) — nettoyage SQL différé (KISS ; pas de churn sur le bloc menus complexe).

### 4.3 Hors-scope B
- Photo par plat (`object_menu_item.media_id` / `object_menu_item_media`) : différée.
- Cuisine par plat : retirée (la cuisine est globale, Volet A).

---

## 5. Volet C — Cartes PDF (#1)

Vrai upload d'un (ou plusieurs) PDF de carte, attaché **au restaurant** (pas à une section).

### 5.1 Schéma — table de lien générique
```sql
CREATE TABLE IF NOT EXISTS object_document (
  object_id   TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ref_document(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES ref_code_document_type(id),  -- ex. 'carte'
  position    INT NOT NULL DEFAULT 1,
  PRIMARY KEY (object_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_object_document_object ON object_document(object_id);
```
- Générique (réutilisable pour la vision PO « documents par section propriétaire ») ; `role` via la partition existante **`ref_code_document_type`** (aujourd'hui vide).
- Seed `document_type` : `carte` (+ extensible : `menu_pdf`, `carte_des_vins`…).

### 5.2 Upload (réutilise l'infra §08/§18)
- `DocumentUploadField` → `uploadDocument({file, objectId, accessToken})` → `POST /api/document/upload` (autorise par objet AS THE CALLER = `user_can_write_object_canonical`, stocke bucket `documents`, crée `ref_document` → `{documentId, url, title}`).
- Le client insère ensuite `object_document(object_id, document_id, role_id='carte', position)`.
- Métadonnées de validité éditables : `ref_document.valid_from/valid_to` + `title`. Suppression = delete du lien (+ GC document différé, comme media).

### 5.3 RLS
- `object_document` : §38 read gate + per-command `canonical_ins/upd/del_object_document` → `user_can_write_object_canonical(object_id)` ; `GRANT SELECT … anon/authenticated/service_role` ; EXECUTE prédicat global.
- `ref_document` : vérifier que la lecture des lignes liées passe pour `anon` (RLS existante §08/§18) ; sinon aligner.

### 5.4 Consommateur
- `api.get_object_resource` : nouvelle clé `menu_documents` (RES) → `[{document_id, url, title, valid_from, valid_to, position}]` filtrée par le gate objet. `get_object_with_deep_data` hérite.
- Drawer public : « Voir la carte (PDF) » (lien `ref_document.url`).

---

## 6. §06 restructure (BlockRES)

Ordre cible, trois blocs visuellement distincts :
1. **Cuisines proposées** (Volet A) — bind module `cuisine`. Le faux libellé « Identité culinaire » est supprimé (ce bloc EST l'identité culinaire).
2. **Carte structurée** (Volet B) — sections + modale plats.
3. **Cartes PDF** (Volet C) — `DocumentUploadField` + liste des cartes (nom, validité, « Voir le PDF », suppression). **Remplace le dropzone factice.**
4. **Bas** : `OwnedElsewhereNote` §07 (capacité/groupes) + §14 (horaires) — « géré ailleurs », hors du thème cuisine.

---

## 7. Plan d'implémentation phasé (chaque phase livrable seule)

- **P0 — Squelette §06 honnête** (FE pur) : 3 blocs, retrait du dropzone factice + faux libellé, relabel « Cartes & menus (PDF) » → ce que c'est. Aucune perte de fonction (cuisine encore en write-trap mais le bloc est honnête). *Optionnel comme étape séparée — peut fusionner avec P1.*
- **P1 — Cuisine #3** : `object_cuisine_type` (table+RLS+grants, manifest), repoint `get_object_resource`/FMA/search, catalogue (rename+14), module `cuisine` (loader/saver/parser), Bloc A.
- **P2 — Carte structurée #2** : UI plats (modale + widgets), retrait cuisine du module menus + saver, parser.
- **P3 — Carte PDF #1** : `object_document` (table+RLS+seed `document_type`), exposition `get_object_resource.menu_documents`, Bloc C (upload + liste + validité), drawer.

---

## 8. Déploiement & tests

- **Manifeste** (suite après `14s`) :
  - `14t` `migration_object_cuisine_type.sql` (table + RLS + grants) — P1.
  - `14u` `migration_object_document.sql` (table + RLS + grants + seed `document_type`) — P3.
  - `api_views_functions.sql` repointé/étendu (`cuisine_types`, FMA, search, `menu_documents`) — P1 & P3.
  - Seed catalogue cuisine dans `seeds_data.sql` — P1.
- Appliqué **live via MCP**, puis **foldé** dans `schema_unified.sql` / `rls_policies.sql` / `api_views_functions.sql` / `seeds_data.sql` ; ajout au `docs/SQL_ROLLOUT_RUNBOOK.md` (manifeste + section incrémentale). Gate **fresh-apply CI** vert.
- **Tests SQL** : `test_object_cuisine_type.sql` (RLS read-gate anon/published/org-member ; write per-command ; `get_object_resource.cuisine_types` lit niveau objet) ; `test_object_document.sql` (idem + `menu_documents`).
- **Tests Jest** : module cuisine (round-trip, ordre `position`, garde-fou) ; éditeur plats (add/edit/remove, persistance prix/description/dietary/allergen) ; upload carte PDF (lien créé, validité) ; BlockRES (3 blocs, plus de write-trap).
- **Décision log** + MCP memory mis à jour.

---

## 9. Hors-scope (YAGNI)

- Enrôlement `ref_facet_registry` / trigger « RES-only » pour cuisine ou document (descripteurs ; gating éditeur suffit).
- Réutilisation `object_taxonomy` pour la cuisine (détournement ; pas de `position`).
- Cuisine par plat & photo par plat (Volet B) ; nettoyage des clés `cuisine_types` nichées dans `get_object_resource`.
- i18n des nouveaux codes cuisine / document_type (FR-fallback au lancement).
- GC des documents/medias orphelins (sweep dédié, déjà différé).
- Rendu public complet de la carte structurée (le drawer n'affiche pas encore les menus structurés — gap pré-existant).
- Migration de données : aucune (0 ligne cuisine/menu/document).

---

## 10. Critères d'acceptation

- **A** : sur une fiche RES sans menu, choisir des cuisines → persiste après save/rechargement ; 1ère = `position=1` ; `get_object_resource(RES).cuisine_types` reflète la sélection ; drawer affiche la cuisine sans menu ; « Française » + 14 nouveaux types sélectionnables.
- **B** : on peut créer une carte structurée — section + plats (nom/prix/description/régimes/allergènes) — qui persiste et se recharge ; le saver n'écrit plus de cuisine par plat.
- **C** : on peut déposer un PDF de carte (réel upload) attaché au restaurant, avec dates de validité ; il apparaît dans `get_object_resource.menu_documents` et le drawer ; le dropzone factice a disparu.
- §06 : 3 blocs distincts, notes §07/§14 en bas, plus de libellé « identité culinaire » trompeur.
- Suites Jest + tests SQL verts ; advisors propres (hors notices §36 attendues) ; gate fresh-apply vert.

---

## 11. Décisions internes actées

- **object_id = TEXT** sur les nouvelles tables (cohérent avec `object.id`).
- **#1** : table de lien **générique `object_document`** avec `role_id`→`ref_code_document_type` (seed `carte`), PDF attaché au **restaurant** ; plutôt qu'une table mono-usage.
- **#2** : éditeur plat = nom/prix/description/régimes/allergènes ; photo-par-plat différée ; cuisine-par-plat retirée.
- **#3** : table dédiée `object_cuisine_type` (pas `object_taxonomy`), avec `position`.
- **UI** compacte + modale (préférence PO) ; style maison (pas le crème/teal des mockups jetables).
