# Registre des vérifications de l'audit

Date : 5 septembre 2026. Dépôt : `C:/Users/dphil/Bertel3.0`. Révision source restée inchangée : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Aucun correctif applicatif, commit, push, déploiement ou SQL distant pendant l'audit.

## Commandes exécutées

Les commandes npm ci-dessous ont été exécutées depuis `bertel-tourism-ui`, les commandes Python et Tourinsoft depuis la racine. Les redirections vers les logs sont omises pour lisibilité. `npm audit` interroge le registre ; aucune commande `audit fix` ou installation n'a été lancée.

| Commande | Résultat |
|---|---|
| `graphify query "Application architecture main features API authentication security tests deployment"` | Graphe utilisé pour navigation ; requêtes complémentaires par domaine. |
| `npm run typecheck` | Code 2 ; dix diagnostics enregistrés dans `verification.json`. |
| `npm run test:run -- --ci --maxWorkers=2 --json --outputFile=../scratch/audit-2026-09-05/jest-results.json` | Code 0 ; 407 suites, 3 374 tests réussis ; avertissement worker. |
| `npm run build` avec télémétrie Next désactivée | Code 0 ; compilation webpack 55 s ; 34 pages prérendues. |
| `python -m pytest tools/db-graph -q` | Code 0 ; 40 tests réussis en 1,26 s. |
| `node tools/tourinsoft/check-contract.mjs` | 314 champs classifiés ; contrat valide. |
| `node --check tools/tourinsoft/compare-payload.mjs` | Syntaxe valide. |
| `node tools/tourinsoft/compare-payload.mjs --input="Base de donnée DLL et API/tests/fixtures/tourinsoft_reunion_common.expected.json"` | Un document conforme aux champs approuvés. |
| `python tools/tourinsoft/check-regional-contract.py` | Six flux et corpus de preuve régional cohérents. |
| `npm audit --json --ignore-scripts` | Code 1 ; 59 paquets signalés, dont 16 élevés. |
| `npm audit --omit=dev --json --ignore-scripts` | Code 1 ; 35 paquets signalés, dont 7 élevés. |
| Vérification du daemon Docker par `docker info` | Échec de connexion au daemon Windows ; aucune base locale démarrée. |

## Examen visuel réalisé

Serveur local démarré sur `http://127.0.0.1:3095` avec `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`, sans changement des fichiers d'environnement. Navigation par le navigateur intégré (CUA), captures affichées pendant l'examen et mesures DOM en lecture seule. Les données visibles sont des fixtures de démonstration ; leur apparence ne prouve pas la configuration de production.

| Écran et dimensions | Observation vérifiée |
|---|---|
| Explorer, 1280×720 | Shell bureau à rail d'icônes, trois panneaux ; noms de plusieurs fiches très tronqués en mode Split ; outils carte empiétant sur « Plan ». |
| Explorer, 390×844 | Shell de 390 px mais `main` et `header` de 64 px ; contenu tronqué dans la colonne gauche, reste vide. Persiste après rechargement. |
| Explorer, 768×1024 | Shell à colonnes `64px 704px`, `main` de 704 px ; liste lisible. Le défaut dépend donc du masquage du rail au seuil inférieur. |
| CRM, 390×844 | Même défaut global : colonnes `64px 326px`, `main` de 64 px. |
| CRM, 1440×900 | Annuaire et trois indicateurs lisibles ; deux actions « Nouvel acteur » et action globale « Créer une fiche » coexistent. |

Les observations complémentaires éventuellement réalisées lors de la finalisation sont consignées dans le document design. Le défaut mobile est établi par l'image et les dimensions ; l'absence de dépassement de `document.scrollWidth` ne suffisait pas à le détecter, car le contenu était tronqué par le shell.

## Précautions d'interprétation

- `verification.json` conserve les résultats utiles, sans recopier les longs journaux ou secrets.
- `dependances.json` contient les paquets et avis du registre, leurs versions, et la distinction arbre complet/production. Il ne s'agit pas d'une preuve d'exploitation.
- Les durées viennent de l'environnement de développement et ne doivent pas servir de benchmark de production.
- Les paramètres d'hébergement, sauvegardes, droits réels et données réelles n'ont pas été consultés ; les contrôles restants figurent dans la synthèse.
- Seuls les rapports et leurs preuves sont livrés. La mise à jour Graphify n'est pas nécessaire : aucun code ni schéma n'a été modifié.
