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
4. Plannings nommés dans le portail, l’éditeur de l’office, la fiche et l’API. La proposition de l’éditeur et la référence SQL vive ont été validées le 31/10 : un bloc par planning, son type, son nom, deux plages par jour et son aperçu. L’accueil et les services ne modifient plus le calcul d’ouverture de la fiche.
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

Ordre de préparation : `migration_org_smtp_settings.sql`, `20261031073734_partner_portal_stay_times.sql`, `migration_actor_portal_message.sql`, `migration_opening_schedule_type_named.sql`, `migration_actor_portal_media.sql`, puis `migration_actor_portal_invitation.sql`. Le manifeste `ci_fresh_apply.sql` exécute leurs tests dans cet ordre.

Les migrations de messages et de photos reprennent le texte vif des fonctions existantes et conservent leurs gardes. Empreintes des références avant modification, fins de ligne normalisées :

| Fonction | MD5 |
| --- | --- |
| `submit_actor_fiche` | `0861011392137effc9c7cb97bef6beab` |
| `approve_pending_change` | `78b171f997cd630da118ecc81382448d` |
| `actor_portal_floor_modules` | `2bbe58646c2d56dc402bbede946e1511` |
| `claim_unmailed_notifications` | `44089157dd6aa1c659175001817c8440` |
| `save_object_openings` (non réécrite) | `7f1665faf55856c0c3b867a243d999e3` |

Le contrôle après transactions annulées retrouve ces mêmes empreintes ; les nouvelles fonctions et la table d’invitations restent absentes de la base réelle. `media.extra`, déjà présente en production (`jsonb`, nullable, sans défaut), est ajoutée au miroir du schéma et déclarée avec `IF NOT EXISTS` pour les installations neuves.

Validation locale du front : **571 suites et 5 676 tests**, plus TypeScript. Les deux tests du worker passent séparément avec `node --test docker/portal-reminder-worker.test.mjs`. Les tests SQL couvrent notamment les refus entre partenaires/offices/realms, les ajouts privés, la publication par l’office, la compensation après réponse perdue, le compte activé et l’unicité de la relance.

Les contrôles Frontend CI et SQL fresh-apply de la branche sont rattachés à la [PR #73](https://github.com/D-OTIsud/Bertel/pull/73). La comparaison des sources et les tests sur base vierge sont requis avant fusion.

Le lot 4 conserve chaque planning séparément, avec ses notes et ses données importées. Une grille complexe reste protégée sans empêcher de modifier un autre planning. La modification d’un service dans l’éditeur ne change pas l’ouverture principale ; l’aperçu affiche les deux. Ce comportement a été vérifié sur ordinateur et mobile avec le composant intégré, dans un aperçu local sans écriture en base.

La migration reprend les définitions vives des quatre lecteurs ci-dessous, conserve leurs signatures et leurs droits, et ajoute les plannings nommés à la réponse publique. Les plages d’accueil et de service sont exclues de la projection principale et du calcul « ouvert maintenant ». `save_object_openings` n’est pas réécrite. Le nouveau lecteur est `SECURITY INVOKER` ; son test vérifie que les plannings privés et de test ne sortent pas vers le rôle anonyme.

| Fonction | Empreinte vive avant | Empreinte historique fresh-apply avant | Empreinte après migration |
| --- | --- | --- | --- |
| `get_opening_slots_by_day(uuid)` | `ec068871a985ff7e38a5f671f6160f30` | `25503d9cd19b95f4c66179f1dee471ae` | `47ce778ad208be7ff87c57e30cd9f683` |
| `build_opening_period_json(uuid,text,date,date,integer)` | `c531f4dc7d173ccd7b1ac167755178d3` | `8f3c3fe32ac51997cd5cebbe045751db` | `f49480441b2bf7c0ae94171d2fdf551b` |
| `compute_open_status(timestamptz)` | `29dabf5a8c6d921814fd288f5cc412c8` | `aa9f821df464af48ce0838c5b0c9b833` | `8b7742ead1f426f48b58431fc3231c4c` |
| `is_object_open_now(text)` | `1d65bee9cde71bf13824b658d949aa17` | `93c5f267e493dc40c2fc77fb1a7fad20` | `fc82231403d838db123a16e6e6c0f764` |

Le précontrôle accepte seulement ces références connues et la version cible pour une réexécution ; toute autre divergence interrompt la migration. Les tests annulés sur le projet réel couvrent les trois plannings, le lecteur public complet, la borne de fin exclusive et le mode sans horaires. Avec une ouverture de 9 h à midi et un service de 15 h à 15 h 30, la fiche est bien fermée à 15 h 10. Après annulation, les empreintes vives sont inchangées et le nouveau lecteur reste absent.

## Avant mise en service

Revue de la branche, contrôle CI sur base vierge, accord de fin de lot puis application des migrations et déploiement. Refaire la comparaison des fonctions juste avant l’application. Conserver les définitions antérieures et interrompre en cas de divergence non expliquée.

Pour chaque office : coordonnées publiques, SMTP enregistré et testé, `NEXT_PUBLIC_APP_URL` HTTPS et redirection Auth autorisant `/set-password?espace=1` (motif `/set-password*`). Vérifier le parcours avec un compte partenaire de test et la relecture avec un compte d’office, puis les ajouts/retraits/ordre et les pièces jointes privées.

Pour un retour en arrière : désactiver d’abord les relances, suspendre les nouveaux envois et traiter les propositions déjà déposées. Ne pas retirer un writer tant qu’une proposition en attente le référence. Restaurer les définitions sauvegardées seulement après cette vérification ; conserver les images canoniques déjà publiées et les traces d’envoi.
