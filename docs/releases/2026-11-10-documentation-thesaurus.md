# Publication documentaire du thésaurus — 10 novembre 2026

**État historique du plan : PREPARED.** La livraison effective et ses contrôles
sont attestés dans le [reçu de production](2026-11-10-thesaurus-editorial-production.md).

Cette livraison ajoute le guide métier d’entretien du thésaurus au site documentaire
et retire le statut bêta des sélections partenaires, en conservant le contrat déjà
publié de `include_selection_ids`. Elle ne livre pas l’application et n’applique
aucune migration ou modification de données.

## Cible et source

| Élément | Valeur |
|---|---|
| Site documentaire | `https://doc.bertel.otisud.re` |
| Ressource documentaire Coolify | `fws8g8k4ok0osogcwccowssc` |
| Source de référence | `fed33286055dc3b96e56dd81f4a6e6b11e08430d` |
| Construction | Dockerfile, répertoire de base `/docs`, port 80 |
| Branche configurée à la préparation | `master`, HEAD |
| Dernière livraison documentaire relevée avant intervention | 10 novembre 2026 à 01 h 44 UTC, soit 05 h 44 à La Réunion ; commit `fed33286` |
| Application distincte, exclue de cette livraison | `r48k844wg04kks848s00wco4` — `https://bertel.otisud.re` |
| Commit candidat | À renseigner après création du commit documentaire isolé |
| PR et commit intégré | À renseigner après relecture et intégration |
| Identifiant du déploiement documentaire | À renseigner après admission effective |
| Contrôle HTTP après publication | Non exécuté au stade PREPARED |

L’identification des ressources et du dernier déploiement provient de la lecture de
Coolify. Les 13 fichiers publics existants ont aussi été sauvegardés par HTTP le
10 novembre à **02 h 25 min 26 UTC** (06 h 25 à La Réunion), avant toute bascule.
Le manifeste privé de préparation est
`.tmp-docs-live-20261110/manifest.json` : il conserve tailles, empreintes SHA-256,
ETag et dates `Last-Modified`. Il ne contient ni clé API ni jeton de session.

Les empreintes du guide partenaires, d’OpenAPI, de la collection Postman, de
`partenaires.html` et d’`index.html` correspondent exactement à leurs versions du
commit `f39cea53`, déjà inclus dans la source de référence. La préparation doit donc
préserver cette version récente des appartenances, plutôt que reprendre les fichiers
plus anciens du chantier d’enrichissement.

## Périmètre du commit documentaire

La préparation s’effectue dans un checkout isolé de la source de référence. Importer
uniquement les fichiers relus suivants ; ne pas copier l’ensemble du chantier sale.

- `docs/guide-metier-thesaurus.md`
- `docs/thesaurus.html`
- `docs/thesaurus-render.js`
- `docs/thesaurus-render.check.js`
- `docs/Dockerfile`
- `docs/README.md`
- `docs/conformite-rgpd/01_Manuel_utilisateur_Bertel.md`
- `docs/guide-partenaires.md`
- `docs/openapi.json`
- `docs/Bertel_API_v3.postman_collection.json`
- `docs/README_Postman.md`
- `docs/partenaires-render.check.js`
- `docs/index.html`
- `docs/partenaires.html`
- `docs/releases/2026-11-10-documentation-thesaurus.md`
- `README.md` — accès au guide depuis la documentation du projet
- `.github/workflows/documentation.yml` — contrôles de rendu et construction de l'image documentaire

Cette liste est le périmètre de préparation, à rapprocher du diff final. Toute
modification technique supplémentaire strictement nécessaire au rendu doit être
identifiée et relue explicitement dans la PR.

Les audits de complétude et de production, les outils et workflows CI d’enrichissement,
les migrations et les modifications SQL accumulés dans le chantier ne font pas
partie de cette livraison. Les modifications préexistantes de
`SQL_ROLLOUT_RUNBOOK.md` n’y sont pas importées. Le site conserve la version du runbook
issue de sa source de référence.

Le Dockerfile doit conserver sa liste explicite de fichiers publiés, complétée
uniquement par la page statique `thesaurus.html`. Le guide Markdown et son générateur
servent à la construction et aux contrôles du dépôt ; ils ne sont pas publiés.
Ne pas remplacer cette liste
par une copie globale de `docs/`. Les audits, plans et documents internes demeurent
hors du site public.

## Vérifications avant admission

1. Relire le diff complet depuis la source de référence : fichiers documentaires
   uniquement, aucune modification de l’application, du Compose applicatif ou du SQL.
2. Exécuter les contrôles de rendu documentaire sur le candidat exact et vérifier
   la syntaxe des artefacts JSON. Enregistrer les résultats réellement acquis.
3. Vérifier le guide et sa page : navigation depuis l’index et l’espace partenaires,
   rendu des exemples, liens internes, caractères français et ressources nécessaires
   incluses explicitement dans l’image.
4. Vérifier que le guide partenaires, OpenAPI et Postman conservent
   `include_selection_ids`, ses incompatibilités et ses limites de synchronisation.
   La table des sélections décrit les définitions initiales, pas un registre courant
   figé ; un nom enregistré peut changer sans remplacer l’identifiant.
5. Avant tout push ou intégration sur la branche surveillée, relire les modes de
   déploiement des **deux ressources** dans Coolify et leurs files d’attente. Exclure
   toute admission automatique ou manuelle de l’application pendant cette livraison.
6. Conserver la référence exacte de l’image ou du déploiement documentaire précédent,
   ainsi que la configuration de construction, pour le retour arrière. La sauvegarde
   HTTP prouve les fichiers servis ; elle ne remplace pas la sauvegarde de l’image et
   de la configuration de la ressource.
7. Intégrer le changement documentaire relu, puis admettre un déploiement visant
   uniquement la ressource documentaire `fws8g8k4ok0osogcwccowssc` sur le commit exact.

Au stade PREPARED, ces points constituent les contrôles à effectuer ; leur présence
dans ce document ne vaut pas preuve de réussite.

## Vérifications après publication

Relever l’heure, le commit servi et l’identifiant du déploiement documentaire réussi
dans Coolify, puis effectuer les lectures HTTP sur le site public :

- `thesaurus.html` : réponse 200, contenu et empreinte conformes au candidat,
  affichage effectif du guide statique sans chargement du Markdown ;
- `guide-metier-thesaurus.md` et `thesaurus-render.js` : absents de l'image publique,
  ainsi que les audits, plans et sources internes ; un éventuel repli SPA vers
  l'index avec un statut 200 ne prouve pas leur présence ;
- `index.html` et `partenaires.html` : liens vers le guide ;
- `guide-partenaires.md` : statut bêta retiré sur le périmètre livré et section
  `include_selection_ids` conservée ;
- `openapi.json` et collection Postman : JSON valide, contrat des appartenances
  conservé et mêmes contenus que le candidat ;
- fichiers publics non modifiés : empreintes identiques à la sauvegarde avant
  bascule, notamment le runbook, la configuration Supabase et la référence API/DB.

Utiliser des lectures fraîches pour comparer les ressources publiées, puis vérifier
que l’application distincte n’a reçu aucun nouveau déploiement. Ne pas déduire le
succès de la seule ouverture du site : le repli SPA peut renvoyer l’index avec un
statut 200 pour un fichier absent.

La recette documentaire ne constitue pas une nouvelle recette HTTP authentifiée de
l’API partenaire. La lecture SQL de production du 10 novembre à 05 h 54, heure de
La Réunion, a confirmé 15 définitions valides et les parcours de 35 et 447 fiches
distinctes pour les sélections 1006 et 1010. Le parcours HTTP authentifié n’a pas été
exécuté lors de cette vérification. Les reçus détaillés demeurent dans le dossier
de recette du chantier, sans être importés implicitement dans cette livraison.

## Retour arrière

Si le site publié échoue aux contrôles, restaurer **uniquement la ressource
documentaire** avec son image précédente vérifiée ou sa source de référence
`fed33286055dc3b96e56dd81f4a6e6b11e08430d`, puis refaire les lectures HTTP et comparer
les empreintes aux fichiers sauvegardés. Ne pas déplacer le pointeur de publication
du thésaurus, réappliquer de migration, ni redéployer l’application pour corriger
une livraison documentaire.

Après intervention, compléter le reçu avec les références et résultats observés,
y compris tout échec ou retour arrière ; conserver l’état PREPARED tant qu’aucun
déploiement réussi et aucun contrôle de publication ne sont attestés.
