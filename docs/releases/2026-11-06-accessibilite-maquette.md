# Accessibilité : intégration fidèle de la maquette

La rubrique Accessibilité reprend la maquette approuvée et est en production depuis le **6 novembre 2026 à 14:40:05, heure de La Réunion** (10:40:05 UTC).

## Livraison

- Commit : [`04028b6a2f0b3549fbd6ff621ab4017957dff3f4`](https://github.com/D-OTIsud/Bertel/commit/04028b6a2f0b3549fbd6ff621ab4017957dff3f4), successeur de `a29c988a6ee87a20c3e778839795933cca03ddd3`.
- Branche de production conservée : `codex/album-production-20261105`. Commit exact épinglé dans Coolify et relu après sauvegarde.
- [Déploiement Coolify](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment/gw4cco8k0imb8sfi9htu5ezo) terminé avec succès en 1 min 45 s. Nouveau conteneur démarré à 10:40:04 UTC ; confirmation à 10:40:05 UTC.
- Implémentation et retouches effectuées avec **Claude Code, Opus 5.5, effort Moyen**, puis revue indépendante par Codex. La pause demandée pendant la visio a été respectée ; le déploiement a été lancé après sa levée explicite.

## Présentation et comportement

L'ancien formulaire à grandes lignes est remplacé par les cartes avec pictogrammes, les badges de sélection, les pastilles compactes, l'introduction menthe, le conseil illustré et l'encart Tourisme & Handicap de la référence14. Le panneau blanc englobe le titre et le formulaire. Les pictogrammes personne encerclée et fauteuil reprennent ceux de la maquette.

Les quatre familles restent côte à côte sur ordinateur. À 390 px, elles occupent deux colonnes. Jusqu'à 360 px, elles deviennent des cartes horizontales compactes sur une colonne, pour conserver des libellés entiers. Les options gardent leurs cases natives, un focus visible et une cible d'au moins 44 px.

La rubrique reste autonome. Le catalogue, les codes, les restrictions selon le type de fiche, les sélections communes aux familles, les brouillons et la validation ne changent pas. Les codes inconnus ou masqués et les autres équipements sont préservés. Le label attribué reste en lecture seule. Aucun faux lien PDF n'a été ajouté.

Le changement couvre **trois fichiers d'interface et une assertion de test**. Le composant générique `PortalChoice`, les services, les fonctions de liaison, le schéma de base et les dépendances ne sont pas modifiés.

## Vérifications

- Tests portail : **7 suites /143 tests réussis** ; tests API : **6 suites /70 tests réussis**.
- TypeScript, `git diff --check` et build complet du candidat réussis, **49/49 pages**.
- Revue visuelle à **1280, 390 et 320 px**, sur le vrai composant et ses styles, avec des données fictives et un éditeur en mémoire. Aucun débordement horizontal ; cases accessibles au clavier, sélection par Tab/Espace, focus et choix partagés vérifiés. Les captures ne prétendent pas montrer une session prestataire en production.
- Graphify actualisé en mode AST : 20 193 nœuds, 35 024 liens ; aucun appel LLM.
- GitHub Actions n'a pas été exécuté pour ce commit `[skip ci]`. Les validations sont les contrôles locaux, la revue et le build Coolify ci-dessus.

## API prestataire

Les **17 fichiers protégés** (11 fichiers HTTP/dépendances d'exécution, les deux documents OpenAPI, les manifestes de dépendances et les deux fichiers de déploiement) sont identiques octet pour octet avant/après. Aucune migration SQL ni changement de structure ou de libellé JSON n'est livré.

La baseline a été rafraîchie après la pause à 10:37:25 UTC, sans différence avec celle de 09:46 UTC. Le contrôle SQL couvre **11 lecteurs présents et deux absences enregistrées**, ainsi qu'un JSON brut et projeté complet par chacun des **12 types publiés disponibles**, en français et sans UID utilisateur. C'est une vérification sur ces échantillons et ce contexte, pas une preuve exhaustive de tous les objets et paramètres.

À **10:41:06 UTC**, `/api/health`, `/api/ready` et `/api/app-version` répondent 200, en mode `live`, avec les contrats client/écriture `2/2`. Sans clé, les routes publiques conservent leur réponse 401 et la version d'API `1.0.0`. Les nouvelles règles CSS, y compris l'adaptation compacte à 320 px, sont effectivement servies en 200 par la production ; cette sonde réussit à 10:41:07 UTC.

La comparaison finale entre **10:37:25 et 10:41:46 UTC** est **strictement identique** : sources et attributs des lecteurs, absences, douze mêmes JSON complets bruts/projetés et arbres de clés/types. Aucun champ n'est ignoré.

La lecture finale du journal applicatif à **10:41:49 UTC** ne trouve aucun GET prestataire enregistré depuis 10:40:05 UTC. Le dernier succès enregistré est `GET /api/public/objects`, **200 à 10:27:31.912790 UTC** (14:27:31 à La Réunion), avant cette livraison. Un nouveau GET authentifié en 200 après ce déploiement n'est donc pas attesté. Le journal est best-effort et son silence ne démontre pas l'absence absolue de trafic. Aucune clé supplémentaire, aucun compte ni appel authentifié artificiel n'ont été créés.

## Retour arrière et preuves

Pour revenir à la version précédente, épingler `a29c988a6ee87a20c3e778839795933cca03ddd3` dans Coolify, sauvegarder, puis reconstruire et redéployer. Aucune migration de base à annuler.

Les preuves restent dans le dossier privé de session `implementation-portail/production-galerie-20261106/accessibilite-maquette-20261106` : captures ordinateur/mobile, réglage Claude, résultats des tests et du build, `protected-source.json`, comparaisons de base, `http-after.json`, `live-css.json` et preuve Coolify. Aucun secret ni dump n'est ajouté à Git. Le présent compte rendu est publié sur une branche documentaire séparée, pour ne pas déclencher une autre livraison.
