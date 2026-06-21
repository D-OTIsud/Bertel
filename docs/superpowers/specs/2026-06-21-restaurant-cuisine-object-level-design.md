# Design — Cuisine restaurant : modèle niveau-objet, catalogue & correctif éditeur

- **Date** : 2026-06-21
- **Type** : object_type RES (restaurant) — modèle, SQL, éditeur, vocabulaire
- **Statut** : design approuvé (PO), prêt pour plan d'implémentation
- **Décision log** : à consigner dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (prochain §)

---

## 1. Problème

L'édition d'une fiche **restaurant** (BlockRES, §06 « Cuisine, cartes & service ») présente 4 défauts signalés par le PO :

1. **Libellé trompeur** — le titre `Identité culinaire` coiffe en réalité une note « géré en §07 » (politique de groupes / capacité), alors que le vrai champ cuisine est juste en dessous. L'utilisateur lit « identité culinaire gérée en §07 », ce qui est faux.
2. **Write-trap (bug central)** — choisir une « cuisine proposée » ne l'ajoute pas à la sélection. Les codes cuisine sont stockés sur `menus.items[0].items[0]` (le **premier plat du premier menu**) ; `onChange` fait `if (!firstMenu || !firstItem) return;`. Comme **aucun** restaurant n'a de menu ni de plat, la sélection est silencieusement jetée. Viole l'invariant CLAUDE.md « no silent write-traps ».
3. **Vocabulaire** — `cuisine_type` `metropolitan` s'affiche « Métropolitaine » ; le PO veut « Française ».
4. **Catalogue incomplet** — 29 types ; le PO veut l'enrichir (voisins océan Indien, européennes, asiatiques/américaines, formats tendance).

### Constat live décisif
`135 RES · 0 object_menu · 0 object_menu_item · 0 object_menu_item_cuisine_type` (toute la base).
⇒ Le champ est un write-trap pour **tous** les restaurants, et **0 donnée cuisine à migrer** : le modèle peut être corrigé proprement.

### Cause racine du bug #2
Le modèle attache la cuisine au **plat** (`object_menu_item_cuisine_type`) puis l'agrège vers l'objet. Déclarer « cuisine créole » exigerait de construire un menu complet avec des plats — absurde pour un attribut de base du restaurant.

---

## 2. Décision

La cuisine devient un **attribut du restaurant** (niveau objet), découplé des menus.

### Approche retenue (parmi 3)
- **A — Table niveau-objet `object_cuisine_type` (RETENUE).** Modèle correct ; marche sans menu ; 0 donnée à migrer. Coût : 1 table + RLS + ~3 fonctions repointées + 1 petit module front + 1 passe seed.
- B — Auto-créer un menu/plat caché. Rejetée : pollue le modèle menu, lignes fantômes dans « Cartes & menus ».
- C — Garder couplé aux menus, champ désactivé-avec-motif. Rejetée : la cuisine ne pourrait pas être saisie seule (mauvaise UX pour un attribut de base).

---

## 3. Schéma

```sql
CREATE TABLE IF NOT EXISTS object_cuisine_type (
  object_id       UUID NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  cuisine_type_id UUID NOT NULL REFERENCES ref_code_cuisine_type(id) ON DELETE CASCADE,
  position        INT  NOT NULL DEFAULT 1,   -- 1 = cuisine principale
  PRIMARY KEY (object_id, cuisine_type_id)
);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_object ON object_cuisine_type(object_id);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_type   ON object_cuisine_type(cuisine_type_id);
```

- **Forme** calquée sur `object_amenity` / `object_environment_tag` (descriptor-link générique `(object_id, ref_id)`). **Non** enrôlée dans `ref_facet_registry` : la cuisine est un descripteur (comme amenities/tags), pas une facette type-spécifique du registre. Le gating « RES uniquement » est porté par l'éditeur (BlockRES = bloc RES), pas par un trigger DB — même précédent que amenities/tags.
- **`position`** porte « la 1ère = cuisine principale » (ordre de sélection dans le ChipMultiSelect).

> Note : on suit la *forme* de table d'`object_amenity`, **mais pas** sa policy de lecture héritée `USING(true)` — voir §4 (invariant §38).

---

## 4. RLS (invariants CLAUDE.md §38 / per-command)

Sur `object_cuisine_type` :

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
- **Lecture** — forme split §38 (pas `USING(true)`) :
  ```
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_cuisine_type.object_id AND o.status = 'published'))
  OR object_cuisine_type.object_id IN (SELECT api.current_user_extended_object_ids())
  ```
- **Écriture** — famille per-command (pas de FOR ALL) :
  `canonical_ins/upd/del_object_cuisine_type` avec prédicat `api.user_can_write_object_canonical(object_cuisine_type.object_id)` (qualifier la colonne externe — invariant silent-rebinding).
- **Gotcha P0.3** : `GRANT EXECUTE` sur le prédicat d'écriture est déjà global à `anon`/`authenticated` ; ajouter `GRANT SELECT ON object_cuisine_type TO anon, authenticated, service_role`.

---

## 5. Consommateurs SQL repointés (source unique de vérité)

Tous lisent désormais `object_cuisine_type` au lieu de l'agrégat menu-plat.

1. **`api.get_object_resource`** — clé objet `cuisine_types` (bloc RES, ~lignes 4257-4274 de `api_views_functions.sql`) :
   ```sql
   SELECT jsonb_agg(jsonb_build_object('id',ct.id,'code',ct.code,'name',ct.name,
                                       'description',ct.description,'position',ct.position)
                    ORDER BY oct.position, ct.position, ct.name)
   FROM object_cuisine_type oct
   JOIN ref_code_cuisine_type ct ON ct.id = oct.cuisine_type_id
   WHERE oct.object_id = obj.id
   ```
   `api.get_object_with_deep_data` hérite verbatim (bloc `object` = `get_object_resource`, memory §101) — **aucune** édition séparée.
2. **FMA `associated_restaurants_cuisine_types`** (~4310-4333) — lit `object_cuisine_type` des restaurants partenaires (`object_relation` `partner_of`) au lieu de leurs plats.
3. **`api.search_restaurants_by_cuisine`** (~6006) et **`api.search_events_by_restaurant_cuisine`** (~6119) — repointées sur `object_cuisine_type`. (Vérifier les appelants front ; repointer quoi qu'il en soit pour la cohérence. `cuisine_counts` = nb de plats par cuisine n'a plus de sens au niveau objet → soit supprimé, soit recalculé comme présence 0/1 ; trancher au plan.)

> La clé `cuisine_types` **nichée par menu** (dans le bloc `menus`, ~4127 et ~4194) reste inchangée : elle décrit les plats d'un menu donné et garde son sens si des menus existent un jour. Le bug ne la concerne pas.

---

## 6. Frontend — module `cuisine` découplé

- **Loader** `loadObjectWorkspaceCuisine(objectId)` (`object-workspace.ts`) : selects directs sur `object_cuisine_type` (codes ordonnés par `position`) + catalogue `ref_code` `domain='cuisine_type'` → `{ codes: string[], options: WorkspaceReferenceOption[], unavailableReason? }`. **Indépendant** du loader `menus` (la cuisine marche sans menu).
- **Saver** `saveObjectWorkspaceCuisine` : delete-all puis reinsert des `object_cuisine_type` avec `position = index+1` (comme les autres link-tables). Garde-fou `unavailableReason` ⇒ no-op (pas de clobber sur load échoué).
- **Parser/types** (`object-workspace-parser.ts`) : nouveau `ObjectWorkspaceCuisineModule` ; champ `cuisine` ajouté à la draft de l'éditeur.
- **BlockRES** : « Cuisines proposées » bind sur `editor.draft.cuisine.codes` / `.options` → **plus de write-trap**. La cuisine ne touche plus `menus.items[0].items[0]`.

---

## 7. Correctif UX libellé (#1) — réorganisation §06 BlockRES

Ordre cible :
1. **« Identité culinaire » → champ « Cuisines proposées »** en premier (la vraie identité culinaire), bind sur le module `cuisine`.
2. **« Cartes & menus (PDF) »** ensuite (repeater menus inchangé).
3. Les notes **`OwnedElsewhereNote` §07 (Capacité & accueil)** et **§14 (Horaires)** descendent en bas, regroupées comme pointeurs « géré ailleurs » — plus jamais sous un titre « identité culinaire ».

---

## 8. Catalogue `ref_code` `cuisine_type` (#3 + #4)

- **Renommage** : `metropolitan` → `name` « **Française** » (code conservé stable ; 0 donnée). Description ajustée (« Cuisine française »).
- **+14 codes** (FR, cohérent avec italienne/japonaise/…) :
  - Océan Indien : `mauricienne` (Mauricienne), `malgache` (Malgache), `seychelloise` (Seychelloise), `sino_reunionnaise` (Sino-réunionnaise).
  - Européennes : `creperie` (Crêperie), `pizzeria` (Pizzeria), `savoyarde` (Savoyarde), `grecque` (Grecque).
  - Asie & Amériques : `vietnamienne` (Vietnamienne), `coreenne` (Coréenne), `mexicaine` (Mexicaine / Tex-Mex).
  - Tendances & formats : `healthy` (Healthy / Poké), `bar_a_vin` (Bar à vin & tapas), `cafe` (Café & brunch).
- Salon de thé déjà couvert par `patisserie` → non dupliqué.
- `position` attribuée pour un ordre d'affichage cohérent (créole/française/traditionnelle en tête).

---

## 9. Déploiement & tests

- **Manifeste step `14t`** : `migration_object_cuisine_type.sql` (table + index + RLS per-command + grants) ; appliqué **live via MCP**, puis **foldé** dans `schema_unified.sql` (table/index) + `rls_policies.sql` (RLS/grants) + `api_views_functions.sql` (fonctions repointées) + seed dans `seeds_data.sql`. Ajout au `docs/SQL_ROLLOUT_RUNBOOK.md` (manifeste + section incrémentale).
- **Tests SQL** (`Base de donnée DLL et API/tests/test_object_cuisine_type.sql`) : RLS read-gate (anon ne voit pas la cuisine d'un draft ; published OK ; org-member voit son draft), write per-command, `get_object_resource.cuisine_types` lit le niveau objet.
- **Tests Jest** : loader/saver cuisine (round-trip, ordre `position`, garde-fou `unavailableReason`) ; BlockRES (sélection persistée, plus de no-op).
- **Gate fresh-apply CI** doit rester vert (fresh == live).
- **Décision log** + MCP memory mis à jour.

---

## 10. Hors-scope (YAGNI)

- Pas d'enrôlement `ref_facet_registry` (descripteur, pas facette type-spécifique).
- Pas de trigger DB « RES-only » (gating éditeur suffit, précédent amenities/tags).
- La clé `cuisine_types` nichée par menu reste telle quelle.
- i18n des nouveaux codes cuisine : différé (FR-fallback au lancement, cohérent avec la dette i18n existante).
- Migration de données : aucune (0 lien cuisine).

---

## 11. Critères d'acceptation

- Sur une fiche RES sans menu, choisir une/des cuisine(s) → la sélection persiste après save et au rechargement ; la 1ère est principale (`position=1`).
- `get_object_resource(RES).cuisine_types` reflète la sélection niveau-objet.
- Le drawer public affiche les cuisines du restaurant sans qu'il ait de menu.
- « Française » s'affiche (plus « Métropolitaine ») ; les 14 nouveaux types sont sélectionnables.
- §06 : « Cuisines proposées » en tête, notes §07/§14 en bas, plus de titre « identité culinaire » trompeur.
- Suite Jest + tests SQL verts ; advisors propres (hors notices §36 attendues) ; gate fresh-apply vert.
