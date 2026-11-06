# Compose préconstruit : même application, SHA unifié

Le fichier docker-compose.prebuilt.yml conserve le service, les ports, les références
d’environnement et toute autre configuration du Compose courant. Seul build est
retiré ; image devient bertel-candidate:${SOURCE_COMMIT:?…}, avec pull_policy: never.
Il n’ajoute ni registre, secret, version Node ni changement d’application.

La variante doit appartenir au SHA final S AVANT la construction manuelle de
l’archive S. Coolify recharge ce fichier depuis le checkout : pour une livraison
future relue, conserver Compose Managed et /bertel-tourism-ui, sélectionner ce
fichier et épingler exactement S. Le tag chargé doit être bertel-candidate:S ;
SOURCE_COMMIT demeure injecté au runtime par Coolify. Vérifier qu’aucune variable
explicite ou héritée de même nom ne masque cette injection avec une autre valeur.
Aucun réglage custom-build/start ni hook de déploiement n’est ajouté.

Les neuf références explicites incluent SUPABASE_SERVICE_ROLE_KEY et
THESAURUS_CURSOR_SECRET, runtime seulement. Les deux noms SERVICE_URL/FQDN générés
par Coolify restent attachés au même service et au même mapping de domaine :
ce fichier n’en ajoute pas et n’en remplace aucun. Les onze noms runtime attendus
sont donc à conserver pendant la configuration opératoire ; ne pas vider ni
régénérer le secret curseur pour cette livraison.

Le garde CI exécute le vrai docker compose config avec un environnement synthétique
isolé, sans credential ni opération de daemon. Il compare les JSON complets au
Compose courant après les seules transformations prévues, garde des témoins
service/port/env non vides, vérifie un second SHA et refuse SOURCE_COMMIT absent
ou vide, même avec un dotenv implicite. Il exige Docker Compose, sans skip permissif.
Ce rendu ne prouve ni la présence d’une image sur l’hôte ni un déploiement Coolify.

## Précondition : déploiements manuels seulement

Avant chaque bascule, confirmer que seul Auto deploy est désactivé et que Coolify
affiche « Manual deployments only ». Enregistrer, recharger, puis relire cet état
sauvegardé. Un pin Git seul ne suffit pas : le
[webhook transmet le commit du push](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/app/Http/Controllers/Webhook/Github.php#L447),
et un [commit fourni à l’admission prime le pin](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/bootstrap/helpers/applications.php#L19).
La [garde Auto deploy](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/app/Models/Application.php#L1448)
empêche cette admission automatique ; elle ne purge pas les tâches déjà admises.

Vérifier séparément qu’aucun déploiement de cette application n’est en attente
ou en cours sur ses destinations concernées. Sinon, suspendre la procédure et
faire réconcilier la file. Geler aussi les actions manuelles/API, les sources,
la configuration, les tags et les nettoyages d’images pendant la fenêtre. Ce mode
ne bloque pas un autre opérateur privilégié.

## Garde avant chaque bascule

1. Figer le SHA complet S, son arbre et les résultats réellement acquis sur ce
   candidat. Vérifier run/attempt et empreintes/taille ZIP, manifeste et gzip
   approuvés ; conserver l’archive vérifiée hors du stockage Docker.
2. Contrôler d’abord espace disque et ressources. Après réception/import
   explicitement autorisés, vérifier en lecture seule présence et ID exact de
   l’image physique, configuration et liste RootFS ordonnée contre l’archive,
   linux/amd64, USER node, labels source/revision et bornes de taille. Ne pas
   afficher Config.Env ou les secrets. Faire revoir tout écart avant de poursuivre,
   sans assouplir un garde en direct.
3. Après autorisation du tag, résoudre bertel-candidate:S
   vers cet ID **avant** Deploy. Un export sans RepoTags ne crée pas ce tag à
   l’import : le tag exact est une étape distincte. Le recontrôler juste avant la
   bascule, sans autre écrivain ni nettoyage concurrent.
4. Exécuter la recette isolée de l’image exacte sur loopback, avec les seuls
   paramètres publics approuvés et leur empreinte, sans credential serveur ni
   effet métier. Vérifier codecs/outils natifs requis, health, contrat2/2,
   readiness live et paramètres publics. Borner ressources, délais et nettoyage
   aux conteneurs de la recette ; conserver son reçu privé.
5. Relire pin S, référence Git accessible au checkout, Compose versionné dans S
   et emplacement sélectionné, SOURCE_COMMIT=S au rendu et au runtime, absence de
   variable explicite masquante, mode manuel sauvegardé et absence de tâche déjà
   admise. Confirmer aussi la disponibilité du tag/ID et du retour préparé.

L’import, le tag, la recette isolée et Deploy sont des actions distinctes. Cette
documentation ne les autorise pas. Après revue des gardes et autorisation,
utiliser le déploiement manuel Compose Managed existant, sans hook improvisé,
commande custom-build/start ou reconstruction de l’image sur l’hôte.

Coolify4.6 peut appeler build --pull : l’absence de build rend cette phase sans
construction. Avec le code Compose5.6.1 relu,
[pull_policy: never saute le pull](https://github.com/docker/compose/blob/6cbc19a3fd59e305fb814dca4d854a4fb67d2941/pkg/compose/pull.go#L539)
sans garantir la présence locale de l’image. Le pull peut donc réussir avec un
tag manquant ; [Coolify arrête l’ancien Compose avant de démarrer le nouveau](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/app/Jobs/ApplicationDeploymentJob.php#L890).
L’absence peut n’être détectée qu’à up. Un succès de config ne remplace donc pas
la garde de présence/tag/ID avant Deploy. Requalifier ces comportements si les
versions d’orchestration changent.

## Postflight de l’application servie

Attribuer le nouveau conteneur à son image physique exacte, aux labels et à
SOURCE_COMMIT=S ; relire aussi le Compose et l’état effectifs, pas seulement le
SHA annoncé dans l’interface. Effectuer quatre GET bornés, sans mutation :
`/api/health`, `/api/ready`, `/api/app-version`, `/runtime-config.js`. Exiger health
sain, ready live, contrat2/2 et configuration publique attendue.

La readiness ne qualifie que la joignabilité de la passerelle Auth : ni session
utilisateur, droits métier, documents, SMTP, IA ou Storage. Compléter par le rendu
et les interactions concernés, sans effet métier non autorisé. Conserver
l’attribution et les résultats dans le reçu privé opérateur.

## Retour préparé, distinct d’un retour exécuté

Avant la fenêtre, préparer un retour R explicitement relu pour le schéma courant
et le contrat2/2 : archive/manifeste conservés, image exacte chargée, tag
bertel-candidate:R contrôlé et recette isolée réussie. R doit contenir le même
Compose préconstruit. Une référence Git dédiée, accessible au clone effectué par
Coolify y compris à sa profondeur shallow configurée, doit résoudre exactement R.
Vérifier cette disponibilité avant la bascule ; un SHA historique seul ne suffit
pas à prouver que le checkout peut le récupérer.

Un retour autorisé reprend les mêmes gardes : mode manuel sauvegardé, file vide,
référence/pin R, SOURCE_COMMIT=R, tag/ID exacts disponibles, déploiement manuel puis
postflight. Une image de retour préchargée et testée en isolation n’est pas un
retour déjà exécuté en production. Aucun ancien artefact n’est automatiquement
compatible. Ni SQL, données, flags album ni objets Storage ne sont remis en
arrière ; aucun rollback automatique n’est ajouté.

Aucun transfert, import, tag, build hôte, conteneur, changement Coolify ou déploiement
n’est effectué par ce lot. L’archive finale et sa recette opérationnelle restent
liées au gel réellement revu.

Sources primaires :
[Coolify4.6, phases Compose](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/app/Jobs/ApplicationDeploymentJob.php#L780),
[parseur des services](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/bootstrap/helpers/parsers.php#L2278),
[Compose5.6.1, pull never](https://github.com/docker/compose/blob/6cbc19a3fd59e305fb814dca4d854a4fb67d2941/pkg/compose/pull.go#L73).
