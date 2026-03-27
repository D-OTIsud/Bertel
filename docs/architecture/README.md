# Documentation d'architecture

## Références structurantes

### Workspace objet

- **Document canonique de référence** : [`bertel-object-workspace-canonical-map.md`](./bertel-object-workspace-canonical-map.md)

Ce document est la **référence principale** pour tout ce qui concerne :

- la structure du workspace objet,
- la logique d'édition,
- la modération,
- les règles transverses,
- la priorisation V1 / V2 / V3,
- l'alignement entre produit, schéma, API et UI.

## À utiliser quand

Utiliser en priorité `bertel-object-workspace-canonical-map.md` quand il faut :

- cadrer un nouvel onglet,
- arbitrer un module métier,
- décider si un bloc appartient au tronc commun ou à un module conditionnel,
- vérifier la logique de visibilité, d'écriture ou de modération,
- aligner backend, RPC, parser UI et UX d'édition.

## Règle de lecture

Toujours distinguer dans ce document :

- le **constat de l'existant**,
- les **décisions V1 figées**,
- la **cible canonique**,
- le **backlog**.

## Liens utiles

- [README racine](../../README.md)
- [Diagramme ER](../../Base%20de%20donn%C3%A9e%20DLL%20et%20API/erd_diagram.md)
- [Fonctions API](../../Base%20de%20donn%C3%A9e%20DLL%20et%20API/api_views_functions.sql)
- [Parser UI](../../bertel-tourism-ui/src/services/object-detail-parser.ts)
