# Portail prestataire : activité, brouillons photo et accessibilité

Les trois changements sont en production sur [Bertel](https://bertel.otisud.re/espace) depuis le 6 novembre 2026 à **09:52:43, heure de La Réunion** (05:52:43 UTC). Vérification réalisée sans Claude, sur la base existante, sans migration de schéma.

## Version déployée

- Ancienne version : `8f8e3d91f47dc473ad84b004fdff70949f9568b3`.
- Version livrée : **`a29c988a6ee87a20c3e778839795933cca03ddd3`**.
- Branche de production : `codex/album-production-20261105`, avancée uniquement jusqu'à cette version.
- Coolify : branche conservée et commit exact épinglé, sauvegardé puis relu ; déploiement [`hrvradcakm0z460ira2axxpx`](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment/hrvradcakm0z460ira2axxpx) terminé avec succès.
- Ce compte rendu est publié sur une branche documentaire séparée, pour éviter de déclencher un autre déploiement.

## Comportement corrigé

**Activité.** La requête demandait `object_act.equipment_provided_details`, colonne absente du schéma réel. Sa lecture et son écriture ont été retirées ; les colonnes existantes sont conservées. La rubrique s'ouvre et affiche les valeurs de l'activité. Les types d'hébergement HOT, HPA, HLO, CAMP et RVA n'ont pas de rubrique Activité. Une saisie de détail du matériel non pris en charge est refusée avant écriture et conservée dans le formulaire avec un message explicite.

**Photos.** Un identifiant de lecture transitoire pouvait faire passer le dépôt de l'utilisateur pour une modification concurrente de l'office après rechargement. La comparaison des brouillons ignore cet identifiant transitoire, tout en conservant les contrôles de concurrence réels. La récupération d'un ancien brouillon reste conditionnée à la correspondance de son empreinte complète avec un identifiant de lecture connu.

**Accessibilité.** La rubrique est autonome, conformément à la maquette validée, avec les familles Mobilité, Vision, Audition et Compréhension. Elle réutilise les codes, libellés et relations existants. Les aménagements propres à l'hébergement sont masqués pour les activités. Le label Tourisme & Handicap reste en lecture seule. L'absence de sélection signifie « À faire / non renseigné ». Les équipements, codes inconnus et autres caractéristiques déjà enregistrés sont préservés. L'envoi à l'office conserve une seule enveloppe complète de caractéristiques malgré les deux rubriques distinctes.

## Vérifications

- Activité : trois suites ciblées, **62 tests réussis**.
- Portail et accessibilité : **23 suites / 369 tests réussis**, avec vérification des assertions ajustées et du scénario combinant accessibilité, photo et rechargement. Les exécutions qui se recoupent ne sont pas additionnées.
- API prestataire : **six suites / 70 tests réussis** sur les routes liste, détail, suppressions, authentification, middleware et projection Tourinsoft.
- TypeScript et `git diff --check` réussis.
- Build de production local de la version exacte `a29c988` réussi, **49/49 pages**. Aucun conteneur local ni installation de dépendances supplémentaire.
- Graphe Graphify actualisé en mode AST après les changements de source.
- GitHub Actions : aucune exécution pour cette livraison ; les validations sont les contrôles locaux ci-dessus et le build Coolify réussi.

## Recette réelle après déploiement

Un compte temporaire autorisé a été rattaché uniquement à l'acteur de la fiche de test `ACTTST0000000001`, qui est bien une activité. Le comparateur hébergement `HOTTST0000000001` est distinct.

Dans le portail en production, la durée a été changée de 90 à 91 minutes dans un brouillon, un aménagement d'accessibilité a été sélectionné, puis une véritable image fictive a été déposée dans le stockage privé. Après rechargement complet, les trois modifications étaient conservées, l'image était effectivement chargée et aucune fausse alerte de modification par l'office n'apparaissait. La fenêtre de récapitulatif contenait Accessibilité, Votre activité et Vos photos ; son bouton final Envoyer était actif. **L'envoi final n'a pas été effectué** : aucune proposition ni tâche de relecture n'a été créée.

L'ajout a ensuite été annulé, son fichier privé supprimé via Storage, et son unique document de recette retiré par une transaction gardée sur les identifiants exacts. Les brouillons locaux ont été effacés. À 06:04:50 UTC, la comparaison finale avec la baseline de 05:54:22 UTC était exacte, sans champ ignoré : objet, activité, neuf équipements, quatre photos, révisions, six tags, quatre reçus et relations. Les annexes sont restées vides. L'affichage a été contrôlé sur ordinateur et à 390 px de largeur, puis la session temporaire a été déconnectée.

## API prestataire : compatibilité et disponibilité

Les **17 fichiers protégés** sont identiques octet pour octet entre l'ancienne version et la livraison : 11 fichiers HTTP et dépendances d'exécution, les deux documents OpenAPI, les manifestes de dépendances et les deux fichiers de déploiement. Aucun changement SQL ou DDL n'est livré.

Une comparaison stricte avant/après déploiement confirme l'identité des **13 lecteurs SQL** et des JSON bruts et projetés de **12 types publiés**, y compris les clés, types récursifs, valeurs et champs optionnels ; aucun champ n'est exclu de la comparaison. La structure et les libellés de l'API n'ont pas changé.

À 05:53:02 UTC, `/api/health`, `/api/ready` et `/api/app-version` répondaient **200**, avec le mode `live` et les contrats client/écriture `2/2`. Les routes publiques sans clé conservaient leur réponse **401** et la version d'API `1.0.0`. Ces sondes ne constituent pas un GET prestataire authentifié.

La dernière lecture des journaux à 06:09:59 UTC ne contient **aucun GET prestataire authentifié après ce déploiement**. Le dernier succès enregistré reste `GET /api/public/objects`, **200 le 6 novembre à 04:00:40.683417 UTC** (08:00:40 à La Réunion), après la livraison du 5 novembre et avant les présents correctifs. Les vérifications de structure et de disponibilité ci-dessus sont réussies ; un nouveau GET authentifié après `a29c988` n'est donc pas attesté. Aucune clé supplémentaire n'a été créée.

## Clôture de la recette

À **06:09:58–59 UTC**, le compte temporaire est supprimé : utilisateur Auth, profil, identités, sessions, jetons de renouvellement, appartenances et permissions associés sont absents. Le document d'essai, sa relation à l'acteur et le fichier de stockage sont absents. Les autres profils et appartenances, ainsi que l'état d'autorité et les autorisations contrôlés, ont les mêmes empreintes qu'avant la recette. Les quatre photos, neuf équipements et valeurs initiales de la fiche sont conservés. L'onglet de recette déconnecté a été fermé.

## Retour arrière

Dans Coolify, réépingler le commit `8f8e3d91f47dc473ad84b004fdff70949f9568b3`, sauvegarder puis reconstruire et redéployer. Aucune migration de base à annuler. Le redéploiement observé n'était pas un basculement sans interruption : les anciens conteneurs ont été retirés à 05:52:12 UTC et le nouveau conteneur a démarré à 05:52:43 UTC.

## Preuves

Les preuves de recette et captures restent dans le dossier privé local `implementation-portail/production-galerie-20261106/hotfix-activite-brouillon` de la session : `protected-source.json`, `http-after.json`, `build-final.log`, `public-api-tests.log`, `coolify-deployment.txt`, captures de la rubrique Accessibilité, du dépôt et du récapitulatif après rechargement. Les comparaisons complètes de base sont dans le dossier parent, dont `base-client-fix-final-cleanup-comparison.json` et `base-client-fix-final-api-journal.json`. Aucun mot de passe, jeton, lien signé ou dump de données n'est ajouté à Git.

Le [compte rendu de la galerie du 5 novembre](https://github.com/D-OTIsud/Bertel/blob/ba6e4b5779423fc7e28159c47806d47ef675798b/docs/releases/2026-11-05-galerie-production.md) reste le contexte historique ; la version déployée décrite ici le remplace pour ces correctifs.
