# Architecture Bertel, point d'entrée

## Document de référence principal

La référence principale pour le **workspace objet Bertel V3** est ici :

- [`docs/architecture/bertel-object-workspace-canonical-map.md`](./docs/architecture/bertel-object-workspace-canonical-map.md)

## Ce document fait autorité pour

- la structure canonique du workspace objet,
- la séparation entre tronc commun, couches transverses et modules conditionnels,
- les décisions V1 figées,
- les règles transverses d'édition,
- la modération,
- la logique de portée objet / sous-lieu,
- la priorisation V1 / V2 / V3,
- l'alignement entre produit, schéma, API et UI.

## Ordre de lecture recommandé

1. `ARCHITECTURE.md`
2. `docs/architecture/README.md`
3. `docs/architecture/bertel-object-workspace-canonical-map.md`
4. `Base de donnée DLL et API/erd_diagram.md`
5. `Base de donnée DLL et API/api_views_functions.sql`
6. `bertel-tourism-ui/src/services/object-detail-parser.ts`
7. `docs/mapping-workbench/README.md`

## Workbench de mapping

Le dossier `docs/mapping-workbench/` contient les artefacts operationnels pour relier la carte canonique aux tables, aux payloads API, a l'UI d'edition et a l'import des anciennes donnees.

Il ne remplace pas la carte canonique. Il sert de checklist executable pour :

- comprendre la surface objet via DBML / ERD,
- profiler les anciens CSV avant insertion,
- valider la surface UI apres promotion en base,
- cadrer les fixtures de tests du workspace objet.

## Règle simple

Quand une décision sur le workspace objet paraît ambiguë, la première référence à consulter est :

- `docs/architecture/bertel-object-workspace-canonical-map.md`
