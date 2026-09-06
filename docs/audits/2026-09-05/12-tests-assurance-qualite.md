# Audit — Tests et assurance qualité

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Environnement local Windows, Node 25.8.1, npm 11.11.0.

## Périmètre et méthode

Exécution des contrôles existants de typage, de tests unitaires frontend, de construction Next.js, de l'outillage Python du graphe de base et des contrats Tourinsoft. Lecture des configurations CI, Jest, TypeScript, Playwright et Storybook. Les résultats déjà obtenus ont été conservés lors de la reprise de l'audit ; les suites réussies n'ont pas été relancées sans changement de code.

| Contrôle exécuté | Résultat observé | Ce qu'il établit |
|---|---|---|
| `npm run typecheck` | Échec, code 2 : **10 erreurs dans 4 fichiers de tests** | Fixtures et assertions de tests incompatibles avec les types actuels. |
| `npm run test:run -- --ci --maxWorkers=2 --json …` | **407 suites, 3 374 tests réussis**, aucun test ignoré ; 292,672 s | Les assertions Jest existantes passent dans cet environnement. |
| `npm run build` | Succès, code 0 ; compilation webpack en 55 s, 34 pages prérendues | La construction Next.js aboutit ; les 55 s ne sont pas la durée totale du build. |
| `python -m pytest tools/db-graph -q` | **40 tests réussis**, 1,26 s | L'outillage documentaire du graphe passe ses tests ; ce ne sont pas des tests de RLS réels. |
| Contrats et fixture Tourinsoft | Réussite des trois contrôles ; syntaxe du comparateur valide | Cohérence des artefacts locaux selon les règles des validateurs. |
| Observation navigateur en mode démo | Explorer/CRM bureau, tablette et téléphone examinés | Défaut mobile reproduit à 390×844 ; voir UX-07. |

Preuves résumées et erreurs exactes : [preuves/verification.json](./preuves/verification.json). Méthode de reproduction : [preuves/controles-executes.md](./preuves/controles-executes.md).

## Points solides

Les 407 fichiers de tests couvrent des parseurs, services, comportements de composants, erreurs API et autorisations simulées. Des tests de refus et de récupération après échec existent ; la suite ne se limite donc pas aux parcours heureux. La CI SQL démarre une base Supabase vierge et contient 66 références explicites à des scripts SQL de test, notamment sur la RLS. Le répertoire SQL comprend 128 fichiers de tests : ces deux nombres ne constituent pas un pourcentage de couverture, certains scripts ayant un autre usage ou pouvant être inclus indirectement.

## Constats

### QA-01 — P2 — Le typage des tests est cassé malgré Jest et build verts

**Statut : confirmé par exécution.** Neuf diagnostics concernent `ActorCrmChannel.isPublic` absent dans des fixtures : `bertel-tourism-ui/src/features/crm/CrmActorFiche.coord-copy.test.tsx:20`, `bertel-tourism-ui/src/features/crm/CrmActorFiche.test.tsx:29` et `bertel-tourism-ui/src/features/crm/CrmActorModals.test.tsx:45`. Le dixième est un accès potentiellement nul dans `src/services/export/export-columns.test.ts:331`.

La configuration `tsconfig.app.json:24` inclut `src`, donc les tests. La configuration utilisée par Next exclut explicitement les fichiers `.test.ts/.tsx` (`tsconfig.json:42`). La réussite du build et l'échec du contrôle dédié sont donc compatibles ; on ne doit pas annoncer une erreur de compilation du code de production.

**Impact :** le contrôle de typage ne peut plus servir de signal vert fiable avant modification ; la dérive des fixtures peut masquer un changement de contrat métier.

**Correction recommandée :** compléter les fixtures avec la visibilité attendue, traiter le cas nul dans l'assertion d'export et rendre le contrôle dédié obligatoire. Ne pas faire disparaître les diagnostics en excluant simplement les tests.

**Validation :** `npm run typecheck` sort avec 0, puis tests ciblés et suite existante restent verts.

### QA-02 — P1 — Aucun contrôle frontend automatique identifié dans la CI versionnée

**Statut : confirmé pour le dépôt ; réglages externes à vérifier.** Le seul workflow trouvé est `.github/workflows/sql-fresh-apply.yml:1`. Il ne lance ni typecheck, ni Jest, ni build frontend, ni Playwright. Les scripts correspondants existent dans `bertel-tourism-ui/package.json:9` mais ne sont pas appelés par ce workflow.

**Impact :** une modification React/CSS/route serveur peut être fusionnée sans que le dépôt fournisse une preuve automatique de construction ou de non-régression. Les erreurs QA-01 et le défaut mobile UX-07 montrent deux classes de problèmes qui ne sont pas garanties par la gate SQL. Une CI externe peut compléter ce dispositif ; elle n'a pas été inspectée.

**Correction recommandée :** un pipeline frontend avec environnement aligné sur le déploiement, installation verrouillée, typecheck, Jest, build et quelques scénarios navigateur critiques. Rendre les contrôles requis pour fusion selon la politique du projet.

**Validation :** une PR introduisant une erreur de type, une régression de route ou un shell mobile de 64 px doit échouer avant fusion.

### QA-03 — P2 — La couverture navigateur ne valide pas la largeur utile ni les parcours réels

**Statut : confirmé par lecture des tests et observation ; suite Playwright non exécutée.** Trois fichiers Playwright contiennent dix scénarios. `playwright.config.ts:25` active la démo et configure Chromium desktop comme projet. `tests/e2e/premium-motion.spec.ts:59` ajoute bien un contrôle à 390×844 : il vérifie l'ouverture/fermeture du tiroir mobile, mais pas la largeur du contenu ni la réalisation d'une tâche. Il serait donc faux d'affirmer qu'il n'existe aucun test mobile.

**Impact :** une navigation peut être présente dans le DOM alors que le contenu est inutilisable visuellement. Les mocks ne valident pas les permissions effectives, la persistance Supabase, le transport SMTP ou les adaptations aux données réelles.

**Correction recommandée :** quelques scénarios de recette à 390/768/1280/1440 px, contrôle de largeur et de débordement du shell, capture de référence des écrans critiques, puis matrice de rôles sur une base isolée. Éviter les assertions limitées à la seule présence d'un élément.

**Validation :** la régression UX-07 est détectée automatiquement ; création/sauvegarde/relecture, refus inter-rôles et brouillons sont vérifiés sur des données de test maîtrisées.

### QA-04 — P2 — Un worker Jest se termine de force après les tests

**Statut : avertissement observé ; cause non localisée.** La fin de `scratch/audit-2026-09-05/jest.log` indique qu'un worker n'a pas quitté proprement et a été arrêté de force. La commande sort néanmoins avec 0 et toutes les assertions passent.

**Impact :** timers, abonnements ou autres ressources mal libérés peuvent fragiliser la suite et ses durées. Cet avertissement n'établit pas à lui seul une fuite mémoire de l'application en production.

**Correction recommandée :** diagnostic ciblé des ressources ouvertes, en priorité les suites de présence, timers et abonnements ; nettoyer dans les fonctions de démontage. Aucun relancement lourd uniquement pour chasser cet avertissement n'a été effectué dans cet audit documentaire.

**Validation :** suites impliquées puis suite complète sans arrêt forcé, sans ajout d'un `forceExit` qui masquerait le problème.

### QA-05 — P2 — Couverture et accessibilité visuelle sans garantie automatisée mesurée

**Statut : confirmé dans la configuration.** `jest.config.mjs:9` indique un fournisseur de couverture mais aucun seuil ; la commande exécutée ne demandait pas `--coverage`, donc aucun pourcentage n'est revendiqué. Storybook cible `src/**/*.stories.*` (`.storybook/main.ts:4`), mais aucune story n'a été trouvée ; `.storybook/preview.ts:8` configure l'accessibilité sur `todo`.

**Correction recommandée :** choisir des composants et flux à risque pour des tests comportementaux et visuels, documenter la couverture réellement mesurée et traiter les violations d'accessibilité au lieu d'un simple statut informatif. Voir audits 10 et 17.

**Validation :** catalogue de composants réellement générable, états erreur/focus/chargement/mobile couverts, et régression de contraste ou de navigation détectable.

## Limites explicites

La reconstruction SQL locale n'a pas pu être exécutée car Docker est indisponible. Les cinq fichiers de tests Deno n'ont pas été exécutés car Deno n'est pas installé. La suite Playwright complète n'a pas été lancée ; l'examen CUA décrit uniquement les écrans réellement observés. Pas de test de charge, de restauration, de lecteur d'écran réel ni de recette authentifiée de production. Ces absences ne sont pas présentées comme des tests réussis ou des défauts prouvés du service distant.
