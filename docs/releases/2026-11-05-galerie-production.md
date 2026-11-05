# Galerie prestataire : livraison du 5 novembre 2026

La galerie de photos est active en production sur [Bertel](https://bertel.otisud.re). L'application déployée est `8f8e3d91f47dc473ad84b004fdff70949f9568b3`, isolée du reste du chantier portail. L'ouverture des écritures a été confirmée à **08 h 11, heure de La Réunion**. La base Supabase existante a servi à toute la recette ; aucun Docker ni nouvelle base sur le poste.

## Comportement livré

Cartes compactes, détails et édition des textes dans une seule modale, réorganisation des photos publiées par glisser-déposer ou au clavier ; la première est la photo principale. Le motif d'un refus, la demande de révision et le suivi restent associés à la photo concernée. La demande de révision humaine est active. La génération automatique d'analyses reste désactivée.

## Recette et déploiement

- Claude Opus 5.5 Max a relu le SQL et l'interface. Les corrections vérifiées portent sur le remplacement ou la suppression de la photo principale, la garde d'atomicité avant toute modification de schéma, la suppression d'un droit anonyme inutile, le focus de la modale et le texte du hub quand la galerie est en consultation. Claude a confirmé la résolution des deux dernières revues ciblées.
- Installation fermée réussie à 07 h 50. La recette a exécuté les contrôles réels de droits sur une fiche test déjà liée à son acteur : titre/description, ordre et principale, conflits de sauvegarde, refus et recours associé à la bonne photo, limite de vingt photos, remplacement/retrait et refus d'accès à une autre fiche. Les changements de rôle, photos, propositions, messages, notifications et droits de recette ont été annulés dans la transaction.
- [Client office compatible `75568b8`](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment/jwzceyyqoapd9ib0606bknq2) démarré à 07 h 53 min 48 s. Une réponse Bad Gateway a été observée pendant son remplacement ; santé et disponibilité répondaient 200 à 07 h 54. Contrat d'écriture interne 2/2.
- [Version finale `8f8e3d9`](https://coolify.otisud.re/project/qw40sk0s4w8sc0gkggokwso4/environment/mo4o40c8o8occs40o4cs0ks4/application/r48k844wg04kks848s00wco4/deployment/noiwvewly8sfhmasgyqglumv) démarrée à 08 h 09 min 38 s. La compilation exacte, TypeScript et les 49 pages ont été vérifiés ; 135 tests ciblés pour l'album, puis 56 pour le correctif de consultation (lots distincts, sans additionner les tests communs).
- Activation à 08 h 11 min 02 s. Les six règles de protection des écritures et les droits des fonctions ciblées ont été vérifiés ; l'ancien classement et l'expéditeur CRM générique restent fermés. Les contrôles HTTP après activation donnent santé et disponibilité 200 en mode live.
- Dans le navigateur de production, le compte de découverte existant a ouvert la fiche test avec quatre photos. Une modification du crédit a été enregistrée, relue dans la base et restaurée par une seconde sauvegarde. L'essai a été répété après activation. La ligne finale est identique à l'initiale pour tous les champs hors horodatage de mise à jour.
- Aucun compte prestataire de test connecté n'existait. Les opérations prestataire ont été exercées avec le rôle authentifié dans la transaction SQL et dans l'interface d'intégration. Aucun dépôt de vrais octets dans Storage depuis une session navigateur prestataire n'est attesté.

## API prestataire

Les onze fichiers qui définissent et exécutent les routes publiques sont identiques à la révision servie avant livraison (`35564dc`). Les quatre opérations OpenAPI v1.0.0 gardent leurs noms, paramètres, enveloppes et en-têtes. Aucun champ JSON n'a été ajouté.

Les treize lecteurs SQL conservent leurs définitions et attributs. Les réponses brutes et les projections HTTP de fiches publiées couvrant les douze types disponibles ont été comparées avant installation, après installation et après activation : **mêmes clés, types, valeurs nulles, tableaux et valeurs**, sans exclusion. Les routes catalogue et objets sans clé renvoient toujours 401, `{"error":"unauthorized"}` et la version 1.0.0.

Le journal prestataire a enregistré 42 appels réussis sur 42 sur 24 heures et 88 sur 88 sur 48 heures. Dernier HTTP 200 : **08 h 00 min 37 s**, après l'installation SQL et avant le déploiement de l'album. Aux relevés de 08 h 13 et 08 h 36, aucun appel prestataire n'était journalisé depuis le déploiement final. Aucun nouveau GET avec clé n'est donc revendiqué pour cette dernière fenêtre. À 08 h 37, les routes de santé et de disponibilité répondaient encore 200 en mode réel, et les routes publiques catalogue et objets sans clé renvoyaient le 401 attendu en version 1.0.0.

## Retour en production de la version de secours

Le paquet SQL, ses empreintes et les contrôles après activation sont décrits dans [le dossier de livraison](../../supabase/releases/20261105_partner_photo_album/README.md). Pour suspendre les écritures acteur, appliquer `close.sql` et vérifier la fermeture. Conserver les règles protégeant les tables et les données déjà enregistrées.

Si le client doit être remplacé, épingler `75568b8cd2e2da63306b4a9875fdbcd01f547df7` dans Git Source de Coolify puis redéployer. Ce commit compatible a réellement tourné en production. La page Rollback de cette ressource Compose n'a affiché aucune image de retour instantané : il s'agit d'une reconstruction, dont la durée observée était 2 min 44 s. Ne pas revenir au client 1/1 avec les nouvelles règles d'écriture.

