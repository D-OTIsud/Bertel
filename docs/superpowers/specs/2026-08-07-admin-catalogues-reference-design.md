# Administration générée des catalogues de référence — conception

- **Date** : 2026-08-07
- **Demande PO** : « il faut rajouter l'interface d'admin pour ce catalogue [`ref_legal_type`]. Mais ce
  serait bien que l'interface d'admin soit produite automatiquement pour tous les catalogues. » puis
  « il faut que tous soit classé et clair ».
- **Origine** : différé identifié en clôture de §209 (catalogue des documents juridiques) — ajouter une
  pièce au catalogue exigeait une migration.
- **Statut** : conception validée section par section, non implémentée.

---

## 1. Le problème

Le projet compte **101 catalogues de référence**, et un seul tiers d'entre eux est administrable :

| Espèce | Nombre | Administrable aujourd'hui |
|---|---|---|
| Domaines plats de `ref_code` | 52 | **oui** — `RefCodeEditor` (phase 7.5, §119) |
| Domaines taxonomiques de `ref_code` | 19 | non, et c'est voulu (triggers d'applicabilité + closure) |
| Tables `public.ref_*` autonomes | 30 | **non** |

L'éditeur existant est déjà générique *pour ce qu'il couvre* : il ne porte pas une ligne de code par
vocabulaire, il dérive son maître de la base. Le trou est ailleurs — les 30 tables autonomes, dont
`ref_legal_type`, `ref_amenity`, `ref_language`, `ref_classification_scheme`, n'ont aucune surface.

Ces 30 tables **n'ont pas la même forme** : 15 portent le quatuor `code`/`name`/`position`,
`ref_sustainability_action` n'a pas de colonne `name`, `ref_commune` n'a pas de `code`, et trois d'entre
elles ne sont que des matrices à deux colonnes. C'est ce qui rend « une interface pour tous les
catalogues » non trivial : tout ce qui s'appelle `ref_*` n'a pas la même nature.

---

## 2. Arbitrages PO

| Question | Décision | Conséquence assumée |
|---|---|---|
| Périmètre | **Tout `ref_*`**, sans liste blanche choisie a priori | Les cas sensibles (`ref_permission`, `ref_commune`, matrices) sont traités *dans* le système, par un verrouillage motivé et visible, pas par une exclusion silencieuse |
| Degré d'automatisme | **Hybride** : découverte automatique, exceptions déclarées | Une table `ref_*` créée demain apparaît le jour même ; son nom lisible et son rangement se saisissent |
| Retrait d'une valeur | **Suppression, uniquement à 0 référence** | Aucune colonne `is_active` ajoutée aux 26 tables qui n'en ont pas ; sortir une valeur déjà utilisée impose de la remplacer d'abord sur les fiches |
| Classement | **Par famille métier + rappel de la section de fiche** | Deux colonnes éditoriales par catalogue |
| Colonnes non rendables (`jsonb`, tableaux, géométrie) | **Masquées** | Voir la garde « ajout impossible » en §4.3 — sans elle, ce choix rendrait la création impossible *en silence* sur certains catalogues |
| Autorisation | **Superuser plateforme uniquement** | Les catalogues sont partagés par toutes les ORG : renommer une valeur la renomme pour tout le monde |
| Approche technique | **A — un RPC générique en SQL dynamique** | Voir §5 pour la discipline qui referme le risque |
| Journal d'audit des modifications | **hors périmètre** | Une valeur modifiée ne laisse pas de trace de son auteur ; à rouvrir si le besoin apparaît |

---

## 3. Architecture

Deux sources, une seule liste à l'écran. La séparation entre elles est ce qui rend le système à la fois
automatique et rangé.

### 3.1 `internal.v_ref_catalog` — la découverte (aucune configuration)

Vue d'introspection sur le catalogue PostgreSQL. Elle émet **deux espèces sous une forme unique** :

- `kind = 'table'` — une table `public.ref_*` autonome ;
- `kind = 'ref_code_domain'` — un domaine de `ref_code`, présenté comme un catalogue à part entière.

Pour chaque catalogue elle expose :

| Champ | Source | Sert à |
|---|---|---|
| `catalog_key` | nom de table, ou `ref_code:<domain>` | identifiant stable côté front et RPC |
| `columns[]` (nom, type, obligatoire, défaut, position) | `information_schema.columns` | générer les contrôles (§4) |
| `primary_key` | `pg_constraint` | cibler une ligne |
| `outgoing_fk[]` (colonne → catalogue cible) | `pg_constraint` | rendre une liste déroulante alimentée par l'autre catalogue |
| `incoming_fk[]` (table, colonne) | `pg_constraint` | compter « utilisé par N » et bloquer la suppression |
| `enum_values[]` | `pg_enum` | rendre une liste déroulante d'énuméré |

Rien de tout cela n'est écrit à la main : la base décrit sa propre forme.

### 3.2 `ref_catalog_registry` — l'éditorial (une ligne par exception)

Ne porte que ce que la base ne peut pas deviner :

| Colonne | Rôle |
|---|---|
| `catalog_key` (PK) | rattachement à la vue |
| `label` | nom lisible (« Documents juridiques », pas `ref_legal_type`) |
| `family` | famille métier — voir l'annexe A |
| `used_in` | section de fiche où le vocabulaire apparaît, ex. « §18 Juridique » (texte libre, nullable) |
| `label_column` | colonne de libellé quand ce n'est pas `name` (cas `ref_sustainability_action`) |
| `access` | `editable` (défaut) ou `readonly` |
| `readonly_reason` | **obligatoire si `access = 'readonly'`** — la phrase affichée à l'écran |
| `position` | ordre dans la famille |

**Une table absente du registre reste visible et éditable**, dans la famille « À classer ». C'est
délibéré : un catalogue oublié doit gêner, pas disparaître. Le registre ne peut que **restreindre**.

### 3.3 L'invariant de sécurité qui découle de cette séparation

> **La liste blanche du RPC d'écriture est la vue d'introspection, jamais le registre.**

Le RPC n'accepte d'écrire que dans une relation que `internal.v_ref_catalog` a reconnue comme catalogue
`public.ref_*`. Conséquences :

- un registre vide laisse le système fonctionnel (dégradé : noms techniques, tout dans « À classer ») ;
- un registre corrompu ou mal seedé **ne peut pas** ouvrir une écriture vers `object`, `auth.users` ou
  quoi que ce soit hors `public.ref_*` ;
- inverser les deux (allowlist = registre) transformerait une erreur de seed en élargissement de
  privilège. C'est le piège à ne pas recréer.

### 3.4 Verrouillages initiaux (seed du registre)

| Catalogue | `access` | `readonly_reason` |
|---|---|---|
| `ref_permission` | `readonly` | « Chaque code est lu en dur par le contrôle d'accès : en retirer un ferme des droits sans qu'aucun test ne rougisse. » |
| les 19 domaines `taxonomy_*` | `readonly` | « Les taxonomies sont régies par les triggers d'applicabilité et la closure de parenté. Elles s'éditent par migration. » |
| `ref_facet_registry`, `ref_facet_applicability` | `readonly` | « Registre type→facette : source de vérité du trigger `trg_assert_facet_applicable`. » |
| `ref_document` | `readonly` | « Ce ne sont pas des valeurs de vocabulaire mais les fichiers déposés par les rédacteurs. » |

`ref_commune` reste **éditable** (le PO a demandé « tout »), avec `used_in` = « filtre Commune de
l'Exploreur, §16 zones desservies » pour que l'écran dise à quoi la valeur sert avant qu'on y touche.

---

## 4. Le générateur : de la colonne au contrôle

### 4.1 Traduction par type

| Ce que dit la base | Contrôle rendu |
|---|---|
| `text` / `varchar` | champ texte |
| `text` accompagné d'un `<col>_i18n` en `jsonb` | champ texte + modale de traductions (celle de `RefCodeEditor`, réutilisée) |
| `boolean` | interrupteur |
| `integer` / `numeric` | champ nombre |
| `date` / `timestamptz` | champ date |
| colonne portant une clé étrangère | liste déroulante alimentée par le catalogue cible |
| type énuméré PostgreSQL | liste déroulante des valeurs de l'énuméré |
| `jsonb`, tableau, `geometry` | **masquée** |

Cette traduction est une **fonction pure** côté front (`buildCatalogFieldSpec`), testable sans DOM.

### 4.2 Colonnes verrouillées partout

`primary_key`, `created_at`, `updated_at`, et **`code`** — saisissable à la création puis figé, comme
dans `RefCodeEditor`. Un code est une identité stable : on le change par migration tracée
(cf. §209, où le renommage `liability_insurance` → `attestation_assurance` devait préserver l'`id` pour
emporter les lignes rattachées), jamais par inadvertance dans un formulaire.

### 4.3 Deux gardes qui découlent du masquage

**Ajout impossible plutôt qu'erreur.** Si un catalogue porte une colonne **obligatoire, sans valeur par
défaut, et non rendue** (masquée ou de type inconnu), le bouton « Ajouter » est désactivé et **nomme la
colonne fautive**. L'édition des lignes existantes reste possible. Sans cette garde, le choix « colonnes
masquées » produirait une erreur PostgreSQL brute à l'enregistrement — exactement le genre de panne
opaque que ce projet refuse.

**Suppression à zéro référence.** Le compteur additionne **toutes** les clés étrangères entrantes
découvertes, pas une choisie à la main. La corbeille s'active à 0 ; sinon elle affiche le nombre et
reste inerte. Le refus est **ré-évalué serveur** : l'UI grisée n'est pas la garde.

### 4.4 Les domaines `ref_code` ne sont pas réimplémentés

Le RPC générique reconnaît `kind = 'ref_code_domain'` et **délègue aux fonctions de la phase 7.5**
(`api.rpc_upsert_ref_code`, `rpc_set_ref_code_active`, `rpc_reorder_ref_code`, `rpc_delete_ref_code`),
déjà éprouvées et déjà gardées. Même écran, deux moteurs derrière ; l'utilisateur ne voit pas la couture.
`RefCodeEditor` est absorbé par le nouvel écran, pas conservé en double.

---

## 5. Écriture : le SQL dynamique et sa discipline

Quatre RPC, toutes `SECURITY DEFINER`, gated `api.is_platform_superuser()`, avec
`REVOKE ALL ON FUNCTION … FROM PUBLIC` explicite (PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut et
un `GRANT` ciblé ne le retire pas), `SET search_path = public, api, internal` et donc
`gen_random_uuid()` — jamais `uuid_generate_v4()`, non résolvable sous ce `search_path`.

| RPC | Rôle |
|---|---|
| `api.list_ref_catalogs()` | familles, catalogues, compteurs de valeurs, accès + motif |
| `api.get_ref_catalog(p_catalog_key)` | schéma de colonnes rendu, valeurs, compteur d'usage par ligne |
| `api.rpc_upsert_ref_row(p_catalog_key, p_id, p_values jsonb)` | création / édition |
| `api.rpc_delete_ref_row(p_catalog_key, p_id)` | suppression, refusée si référencée |

**Discipline, non négociable :**

1. La relation cible est résolue **contre la vue d'introspection**, jamais contre une chaîne fournie par
   l'appelant.
2. Chaque clé du payload est validée contre les colonnes réellement découvertes. **Une colonne inconnue
   fait échouer l'appel** — elle n'est pas ignorée. Une valeur silencieusement jetée est un piège
   d'écriture, le défaut que ce projet traque section par section depuis six mois.
3. Les identifiants passent par `format(%I)` ; les valeurs par des paramètres liés (`USING`). Aucune
   valeur n'est concaténée dans du texte SQL.
4. Le `code` d'une ligne existante présent au payload avec une valeur différente ⇒ `CODE_IMMUTABLE`.

Le flag advisor `0028/0029_*_security_definer_function_executable` sur ces RPC est **attendu** (classe
§36 : fonction publique-exécutable qui s'auto-autorise).

### 5.1 Erreurs typées

`FORBIDDEN`, `UNKNOWN_CATALOG`, `LOCKED_CATALOG` (+ motif), `UNKNOWN_COLUMN` (+ nom),
`CODE_IMMUTABLE`, `STILL_REFERENCED` (+ compte), `REQUIRED_HIDDEN_COLUMN` (+ nom).
L'écran affiche une phrase française ; une erreur PostgreSQL brute ne remonte jamais à l'utilisateur.

---

## 6. Front

- `src/views/RefCatalogAdmin.tsx` — maître/détail : familles (colonne), catalogues de la famille,
  valeurs du catalogue sélectionné. Remplace `RefCodeEditor` dans l'onglet « Référentiels » de
  `/settings`.
- `src/features/settings/catalog-fields.ts` — **pur** : `buildCatalogFieldSpec(columns, fks, enums)`
  → liste de contrôles ; `computeAddBlocked(columns, spec)` → `null` ou le nom de la colonne bloquante.
- `src/services/ref-catalogs.ts` — appels aux 4 RPC ; `src/services/ref-codes.ts` conservé (le RPC
  générique délègue, mais le front n'a plus à connaître la distinction).
- Recherche plein texte sur le nom de catalogue **et** sur les libellés de valeurs — c'est ce qui rend
  101 catalogues navigables.
- Invalidation : toute écriture invalide `REFERENCE_CATALOGS_QUERY_KEY` (cache de session 1 h,
  persisté), sinon les rédacteurs continuent de voir l'ancien vocabulaire jusqu'à expiration.

---

## 7. Tests

La garde qui compte n'est pas « le registre contient des lignes » — ça ne prouve rien.

**SQL — `tests/test_ref_catalog_admin.sql`, trois assertions non vacantes :**

1. **Cycle réel sur un catalogue témoin** : créer une valeur par `rpc_upsert_ref_row`, l'éditer,
   tenter de la supprimer alors qu'une ligne métier la référence (doit lever `STILL_REFERENCED` avec le
   compte), retirer la référence, supprimer (doit réussir).
2. **La liste blanche refuse vraiment** : un appel visant `object`, `auth.users` ou `staging.*` doit
   lever `UNKNOWN_CATALOG`. **C'est l'assertion de sécurité du fichier** — si elle disparaît, l'approche
   A devient une écriture arbitraire.
3. **Balayage des 101** : chaque catalogue découvert par la vue doit se lister par `get_ref_catalog`
   sans erreur. C'est ce qui attrape une table dont la forme casse le générateur (clé primaire
   composite, absence de clé primaire, type exotique).

Assertions complémentaires : un catalogue `readonly` refuse l'écriture ; `code` figé ⇒ `CODE_IMMUTABLE` ;
`access = 'readonly'` sans `readonly_reason` est rejeté par une contrainte `CHECK`.

**Front :** un test par type de colonne sur `buildCatalogFieldSpec` ; `computeAddBlocked` nomme la
colonne fautive ; le rendu affiche le motif de verrouillage d'un catalogue `readonly`.

**Vérification par sabotage** (exigence maison) : neutraliser la validation de colonne (point 2 de la
discipline) doit faire tomber le test 1 ; retirer la résolution par la vue doit faire tomber le test 2.

---

## 8. Hors périmètre

- Ajout d'une colonne `is_active` aux 26 tables qui n'en ont pas (arbitrage PO : suppression à 0
  référence). À rouvrir table par table, avec le balayage de ses lecteurs dans la même passe.
- Édition confortable des matrices d'applicabilité en cases à cocher. Elles apparaissent et sont
  éditables ligne à ligne (deux listes déroulantes) — suffisant, pas agréable.
- Journal d'audit des modifications de catalogue.
- Réordonnancement par glisser-déposer (les flèches monter/descendre de `RefCodeEditor` sont reprises).
- Traduction des libellés de catalogues eux-mêmes (le registre est en français).

---

## Annexe A — Classement initial

13 familles. Le classement est **éditorial** : il vit dans `ref_catalog_registry` et se corrige sans
migration de schéma. Un catalogue non classé apparaît dans « À classer ».

| Famille | Catalogues |
|---|---|
| Hébergement | `accommodation_family`, `accommodation_type`, `accommodation_unit_type`, `bed_type`, `room_type`, `ref_capacity_metric`, `ref_capacity_applicability` |
| Restauration | `cuisine_type`, `menu_category`, `dietary_tag`, `allergen` |
| Activités et itinéraires | `activity_type`, `event_type`, `iti_difficulty`, `iti_practice`, `iti_stage_kind`, `iti_open_status`, `trail_link_role`, `ref_iti_assoc_role`, `ref_trail_manager`, `ref_trail_source`, `ref_object_relation_type` |
| Équipements et cadre | `ref_amenity`, `amenity_family`, `meeting_equipment`, `service_type`, `view_type`, `environment_tag`, `assistance_type`, `ref_tag` |
| Labels, classements, durabilité | `ref_classification_scheme`, `ref_classification_value`, `ref_classification_scheme_applicability`, `ref_classification_equivalent_group`, `ref_classification_equivalent_action`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_sustainability_action_group` |
| Juridique et conformité | `ref_legal_type`, `insurance_type`, `document_type`, `ref_document` (verrouillé) |
| Personnes et organisations | `ref_contact_role`, `ref_actor_role`, `ref_org_role`, `ref_org_admin_role`, `ref_org_business_role`, `ref_permission` (verrouillé), `contact_kind`, `client_type`, `ref_language`, `language_level` |
| Tarifs et commercial | `price_kind`, `price_type`, `price_unit`, `payment_method`, `promotion_type`, `package_type`, `season_type`, `membership_tier`, `membership_campaign`, `partnership_type`, `distribution_channel`, `booking_status` |
| Relation client | `demand_topic`, `crm_sentiment`, `mood`, `feedback_type`, `ref_review_source` |
| Ouverture et temps | `opening_period_type`, `opening_schedule_type`, `weekday` |
| Médias et contenus | `media_type`, `media_tag`, `social_network` |
| Territoire | `ref_commune`, `destination_type`, `tourism_type`, `transport_type` |
| Structure (verrouillée) | les 19 domaines `taxonomy_*`, `ref_facet_registry`, `ref_facet_applicability`, `ref_code_domain_registry`, `ref_interop_crosswalk` |

Les matrices d'applicabilité ne sont pas toutes logées au même endroit, et c'est voulu :
`ref_capacity_applicability` et `ref_classification_scheme_applicability` vivent avec leur sujet et
restent **éditables** ; `ref_facet_applicability` est verrouillée car elle est la source de vérité du
trigger `trg_assert_facet_applicable` (invariant type→facette, CLAUDE.md).

---

## Annexe B — Ce que la maquette validée montre

Colonne des familles à gauche avec compteurs, « À classer » signalé en jaune ; liste des catalogues de
la famille au centre, chacun avec son nom lisible, son nom technique et son nombre de valeurs, un
catalogue verrouillé portant son motif en clair ; détail des valeurs en bas — libellé, code en
monospace, « utilisé par N fiches », édition et corbeille (grisée à N > 0). Les colonnes propres au
catalogue s'ouvrent dans la fiche de la valeur, pas dans la ligne du tableau.

La maquette affichait « 82 catalogues » : elle a été faite avant que les 19 domaines taxonomiques
soient intégrés à la liste en lecture seule. Le compte cible est **101**.
