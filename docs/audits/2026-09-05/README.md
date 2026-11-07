# Audit transversal Bertel 3.0 — 5 septembre 2026

**17 rapports par aspect, une synthèse priorisée et un dossier de preuves.** L'audit couvre le code, la configuration, les contrats de données, les parcours et un examen visuel local. Il identifie les corrections à préparer ; aucune correction applicative ni modification de production n'a été effectuée.

Commencer par la [synthèse et le plan d'action](./00-synthese-et-plan-action.md). Pour la demande spécifique sur l'interface, lire [ergonomie et mobile](./09-ux-interface-responsive.md), [accessibilité et langues](./10-accessibilite-internationalisation.md), puis [design et système visuel](./17-design-systeme-visuel.md).

## Documents d'audit

| N° | Aspect et document | Couverture principale |
|---|---|---|
| 01 | [Architecture et maintenabilité](./01-architecture-maintenabilite.md) | Découpage, responsabilités, types, contrats et documentation de démarrage. |
| 02 | [Sécurité et authentification](./02-securite-authentification.md) | Sessions, administration, invitations, hiérarchie et frontière service-role. |
| 03 | [API, fichiers et médias](./03-api-fichiers-medias.md) | API partenaires, quotas, uploads, validation des formats, nettoyage et partage. |
| 04 | [Base de données et intégrité](./04-base-de-donnees-integrite.md) | Contraintes, prix, devises, dates, agrégats et cohérence métier. |
| 05 | [Autorisations RLS et RPC](./05-autorisations-rls-rpc.md) | Grants, fonctions privilégiées, contexte d'identité, historique et installation. |
| 06 | [Performance SQL](./06-performance-sql.md) | Triggers, amplification des écritures, pagination et paramètres non bornés. |
| 07 | [Confidentialité et RGPD](./07-confidentialite-rgpd.md) | Cartographie des données personnelles, effacement, anonymisation, notice et conservation. |
| 08 | [Fonctionnel et parcours métier](./08-fonctionnel-parcours-metiers.md) | Inventaire des modules, sauvegarde, brouillons, listes, envoi et fonctionnalités de démo. |
| 09 | [Ergonomie et adaptation mobile](./09-ux-interface-responsive.md) | Navigation, retours d'erreur, compréhension des actions, aperçus et shell responsive. |
| 10 | [Accessibilité et internationalisation](./10-accessibilite-internationalisation.md) | Clavier, glissement, ARIA, labels, langues, contrastes et branding. |
| 11 | [Performance du frontend](./11-performance-frontend.md) | Recherche, pagination, cache, carte, mémoire d'export et budgets. |
| 12 | [Tests et assurance qualité](./12-tests-assurance-qualite.md) | Résultats exécutés, typage, Jest, build, CI, Playwright et couverture visuelle. |
| 13 | [Dépendances et chaîne logicielle](./13-dependances-chaine-logicielle.md) | Audit npm, versions, verrouillage, runtime, imports Edge et suivi des avis. |
| 14 | [Déploiement et exploitation](./14-deploiement-exploitation.md) | Docker, secrets de build, configuration, démo, confinement et reprise. |
| 15 | [Observabilité et diagnostic](./15-observabilite-diagnostic.md) | Erreurs, références d'incident, healthcheck, statuts métier et alertes. |
| 16 | [Intégrations, IA et interopérabilité](./16-integrations-ia-interoperabilite.md) | Tourinsoft, ONF/ArcGIS, coût IA, SMTP, cartographie et recette partenaire. |
| 17 | [Design et système visuel](./17-design-systeme-visuel.md) | Hiérarchie, lisibilité, collisions de commandes, tokens, identité et catalogue visuel. |

## Preuves et traçabilité

- [Registre des contrôles exécutés](./preuves/controles-executes.md) : commandes, résultats et écrans réellement observés.
- [Résultats structurés](./preuves/verification.json) : décomptes Jest/Python, diagnostics TypeScript et contrôles de contrats.
- [Audit des dépendances](./preuves/dependances.json) : périmètres npm séparés, versions et avis.
- [Registre des constats](./preuves/constats.json) : identifiants, priorité, titre et document source.
- [Validation des livrables](./preuves/validation-livrables.json) : cohérence des comptes, liens locaux, références de sources et format des preuves.

Révision examinée : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Les rapports correspondent à l'arbre de travail observé le 5 septembre 2026. Les trois documents non suivis préexistants du 28 août ont été laissés en place. Les modifications de cette mission se limitent aux livrables d'audit et fichiers locaux de vérification.

## Comment lire les priorités

| Niveau | Sens |
|---|---|
| P0 | Critique immédiat ; aucun constat de ce niveau établi dans cet audit. |
| P1 | Prioritaire : perte de travail/données, risque de droits ou de confidentialité, obstacle majeur ou garantie de livraison manquante. |
| P2 | Correction ou vérification à planifier : cohérence, robustesse, performance, lisibilité et maîtrise d'exploitation. |
| P3 | Amélioration ou surveillance d'un invariant ; peut nécessiter une décision produit. |

Un **constat confirmé dans le code** n'est pas une exploitation réussie en production. Une **observation visuelle** est limitée à l'écran, la taille et la configuration indiqués. Un **risque** précise ses conditions ; **à vérifier** désigne une preuve d'exploitation manquante. Une **heuristique de design** est un jugement motivé à confronter aux usages.

## Portée et limites

L'audit est transversal et fondé sur un échantillonnage guidé par les risques ; il ne certifie pas la lecture exhaustive des 90 074 lignes de TypeScript applicatif ou du catalogue SQL. Le graphe de base inventorie notamment 370 tables, 374 fonctions et 537 politiques dans un instantané documentaire qui inclut des schémas techniques.

La construction Next.js et 3 374 tests Jest passent, mais le contrôle TypeScript dédié échoue sur dix erreurs de tests. Le défaut mobile du shell a été reproduit au navigateur. L'audit npm signale 35 paquets avec `--omit=dev`, dont sept élevés ; ce décompte n'est pas un nombre de vulnérabilités distinctes exploitables.

Les droits réellement déployés, sauvegardes/restauration, volumes de production, contrats de sous-traitance, lecteurs d'écran et tests métier authentifiés restent à contrôler. Docker et Deno n'étaient pas disponibles pour leurs suites locales ; Playwright complet n'a pas été exécuté. Les conditions de clôture sont détaillées dans chaque rapport et regroupées dans la synthèse.
