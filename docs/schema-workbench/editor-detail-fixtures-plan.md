# Plan de fixtures éditeur / fiche détail

**Objectif** : couvrir les états de l'UI d'édition et de la fiche détail pour QA, démos et tests d'intégration.
**Source live** : `live-tables.csv`, `live-columns.csv`, `live-foreign-keys.csv` (cf. `docs/schema-workbench/`)
**Date** : 2026-05-19

---

## Principes

1. **Pas de modification DB** : ces fixtures sont des **fichiers de seeding** (TS / SQL / CSV) générés à part, pas des mutations directes.
2. **Données réalistes mais synthétiques** : préfixe ID standardisé (ex. `FXT-…` ou `TEST-…`) pour pouvoir purger.
3. **Couverture des types sous-représentés** : priorité aux types avec 0 ou très peu de lignes en base (HPA, ITI, FMA, VIL, ASC, PCU, PNA, RVA, et marginalement CAMP/HOT/ORG).
4. **i18n** : minimum FR + EN par champ traduisible (sauf scénario « legacy-imported » qui n'a que FR).
5. **Modération** : chaque fixture précise si elle expose un `pending_change` en cours.

---

## Matrice des fixtures (12 scénarios)

| ID | Scénario | Type cible | Onglets à exercer | Critères d'inclusion |
|---|---|---|---|---|
| F-01 | Objet complet | HOT | A1-A4, B1-B5, C1-C7, D1-D4, D6, E5 | Toutes les sections renseignées, multilingue FR/EN, médias multiples, prix saisonniers, période d'ouverture annuelle, distinctions, audits + incidents, légal valide |
| F-02 | Objet sparse | LOI | A1, B1, B2 (FR seul), B3 (1 média) | Minimum viable pour publication — détecte les chemins « pas de données » |
| F-03 | Legacy-imported | RES | A4, B1, B2, C5 | Données issues de l'import historique (origine = legacy), `object_origin.source_code` peuplé, pas d'i18n EN |
| F-04 | Duplicate-contact | HOT | B4, D2 | Deux `contact_channel` du même type (`email`) sur le même objet — UI doit signaler la duplication |
| F-05 | Missing-media | RES | B3 | Objet sans média principal (`is_main = false` partout ou aucun média) — UI doit afficher placeholder et CTA d'upload |
| F-06 | Missing-description | ACT | B2 | `object_description` absent ; UI doit présenter l'état vide et l'invitation à compléter |
| F-07 | Incomplete opening period | RES | C6 | `opening_period` créée mais sans `opening_time_period_weekday` complet (ex. seulement lundi) — détecte les bugs de rendu calendrier |
| F-08 | Accessibility labels | HOT | C2, C4, E5 | `object_classification` avec schéma « Tourisme & Handicap » sur 2 handicaps + `object_room_type.is_accessible=true` sur 1 chambre |
| F-09 | Itinéraire | ITI | A1-A4, B1-B3, E1 (toutes sous-tables) | Tracé GPS complet, étapes, sections, profil altimétrique, pratiques multi (rando + VTT), associés (refuge + point d'eau) |
| F-10 | Accommodation | HLO | A1, B1-B4, C1-C6, E5 | HLO avec 3 `object_room_type` (studio, T2, T3), capacités, prix par période, photos chambres |
| F-11 | Restaurant | RES | A1, B1-B4, C1, C5-C6, E4 | Menu actif (déjeuner + dîner), 8 plats, allergènes croisés, 3 types de cuisine, tags végétariens et vegan |
| F-12 | Activity | ACT | A1, B1-B4, C1, C4-C6, E2 | Activité « canyoning » : durée, jauge, âge mini, niveau, équipement fourni, guide rattaché via `actor_object_role` |

---

## Détail par fixture

### F-01 — Objet complet (HOT)

**But** : valider chaque onglet en condition maximaliste.

**Données minimales** :
- `object` : `object_type=HOT`, `status=published`, `commercial_visibility` activé, `business_timezone='Europe/Paris'`, `region_code` réel
- `object_description` : FR + EN, version `object_place_description` pour 1 sous-lieu
- `object_private_description` : 1 note interne
- `object_location` : 1 GPS + adresse structurée
- `object_place` : 2 sous-lieux (« Aile Sud », « Restaurant ») + `object_place_description` pour chacun
- `object_zone` : 1 polygone
- `media` : 6 médias dont 1 `is_main=true`, 2 scopés à `place_id`, 1 à `object_room_type_id` via `object_room_type_media`
- `contact_channel` : tel + email + web + 2 réseaux sociaux
- `actor` + `actor_object_role` : 3 acteurs (directeur, commercial, technique)
- `actor_consent` : consentements RGPD pour chaque acteur
- `object_org_link` : rattachement à une ORG (cf. F-09 ou ORG dédiée)
- `object_amenity` : 12 amenities sur 3 familles
- `object_language` : FR, EN, IT
- `object_payment_method` : CB, espèces, chèque
- `object_environment_tag` : « montagne », « village »
- `object_classification` : 1 étoile (4★), 1 label environnemental, 1 label accessibilité (cf. F-08)
- `object_capacity` : capacité totale + capacité chambres
- `object_group_policy`, `object_pet_policy`
- `object_price` + `object_price_period` (basse / haute saison) + `object_discount` (early booking)
- `opening_period` + `opening_schedule` + `opening_time_period` + `opening_time_period_weekday` (toute l'année, 7j/7)
- `object_legal` : licence + assurance valides
- `object_review` : 5 avis importés (sources variées)
- `object_membership` : 1 adhésion active à une campagne
- `object_room_type` × 3 + `object_room_type_amenity` + `object_room_type_media`
- `object_meeting_room` × 2 + `meeting_room_equipment`
- `audit_session` × 1 récente + `audit_result` détaillé
- `incident_report` × 1 résolu
- `pending_change` × 1 sur description EN (état « pending ») pour exercer la vue modération
- `publication` : 1 publication print active

**Anti-patterns détectables** : champ tronqué, pagination sur listes (médias, prix), perf chargement complet.

---

### F-02 — Objet sparse (LOI)

**But** : valider le rendu « champ vide » + ergonomie de complétion.

**Données minimales** :
- `object` : `object_type=LOI`, `status=draft`
- `object_description` : FR uniquement, 1 phrase
- `object_location` : GPS + adresse mais pas de `object_place`
- `media` : 1 média, pas de tag, pas de `is_main`
- Tout le reste : VIDE

**À tester** : tous les onglets B/C/D/E doivent gérer absence sans crasher.

---

### F-03 — Legacy-imported (RES)

**But** : exercer le flux d'import historique et la coexistence ancien/nouveau.

**Données minimales** :
- `object_origin` : source = `'berta2'` ou équivalent, `imported_at` ancien
- `object_external_id` : 1 ID externe legacy
- `object` : créé via flow staging (ID préfixé selon `api.generate_object_id`)
- `object_description` : FR uniquement (pas d'i18n)
- `contact_channel` : tel sans format normalisé (pour exercer `enforce_contact_email_shape` / vérifs)
- `object_price` : prix saisis « à la main » sans `price_period`
- `pending_change` : 1 enrichissement proposé via le module old-data enrichment

**À tester** : badge « legacy », bouton « enrichir », modale d'origine, divergence de format.

---

### F-04 — Duplicate-contact (HOT)

**But** : exercer la détection de doublons et le merge UX.

**Données minimales** :
- `object` : HOT existant
- `contact_channel` × 3 :
  - email = `info@hotel.example` (kind=email, role=public)
  - email = `info@hotel.example` (kind=email, role=reservation)  → doublon explicite à signaler
  - tel = identique sur 2 canaux

**À tester** : signal visuel, action « fusionner », blocage publication.

Voir aussi : `api.prevent_duplicate_actor_email` (côté acteur, pas contact_channel).

---

### F-05 — Missing-media (RES)

**But** : exercer l'état vide média + CTA upload.

**Données minimales** :
- `object` : RES complet par ailleurs
- `media` : aucune ligne pour cet objet
- (alternative : 2 médias mais aucun avec `is_main=true` ni `position=1`)

**À tester** : placeholder, bouton upload primaire, lecture `api.get_media_for_web` qui retourne vide.

---

### F-06 — Missing-description (ACT)

**But** : exercer l'état vide description.

**Données minimales** :
- `object` : ACT créé mais `object_description` absent et `object_private_description` absent
- `object_iti_info.access` non applicable (type ACT, pas ITI)

**À tester** : badge « incomplet », blocage publication, RPC `user_can_publish_object` doit refuser.

---

### F-07 — Incomplete opening period (RES)

**But** : exercer la robustesse du composant arbre horaires.

**Données minimales** :
- `opening_period` : période créée
- `opening_schedule` : 1 schedule
- `opening_time_period` : 1 tranche définie
- `opening_time_period_weekday` : **seulement lundi et mardi**, jours restants absents
- `opening_time_frame` : absent

**À tester** : `api.is_object_open_now` retourne correct, vue calendrier sans crasher, badge « horaires partiels ».

---

### F-08 — Accessibility labels (HOT)

**But** : exercer le bloc C2 distinctions + accessibilité fragmentée (cf. G-A11Y-1).

**Données minimales** :
- `object_classification` × 2 : schéma « Tourisme & Handicap » avec deux valeurs (mental, moteur)
- `object_room_type` × 2 dont 1 avec `is_accessible=true`
- `object_room_type_amenity` : amenities accessibilité (ascenseur, rampe, etc.) via `ref_amenity` famille `assistance`
- `object_iti_info` : N/A (type HOT, pas ITI)
- `ref_code_assistance_type` : référencé par au moins une amenity

**À tester** : agrégation côté UI (puisqu'il n'y a pas de bloc unifié en DB) ; rendu badges accessibilité ; recherche via `api.search_objects_by_label`.

---

### F-09 — Itinéraire (ITI)

**But** : couvrir le module E1 dans son intégralité — type ITI ayant **0 donnée live**.

**Données minimales** :
- `object` : `object_type=ITI`, `status=published`
- `object_iti` : distance 12.5km, dénivelé +650/-650, durée 4h, type boucle, sens unique
- `object_iti_stage` × 4 : départ, étape 1, étape 2, retour
- `object_iti_stage_media` : 1 photo par étape
- `object_iti_section` × 3 : montée / plat / descente
- `object_iti_info` : accès (text + i18n), parking, recommandations, équipement, eau, restauration, **et test du champ `access` accessibilité**
- `object_iti_profile` : profil altimétrique
- `object_iti_practice` × 2 : pédestre + VTT
- `object_iti_associated_object` × 2 : 1 refuge (rôle hébergement étape) + 1 point d'eau (rôle service)
- `media` : track GPX uploadé

**À tester** : `api.build_iti_track`, `api.get_itinerary_track_geojson`, `api.export_itinerary_gpx`, rendu carte, profil altimétrique.

---

### F-10 — Accommodation (HLO)

**But** : exercer le scénario locatif réaliste (type majoritaire en base).

**Données minimales** :
- `object` : HLO
- `object_room_type` × 3 : « Studio », « T2 », « T3 »
- `object_room_type_amenity` : équipements par type (clim, lit double, etc.)
- `object_room_type_media` : 2 photos par type
- `object_capacity` : capacité totale + par type
- `object_price` + `object_price_period` × 4 (basse, moyenne, haute, vacances)
- `object_discount` × 2 (séjour long, dernière minute)
- `opening_period` : ouverture annuelle avec fermetures hivernales
- `object_pet_policy` : animaux acceptés sous condition

**À tester** : grille de prix multi-période, rendu chambres / unités, simulation `api.get_object_room_types`.

---

### F-11 — Restaurant (RES)

**But** : couvrir le module E4 menus.

**Données minimales** :
- `object` : RES
- `object_menu` × 2 : « Déjeuner », « Dîner »
- `object_menu_item` × 8 répartis sur les 2 menus
- `object_menu_item_dietary_tag` : tags végétariens (3 plats), vegan (1 plat)
- `object_menu_item_allergen` : croisements réalistes (gluten, fruits à coque, ...)
- `object_menu_item_cuisine_type` × 3 : française, méditerranéenne, locale
- `object_menu_item_media` : 1 photo sur 4 plats vedettes
- `object_price` : ticket moyen
- `opening_period` : 7j/7 sauf lundi midi

**À tester** : `api.search_restaurants_by_cuisine`, filtres allergènes, rendu carte interactive.

---

### F-12 — Activity (ACT)

**But** : couvrir le module E2.

**Données minimales** :
- `object` : ACT (« Canyoning Vallée du Verdon »)
- `object_act` : durée 4h, jauge max 8 personnes, difficulté intermédiaire, âge mini 14, équipement fourni
- `actor_object_role` : 1 acteur « guide diplômé »
- `object_classification` : qualification professionnelle
- `object_iti_practice` : N/A (réservé ITI, pas ACT)
- `object_price` : tarif par personne, supplément groupe
- `opening_period` : saisonnier juin–septembre
- `object_legal` : assurance RC + qualification guide
- `object_relation` : lien vers ITI parent ou site support (si disponible)

**À tester** : règles métiers ACT (`api.user_can_publish_object` vérifie qualifications), rendu équipement, validation âge mini.

---

## Fixtures additionnelles recommandées (hors périmètre demandé)

Pour compléter la matrice à terme :
- **F-13 ORG complète** : organisation avec adhérents, permissions, branding (cf. `upsert_app_branding`)
- **F-14 FMA datée** : événement avec `object_fma_occurrence` multiples sur 6 mois
- **F-15 Camping (HPA / CAMP)** : couvrir les types quasi-vides en base (3 CAMP, 0 HPA)
- **F-16 Pending change actif** : objet avec 3 `pending_change` simultanés pour exercer vue modération avec diff
- **F-17 Object archivé** : `status=archived`, vérifier rendu lecture-seule
- **F-18 Multi-language complet** : objet avec FR + EN + IT + ES sur tous les champs traduisibles

---

## Mise en œuvre

### Recommandation de format
- **TypeScript fixtures** côté `bertel-tourism-ui` (proche du parseur) pour mocks UI
- **SQL fixtures** sous `Base de donnée DLL et API/fixtures/` pour tests d'intégration
- **JSON canonical** au format `api.get_object_with_deep_data` pour valider parseur

### Ordre de génération recommandé
1. F-02 (sparse) — état vide, base de test la plus simple
2. F-06 (missing description) — état partiel le plus fréquent
3. F-05 (missing media) — état partiel courant
4. F-11 (restaurant) — type majoritaire avec module conditionnel
5. F-10 (accommodation) — type majoritaire HLO
6. F-12 (activity) — module E2 court
7. F-08 (accessibility) — clarifier le gap G-A11Y-1
8. F-07 (incomplete opening) — composant horaires complexe
9. F-04 (duplicate contact) — validation de cohérence
10. F-09 (itinerary) — type vide en base, fixture la plus longue à construire
11. F-01 (complet) — fixture de référence maximaliste
12. F-03 (legacy imported) — exercer flow d'enrichissement

### Stratégie de purge
- Préfixe ID standardisé (`FXT-` ou similaire) appliqué à `object.object_id`
- Script SQL de purge : `DELETE FROM public.object WHERE object_id LIKE 'FXT-%';` (avec CASCADE attendu via FKs)
- À jouer **uniquement** sur environnements de dev / staging.

---

## Prochain pas concret

Après validation produit des 12 scénarios :
1. Choisir un format de fixture (TS / SQL / JSON canonical via `api.get_object_with_deep_data`).
2. Implémenter F-02 d'abord (effort minimum, valeur immédiate).
3. Itérer F-06, F-05, F-11 en parallèle.
4. Garder F-01 et F-09 pour la fin (effort maximal).
