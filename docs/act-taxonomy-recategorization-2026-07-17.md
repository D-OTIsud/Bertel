# Recatégorisation des objets ACT — audit + correction (§186, 2026-07-17)

Déclencheur : signalement PO — « des objets comme ACTRUN00000000UU ont très mal été catégorisés »
(Natur'aissance, un institut de massages, était taxonomisé **Équitation**).

Audit exhaustif des **52 objets ACT publiés** (nom + description vs `object_taxonomy` domaine
`taxonomy_act`) : **25 fiches mal codées** (~48 %), **3 sans sous-catégorie**, et un **catalogue
trop étroit** (12 codes projetés du scheme `type_act`, aucun code pour le bien-être — ~11 fiches —
ni le motorisé, la spéléo, la pêche, le bateau, les ateliers).

Cause racine : les lignes portent `source='old_data_enrichment_20260512'` — l'enrichissement de
l'import Berta a posé les codes en masse par heuristique défaillante.

## Livraison

- Migration **`migration_act_taxonomy_recategorization.sql`** (manifest **13f**), live-applied
  2026-07-17 (MCP `act_taxonomy_recategorization`), idempotente (re-run vérifié : 0/0).
- MV rafraîchies : `internal.mv_filtered_objects` + `internal.mv_ref_data_json` (CONCURRENTLY).
- Snapshot `migration_taxonomy_trees_seed.sql` étendu (211 → 218 nœuds) ; `ci_fresh_apply.sql`
  + `docs/SQL_ROLLOUT_RUNBOOK.md` mis à jour.
- Aucun changement frontend nécessaire : aucun code `taxonomy_act` en dur dans `bertel-tourism-ui`
  (filtres, éditeur §01 et badges chargent le catalogue dynamiquement).

## Catalogue — 7 nouveaux nœuds `taxonomy_act`

| Code | Libellé (fr) | Position |
|---|---|---|
| `wellness_massage` | Massage / Bien-être | 13 |
| `nature_discovery` | Découverte nature & terroir | 14 |
| `motorized_excursion` | Excursion motorisée | 15 |
| `caving` | Spéléologie / Tunnels de lave | 16 |
| `fishing` | Pêche de loisir | 17 |
| `boat_excursion` | Sortie en mer / Croisière | 18 |
| `craft_workshop` | Atelier créatif / artisanal | 19 |

`other_guided_activity` (« Autre activité encadrée ») repoussé en position **99** (fin de liste).
`fitness_wellness` et `scuba_diving` tombent à **0 usage** mais restent au catalogue (catégories
légitimes : salles de sport / clubs de plongée futurs).

**Contrainte structurante** : `uq_object_taxonomy_object_domain` = UNIQUE (object_id, domain) ⇒
**une seule** sous-catégorie par objet et par domaine. Le code retenu est le **métier dominant**
de la fiche (pas de multi-tag possible).

## Corrections — 33 fiches (before → after)

Ce tableau est le **backup de l'état antérieur** (les lignes corrigées portent
`source='act_taxonomy_recat_20260717'` ; l'ancienne source était `old_data_enrichment_20260512`).

| Objet | Fiche | Avant | Après |
|---|---|---|---|
| ACTRUN00000000ON | Une Escale enchantée (masseur Janzu) | fitness_wellness | wellness_massage |
| ACTRUN00000000U2 | L'ANNESSENCE DIVINE (réflexologie) | guided_hiking | wellness_massage |
| ACTRUN00000000U7 | Humanity Spirituality Malika (massages) | fitness_wellness | wellness_massage |
| ACTRUN00000000UU | Natur'aissance (massages) | horse_riding | wellness_massage |
| ACTRUN00000000VG | Au Cocon D'Adéli - Ma Sage Bien-être | horse_riding | wellness_massage |
| ACTRUN000000014X | Janma (yoga, massages ayurvédiques) | guided_hiking | wellness_massage |
| ACTRUN0000000154 | Dimitile Hôtel - Espace Bien-Être (spa) | guided_hiking | wellness_massage |
| ACTRUN0000000185 | Kolibriz (bien-être) | guided_hiking | wellness_massage |
| ACTRUN0000000187 | Emi Yogam (yoga, massage) | fitness_wellness | wellness_massage |
| ACTRUN000000018N | Dans Les Mains d'Emy (massage) | fitness_wellness | wellness_massage |
| ACTRUN000000019B | Sozen Massage | guided_hiking | wellness_massage |
| ACTRUN00000001B0 | Virginie MOUSSA - Thérapie Manuelle | *(aucune)* | wellness_massage |
| ORGRUN00000000Z9 | Destination Bien Être (massages ; typé ACT) | fitness_wellness | wellness_massage |
| ACTRUN00000000OP | La Ferme Péi (biodiversité, sensibilisation) | guided_hiking | nature_discovery |
| ACTRUN0000000165 | Change-écorce (découverte sensorielle forêt) | guided_mountain_biking | nature_discovery |
| ACTRUN000000019J | Lebreton France May (visite d'exploitation) | fitness_wellness | nature_discovery |
| ACTRUN000000019K | Mobilboard (Segway) | guided_mountain_biking | motorized_excursion |
| ACTRUN00000001A7 | Kréolie 4x4 | guided_hiking | motorized_excursion |
| ACTRUN00000001AK | Bugg's Buggy 974 | guided_mountain_biking | motorized_excursion |
| ACTRUN00000001AN | Z'ile 4x4 | guided_hiking | motorized_excursion |
| ACTRUN000000019X | LAVE'NTURE (tunnels de lave) | scuba_diving | caving |
| ACTRUN00000001AB | Kokapat Rando (tunnels de lave) | horse_riding | caving |
| ACTRUN00000001AO | Spéléolave (spéléo tunnels de lave) | guided_hiking | caving |
| ACTRUN00000001AG | Parc Piscicole de Langevin (pêche truite) | guided_hiking | fishing |
| ACTRUN00000001AS | Village Pêche Nature (fédération pêche) | guided_hiking | fishing |
| ACTRUN00000000RV | Croisières Australes (catamaran moteur) | kayaking_paddleboarding | boat_excursion |
| ACTRUN000000019N | Terre et feu créations (poterie) | other_guided_activity | craft_workshop |
| ACTRUN000000019O | Mira Céramik Art (céramique) | other_guided_activity | craft_workshop |
| ACTRUN000000019V | Paintball de Saint-Joseph | guided_hiking | other_guided_activity |
| ACTRUN000000019Y | Aquasens (kayak de mer, paddle) | canyoning | kayaking_paddleboarding |
| ACTRUN00000001A3 | A'RaNd'O (« sorties randonnées, VTTAE ») | guided_mountain_biking | guided_hiking |
| ACTRUN00000001B2 | Kozman La Montagn (guide montagne) | *(aucune)* | guided_hiking |
| ACTRUN00000001B7 | Rando des Z'Iles (randonnées guidées) | *(aucune)* | guided_hiking |

**Inchangées (19)** — code déjà correct : Haras des Cœurs, Ecurie Notre Dame de la Paix,
Adrenalile, Ascendance Parapente, Evasion Kréol, Ferme équestre du Sud Sauvage, Les Poneys de
Grand Coude, Canyon Aventure, Ecuries du Volcan, A grand coup d'aile, Alti Merens, Waterfalls
Canyoning, Chez I&S, DIMITILE BIKE, ALTIRUN, Dimitilez-vous, Les Cent pieds, Rougail Rando,
Allon Bat A Pat Rando.

## Cas arbitrés (choix du métier dominant)

- **LAVE'NTURE** : la description parle de « Rando Trek Réunion » mais le site est
  `tunnelsdelave.net` et l'email `randotrekreunion@…` — c'est l'enseigne tunnels-de-lave de
  Rando Trek Réunion ⇒ `caving`.
- **Spéléolave** : rando volcan + spéléo, mais le nom et l'offre distinctive = tunnels de lave
  ⇒ `caving`.
- **Aquasens** : « kayak de mer, big paddle et randonnée aquatique » ⇒ `kayaking_paddleboarding`
  (le canyoning n'était pas faux, mais secondaire).
- **A'RaNd'O** : « sorties randonnées, VTTAE » — nom et ordre d'énonciation ⇒ `guided_hiking`.
- **Chez I&S / DIMITILE BIKE** (location VTTAE, non guidée) : conservés en
  `guided_mountain_biking` — le code le plus proche et le plus trouvable pour l'usager.

## Anomalies relevées (non corrigées ici)

- **`ORGRUN00000000Z9` « Destination Bien Être »** : `object_type='ACT'` avec un id préfixé ORG
  (retypé par `old_data_type_correction_20260514`). Le type est correct (prestataire de massages),
  l'id est immuable — anomalie cosmétique du préfixe, documentée seulement.
- **Le même enrichissement d'import a peuplé les autres domaines** (`taxonomy_loi`, `taxonomy_res`,
  `taxonomy_hlo`…) : un audit du même type y est probablement justifié — **différé**, voir le
  tracker `.claude/WORKFLOW.md`.

## Vérification

- 33/33 corrections en base (`source='act_taxonomy_recat_20260717'`), `cached_taxonomy_codes`
  rafraîchi par objet (`api.refresh_object_filter_caches`, précédent 13b/13d), MV rafraîchies.
- Répartition finale : wellness_massage 13 · guided_hiking 8 · horse_riding 6 · canyoning 4 ·
  motorized_excursion 4 · caving 3 · nature_discovery 3 · fishing 2 · guided_mountain_biking 2 ·
  paragliding 2 · craft_workshop 2 · kayaking_paddleboarding 1 · boat_excursion 1 ·
  other_guided_activity 1 (paintball).
- Re-run du script = 0 UPDATE / 0 INSERT (idempotence prouvée sur live).
