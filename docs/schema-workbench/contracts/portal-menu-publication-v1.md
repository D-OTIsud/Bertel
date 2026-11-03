# Publication des menus partenaire — préparation M

Cette préparation ajoute un backend et un service, sans brancher de nouvel écran. La configuration et les droits de publication acteur restent fermés. Le JSON de l’API prestataire existante et ses libellés restent inchangés.

## Champs livrés

| Donnée | Contrat M |
| --- | --- |
| Fiche | Acteur lié à une fiche `RES`, dans son périmètre courant ; masquage `menus` respecté. Aucun hôtel, activité ou événement. |
| Menus gérés | Uniquement `visibility='public'`, actifs ou inactifs. Les menus `private`, `partners` ou de visibilité NULL sont conservés hors de ce périmètre. |
| Menu | Nom, description, catégorie existante, position et disponibilité. Une création impose `visibility='public'` ; M ne transforme pas la visibilité d’un menu office. |
| Plat | Nom, description, prix, devise, références de type/unité/section, position et disponibilité. Un nouveau plat doit être nommé. |
| Prix | `null` signifie non renseigné ; `0` reste un nombre distinct. Borne `NUMERIC(12,2)` : de 0 à 9 999 999 999,99, deux décimales au maximum. |
| Régimes et allergènes | Références existantes, ajout et retrait explicites. Une liste d’allergènes vide ne prouve pas une absence d’allergènes : elle reste une information non renseignée. Aucun indicateur de certitude n’est inventé. |
| Médias et cuisines par plat | Gérés par l’office, conservés pendant les éditions M. Les identifiants de médias et liens cuisine ne sont pas exposés par le snapshot M. |
| Traductions et autres métadonnées | Aucune réécriture pendant une modification ciblée. Les colonnes inconnues et données masquées sont couvertes par un jeton opaque de bundle et conservées par le writer. Elles ne sont pas projetées dans le snapshot acteur. |

Une désactivation modifie `is_active` ou `is_available` et conserve la ligne. Une suppression exige un identifiant explicite et le jeton du bundle complet inchangé ; aucune absence dans un écran ne devient une suppression. La suppression explicite d’un parent retire ses enfants et liens selon les FK, sans supprimer leurs fichiers média. Ce point doit rester visible dans la validation de l’interface avant activation.

## Écriture et reprise

Le writer R4 est partagé via `internal.apply_object_menus_patch(text,jsonb)`. La façade office conserve sa garde canonique ; la façade M possède sa garde acteur RES. La migration vérifie l’empreinte et les attributs de R4 avant ce remplacement. Un rejeu n’est admis que sur la préparation exacte encore fermée ; une dérive ou une activation existante bloque ce rejeu.

Chaque intention reçoit un `request_id` UUID, conservé avec la requête exacte. Un retry du même identifiant ne réécrit pas les données et renvoie l’état courant. Une ancienne demande sans date ou de plus de 24 heures passe par une lecture de reçu, puis une recharge obligatoire ; elle n’est jamais publiée implicitement après une longue absence.

Les suppressions sont explicites, les identifiants restent stables, et une erreur annule toute la transaction. Les jetons M couvrent les lignes et leurs dépendances complètes : une correction office concurrente impose une nouvelle lecture. Les menus hors périmètre sont conservés.

## Raccord à l’extraction

`api.publish_portal_menus(text,jsonb,uuid)` accepte une opération E facultative. Sans opération, la saisie manuelle fonctionne sans document ni IA. Avec E, le contrôle de source/pages/cible précède l’écriture et l’enregistrement des IDs effectivement écrits appartient à la même transaction. L’ordre commun est fiche, opération, source/document, menus. Un échec tardif annule menus, reçus et association E.

Avec une opération E, `p_payload.extraction_draft_version` est obligatoire et appartient à l’intention exacte. E compare cette version sous son verrou avant toute écriture : une publication prise avant la correction d’un autre onglet est refusée. Ce champ est retiré avant le writer R4. Un reçu de publication déjà réussie est réconcilié avant les nouvelles vérifications de version/source et ne réécrit rien.

Une publication E ne peut supprimer aucun menu. Les plats à supprimer sont résolus en base et doivent appartenir à sa cible exacte ; un `menu_id` fourni par le client ne suffit pas. Cette vérification précède le writer partagé, afin qu’un menu indépendant et ses plats restent intacts.

Le parent menu ne possède pas de prix/devise de formule dans ce contrat. Le backend ne crée aucun faux plat pour représenter une formule tarifée. Une formule non représentable doit être signalée dans le résultat E, conservée comme telle pour revue, et rester hors publication structurée jusqu’à une décision de contrat. Aucune propriété publique supplémentaire ni suppression silencieuse n’est retenue ici.

## Validation et activation

Ordre : R4 corrigé → préparation M → préparation E → recettes isolées M puis E. La recette M réexécute l’acceptation R4 après le partage du writer, dont ajout/retrait/ajout d’un allergène, limites de prix, échec atomique et réponse perdue.

Le cutover M est séparé et refuse l’activation tant que les anciennes permissions DML menus subsistent. La validation de l’interface et les décisions sur formules précèdent toute activation produit. Les appels au service M ne sont actuellement branchés à aucun écran.

Juste avant tout grant, le cutover recontrôle les neuf empreintes de source, propriétaire, langage, mode de sécurité, volatilité, arguments/retour, expression canonique des paramètres par défaut, configuration et ACL. Une dérive depuis la préparation bloque l’activation. Sa recette réelle vérifie aussi les dérives de source, de valeur par défaut, de configuration et de privilège, puis la restauration OFF sans réouverture du DML.
