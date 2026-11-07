# Refonte Éditeur Section 06 — Itinéraire (tracé, étapes & praticabilité)

- **Date** : 2026-06-22
- **Statut** : design validé (PO « oui au découpage A/B/C, oui au vocab, Boucle dans Infos pratiques »)
- **Surface** : `bertel-tourism-ui` — éditeur pleine page `/objects/[id]/edit`, Section 06, objets `ITI` uniquement
- **Liens** : décision log `lot1_mapping_decisions.md` §28 (modèle ITI greenfield), §48 (audit éditeur, dropzone GPX désactivée), Markdown Delivery 2 (`object_iti_stage.description` inline)

---

## 1. Contexte & problème

`BlockITI.tsx` (Section 06) souffre aujourd'hui de plusieurs défauts vérifiés :

- **Import GPX désactivé** : dropzone `aria-disabled`, géométrie « import-only » (§48). `object_iti.geom` n'a aucune voie d'écriture éditeur.
- **Steppers morts** : les boutons +/− de `StatCard` sont câblés `disabled`, sans handler (placeholder).
- **Write-traps** : `Difficulté` est un `<input>` texte libre alors que `object_iti.difficulty_level` est un `INTEGER CHECK (1..5)` ; `Statut d'ouverture` est un input libre alors que la colonne est `TEXT CHECK IN ('open','closed','partially_closed','warning')`.
- **Pratiques** : mur de chips permanent (fonctionnel mais à ranger derrière un bouton→modal pour cohérence UI).
- **Étapes plates** : lignes `nom / position / description` ; pas de point GPS (le RPC **ignore** `object_iti_stage.geom`), pas de médias dans l'UI, pas de type explicite (D/A déduit de la position).
- **Manques modèle** : `object_iti_info` (infos pratiques) n'est éditable nulle part ; `object_iti_associated_object` (objets liés) non plus.

**État live (vérifié 2026-06-22)** : 1 seul objet `ITI`, **0** ligne `object_iti` / stage / stage_media / associated_object. `ref_iti_assoc_role` = **0 ligne (non seedé)**. Terrain totalement greenfield : aucun risque de migration de données.

**Acquis backend réutilisables** :
- Trigger `trg_cache_iti_track` (BEFORE INS/UPD `object_iti`) régénère déjà `cached_gpx` / `cached_kml` via `ST_AsGPX` / `ST_AsKML` dès que `geom` change.
- `save_object_itinerary_nested` accepte déjà les **médias d'étape** (`stages[].media[]`) et les **objets associés** (`associated_objects[]`, rôle par `role_id` **ou** `role_code`).
- MapLibre + react-map-gl, `@dnd-kit` (`SortableList`), `EditorModal`, `MediaUploadField` (→ `/api/media/upload`) sont installés et éprouvés.

**Manque côté front** : parseur GPX/KML, util distance point↔ligne (corridor).

---

## 2. Décisions verrouillées

| Fork | Décision |
|------|----------|
| Import GPX/KML | **Tracé + métriques auto** : écrit `geom`, calcule distance / dénivelé +/− / profil côté serveur (PostGIS). Steppers = correction manuelle. |
| Points d'intérêt | **Étapes inline typées** (`object_iti_stage`, point GPS + photos + type) **ET** bloc séparé **Objets liés** (`object_iti_associated_object`). |
| Zone de placement | **Corridor auto autour du tracé, largeur réglable** (curseur, défaut 50 m). Garde-fou d'édition **non persisté**. Pas de tracé → placement libre. |
| Infos pratiques | **Oui**, surfacer `object_iti_info`. |
| Boucle (`is_loop`) | Regroupé visuellement dans **Infos pratiques** avec les autres booléens (persiste toujours dans `object_iti`, pas dans `object_iti_info`). |

---

## 3. Architecture & découpage (3 phases livrables séparément)

### Phase A — Fondations backend (bloquant pour B/C)

**A1 — Seeds de vocabulaire** (`migration_iti_section06_vocab.sql`, idempotent `ON CONFLICT DO NOTHING`) :

- `ref_iti_assoc_role` : `sur_le_parcours`, `a_proximite`, `point_de_depart`, `hebergement_etape`, `restauration`, `parking`, `point_interet`, `prestataire`.
- `ref_code` domaine `iti_difficulty` : codes `1`..`5` → Très facile / Facile / Moyen / Difficile / Très difficile.
- `ref_code` domaine `iti_open_status` : `open`/`partially_closed`/`warning`/`closed` → Ouvert / Partiellement fermé / Vigilance / Fermé.
- `ref_code` domaine `iti_stage_kind` : `depart`, `etape`, `point_interet`, `point_eau`, `panorama`, `parking`, `ravitaillement`, `arrivee`.

**A2 — Nouvel RPC `api.set_itinerary_track(p_object_id text, p_payload jsonb)`** (`SECURITY INVOKER`, `SET search_path = public, api, internal`, garde `internal.workspace_assert_can_write_object(p_object_id)`, UUID via `gen_random_uuid()`) :

- Entrée : `{ "geojson": <LineString GeoJSON, 2D ou 3D Z=altitude> }` ou `{ "geojson": null }` (effacement).
- Effacement : `UPDATE object_iti SET geom = NULL` (le trigger remet caches NULL) + vide `object_iti_profile`, remet `distance_km/elevation_*` à NULL.
- Écriture : `geom := ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326)::geography(LineString,4326)` (upsert `object_iti` sur `object_id`). Le trigger régénère `cached_gpx/kml`.
- **Métriques serveur** (source de vérité, pas de maths client) :
  - `distance_km := round(ST_Length(geom)::numeric / 1000, 2)`.
  - `elevation_gain` / `elevation_loss` : parcours ordonné des points 3D (`ST_DumpPoints` + `ST_Z`), somme des deltas positifs/négatifs (NULL si géométrie 2D).
  - `object_iti_profile` : reconstruit par échantillonnage (distance cumulée `position_m`, `elevation_m`) — borné à ~300 points (downsample si plus).
- Retour : `{ success, distance_km, elevation_gain, elevation_loss, profile_points, has_3d }`.

**A3 — Débloquer le point d'étape** dans `api.save_object_itinerary_nested` :

- Le bras `stages` cesse d'ignorer `geom` : si un stage porte `lng`/`lat` (ou `geojson` point), écrire `object_iti_stage.geom := ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography` ; si absent → `NULL`.
- Passer `extra` tel quel (déjà inséré) — le front y place `{ "kind": "<code>" }`.
- Aucun changement pour `media[]` (déjà supporté) ni `associated_objects[]` (déjà supporté).

**A4 — Lecture (`api.get_object_resource`, bloc `itinerary_details`)** :

- Émettre le **tracé en GeoJSON** pour MapLibre (réutiliser/étendre `api.get_itinerary_track_geojson`) sous une clé stable (`itinerary_details.track_geojson`).
- Émettre par étape ses **coordonnées** : `lng := ST_X(geom::geometry)`, `lat := ST_Y(geom::geometry)` (NULL si pas de point) — `to_jsonb(stage)` seul ne sort pas `geom` exploitable.
- `object_iti_info` est déjà émis (`itinerary_details.info`). `associated_objects` déjà émis.

**A5 — Libs front** : ajouter `@tmcw/togeojson` (parse GPX/KML→GeoJSON) + modules `@turf` (`@turf/point-to-line-distance`, `@turf/nearest-point-on-line`, `@turf/buffer`) pour le corridor.

### Phase B — Layout & contrôles (frontend, après A)

- **B1 layout** : carte large MapLibre en haut (affiche `track_geojson`) + zone d'import GPX à gauche (**drag&drop ET bouton**). Suppression de la bande « Type de tracé » sous la carte.
- **B2 steppers** : `StatCard` accepte `onStep?(delta)` ; quand fourni, les boutons +/− sont actifs + saisie directe. Pas : distance ±0,5 km, durée ±15 min, dénivelé ±10 m. Valeurs auto-remplies à l'import, éditables.
- **B3 selects** : `Difficulté` et `Statut d'ouverture` deviennent des `ReferenceSelect` alimentés par `iti_difficulty` / `iti_open_status` (l'éditeur écrit l'entier 1-5 / le code). Fin des write-traps.
- **B4 pratiques** : bouton « Ajouter des pratiques » → `EditorModal` (16 pratiques en cases). Save inchangé (`practiceCodes`).
- **B5 Infos pratiques** : bloc `object_iti_info` (accès / ambiance / parking conseillé / équipement requis) + toggles **« Adapté aux enfants »** (`is_child_friendly`) et **« Tracé en boucle »** (`is_loop`). Texte simple (hors scope Markdown D2). Persistance : `is_loop`→`buildItineraryUpsertPayload`, le reste→`save_object_itinerary_nested({ info })`.

### Phase C — Étapes & objets liés (frontend, après A)

- **C1 cartes étapes** : `SortableList` (drag&drop), cartes collapsables — icône par `kind`, nom, miniature (1ʳᵉ photo), position ; dépliée → description + médias + « sur le tracé · N m ». Réordonnancement met à jour `position`.
- **C2 modale d'étape** (`StageEditModal` sur `EditorModal`) couvrant tout le modèle :
  - **Type** (`ReferenceSelect` `iti_stage_kind`) → `extra.kind`.
  - **Nom**.
  - **Description** en `MarkdownEditor` **inline** (adopte le champ Markdown Delivery 2 ; pas un conflit).
  - **Photos** : `MediaUploadField` → `/api/media/upload`, liées via `media[]` du payload stage.
  - **Point GPS** : carte MapLibre montrant `track_geojson` + marqueur déposable/déplaçable. **Corridor** = bande tampon autour du tracé (turf buffer, curseur de largeur, défaut 50 m) rendue translucide ; validation par `pointToLineDistance ≤ largeur` ; hors corridor → refus + feedback. Pas de tracé → placement libre. Sortie : `lng`/`lat`.
- **C3 objets liés** (`AssociatedObjectsBlock`) : liste + « Ajouter un objet lié » → modale (picker d'objet existant façon §15/§19 + `ReferenceSelect` `ref_iti_assoc_role` + note). Réconcilié par `save_object_itinerary_nested({ associated_objects })` (delete+reinsert déjà en place).

---

## 4. Flux de données

1. **Import** : fichier → parse client (`togeojson`) → GeoJSON LineString (Z si `<ele>`) → `api.set_itinerary_track` → `object_iti.geom` (+caches via trigger) + distance/dénivelé/profil serveur → rechargement `get_object_resource` → carte + steppers remplis.
2. **Étape** : modale → payload `{ id?, name, description, position, extra:{kind}, lng?, lat?, media:[{media_id,position}] }` → `save_object_itinerary_nested({ stages })` (delete+reinsert, écrit désormais `geom`).
3. **Lecture** : `get_object_resource` → `itinerary_details` { info, track_geojson, stages[{…, lng, lat, media[]}], associated_objects[], practices[], profiles[] }.

---

## 5. Vocabulaires (final, seedés Phase A)

**`ref_iti_assoc_role`** : sur_le_parcours · a_proximite · point_de_depart · hebergement_etape · restauration · parking · point_interet · prestataire.
**`iti_difficulty`** (1-5) : Très facile · Facile · Moyen · Difficile · Très difficile.
**`iti_open_status`** : Ouvert (open) · Partiellement fermé (partially_closed) · Vigilance (warning) · Fermé (closed).
**`iti_stage_kind`** : depart · etape · point_interet · point_eau · panorama · parking · ravitaillement · arrivee.

---

## 6. Gestion des erreurs / cas limites

- **Import** : fichier non GPX/KML, pas de trace dans le fichier, trace vide, trace 2D (dénivelé NULL, non bloquant) → message clair, pas d'écriture partielle.
- **Corridor** : clic hors corridor → marqueur refusé (ne bouge pas) + indication « au-delà de N m du tracé ». Pas de tracé importé → placement libre (corridor masqué).
- **Autorisation** : `set_itinerary_track` et l'écriture stage-geom passent par `workspace_assert_can_write_object` (même garde que les autres écritures canoniques).
- **Selects** : valeur absente du vocab (donnée legacy) → afficher la valeur brute sans casser le rendu.
- **`unavailableReason`** (gate §46 type→facette) : carte/contrôles masqués (`ModuleUnavailableNotice`), savers refusent en défense ; comportement inchangé.

---

## 7. Tests

**SQL (CI `tests/`)** :
- `test_iti_section06_vocab.sql` : présence des 4 jeux de seeds + unicité `(domain,code)` / `ref_iti_assoc_role(code)`.
- `test_set_itinerary_track.sql` : écriture geom (LineString 2D & 3D), distance ≈ `ST_Length`, dénivelé +/− sur un Z connu, profil borné, effacement (geom/caches/profil NULL), garde d'autorisation, round-trip via `get_object_resource.track_geojson`.
- `test_iti_stage_geom_roundtrip.sql` : `save_object_itinerary_nested` écrit `object_iti_stage.geom` + `extra.kind` ; relu par `get_object_resource` (lng/lat).

**Front (Jest, TDD avant impl)** :
- builders/parsers : `buildItineraryUpsertPayload` (inchangé), nouveau `buildStagePayload` (kind/lng/lat/media), parseur stage (lng/lat/kind), `parseTrackGeojson`.
- `StatCard` stepper (onStep), selects difficulté/statut (mapping vocab), modale pratiques, util corridor `isInsideCorridor(point, line, widthM)` + `nearestOnLine`, réconcilie objets liés.
- composants : `StageEditModal`, `AssociatedObjectsBlock`, `BlockITI` recomposé (specs de rendu/honnêteté des contrôles).

**Live** : l'unique ITI (`test iti`) sert de banc — import d'un GPX réel, métriques vérifiées vs `ST_Length`, une étape avec point + photo, un objet lié.

---

## 8. Hors scope / différés

- Édition des **sous-sections** `object_iti_section` (non demandée).
- Strip des métadonnées **vidéo** d'étape (limite existante `process-video.ts`).
- Reconcile non destructif des stages (le delete+reinsert reste ; cascade `object_iti_stage_media` détruite à chaque save — différé existant, OK tant que le front renvoie l'arbre complet).
- `iti_stage_kind` stocké dans `extra.kind` (pas de colonne) — promotion en colonne si l'attribut devient porteur (filtrage Explorer).
- Markdown sur les champs `object_iti_info` (hors scope Delivery 2).

## 9. Invariants (nouveaux / impactés)

- **Toute** écriture de géométrie ITID passe par `api.set_itinerary_track` (tracé) ou `api.save_object_itinerary_nested` (point d'étape) — jamais d'écriture `geom` directe ; `save_object_itinerary_nested` n'ignore plus le geom d'étape.
- `ref_iti_assoc_role` doit être seedé avant tout `object_iti_associated_object` (sinon FK 23503).
- Difficulté / statut d'ouverture pilotés par vocab DB (`iti_difficulty` / `iti_open_status`), plus de saisie libre.
- Type d'étape canonique = `iti_stage_kind` ; marqueur carte + icône carte dérivés du type (remplace le D/A positionnel).
- Toute table object-attachée nouvellement éditable doit rester émise par un RPC consommateur (§101/§103) — ici via `get_object_resource.itinerary_details`.
