# Convergence — intégration du premier lot

## P0 : source et baseline

- Cible : worktree `socle-convergence-lot1`, branche `codex/socle-convergence-lot1`.
- Source : checkout principal `C:/Users/dphil/Bertel3.0`, HEAD `64c1ee06f5e25ab2f734e4bf85b7a86d484e5b43`, avec ses modifications locales. Les 1 199 empreintes de la référence UX correspondent avant intervention.
- Baseline locale : `1e9405a491758010b93064bc603245f22cc878b3`. Ce commit préserve les modifications préexistantes de l'application ; elles ne font pas partie de ce lot. Le diff du lot se lit **depuis cette baseline**.
- 1 195 fichiers copiés et vérifiés : `src`, `public`, `scripts`, `tests`, `.storybook` et configurations nécessaires. Credentials, fichiers `.env`, caches et fichiers temporaires exclus. Dépendances existantes réutilisées sans installation.
- Avant modification : typecheck réussi ; 15 suites ciblées, 211 tests réussis.
- Proposition autorisée : critères appliqués/mémorisés/partiels, période et reset commun, statuts propres au Dashboard, transfert explicite, recherche dirigée vers Explorer, horloge informative et rôles CSS existants.

## Conservation et validation

L'inventaire rendu avant/après utilise les pages et styles applicatifs natifs. L'hôte externe fournit uniquement route, session et données synthétiques ; il ne contient ni surcouche de proposition, ni interception de clic, ni proxy de contrôle, ni remplacement de sérialiseur. Les paramètres réellement construits sont vérifiés séparément des réponses synthétiques.

Les contrôles sont comparés avec leurs noms, valeurs, options, états, visibilité et occurrences ; chaque différence UX voulue doit être explicitée. L'éditeur, les autres pages et leurs modèles restent hors du diff. Le périmètre ne comprend aucune modification de données, RPC, DTO, permissions ou sauvegarde.

Les preuves de travail se trouvent dans `C:/Users/dphil/.codex/visualizations/2026/10/26/01a17926-0c45-7d61-898b-326c6292c5e0/integration-lot1-2026-10-28/`.

## Résultat et preuves

L'implémentation Sol 6.1 est intégrée localement. Le parent a relu les diff et exécuté indépendamment les contrôles suivants :

- Typecheck et compilation de production `npm run build` réussis.
- 18 suites Jest pertinentes, **250 tests réussis** (211 avant intervention).
- **25 états rendus avant/après** : sept familles, zéro/multi-type, quatre vues Explorer et trois onglets Dashboard ; **175 ouvertures de menus identiques**. Aucune perte inexpliquée de contrôle, option, valeur ou état dans ces comparaisons.
- **31 contrôles navigateur** : mono/multi/mono, mémoire/retrait, statut et payload, période/reset, indépendance des états, pont, focus, bureau/mobile tactile, cibles 44 px et vérification ciblée du reflow à 200 %.
- **3 parcours Playwright sur les vraies routes Next**, en mode démo natif, sans hôte : statuts/période/deux resets, capacité et transfert, recherche vers Explorer. Suite versionnée dans `bertel-tourism-ui/tests/e2e/filter-convergence.spec.ts`.
- Comparaison AST des 34 déclarations de contrôles dans `FiltersPanel`, `CapacityCriteria` et `RangeSlider` : propriétés et handlers identiques hors classes. Empreintes inchangées pour l'éditeur, portail, services, stores, hooks, modèles et utilitaires. Checkout principal inchangé.
- `graphify update .` exécuté dans le worktree.

Les deltas rendus autorisés sont nommés : horloge devenue `time`, libellé commun Réinitialiser et disponibilité avec un critère/période seule, lien de recherche Explorer, statut Dashboard par défaut, puce de période, rangement et annonces des valeurs mémorisées. Les comparaisons conservent les occurrences portant un même libellé.

Les vérifications restent locales et sur données synthétiques. Elles ne valident pas les droits ou résultats serveur réels, ni tous les catalogues/conditions. Les contrôles à 200 % sont ciblés ; ils ne constituent pas un audit global des cartes et de TopBar. Aucun déploiement, écriture en base, publication ou création de liste réelle n'a été réalisé.

Pour rejouer les parcours natifs avec l'outillage installé : lancer `NEXT_PUBLIC_ENABLE_DEMO_MODE=true` et `next dev --webpack` sur un port libre, puis Playwright avec `PLAYWRIGHT_SKIP_WEBSERVER=1` et `PLAYWRIGHT_BASE_URL` correspondant. Le premier essai Turbopack a rencontré une erreur de résolution des fontes dans ce worktree ; les trois parcours passent avec Webpack, moteur déjà utilisé par la compilation de production. Le fichier `next-env.d.ts` généré par Next n'appartient pas au diff livré.

Les logs initiaux restent conservés : chemin de test GradeBar initialement mal indiqué, erreur de nom de setter dans la sonde externe et essai Turbopack. Ils ne sont pas des échecs applicatifs masqués ; les contrôles corrigés ont été rejoués. Les résultats de maquettes historiques ne sont pas additionnés à cette campagne.

Correction visuelle après retour utilisateur : le groupe de période, enfant direct de la sidebar, n'héritait pas du retrait de `FiltersPanel`. Il reçoit désormais `padding-inline: theme('spacing.4')` dans sa feuille propriétaire. Vérification sur la vraie route à 952 × 884 : retrait calculé de 16 px, dates et catégorie alignées à x = 96 px, quatre préréglages et deux dates présents. Capture `dashboard-period-padding-corrected.png` dans le dossier de preuves. Ce défaut n'avait pas été détecté par la première recette visuelle ; aucun handler, champ ou breakpoint n'a changé.

Deux autres retours visuels sont corrigés dans les déclarations propriétaires : les boutons de type du tableau d'actualisation imposent l'alignement à gauche ; les badges de type du tableau de remplissage restent sur une ligne et leurs icônes ne rétrécissent plus. Vérification navigateur : huit types alignés à gauche, trois badges de 24 px de hauteur avec icônes de 13 px, libellés complets et page sans débordement à 952 px. Le défilement horizontal des tableaux reste nécessaire à cette largeur. Captures `dashboard-type-alignment-corrected.png` et `dashboard-long-pill-corrected.png`. Aucun libellé tronqué ni changement du filtrage au clic.
