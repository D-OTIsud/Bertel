# §191 — Preuves de déploiement CAMP → HPA « Camping chez l'habitant »

Date : 2026-07-27  
Application live : 08:59 RUN (04:59 UTC)  
Migration : `Base de donnée DLL et API/migration_taxonomy_camp_hpa_homestay.sql` (`taxo3`)

## Décision et portée

`Camping chez l'habitant` est une forme d'hébergement de plein air non classé. Elle relève donc de `HPA`, pas de `CAMP` (« Camping classé »).

Deux fiches ont été migrées :

- `CAMRUN000000013J` — Le Verger de la Chapelle ;
- `CAMRUN00000000PH` — L'Eden du Randonneur (camping), confirmé « Camping chez l'habitant » par le PO.

`CAMRUN000000013G` — Camping Pré-Vert Entre 2 Songes — reste `CAMP`.

## Contrôles avant application

- Base cloud : PostgreSQL 17.6.
- État initial : 3 CAMP publiés, 0 HPA ; les deux porteurs encore sous `taxonomy_camp`.
- Nœud `taxonomy_hpa.homestay_camping` absent ; nœud historique `taxonomy_camp.camping_chez_l_habitant` assignable.
- Supabase Database Advisors, sécurité, niveau `warn` : aucun problème.
- Dry-run cloud de `migration_taxonomy_trees_seed.sql` + `taxo3` dans une transaction annulée : PASS.
- Cible du dry-run : 226 nœuds, 207 liens parents, deux objets HPA/`homestay_camping`, ancien nœud CAMP non assignable.
- Contrôle post-rollback indépendant : les deux objets sont revenus CAMP et le nœud cible est absent.
- Facettes applicables CAMP/HPA identiques : `object_meeting_room`, `object_room_type`.
- Sorties complètes des quatre profils partenaires comparées avant/après dry-run : égalité byte à byte.

## Résultat live

| Objet | Type | Taxonomie | Source |
|---|---|---|---|
| L'Eden du Randonneur (camping) | HPA | `taxonomy_hpa.homestay_camping` | `taxonomy_camp_hpa_20260727` |
| Le Verger de la Chapelle | HPA | `taxonomy_hpa.homestay_camping` | `taxonomy_camp_hpa_20260727` |
| Camping Pré-Vert Entre 2 Songes | CAMP | `taxonomy_camp.camping` | inchangée |

Catalogue :

- `taxonomy_hpa.homestay_camping` actif, assignable, parent `root`, 2 porteurs ;
- `taxonomy_camp.camping_chez_l_habitant` actif mais non assignable, parent `camping`, 0 porteur ;
- compte publié : CAMP = 1, HPA = 2.

Filtres :

- filtre type HPA → les deux campings chez l'habitant ;
- filtre type CAMP → Camping Pré-Vert uniquement.

Interop :

| Profil | Classe des deux fiches |
|---|---|
| schema.org | `Campground` |
| DATAtourisme | `PointOfInterest`, `Accommodation` |
| Apidae | `HOTELLERIE_PLEIN_AIR` |
| Tourinsoft | `HPA` |

## Opérations post-commit

- `api.refresh_object_filter_caches` exécutée pour les deux fiches ;
- `internal.mv_filtered_objects` rafraîchie `CONCURRENTLY` ;
- `internal.mv_ref_data_json` rafraîchie `CONCURRENTLY` ;
- reload du schéma PostgREST envoyé par `NOTIFY pgrst`.

Le snapshot `migration_taxonomy_trees_seed.sql`, le manifeste `ci_fresh_apply.sql`, le runbook, l'aide HPA et le journal de décisions §191 ont été alignés sur cet état cible.
