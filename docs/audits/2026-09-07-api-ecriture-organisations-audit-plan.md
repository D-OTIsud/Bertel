# API d’écriture pour les organisations — audit et plan

Date : 7 septembre 2026. Statut : proposition de conception à discuter, sans implémentation.

**Approfondissement disponible :** [identité, prévention des doublons, confidentialité et gouvernance](../../docs/audits/2026-09-07-api-ecriture-gouvernance-identite-conception.md). Ce second document précise et remplace les propositions initiales concernant la création immédiate d’une fiche, l’attribution de responsabilité et le retrait global. L’admission d’identité doit précéder la nouvelle fiche commune ; la responsabilité éditoriale ne vaut pas pouvoir de supprimer les flux des autres organisations.

L’audit porte sur la copie de travail du dépôt, les scripts SQL, les tests existants et les graphes de connaissance. Les migrations pertinentes ont été confrontées aux définitions initiales quand elles les remplacent. Le schéma effectivement déployé n’a pas été interrogé et les tests n’ont pas été exécutés. Les modifications préexistantes du dépôt ont été laissées en place. Aucun code, schéma, droit, clé ou déploiement n’a été modifié pour cet audit.

## 1. Conclusion

Le besoin est réalisable en réutilisant une partie des mécanismes métier existants. L’ouverture demande cependant davantage que des routes POST/PATCH : l’identité des clés, la responsabilité du contenu commun et la diffusion par organisation doivent être explicites.

Le modèle recommandé distingue quatre choses :

1. **La fiche commune**, avec ses données factuelles validées : adresse, horaires, caractéristiques, etc.
2. **L’organisation responsable de la fiche**, initialement celle qui la crée, avec ses éventuels délégataires de validation.
3. **La diffusion par organisation**, qui permet à chacune d’inclure ou de retirer cette fiche de son propre flux.
4. **La personnalisation éditoriale par organisation**, qui change les textes de son flux sans modifier la fiche commune.

Les horaires n’ont actuellement pas de variante par organisation. En revanche, ils sont déjà pris en charge par le mécanisme de propositions validées. **Recommandation : conserver des horaires communs et permettre à toute organisation autorisée de suggérer leur correction.** Des heures propres à une offre réellement différente justifieraient une modélisation de cette offre, plutôt qu’une variation silencieuse selon le diffuseur.

## 2. État actuel vérifié dans le dépôt

| Sujet | Ce qui existe | Conséquence pour le besoin |
| --- | --- | --- |
| API partenaire | Quatre routes de lecture : catalogue, liste, détail, suppressions définitives. | Aucune commande d’écriture partenaire existante. |
| Clés API | Clé hachée, révocation/expiration, scopes stockés, quota et journal HTTP. Aucune organisation dans l’identité retournée. Les routes ne contrôlent pas les scopes. | Une clé actuelle ne permet pas de déterminer au nom de quelle organisation une modification est faite. |
| Publication | `object.status` et les RPC de cycle de vie agissent sur la fiche globale. | Retirer de « mon flux » doit devenir une opération différente de masquer la fiche pour tout le monde. |
| Organisations liées | `object_org_link` porte notamment les rôles `publisher` et `contributor`, et un indicateur principal unique. | Ces liens sont utilisables pour les relations existantes, mais ne constituent pas une propriété organisationnelle durable ni une sélection indépendante de flux. |
| Droits sur le commun | Un membre d’une organisation `publisher`, muni des permissions correspondantes, peut modifier/publier le commun. La modération n’exige pas que cette organisation soit principale. | L’ajout d’un diffuseur en tant que `publisher` peut lui donner trop d’autorité sur la fiche. |
| Propriété actuelle | `is_object_owner` conserve un chemin historique par lien acteur primaire, mais la persona prestataire `actor` en est désormais explicitement exclue. La création rattache automatiquement la fiche à l’unique organisation active du créateur quand elle est identifiable. | Ces mécanismes ne suffisent pas à représenter l’organisation propriétaire d’un objet créé par une clé technique ; ils ne donnent pas au prestataire un accès direct au commun. |
| Personnalisation | `rpc_write_org_description` écrit les descriptions de l’organisation active ; l’organisation n’est pas choisie dans le payload. | Bonne base pour une commande partenaire limitée et isolée par organisation. |
| Validation | Propositions `pending_change`, modération, vue avant/après, acceptation/refus ; le portail regroupe les changements en soumissions avec tâche et notifications. | Réutilisation fonctionnelle possible, avec une entrée partenaire et des contrôles adaptés. |
| Horaires | Calendrier rattaché à l’objet ; `save_object_openings` est accepté dans le circuit de propositions du portail. | Pas besoin de créer des horaires locaux pour autoriser les suggestions. |

### Personnalisations réellement prises en charge

Le writer organisationnel accepte précisément :

- l’accroche (`description_chapo`) et ses traductions ;
- le descriptif (`description`) et ses traductions ;
- le descriptif d’accessibilité (`description_adapted`) et ses traductions.

L’interface principale des descriptions expose actuellement l’accroche et le descriptif. Le schéma contient d’autres textes, par exemple mobile et édition, mais leur présence dans la table ne signifie pas que le writer de personnalisation les accepte. Les horaires, tarifs, équipements et adresse ne font pas partie de cette personnalisation.

Pour une première ouverture, recommander l’accroche et le descriptif. Le texte d’accessibilité est techniquement pris en charge par le writer, mais son caractère factuel mérite un arbitrage avant de l’autoriser sans revue.

### Lecture et rendu à aligner

Les routes actuelles ne transmettent pas l’organisation de la clé. Le détail utilise des options vides ; le sérialiseur peut alors préférer l’organisation principale de la fiche. Cela ne garantit pas le rendu personnalisé de l’organisation consommatrice.

Le chemin `lang=all` choisit également l’organisation principale dans une fonction distincte, sans paramètre d’organisation. Corriger uniquement les options du détail ne suffira donc pas : liste, détail, toutes langues et formats d’export devront partager la même règle.

Autre nuance : dans le rendu principal examiné, le choix entre description organisationnelle et commune se fait par **ligne complète**, avec repli sur le commun seulement si la ligne organisationnelle est absente. Une accroche locale seule ne garantit donc pas l’héritage champ par champ du reste. Le futur contrat doit définir le repli par champ et par langue, ainsi que la différence entre un champ absent, une valeur vide et une demande de suppression de personnalisation.

Les tables `publication` et `publication_object`, utilisées pour les sélections éditoriales et le circuit de BAT, ne doivent pas être assimilées à un flux API propre à une organisation.

## 3. Points à résoudre avant d’ouvrir l’écriture

| Priorité | Constat | Travail nécessaire |
| --- | --- | --- |
| Préalable | Les clés n’ont pas d’identité organisationnelle et les scopes sont inactifs dans les routes. | Rattacher explicitement chaque nouvelle clé d’écriture à une organisation et imposer des droits positifs par opération. Conserver les anciennes clés en lecture. |
| Préalable | Les appels partenaires utilisent `service_role`. Les garanties ne proviennent donc pas de la RLS d’une identité partenaire. | Construire des commandes qui contrôlent le contexte de confiance, les droits et le périmètre à la frontière d’écriture. Ne pas appeler les sauvegardes internes avec des privilèges généraux en supposant que les contrôles utilisateur s’appliqueront. |
| Préalable | `publisher` mélange des responsabilités incompatibles avec une simple rediffusion. | Séparer responsabilité du commun, délégation et présence dans un flux ; ne pas donner `publisher` automatiquement lors de la rediffusion. |
| Préalable | Le portail exige une persona acteur et des fiches liées. Une seule soumission ouverte est permise par objet. | Créer une entrée partenaire ; permettre des propositions simultanées de plusieurs organisations sans bloquer le portail prestataire. |
| Préalable | Une proposition ne vérifie pas la révision du module au moment de l’approbation. Les horaires sont supprimés puis reconstruits par leur writer. | Capturer une révision ou empreinte de référence, la vérifier sous verrou lors de l’application, et signaler les conflits sans écrasement silencieux. |
| Préalable | L’entrée générique de proposition transporte table, action, payload et métadonnées de routage. | Exposer des objets métier typés et des champs explicitement autorisés. Le serveur choisit les writers ; le partenaire ne fournit jamais une fonction SQL à appeler. |
| Avant publication automatique | La RPC de statut contrôle droits et transitions, mais ne reprend pas les contrôles de complétude présents dans l’éditeur. | Garantir les règles de publication côté serveur, quel que soit le canal de saisie. |
| Avant synchronisation | Le journal de suppressions ne représente pas les retraits d’un flux organisationnel. | Prévoir des événements de flux ou une réconciliation complète documentée, y compris pour les retraits et changements de personnalisation. |

Le journal HTTP est actuellement écrit au mieux et le quota de lecture laisse passer les appels si son service tombe en panne. L’écriture doit disposer d’une traçabilité transactionnelle et d’un comportement de panne défini. Le journal d’accès ne remplace pas l’historique métier des changements.

Une limite de couverture est déjà visible : l’éditeur contributeur propose un writer de chambres `save_object_rooms` qui n’est pas dans la liste finale des writers applicables par la modération. Il ne faut donc pas annoncer « tous les champs sont suggestibles et applicables » sans inventaire. Le circuit distingue aussi une modification réellement appliquée d’une modification approuvée après report manuel ; cette distinction doit rester visible pour l’intégrateur.

## 4. Règles métier recommandées

Les règles ci-dessous sont des propositions pour la première version, et non des décisions déjà implémentées.

| Action de l’organisation A | Effet proposé | Validation |
| --- | --- | --- |
| Créer une fiche | Création d’un brouillon, responsabilité attribuée à A depuis la clé, préparation de sa présence dans le flux de A. | Contrôles serveur puis revue avant disponibilité publique. Le brouillon est consultable par A dans son espace de gestion. |
| Publier une nouvelle fiche | Après validation du commun, activation possible de sa diffusion chez A. | Droit distinct de publication ; l’intention de publier peut être enregistrée dès la soumission puis exécutée après validation. |
| Ajouter à son flux une fiche publiée de B | Création de la sélection de A ; la fiche reste sous la responsabilité de B. | Choix éditorial de A, soumis aux droits de sa clé. Aucun droit nouveau sur le commun. |
| Retirer cette fiche de son flux | Retrait chez A uniquement ; les autres flux restent inchangés. | Droit de gérer son flux. |
| Personnaliser accroche/descriptif | Enregistrement des seuls textes locaux de A. | Écriture directe possible avec le droit approprié ; repli défini vers le commun pour les champs non personnalisés. |
| Corriger horaires, adresse ou caractéristiques d’une fiche de B | Création d’une proposition ; le commun publié reste identique en attendant. | Organisation responsable B ou délégataire explicitement autorisé. |
| Modifier par API le commun d’une fiche appartenant à A | Même mécanisme de proposition en première version. | Revue par les validateurs autorisés ; l’identité technique de la clé ne vaut pas approbation humaine. |
| Changer propriétaire, droits, statut global ou données privées | Hors payload ordinaire de création/personnalisation/proposition. | Opérations séparées et contrôlées ; pas d’ouverture générique en première version. |

**Exemple.** A crée une fiche de restaurant. Après validation, elle est visible dans le catalogue partagé et diffusée chez A. B peut la diffuser chez B et rédiger sa propre accroche. B propose une correction des horaires : A la vérifie. Si elle est appliquée, le nouvel horaire commun est repris par les flux qui utilisent la fiche, sans effacer leurs accroches respectives. Si B retire la fiche de son flux, A continue de la diffuser.

### Responsabilité et validation

Représenter explicitement une organisation responsable, distincte de l’auteur technique et des diffuseurs. Conserver séparément l’origine de création, qui doit rester traçable même en cas de transfert ultérieur. Un lien principal historique n’est qu’un candidat pour la reprise des fiches existantes : les cas ambigus ou sans lien doivent être examinés, sans attribution arbitraire.

Le validateur devrait disposer d’une permission explicite au sein de l’organisation responsable, ou d’une délégation enregistrée. Prévoir un recours plateforme si la fiche n’a plus de responsable actif ou de validateur disponible. L’obligation d’une seconde personne distincte de l’auteur est un choix de gouvernance à confirmer.

Le circuit actuel distingue déjà deux contrôles : avoir le droit de modérer, puis avoir le droit d’écriture exigé par le writer lors de l’application. Un compte autorisé à valider peut donc échouer à appliquer s’il n’a pas ce second droit. La conception devra garantir qu’une décision autorisée est effectivement applicable, sans accorder pour autant une permission générale d’édition du commun à tous les diffuseurs.

Recommander que seules les fiches communes validées et publiées soient découvrables et rediffusables par les autres organisations. Les brouillons de A restent dans son espace de gestion. Une mise hors ligne globale suspend la présence dans tous les flux ; une simple désélection locale n’affecte que le diffuseur concerné. Définir également le comportement à la republication globale.

## 5. Conception technique proposée

### Identité et autorisation

Conserver les clés partenaires comme mode d’intégration, avec une liaison explicite à l’organisation, des scopes reconnus, une distinction test/production et une identité technique traçable. Une ancienne clé sans scopes d’écriture reste incapable d’écrire. Aucun octroi automatique à partir d’un libellé de clé.

Préserver le contrat des quatre GET historiques, leurs clés, leur périmètre de lecture et leur rendu. La résolution du flux par organisation et le nouveau repli champ/langue doivent être activés sur une surface ou une version explicitement choisie. Toute évolution du sérialiseur partagé devra respecter cette compatibilité.

Les droits effectifs doivent combiner l’organisation de la clé, le scope demandé, la relation à la fiche, son état et les règles du module. Ni l’organisation cible, ni le propriétaire, ni l’auteur de validation ne doivent être librement contrôlables dans le JSON. Ne pas fabriquer un contexte utilisateur arbitraire pour satisfaire `auth.uid()`.

Préférer une façade de commandes dédiée, distincte de la liste de RPC publiques en lecture. Les contrôles doivent rester valables à l’entrée privilégiée de la base, même si un autre appelant tente de contourner la route HTTP. Le choix précis du rôle technique et des fonctions privées reste à arrêter lors de la conception détaillée. Supabase distingue l’accès aux objets SQL, les politiques de lignes et les contrôles supplémentaires : [documentation officielle](https://supabase.com/docs/guides/api/securing-your-api).

### Modèle de données à concevoir

Prévoir explicitement : responsabilité de la fiche ; sélection de diffusion par organisation avec état et révision ; personnalisation avec révision propre ; soumission attribuée à une organisation et une clé ; décisions et historique ; références externes et idempotence.

Étudier l’extension des tables existantes pour les soumissions et personnalisations. L’index actuel d’une seule soumission ouverte par fiche ne doit pas être relâché sans conserver la règle utile au portail prestataire et traiter les soumissions concurrentes. Une nouvelle table de diffusion semble appropriée pour éviter de détourner `publisher` ; son nom et sa structure ne sont pas arrêtés ici.

Pour les objets existants, préparer une reprise contrôlée des responsabilités et des sélections. Préserver les coéditeurs historiques réellement autorisés au moyen de délégations explicites ; ne pas leur retirer leurs droits par une migration aveugle.

### Contrat HTTP indicatif

Les chemins sont proposés pour matérialiser le périmètre ; ils ne décrivent pas une API disponible.

| Commande | Intention | Scope indicatif |
| --- | --- | --- |
| `POST /api/public/objects` | Créer un brouillon attribué à l’organisation de la clé. | `objects:create` |
| `PATCH /api/public/objects/{id}/customization` | Modifier sa personnalisation autorisée. | `objects:customize` |
| `PUT /api/public/objects/{id}/publication` | Définir la diffusion dans son propre flux. Le contrat doit lever toute ambiguïté avec le statut global. | `feed:publish` |
| `POST /api/public/objects/{id}/proposals` | Soumettre des modifications du commun. | `proposals:create` |
| `GET /api/public/proposals/{id}` | Lire sa proposition, son état, les décisions accessibles et les éventuels conflits. | `proposals:read` |
| `GET /api/public/feed/objects` | Lire son flux publié avec ses personnalisations et un curseur de synchronisation. | `feed:read` |

Prévoir aussi une consultation de gestion limitée aux brouillons et soumissions de sa propre organisation : l’API de lecture publique actuelle ne peut pas remplir cet usage puisqu’elle ne retourne que les fiches publiées.

Pour le premier flux organisationnel, privilégier la représentation JSON native. Les exports JSON-LD, DataTourisme, Apidae et Tourinsoft empruntent actuellement des RPC distinctes sans contexte organisationnel transmis par les routes. Les ouvrir sur le nouveau flux seulement lorsqu’ils utilisent la même fiche effective et les mêmes personnalisations ; leur disponibilité actuelle sur le catalogue historique ne garantit pas cette prise en charge.

Une proposition persistée peut répondre `201` avec `pending_review`. Réserver `202` aux traitements effectivement asynchrones. Distinguer rejet métier, refus de droits, conflit de version et erreur technique. À titre de contrat à confirmer : `403` pour droits insuffisants, `422` pour payload interdit/invalide, `409` pour collision d’idempotence et `412` pour précondition de version dépassée.

Ne pas accepter le document JSON de lecture complet comme payload d’écriture : il contient des données calculées, liées, ou des informations que l’appelant ne possède pas. Pour chaque module ouvert, définir champs, limites, identifiants, sémantique des suppressions et validations côté serveur.

### Fiabilité et synchronisation

- Créations et soumissions : idempotence persistante par organisation et opération, avec empreinte du payload. Une nouvelle tentative identique restitue le même résultat ; une même clé d’idempotence avec un contenu différent est refusée.
- Déduplication métier : référence externe dans un espace de noms propre à l’intégration/organisation, contrôle des doublons probables, sans fusion automatique non décidée.
- Modifications : révision par ressource ou module, vérifiée à la soumission et à l’application. La révision des horaires doit changer avec leurs tables enfants ; ne pas supposer que la version du seul objet couvre tous les changements.
- Application : atomique pour l’unité de changement acceptée, avec état et audit dans la même transaction. Si une soumission accepte des décisions partielles, les rendre explicites par module.
- Notifications : réutiliser le circuit de tâches/notifications en évitant les doublons lors des nouvelles tentatives. Les décisions restent consultables même sans notification.
- Diffusion : isoler les caches et curseurs par organisation, langue et représentation. Les modifications de personnalisation, retraits locaux, masquages globaux et suppressions doivent être réconciliables. Préférer une séquence d’événements ordonnée avec identifiant stable ; un horodatage seul ne suffit pas à paginer sans perte lorsque plusieurs événements ont la même date. Les changements des tables enfants doivent alimenter cette synchronisation : `object.updated_at` seul ne les couvre pas actuellement.
- Sécurité de contenu : mêmes règles de visibilité publique et d’isolement test/production que la lecture ; pas de fuite de brouillons étrangers, contacts privés d’acteurs ou données CRM à travers une proposition ou une réponse d’écriture.

## 6. Plan de réalisation ultérieure

| Étape | Travail | Critère de sortie |
| --- | --- | --- |
| 1 — Contrat métier | Trancher les choix de la section 7 ; établir la matrice création/diffusion/personnalisation/suggestion/validation et la liste de modules ouverts. | Scénarios A/B sans ambiguïté sur qui peut changer quoi et qui valide. |
| 2 — Conception et reprise | Vérifier le catalogue déployé en lecture seule ; concevoir identité technique, responsabilité, délégations, sélection de flux, soumissions concurrentes et reprise de l’existant. | Spécification des données, des droits, de la reprise et du retour arrière, sans attribution implicite des propriétaires. |
| 3 — Socle de commandes | Implémenter ultérieurement scopes, contrôle de périmètre, validation serveur, idempotence, révisions et audit transactionnel. | Tests négatifs d’isolement et d’autorisation réussis avant toute route partenaire d’écriture ouverte. |
| 4 — Premier parcours complet | Création soumise à revue, diffusion locale, accroche/descriptif personnalisés, proposition d’horaires, suivi des décisions et lecture cohérente du flux. | Parcours A crée / B diffuse et propose / A valide démontré de bout en bout. |
| 5 — Extension des modules | Ouvrir progressivement les autres champs après vérification des writers, droits, suppressions, conflits et rendu de modération. | Matrice de couverture publiée ; aucune promesse de « toutes modifications » au-delà des modules réellement vérifiés. |
| 6 — Préparation du lancement | Documenter contrat OpenAPI, exemples, quotas, erreurs, synchronisation et administration des clés ; pilote en environnement isolé et mécanisme de désactivation de l’écriture. | Résultats de tests et pilote examinables ; activation en production traitée comme une étape séparée, hors de cet audit. |

Les médias/documents, les imports massifs, la suppression définitive, le transfert de propriété, les changements de droits et l’approbation par API ne sont pas proposés pour le premier périmètre.

## 7. Arbitrages à confirmer avant développement

| Choix | Recommandation initiale | Effet |
| --- | --- | --- |
| Qui décide du commun ? | Organisation responsable, délégataires explicites et recours plateforme. | Une organisation qui rediffuse ne devient pas automatiquement validatrice. |
| Les écritures de sa propre API sont-elles directement publiables ? | Toutes les créations et corrections du commun passent d’abord en revue ; publication automatique seulement après validation et avec intention/droit explicites. | Respect du circuit humain dès la première version ; une exception de confiance pourra être étudiée plus tard. |
| Que personnaliser sans revue ? | Accroche et descriptif avec traductions ; horaires et autres faits par proposition. | Limite les divergences factuelles entre flux. Décision spécifique à prendre pour le descriptif d’accessibilité. |
| Quand les autres voient-ils une nouvelle fiche ? | Après validation et publication du commun. | Les créations incomplètes ne deviennent pas des fiches publiques. |
| Qui peut proposer ? | Toute organisation d’écriture autorisée sur une fiche publique accessible, même sans la diffuser, sous quota. | Encourage les corrections sans lui attribuer un rôle `publisher`. |

## 8. Vérifications attendues lors de l’implémentation

1. Une ancienne clé, une clé révoquée, une clé d’une autre organisation et une clé de test ne permettent aucune écriture hors de leur périmètre ; les paramètres d’organisation/propriété injectés sont refusés.
2. Une création répétée après expiration réseau ne crée qu’une fiche, une responsabilité et une soumission. Un échec annule les écritures liées.
3. B peut diffuser et retirer une fiche de A chez B sans modifier le commun ni le flux de A, et sans obtenir de droits de validation.
4. Une personnalisation de B laisse intactes celles de A et C ; le détail, la liste, les variantes linguistiques et tout export effectivement ouvert produisent le rendu contractuel, sans contamination de cache. Les quatre GET et les clés historiques restent compatibles.
5. Une proposition d’horaires ne change rien avant validation. Seul le responsable ou délégataire autorisé peut l’appliquer ; une version dépassée produit un conflit exploitable.
6. Le portail prestataire et plusieurs organisations peuvent proposer sur la même fiche ; une décision ou un verrou ne fait pas disparaître les autres contributions.
7. Les champs inconnus, droits, statut global, provenance, identifiants étrangers, contacts privés et métadonnées de routage ne passent pas au travers d’un payload métier.
8. La publication via API respecte les règles de complétude côté serveur ; aucun contournement par appel direct du writer privilégié.
9. Le suivi restitue précisément en attente, rejeté, approuvé, appliqué ou conflit selon les états retenus ; un report manuel ne se présente pas comme une application automatique.
10. La synchronisation restitue créations, modifications et retraits sans laisser chez le consommateur une fiche absente de son flux. L’historique permet d’expliquer chaque mutation et décision.

Les tests actuels d’authentification partenaire, de refus des brouillons, de droits canoniques et du cycle de publication constituent des points de départ. Leur présence dans le dépôt ne vaut pas exécution réussie pour cet audit.

## 9. Principales sources du dépôt

- [Identité partenaire, authentification, quota et journal HTTP](../../bertel-tourism-ui/src/lib/partner-auth.ts:17) ; [table des clés et scopes](<../../Base de donnée DLL et API/migration_partner_api_keys.sql:23>).
- [Façade RPC publique de lecture](../../bertel-tourism-ui/src/lib/public-api.ts:18) ; [liste publiée](../../bertel-tourism-ui/src/app/api/public/objects/route.ts:76) ; [détail et options de rendu](../../bertel-tourism-ui/src/app/api/public/objects/[id]/route.ts:67).
- [Publication et écriture canonique selon le rôle publisher](<../../Base de donnée DLL et API/rls_policies.sql:3082>) ; [droit d’enrichissement](<../../Base de donnée DLL et API/rls_policies.sql:3134>) ; [cycle de statut effectif](<../../Base de donnée DLL et API/migration_object_status_lifecycle.sql:11>).
- [Rattachement automatique au créateur](<../../Base de donnée DLL et API/schema_unified.sql:6463>) ; [propriété acteur redéfinie pour le portail](<../../Base de donnée DLL et API/migration_actor_portal.sql:326>) ; [liens organisationnels documentés](../../dbdoc/public.object_org_link.md:7).
- [Champs réellement personnalisables](<../../Base de donnée DLL et API/api_views_functions.sql:7235>) ; [payload limité aux trois champs](../../bertel-tourism-ui/src/services/object-workspace.ts:6672) ; [organisation préférée au rendu](<../../Base de donnée DLL et API/api_views_functions.sql:3076>) ; [choix du descriptif](<../../Base de donnée DLL et API/api_views_functions.sql:3259>).
- [Soumissions prestataire et unicité de la soumission ouverte](<../../Base de donnée DLL et API/migration_actor_portal.sql:354>) ; [entrée prestataire](<../../Base de donnée DLL et API/migration_actor_portal.sql:688>) ; [application en modération](<../../Base de donnée DLL et API/migration_actor_portal.sql:1038>) ; [périmètre de modération](<../../Base de donnée DLL et API/migration_moderation_rpcs.sql:43>).
- [Calendrier commun](../../dbdoc/public.opening_period.md:8) ; [remplacement du calendrier à la sauvegarde](<../../Base de donnée DLL et API/migration_opening_period_recurrence.sql:257>) ; [proposition de chambres côté éditeur](../../bertel-tourism-ui/src/features/object-editor/contributor-proposal.ts:90).
- [Limites de la synchronisation actuelle](<../../Base de donnée DLL et API/migration_partner_tombstone_feed.sql:24>) ; [rendu toutes langues et organisation principale](<../../Base de donnée DLL et API/api_views_functions.sql:509>).
- [Test interdisant les writers dans la façade publique](../../bertel-tourism-ui/src/lib/partner-auth.test.ts:33) ; [tests de permissions canoniques/publication](<../../Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql:76>) ; [tests du cycle de statut](<../../Base de donnée DLL et API/tests/test_object_status_lifecycle.sql:2>).
