# Qualification de l'envoi manuel dans l'image compilée

Ce harnais appartient à la préparation CI d'une archive. Il n'est pas un outil de
production, d'installation SQL ou de test SMTP. Les contrôles historiques natifs,
le smoke normal et `sourceContext` restent requis. Aucun résultat unitaire ne vaut
exécution Docker, qualification de flotte, Auth GoTrue ou paramètres de production.

## Profil manuel obligatoire

L'opérateur fournit `manual_email_profile` au workflow manuel, en plus du SHA :

- `hard-closed` : artefact de transition/retour dérivé S2. Toutes les phases POST,
  requêtes legacy, sans Auth, sans corps et JSON invalide doivent donner503
  `email_protection_unavailable`, no-store, zéro Auth/RPC/socket.
- `protocol-v1` : garde du nouveau protocole. Sur la MÊME imageID physique, quatre
  processus distincts sont démarrés : variable absente, closed, inconnue, puis
  protocol-v1 exact. Un prepare valide synthétique donne503 métier/Auth1/config0
  dans les trois premiers ; l'ouverture exacte donne503 smtp_not_configured et
  Auth1/config1. Le fournisseur factice est désactivé, donc rien ne peut atteindre
  la réservation, le lien partagé, la préparation ou la transmission SMTP.

Absence, valeur inconnue, mauvais profil B/N, fichier manquant, réponse500 ou timeout
font échouer le job. Aucun profil n'est déduit de la présence d'un fichier et aucun
échec de montage/startup n'est qualifié comme un RED du garde.

## Frontières factices et vraies

Le vrai entrypoint/CMD et le vrai serveur Next compilé s'exécutent. Le bundle,
le template et tous les actifs restent dans l'image. L'entrypoint écrit avec
`envsubst > /app/public/runtime-config.js` : seul ce fichier est monté writable,
neuf/exclusif0600/chown1000:1000 vérifié dans un dossier CI owned/nonce. Aucune
substitution du répertoire public. Tout autre fichier de l'image est readonly.

Chaque conteneur est nommé/étiqueté avec une nonce et lié à l'imageID attendue ;
node, network none, no-new-privileges, cap-drop ALL, 1CPU, 768MiB, 64PID et /tmp
tmpfs32MiB sont vérifiés. Aucun port hôte. `--no-healthcheck` désactive le wget
/api/ready de l'image. Seul /api/health sert à attendre en loopback. Le probe HTTP
est un processus séparé dont NODE_OPTIONS est explicitement vide et UID1000.

Le preload du serveur ne lit PAS le mode d'admission. Il ne répond qu'au GET
Auth/user synthétique et au POST get_smtp_config_secret (enabled:false) du vrai
SDK. Toute autre requête fetch ou ouverture de socket est refusée et comptée,
sans reproduire URL, JWT, adresse, contenu ou réponse brute. Les secrets service
et Bearer sont entièrement synthétiques. Le vrai handler décide de la réponse.
Ce double ne qualifie ni TLS/Auth réels ni les RPC d'intention installées.

Les six paramètres publics capturés sont identiques au build final, au build508
et aux quatre démarrages, pour couvrir aussi les références NEXT_PUBLIC compilées.
Le host public réel attendu est reconnu explicitement par le preload, qui n'y
accède jamais au réseau. Seuls clé service/Bearer sont synthétiques. Les variations
entre les quatre conteneurs sont le mode et leurs identités/chemins éphémères.

Les opérations Docker exigent un déclenchement manuel dans la CI GitHub Linux,
sur master ou sur le ref exact `refs/heads/codex/release-n2-loopback-fallback-20261107`.
Le contexte default et son socket local sont vérifiés. Les surcharges d’endpoint
sont refusées. Un conteneur n'est retiré qu'après contrôle de son ID physique,
image, nonce, mode, mounts et bornes. ACK create inconnu ou identité douteuse ne
permet pas une suppression par nom : job en échec/quarantaine sur cette VM éphémère.

## Calibration réelle et export

Une seconde checkout épinglée de la vraie source sans garde50805933 (arbre2cd09e)
est construite avec les mêmes paramètres publics. Pas de bundle final réécrit.
Sous closed, cette baseline doit réellement produire Auth1/config1/503
smtp_not_configured, puis être rejetée par le verdict de fermeture. Un500,
timeout, échec de démarrage ou double non branché fait échouer la calibration.

Avant docker save, `candidate.mjs export` relit une preuve complète et bornée liée
à source/arbre/imageID/config/outils/run/tentative/profil, aux quatre conteneurs
distincts et à cette calibration. Omettre la qualification ou sélectionner un
autre profil échoue. La preuve est un SECOND artefact GitHub, séparé du ZIP
historique à deux fichiers. Aucun ajout au manifeste schema1, smoke historique,
receiver ou importeur S0/S1/S2. Le validateur partagé exige un ref de release
admis et l’égalité du SHA attendu, du checkout et de GITHUB_SHA.

Les push/PR exécutent les gardes purs et le contrat natif Compose habituel. La
vraie matrice Docker est exécutée uniquement par la préparation manuelle
d’archive sur l’un des deux refs admis, avant export. Il faut donc distinguer ces statuts dans toute revue.
Une branche source B et une branche source N restent des sources distinctes ;
ces outils ne les composent pas et n'autorisent aucun déploiement.

Commande locale autorisée sans Docker/provider :

```sh
node --test tools/release-artifact/candidate.test.mjs tools/release-artifact/manual-email.test.mjs
```

La vraie commande CI, après prepare/build/smoke et checkout508 séparée :

```sh
node tools/release-artifact/manual-email-runtime.mjs qualify
```

La garantie SMTP prospective dépend encore de B fermé, du retrait vérifié des
anciens processus, du reçu SQL/postflight et de la flotte homogène N. Ce harnais
ne réconcilie pas une acceptation legacy et ne promet pas de livraison ou exactly-once.
