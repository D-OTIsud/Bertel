# Compose préconstruit : même application, SHA unifié

Le fichier docker-compose.prebuilt.yml conserve le service, les ports, les références
d’environnement et toute autre configuration du Compose courant. Seul build est
retiré ; image devient bertel-candidate:${SOURCE_COMMIT:?…}, avec pull_policy: never.
Il n’ajoute ni registre, secret, version Node ni changement d’application.

La variante doit appartenir au SHA final S AVANT la construction manuelle de
l’archive S. Coolify recharge ce fichier depuis le checkout : pour une livraison
future relue, conserver Compose Managed et /bertel-tourism-ui, sélectionner ce
fichier et épingler exactement S. Le tag chargé doit être bertel-candidate:S ;
SOURCE_COMMIT demeure injecté au runtime par Coolify, comme aujourd’hui. Aucun
réglage custom-build/start n’est requis ou proposé par ce lot.

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

Avant tout futur Deploy, sous gel coordonné de la source/configuration et des images :

- vérifier le run/SHA/arbre et les empreintes ZIP/gzip du manifeste approuvé ;
- après import autorisé, résoudre le tag bertel-candidate:S et vérifier son imageID
  EXACT contre le manifeste, ainsi que labels source/revision, linux/amd64,
  USER node et taille attendue ; ne pas imprimer Config.Env ;
- confirmer le même tag/ID immédiatement avant Deploy et préserver cette identité
  jusqu’au démarrage, sans autre écrivain ni nettoyage concurrent d’image ;
- garder l’archive vérifiée hors Docker et un retour R corrigé explicitement relu,
  compatible avec le contrat2/2 et le schéma applicatif courant, puis smoke privé.

Coolify4.6 peut appeler build --pull : l’absence de build rend cette phase sans
construction. Son pull explicite respecte pull_policy: never avec Compose5.6.1,
version relevée du conteneur existant ; il ne remplace pas la garde manuelle.
Si l’image locale manque, never refuse : Coolify peut déjà avoir arrêté l’ancien
Compose avant up. Un tag seul, un ancien SHA ou un succès de config ne suffisent
donc pas pour autoriser la bascule.

Le retour utilise le même fichier depuis R et l’image bertel-candidate:R, dont
l’archive et le manifeste sont conservés. R doit lui aussi contenir cette variante ;
aucun ancien artefact n’est automatiquement déclaré compatible. L’archive1a73
sert seulement de preuve du mécanisme, pas de choix de retour pour Thésaurus.
Ni SQL, données, flags album ni objets Storage ne sont remis en arrière ici.

Aucun transfert, import, tag, build hôte, conteneur, changement Coolify ou déploiement
n’est effectué par ce lot. L’archive finale et sa recette opérationnelle restent
liées au gel réellement revu.

Sources primaires :
[Coolify4.6, phases Compose](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/app/Jobs/ApplicationDeploymentJob.php#L780),
[parseur des services](https://github.com/coollabsio/coolify/blob/0becfba9113063336b09860579627fd218cb3fc4/bootstrap/helpers/parsers.php#L2278),
[Compose5.6.1, pull never](https://github.com/docker/compose/blob/6cbc19a3fd59e305fb814dca4d854a4fb67d2941/pkg/compose/pull.go#L73).
