# Portail partenaire — préparation du lancement

Branche de revue : `codex/partner-portal-launch-20261030`. Aucune fusion dans `master`, aucun déploiement, aucun e-mail réel et aucun fichier envoyé dans Storage pendant ce chantier. Les validations sur `ryycrdhlkmzpxwwwwupy` utilisent une transaction annulée.

## Comportement retenu

- Invitations et relance depuis le SMTP de chaque office, sans repli sur le relais général.
- Deux plages horaires par jour ; ouverture sans horaires fixes conservée.
- Arrivée, arrivée jusqu’à et départ dans « Ouverture, arrivée et départ », pour les hébergements uniquement. Ces trois heures contrôlées sont enregistrées directement ; les autres champs de capacité gardent leur circuit.
- Accessibilité et ajouts de photos relus par l’office. Les nouvelles images et les images de remplacement restent privées jusqu’à l’approbation. Retrait et ordre des photos immédiats.
- Les sept sujets et exemples du formulaire fourni sont conservés. « Conseils » et « Événement ou nouveauté » ont leurs sujets CRM. Le sujet interne de « Me faire connaître » est `partenaire_b2c`, sans choix de canal supplémentaire dans le portail.
- Accueil sur place proposé par défaut pour hôtels et campings (`HOT`, `HPA`, `CAMP`). Le PDF Tourisme & Handicap sera fourni plus tard.

## Incréments préparés

1. Présentation ordinateur/mobile, aides, horaires cliquables, identité de l’office, invitation et formulaire SMTP approuvé.
2. Une enveloppe par module partagé, rubrique Accessibilité et heures de séjour enregistrées séparément.
3. Écrire à l’office, interactions CRM entrantes, pièces jointes privées, historique des réponses et notification de l’office.
4. Portail et affichage des plannings nommés : front préparé. L’éditeur de l’office et la correction du lecteur public restent en attente des validations demandées. Le fichier SQL et son test sont conservés localement, hors de la livraison des lots indépendants.
5. Galerie partenaire, ordre/retrait immédiats, dépôt privé et publication des ajouts depuis la modération existante.
6. Console « Paramètres › Espace partenaire », statistiques par office, sélection des destinataires, envoi en série, suivi et relance à sept jours.

## Relance et console

Les statistiques dédoublonnent les partenaires, même lorsqu’ils ont plusieurs fiches. Le compte est activé à sa première connexion ; le premier envoi correspond à une `fiche_submission` du partenaire sur une fiche de cet office. Les types et communes filtrent le groupe ; les comptes actifs et les adresses déjà utilisées par un autre compte sont exclus.

Les administrateurs de l’office peuvent lire la console. L’envoi exige aussi la permission existante `manage_actor_portal_access` et le droit CRM sur chaque acteur, vérifiés de nouveau par la route d’invitation. Une permission manquante apparaît comme un point bloquant.

Une invitation n’est enregistrée qu’après la réussite de l’envoi SMTP. Si le suivi échoue ensuite, le compte reste ouvert et le compte rendu l’indique. Un renvoi manuel ne réarme jamais une relance automatique déjà commencée.

Le conteneur de production lance `docker/portal-reminder-worker.mjs`, qui appelle toutes les quinze minutes la route locale protégée par la clé serveur. Il n’y a aucun secret dans une URL. `PORTAL_REMINDERS_ENABLED=false` désactive ce worker ; le mode démonstration ne l’exécute pas. Hors Docker, prévoir l’appel serveur de cette même route toutes les quinze minutes.

Les réservations sont verrouillées en SQL (`SKIP LOCKED`) et expirent avant le début de la livraison. Une barrière persistante, posée juste avant SMTP, empêche un second envoi si le serveur s’interrompt ou perd son acquittement. Une livraison dont le résultat est incertain reste à vérifier dans le CRM avant un renvoi manuel. Les échecs de préparation avant cette barrière sont différés au lendemain. Une connexion du partenaire annule son éligibilité.

Le bouton de test envoie le modèle à l’administrateur connecté, avec un sujet `[TEST]` et un lien vers la connexion. Il ne crée pas de compte partenaire et ne certifie pas le parcours complet d’activation. Celui-ci reste à vérifier avec un compte partenaire de test.

## SQL et contrôles

Ordre de préparation : `migration_org_smtp_settings.sql`, `20261031073734_partner_portal_stay_times.sql`, `migration_actor_portal_message.sql`, `migration_actor_portal_media.sql`, puis `migration_actor_portal_invitation.sql`. Le manifeste `ci_fresh_apply.sql` exécute leurs tests dans cet ordre. Le lot 4 s’intercalera après validation de son lecteur public et de l’éditeur.

Les migrations de messages et de photos reprennent le texte vif des fonctions existantes et conservent leurs gardes. Empreintes des références avant modification, fins de ligne normalisées :

| Fonction | MD5 |
| --- | --- |
| `submit_actor_fiche` | `0861011392137effc9c7cb97bef6beab` |
| `approve_pending_change` | `78b171f997cd630da118ecc81382448d` |
| `actor_portal_floor_modules` | `2bbe58646c2d56dc402bbede946e1511` |
| `claim_unmailed_notifications` | `44089157dd6aa1c659175001817c8440` |
| `save_object_openings` (non réécrite) | `7f1665faf55856c0c3b867a243d999e3` |

Le contrôle après transactions annulées retrouve ces mêmes empreintes ; les nouvelles fonctions et la table d’invitations restent absentes de la base réelle. `media.extra`, déjà présente en production (`jsonb`, nullable, sans défaut), est ajoutée au miroir du schéma et déclarée avec `IF NOT EXISTS` pour les installations neuves.

Validation locale du front : **570 suites et 5 666 tests**, plus TypeScript. Les tests du worker passent séparément avec `node --test docker/portal-reminder-worker.test.mjs`. Les tests SQL couvrent notamment les refus entre partenaires/offices/realms, les ajouts privés, la publication par l’office, la compensation après réponse perdue, le compte activé et l’unicité de la relance.

Contrôles GitHub sur `14ab9c6` : [Frontend CI](https://github.com/D-OTIsud/Bertel/actions/runs/41195757703) et [SQL fresh-apply](https://github.com/D-OTIsud/Bertel/actions/runs/41195757632) réussis.

Le contrôle complémentaire du lot 4 confirme deux corrections encore nécessaires : le lecteur public mélange les plages du service avec celles de l’ouverture et omet les noms ; le calcul « ouvert maintenant » considère aussi les services. Sur une fiche synthétique ouverte de 9 h à midi avec un service de 15 h à 15 h 30, le calcul actuel la dit ouverte à 15 h 10. Cette vérification a été annulée et aucune fonction d’ouverture n’a été remplacée. La proposition SQL conserve les corps vifs et ajoute le filtre du planning principal ainsi que les plannings nommés dans la réponse. Elle doit encore être intégrée, testée et relue après la validation de sa référence.

## Avant mise en service

Revue de la branche, contrôle CI sur base vierge, accord de fin de lot puis application des migrations et déploiement. Refaire la comparaison des fonctions juste avant l’application. Conserver les définitions antérieures et interrompre en cas de divergence non expliquée.

Pour chaque office : coordonnées publiques, SMTP enregistré et testé, `NEXT_PUBLIC_APP_URL` HTTPS et redirection Auth autorisant `/set-password?espace=1` (motif `/set-password*`). Vérifier le parcours avec un compte partenaire de test et la relecture avec un compte d’office, puis les ajouts/retraits/ordre et les pièces jointes privées.

Pour un retour en arrière : désactiver d’abord les relances, suspendre les nouveaux envois et traiter les propositions déjà déposées. Ne pas retirer un writer tant qu’une proposition en attente le référence. Restaurer les définitions sauvegardées seulement après cette vérification ; conserver les images canoniques déjà publiées et les traces d’envoi.
