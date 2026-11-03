# Portail partenaire — corrections et mise en œuvre

3 novembre 2026 — **plan corrigé après revue Claude Opus 5.5, aucune implémentation ni mise en production effectuée**.

Référence : [audit indépendant du 03/11](C:/Users/dphil/.codex/worktrees/bertel-partner-portal-launch-20261030/docs/audits/2026-11-03-portail-partenaire-audit-astra.md), constats A01–A08. Worktree existant `C:/Users/dphil/.codex/worktrees/bertel-partner-portal-launch-20261030`, HEAD `4d8d844f18c90b6428fe787456c5bb395fdaefe2` et documents non committés conservés. Base cible `ryycrdhlkmzpxwwwwupy`.

Ce document devient la proposition de référence pour la prochaine demande d’implémentation. Les plans du 02/11 restent des archives de solutions possibles. Une tâche n’est terminée qu’avec sa preuve de sortie ; code, tests, base appliquée, front déployé et parcours observé sont cinq états distincts.

## 0. Exigence impérative : API prestataire disponible et compatible

Précision utilisateur du 03/11 après le premier plan : l’API prestataire doit rester en ligne et fonctionnelle. **Aucun changement de structure, de libellé ou de contrat existant** n’est autorisé par ces travaux. Ne renommer, supprimer, déplacer ni réinterpréter aucune clé ; conserver enveloppes, imbrications, types, conventions null/vide, identifiants, libellés, routes, paramètres, pagination, authentification et codes de réponse. Une petite addition JSON peut être proposée seulement si elle est optionnelle et démontrée compatible avec les consommateurs ; ce n’est pas une permission de remodeler le contrat.

- [ ] Figer avant implémentation les réponses de référence et contrats des variantes effectivement exposées, puis comparer chaque lot susceptible de les toucher : R1, R3, plannings, cartes, menus et extraction. Inclure lecteurs SQL et routes qui emploient des droits privilégiés.
- [ ] Distinguer correction de contenu autorisé et changement de structure. R3 peut retirer des résultats qui ne doivent pas être publics, mais conserve exactement les mêmes champs/enveloppes ; documenter cette correction de visibilité et tester les clients concernés. Aucun masquage silencieux d’une rupture derrière une nouvelle version de contrat.
- [ ] Vérifier la disponibilité par des lectures HTTP bornées avant/après livraison, avec un accès existant autorisé ; relever statut, format et résultat utile sans exposer clé ni données privées. Une route joignable ou une CI verte ne prouvent pas à elles seules que l’accès prestataire authentifié fonctionne. Toute limite de vérification reste explicitement indiquée.
- [ ] Préserver le service API durant les migrations et bascules ; une éventuelle suspension des écritures office/portail ne doit pas couper ses lectures. Prévoir des délais de verrouillage bornés, le contrat SQL compatible disponible avant le front et une désactivation ciblée du nouveau domaine si les contrôles échouent.

**Condition de livraison de chaque lot concerné :** aucune régression du contrat externe ni de la disponibilité ; preuve sur référence existante et parcours consommateur. En cas de divergence, ne pas activer le lot et corriger sa mise en œuvre, sans demander aux prestataires de s’adapter.

Contrat source à figer : `docs/openapi.json`, `docs/partenaires.html` et les routes `src/app/api/public/` ; conserver la version `1.0.0` et l’en-tête `X-Bertel-Api-Version`. Les domaines d’exemple d’OpenAPI ne constituent pas une URL de production.

| Route existante sous `/api/public` | Invariant de réponse et de comportement |
|---|---|
| `/objects` | `data` tableau et `meta.contract_version/page_size/total/next_cursor` ; card par défaut 50, maximum 200 ; full par défaut 25, maximum 100 ; curseur opaque, `null` en fin |
| `/objects/{id}` | `data` ressource complète ; inconnu/non publié → 404 ; enrichissement `i18n` pour `lang=all` sur ce détail, sans inventer le même traitement pour la liste |
| `/catalog` | `data` objet domaine → tableau ; entrées `code,name,icon_url,parent_code,domain`, codes et libellés conservés |
| `/objects/deletions` | `data` tableau `{object_id,type,deleted_at}` et `meta.cursor/count` ; `since` ISO, limite par défaut 500, maximum 1000 |

Les erreurs gardent leur forme `{error,…}`, sans ajout d’enveloppe `meta/data`. Préserver aussi `open_now` à trois états, texte/`*_md`, IDs, les 19 codes de type, ordre métier et distinction absent/`null`/`[]`. Aucun nouveau scope ni mécanisme d’authentification imposé aux clients. La note d’avis `rating` ne devient jamais une note de qualité photo. Les enrichissements optionnels étant best-effort, vérifier leur présence et leur contenu attendu ; HTTP 200 seul ne suffit pas.

Compléter les tests de routes existants, qui simulent leurs dépendances, par des références JSON déterministes en recette isolée avant/après. N’autoriser dans le comparateur que les ajouts nommément décidés et les exclusions de visibilité attendues ; pour R3, tous les éléments conservés doivent garder leurs valeurs. Tester les variantes/profils réellement utilisés, sans activer un export actuellement absent.

**Vérification datée du 03/11 à 10:32 (La Réunion) :** la passerelle `https://bertel.otisud.re/api/public` répond en HTTPS sur objets/catalogue ; sans clé, réponses JSON 401 `unauthorized` et version `1.0.0`, conformes à la garde d’accès. Le relevé préalable compte 42 appels réussis sur 24 h, aucun 5xx, dernier succès à 08:00. Cela démontre disponibilité de la passerelle et activité récente, **pas une recette authentifiée actuelle de tous les contenus**. [Preuves et limites](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/api-disponibilite-20261103.json). La recette future emploie une clé existante, gardée en mémoire sans affichage ; ces GET alimentent la télémétrie normale sans modifier les fiches.

## 1. Ordre de travail et dépendances

| Lot | Résultat livrable | Dépendances réelles | Taille relative |
|---|---|---|---|
| R0 — Préparer | Référence, périmètre, consommateurs et environnement de recette identifiés | Audit | Petite |
| R1 — Activité | Contrat office/base réparé, données activité conservées | R0 | Petite |
| R2 — Séjour | Heures protégées contre ancien onglet et sauvegarde de capacité | R0 | Moyenne |
| R3 — Lectures restaurant | R3a : restitution publique ; R3b : droits des tables sans perte office | R0 ; R4 avant resserrement RLS R3b | Moyenne |
| R4 — Writer menus office | Modification atomique, identifiants conservés, anciens DELETE bloqués | R0 ; se développe en parallèle | Moyenne à importante |
| R5 — Photos : plafond réel | Vingt au total, remplacement à vingt et modération B sûrs | Contrat du lot photo préparé | Moyenne |
| R6 — Propositions relues | Ancien instantané équipements/plannings incapable d’écraser une correction récente | R0 | Moyenne |
| X1 — Export régional | Réception/services séparés de l’ouverture exportée | Sources de l’export ; pas son déploiement préalable | Petite à moyenne |
| L — Socle et pilote | Six lots initiaux effectivement utilisables | R2, R5, R6, prérequis par office ; R1 pour ACT/ASC | Moyenne, surtout intégration/recette |
| C — Carte restaurant | Ajouter/remplacer/retirer de bout en bout | R3a, identité/droits du socle L, nouvelle UI validée | Moyenne à importante |
| M — Menus textuels | Restaurateur autonome, office correcteur | R3 + R4, identité/droits et UI validée | Importante |
| E — Extraction | Préremplissage vérifié et quota durable | C + M, paramètres IA définis | Importante |
| P — Photos notées | Notes, motifs, refus et recours humain | R5 + circuit photo L, règles d’activation définies | Moyenne à importante |

**Ordre conseillé : corriger les contrats, fermer le socle initial, puis livrer C, M et E.** Ce séquencement ne crée pas de dépendances artificielles : le chemin technique vers C est R0 → R3a + identité/droits du socle → C. La carte n’attend ni séjour, ni photos, ni relance J+7. R1 conditionne la recette activité, pas la carte. R4 prépare M et la fermeture RLS R3b sans bloquer C ; M n’exige que l’identité/droits du socle, pas la clôture de ses six lots. X1 ne bloque que l’activation de son export. P exige le circuit photo sûr, pas tous les lots du socle ; il ne bloque ni C ni M. Les menus textuels et l’extraction sont des objectifs acquis, pas des options à rejustifier.

Les tailles expriment l’étendue, pas un délai promis. Chiffrer le calendrier après R0, en fonction de l’environnement et des dépendances externes réellement disponibles.

## 2. R0 — Référence et contrat de livraison

- [ ] Préserver ce worktree et ses documents non suivis ; relever branche, HEAD et état. Compléter la PR73 par corrections cohérentes ; ne pas réécrire son historique. Préparer les compléments restaurant/photo en PRs séparées ou empilées, afin de garder des revues bornées.
- [ ] Lire graphify et l’index DB pour les chemins modifiés ; partir des définitions vivantes, signatures et droits, pas du vieux fichier SQL global. Les relevés du 03/11 sont une référence datée : comparer à nouveau juste avant toute migration.
- [ ] Identifier le front actuellement déployé, les appels réels aux writers concernés, les imports/traitements privilégiés et les consommateurs API/exports. L’usage API est établi ; les clients et champs consommés restent à inventorier.
- [ ] Préparer une base isolée reconstruite par le manifeste et un scénario de mise à niveau depuis l’état vivant documenté. Fixtures et comptes de recette uniquement dans cet environnement, jamais sur la production même avec ROLLBACK.
- [ ] Préparer les références avec le SQL réel et les routes utilisant `service_role` : détail et liste full, FR et enrichissement `lang=all` du détail, ACT/ASC avec et sans ligne, RES avec et sans carte, FMA et profils effectivement utilisés. Comparer récursivement clés, types, valeurs, ordre, libellés et absent/null/tableau vide ; un renommage volontaire doit faire échouer ce contrôle. Les exclusions R3 portent sur des éléments précisément attendus, jamais sur une exemption générale `menus/**`.
- [ ] Tenir un registre par lot : sources attendues, migration, changement de droits, front minimal, tests, résultat de recette et méthode de désactivation. Pour les nouveaux écrans, préparer les aperçus isolés décrits §5 ; les blocs déjà approuvés ne sont pas remis au vote.

**Sortie R0 :** liste des chemins d’écriture/lecture et de leurs consommateurs, environnement de recette, préconditions et décisions ciblées identifiés. L’absence d’un consommateur connu est notée comme limite, pas interprétée comme absence de consommateur.

## 3. Corrections du code et de la base existants

### R1 — Activité, sans nouvelle question partenaire (A01)

- [ ] Reprendre `migration_activity_contract_fix.sql`, déjà au manifeste ; vérifier son effet incrémental et son contrôle sur le détail du matériel.
- [ ] Garder le loader, le writer office et les quatre questions partenaire existantes : durée, participants minimum/maximum et âge. Ne pas ouvrir automatiquement le texte matériel.
- [ ] **Choix conservateur retenu pour ce lot : aucun ajout JSON externe.** La colonne reste utilisable par le loader/writer office direct, mais sa clé est explicitement exclue de la projection `to_jsonb(object_act)` du reader partagé. Elle reste absente, pas présente avec `null`. Ajouter la colonne et cette exclusion dans la même transaction pour éviter toute fenêtre d’émission intermédiaire ; conserver toutes les autres clés et valeurs.
- [ ] Appliquer le SQL cohérent, recharger le schéma PostgREST (`NOTIFY pgrst, 'reload schema'`), confirmer la lecture de colonne et les réponses API, puis seulement livrer le front qui la sélectionne. Tester aussi l’ancien onglet qui retire « matériel fourni » alors qu’un détail existe : erreur contrôlée en français et saisie conservée.
- [ ] Ne pas incrémenter la version publique. Un futur ajout de cette clé serait un incrément séparé, explicitement retenu et notifié selon l’engagement du guide partenaires ; aucun envoi n’est autorisé par le présent plan.

**Sortie :** ACT et ASC chargent et sauvegardent leur détail avec et sans ligne existante ; réponses API identiques avant/après, y compris absence de ligne et de nouvelle clé. Cibles : `object-workspace.ts:3223/5396`, migration activité, reader partagé et tests API.

### R2 — Heures de séjour et ancien écran office (A02)

- [ ] Séparer la capacité/les animaux des heures et conditions de séjour. Une sauvegarde de capacité ne doit plus réécrire ou supprimer une politique inchangée.
- [ ] Prévoir un contrat métier étroit pour séjour : trois heures pour le partenaire ; heures et conditions autorisées pour l’office. Champs acceptés explicites, valeurs vides/null contrôlées, aucune autre colonne modifiable.
- [ ] Comparer l’état de départ attendu sous verrou avant de changer les heures ; traiter correctement l’absence de ligne. Conserver les champs non visés. En conflit, renvoyer un résultat exploitable et garder la saisie.
- [ ] Convertir les chemins office et partenaire ; fermer ensuite l’ancien DML direct sur `object_stay_policy` pour les clients ordinaires. Le nouveau RPC seul ne protège pas contre un vieux client qui fait encore UPSERT/DELETE.
- [ ] Réutiliser le mécanisme existant `write-compatibility.ts` / `/api/app-version` pour faire recharger les anciens bundles, sans le considérer comme la seule barrière. Pas de repli « état attendu absent → écrasement ».
- [ ] Gérer explicitement le succès partiel : le saver actuel réalise capacité puis séjour en deux étapes. Si elles restent séparées, indiquer ce qui a été enregistré et ne réessayer que l’opération échouée, avec sa bonne base.

**Sortie :** sauvegarde d’une capacité depuis un ancien état après changement d’heure → heure récente conservée ; vrai conflit d’heures → refus contrôlé ; ancien DML → refus serveur. Cibles : `object-workspace.ts:4812–4868`, migration séjour préparée, service de sauvegarde et compatibilité.

### R3 — Lecture publique et lecture étendue (A03)

- [ ] **R3a, restitution sans resserrement RLS préalable :** corriger la définition actuelle de `get_object_resource` : menus actifs, plats disponibles, documents autorisés et valides sur la projection publique ; garder les données complètes pour l’office habilité. Conserver la garde d’exclusion R1 si elle est déjà livrée.
- [ ] Aligner le lecteur du volet RES. Tester aussi le bloc SQL menus FMA, sans inventer un écran menu FMA.
- [ ] **R3b, après R4 et fermeture de l’ancien saver :** corriger les accès directs aux tables menus/plats et enfants pour la confidentialité propre du menu. Ne pas transformer `is_active` / `is_available` en filtres RLS qui amputeraient le chargement office ; ces états se filtrent dans la restitution publique. Garantir une lecture complète à tous les correcteurs canoniques, dont superuser sans membership, sans élargir les droits acteur ou autre office.
- [ ] Le saver actuel efface les menus en cascade : un resserrement isolé de SELECT peut lui cacher des enfants qu’il supprimerait ensuite. Ne pas anticiper R3b sans convertir ou suspendre cette écriture et fermer l’ancien DML. Le défaut de confidentialité des lectures directes reste ouvert tant que R3b n’est pas clos ; ne pas déclarer A03 entièrement corrigé avec R3a seul.
- [ ] Reprendre le prédicat documentaire public existant : scope public, URL HTTP(S) absolue et dates du lien **et** du document. Éviter une règle divergente du régional ; tester l’ensemble documentaire commun sur la même fixture, sans activer cet export. Relever la carte existante avant application. Au contrôle du 03/11 à 10:38, l’unique carte non-test a scope public et dates valides mais son objet n’est pas publié : aucune disparition de carte actuellement exposée n’est établie.
- [ ] Vérifier les routes API liste/détail, le mode complet et leurs appels privilégiés. Une clé service ne dispense pas d’un filtre public explicite. Garder l’enveloppe publique et les contrats compatibles ; documenter tout changement de contenu.
- [ ] Préparer le rendu `menu_documents` utilisé par C, sans message de disponibilité avant réponse réelle.
- [ ] Documenter les corrections de visibilité dans le guide partenaires, sans changer les clés ni leur sens. Mesurer avant/après la latence de la liste full au plafond de 100, dans les mêmes conditions isolées ; définir le budget de non-régression en R0 et garder des prédicats simples, sans fonction coûteuse par élément.

**Sortie R3a :** restitution publique correcte et sous-arbres conservés identiques ; un tableau devenu vide reste `[]`. **Sortie R3b :** matrice public/acteur/office/superuser sans membership/autre office/service-route passée ; chargement puis sauvegarde d’un menu privé avec plat indisponible conserve toutes les lignes. L’office peut encore corriger ces données.

### R4 — Writer menus atomique partagé (A04)

- [ ] Remplacer le DELETE/INSERT multi-requêtes de `saveObjectWorkspaceMenus` par une transaction métier ; conserver identifiants, relations et champs masqués, supprimer seulement les éléments explicitement visés.
- [ ] Vérifier les références, l’appartenance des enfants et l’état attendu. Une panne annule toute l’opération ; un ancien état ne supprime pas un menu ajouté depuis. Un retry retrouve son résultat sans doublon.
- [ ] Basculer d’abord l’éditeur office vers ce contrat. Puis adapter M avec une liste de champs partenaire autorisés ; ne pas envoyer le petit formulaire brut comme état complet de l’office.
- [ ] Après inventaire et conversion des consommateurs, fermer le DML direct ordinaire sur les tables menus/plats et leurs enfants concernés. Tester les anciens DELETE même sans garde de version. Conserver les droits des imports nécessaires, mais convertir leur écriture ou suspendre le domaine tant que leur interaction n’est pas sûre.
- [ ] Ne pas confondre cette réparation avec `rooms-reconcile-v1`, déjà déployé et à conserver.

**Sortie :** erreur injectée au milieu d’un menu → aucune perte ; deux onglets → conflit/preservation ; mêmes identifiants après correction d’un prix ; aucun menu hors écran supprimé. Ce lot est utile à l’office même avant M.

### R5 — Plafond photo total et remplacement (A06)

- [ ] Compter au serveur le stock retenu et les ajouts/réservations en cours, office et partenaire inclus. Réemployer les reçus documentaires et métadonnées existants si leur contrat suffit ; aucun compteur uniquement navigateur.
- [ ] Convertir aussi le saver galerie office qui écrit directement dans `media`. Fermer les anciens DML sur les seules photos racines concernées, ou démontrer une protection équivalente en base : le comptage des RPC ne suffit pas si une écriture directe le contourne. Préserver vidéos et médias rattachés aux lieux.
- [ ] Pour cette table partagée, préférer des policies `AS RESTRICTIVE` propres à INSERT/UPDATE/DELETE, avec `USING`/`WITH CHECK` adaptés au prédicat photo racine. Pas de REVOKE global ni `FOR ALL` qui affecterait les autres médias ou SELECT. Vérifier le cumul avec toutes les policies permissives ; les imports privilégiés restent à convertir/inventorier, la restriction du rôle ordinaire ne les couvre pas.
- [ ] À vingt, autoriser un remplacement ciblé gardant l’ancienne photo jusqu’à publication réussie. Historique supérieur à vingt : aucun retrait forcé ; retrait/ordre et échange sans ajout net restent possibles.
- [ ] Libérer une place après refus/abandon confirmé ; distinguer la place photo du coût d’une analyse déjà exécutée.
- [ ] Préserver l’ordre de verrous de la modération B : ne pas prendre `pending_change` après `object` sur un chemin qui inverse l’approbation. Tester upload, office et approbation simultanés.

**Sortie :** deux ajouts concurrents à dix-neuf ne dépassent pas vingt, y compris depuis l’office ; ancien DML incapable de contourner le plafond ; remplacement à vingt et panne conservent l’ancienne photo ; aucune régression du retrait/ordre immédiats, des vidéos ou des médias de lieux.

### R6 — Propositions équipements/plannings devenues obsolètes

Complément issu du recoupement code C08 : `characteristics` et `openings` transportent un état de collection que `approve_pending_change` redispatche. La garde de lecture des brouillons ne prouve pas que cet état reste actuel lors de l’approbation. C’est un risque établi par le chemin de code, pas un incident observé.

- [ ] À la soumission, vérifier côté serveur l’état de départ autorisé et conserver une précondition fiable pour la collection concernée. Ne pas accepter comme preuve un simple résumé `before` fourni par le client.
- [ ] À l’approbation, comparer sous verrou l’état courant du domaine avant redispatch ; vérifier que les writers concurrents participent à cette protection, un verrou sur la proposition seule ne suffit pas. Bloquer l’application d’un état dépassé, conserver proposition et saisie, permettre relecture/report explicite. Un changement dans un autre module ne doit pas créer de faux conflit.
- [ ] Pour les propositions historiques sans précondition, interdire la réapplication automatique aveugle. Prévoir une nouvelle proposition depuis une lecture fraîche ou une action explicite de report manuel historique à implémenter : `approved`, attestation nominative et raison, sans changer le payload/RPC d’origine. L’attestation actuelle ne traite que `rpc IS NULL` ; ne pas effacer ce champ ni fabriquer une baseline actuelle pour contourner la garde.
- [ ] Garder `capacity-policies` en report manuel ; ne lui ajouter aucun writer automatique pour faciliter cette transition. Préserver le chemin photo dédié et ses gardes.

**Sortie :** office modifie équipement ou ouverture après soumission → approbation incapable de rétablir l’ancien état ; soumission déjà périmée refusée sans perte ; proposition historique conservée et traitable. Cibles : `contributor-proposal.ts:65–71/156–189`, `migration_actor_portal_media.sql:475–592`, source vivante recontrôlée avant patch. Protection ciblée, aucun moteur de version général.

### X1 — Export régional préparé (A05)

- [ ] Corriger le CTE `opening_slots` régional : accueil/service ne deviennent pas les deux créneaux d’ouverture principale ni une ouverture dimanche soir.
- [ ] Tester ouverture 09–12/14–18 + accueil 08–09 + service tardif, sans horaires fixes et fermeture.
- [ ] Identifier les consommateurs avant de toucher les anciens helpers sans filtre. Ne pas déployer la pile Tourinsoft régionale entière pour réaliser cette correction.

**Sortie :** sérialiseur préparé correct ; activation de cet export interdite tant que sa recette ne passe pas. Il était absent de la base au contrôle du 03/11.

## 4. L — Fermer les six lots initiaux et réaliser un pilote

| Lot historique | Travail de mise en service restant | Preuve exigée |
|---|---|---|
| 1 — Identité/SMTP | Configuration SMTP et coordonnées publiques par office ; URL HTTPS et redirections Auth ; interface approuvée conservée | Test avec destinataire de recette autorisé, puis invitation/activation isolée ; aucun repli sur relais global |
| 2 — Envois/accessibilité/séjour | Migration séjour + R2/R6 ; dédoublonnage par module, accessibilité relue ; PDF handicap différé | Heures directes seules, accessibilité non publiée sans relecture ; ancien état refusé, module partagé préservé |
| 3 — Messages | RPC, sujets CRM, contrainte notification et fichiers privés livrés ensemble | Sept sujets/exemples attendus, pièce lisible par destinataires autorisés seulement ; reprise après échec |
| 4 — Plannings | Référentiels et lecteurs préparés, R6, UI office validée, deux plages et mode sans horaires | Service tardif n’ouvre pas la fiche ; noms/types conservés ; grille complexe et correction récente protégées |
| 5 — Photos B | RPC/stockage/modération préparés + R5 | Ajout privé, approbation office, retrait/ordre directs ; état « transmis à l’office » honnête |
| 6 — Lancement/J+7 | Table/RPC/worker coordonnés ; permission CRM et sélection des destinataires | Comptes activés exclus, pas de double relance après réponse perdue ; résultat incertain visible, aucune garantie fictive de livraison |

Tester tout le parcours dans l’environnement isolé : partenaire et office habilités, autre office, autre fiche et autre environnement. Inclure les rubriques déjà présentes, les contenus privés et la conservation des brouillons.

Pour le premier pilote réel, après une demande d’implémentation puis une mise en service autorisée : choisir un petit groupe volontaire, revoir les destinataires, configurer chaque office, et observer activation, première mise à jour et relecture. Les envois réels ne servent pas de test automatisé. Garder les relances désactivées jusqu’à recette ; un envoi SMTP au résultat incertain exige une vérification, pas une répétition automatique.

## 5. C puis M — Parcours restaurant concrets

**Direction visuelle proposée :** reprendre identité de l’office, typographie, couleurs sémantiques et contrôles existants. Une colonne sur téléphone, une action principale par état, noms humains des fichiers et détails secondaires repliés. Préparer ensemble les aperçus isolés carte/menu/extraction/photo, puis valider seulement ces nouvelles interfaces avant intégration, conformément à la préférence app-ui-ux. Les maquettes de succès fictif ne servent pas de formulaire de production.

### C — Carte PDF/image complète

- [ ] Réutiliser `ref_document` / `object_document`, rôle carte. Droit acteur limité à sa fiche RES ; contrôle avant toute clé privilégiée, puis nouvelle vérification au commit. Le dépôt ne modifie ni cuisine ni menus.
- [ ] Stocker le nouveau dépôt privé pendant l’aperçu ; contrôler signature/type/taille et traitement image avec les outils existants. Vérifier réellement les limites du bucket réutilisé et les formats téléphone avant de les annoncer.
- [ ] **Choix compatible retenu après revue :** à la demande explicite de publication, copier vers le bucket public `documents` déjà utilisé, avec une URL HTTPS absolue de même format et un chemin immuable. Réutiliser le service Storage, sans introduire une nouvelle route applicative de téléchargement. Conserver un reçu durable de copie/finalisation pour retrouver un résultat après interruption.
- [ ] Publier/remplacer/détacher le lien par une mutation commune office/partenaire, avec état attendu et identification de requête. Revérifier droits, fiche, document, copie attendue et concurrence lors de la finalisation SQL atomique. Ancien lien et ancien fichier conservés jusqu’au succès ; documents partagés jamais supprimés globalement.
- [ ] Le `ref_document` finalisé doit lui-même porter `access_scope='public'` et une URL conforme ; les dates du document et du lien doivent correspondre à la publication voulue. Sur une fiche publiée, une carte annoncée disponible immédiatement doit apparaître dans l’API R3a. Une carte future ou expirée reste exclue selon les mêmes règles, sans annoncer une disponibilité fictive.
- [ ] Garder les clés/types de `menu_documents` et tester depuis un consommateur externe sans session GET, HEAD, Range, MIME, redirections et cache. Retrait/expiration retirent la carte des restitutions R3 ; ils ne révoquent pas une URL publique déjà connue. Une exigence future de révocation stricte imposerait une nouvelle conception explicitement validée, pas une promesse dans ce lot.
- [ ] Basculer les commandes de `object-cartes.ts` / `MenuPdfCartes`. Fermer le seul ancien chemin direct des liens de rôle carte par des policies RESTRICTIVE INSERT/UPDATE/DELETE ciblées, en contrôlant anciennes/nouvelles valeurs. Ne pas bloquer les autres documents ni modifier SELECT ; tester aussi les policies permissives voisines.
- [ ] Rendre la carte dans le volet et l’API, vérifier un consommateur concret. Après réponse perdue, lire l’état de l’opération avant compensation ; ne pas supprimer un fichier effectivement publié.
- [ ] Nettoyer une copie abandonnée uniquement après preuve d’échec/non-finalisation et absence de toute référence ou publication concurrente. Ne pas compenser sur un simple timeout. L’ancienne URL reste intacte ; aucun balayage global du stockage.

**UX :** « Votre carte » → choisir → aperçu privé → « Publier la carte » / « Remplacer la carte ». Fichier reconnaissable, titre, téléchargement et retrait secondaire. En erreur/conflit, ancienne carte et sélection conservées. Après retrait : « La carte n’est plus proposée sur votre fiche ». Si des menus existent : « Les plats et leurs prix restent inchangés ».

**Sortie :** ajout, copie réussie puis finalisation échouée, réponse perdue après commit, remplacement concurrent, retrait, carte future/expirée et document partagé passent de partenaire à office puis lecteur. Aucune IA ni mutation textuelle requise ; aucune modification de la forme des documents API existants.

### M — Menus textuels manuels

- [ ] Brancher sur R4 ; publication directe limitée aux données restaurant retenues, avec correction office après coup. Aucun élargissement aux chambres, activités ou visites.
- [ ] Afficher une liste de menus/sections et une ligne résumée par plat ; ouvrir uniquement la correction demandée. Nom/prix du plat en premier, détails et allergènes connus ensuite. Ne pas confondre vide, zéro et allergènes non renseignés.
- [ ] Conserver les références réelles, traductions, disponibilités et données masquées. Désactiver ne signifie pas supprimer.
- [ ] Garantir que le restaurateur peut créer/modifier sans PDF ni IA. Action de publication accessible, espace réservé pour qu’elle ne masque pas le contenu.
- [ ] Examiner un échantillon représentatif de cartes avant de figer le sous-ensemble textuel. Prix par plat déjà pris en charge ; si une formule tarifée structurée est requise, prévoir prix/devise du parent avec édition office, lecteur et compatibilité. Pas de faux plat ni prix caché dans le titre, pas de perte silencieuse lors de l’extraction.

**Sortie :** deux menus/30 plats utilisables à 320 et 390 px, correction d’une seule ligne sans perte, office concurrent traité, menu inactif absent du public. Le service de formule est annoncé seulement si son contrat est livré.

## 6. E — Extraction et cohérence du document source

- [ ] Action distincte « Préremplir mes menus », à partir d’un fichier validé ; source et pages à traiter visibles. Réutiliser les services existants d’extraction après adaptation de l’autorisation partenaire.
- [ ] Compter les pages au serveur. Réserver atomiquement le quota quotidien avant appel fournisseur ; identifier la requête et conserver état/résultat durablement. Définir le jour en heure de La Réunion et afficher l’instant de reprise calculé par le serveur.
- [ ] Distinguer réservé, démarré, réussi, échoué avant appel et résultat incertain. Libérer uniquement ce qui n’a pas été consommé ; après incertitude fournisseur, ne pas rappeler automatiquement et doubler la dépense.
- [ ] Conserver dans l’opération ciblée la source/version ou empreinte, les pages et les identifiants des menus écrits. Enregistrer cette association avec la publication atomique. Aucun nouveau modèle métier générique imposé.
- [ ] Résultat = brouillon corrigeable, jamais publication automatique. Préserver les corrections manuelles ; refuser la publication d’un résultat dont la source ou les menus ont changé.
- [ ] Lors d’un remplacement de carte, proposer de vérifier les menus issus de cette source ; ne supprimer ni offres saisonnières indépendantes ni menus manuels.
- [ ] Tester les limites de durée/taille de la route avant d’imposer un exécuteur. Un traitement durable n’implique pas une reprise magique après crash : ajouter un worker seulement si les mesures ou l’exigence de reprise le nécessitent.

**Sortie :** concurrence, changement de jour, quota atteint, fermeture/rechargement et réponse perdue ne doublent ni dépenses ni menus. Le dépôt de carte et la saisie manuelle restent disponibles. Une formule non représentable est signalée, jamais discrètement transformée.

## 7. P — Photos notées et recours

Conserver B comme étape clairement nommée ; réaliser ensuite la cible notation, points forts/faibles, refus expliqué et recours équipe. Le stock de vingt et le quota d’analyse sont distincts. Le budget menu ne doit pas empêcher les vingt premiers ajouts photo.

- [ ] Identifier le moteur disponible, ses contrats et migrations ; sa présence ne se déduit pas d’un champ JSON.
- [ ] Définir notes, motifs, panne et résultat incertain. Une panne n’est pas une mauvaise note.
- [ ] Préparer un recours humain lié à la photo et à son analyse, sans nouvelle analyse payante implicite ; utiliser le circuit de suivi existant compatible, sans genre de notification inventé.
- [ ] Fixer séparément les règles de publication automatique et les seuils avant activation. En attente, garder le circuit office B ; ne pas interpréter une note ≥6 comme autorisation implicite.
- [ ] Garantir droits de diffusion, retrait/ordre et remplacement ; préserver l’ordre des verrous R5.

**Sortie :** note/motifs lisibles, refus contestable, décision office propagée, quota/stock cohérents et aucune publication sur résultat absent.

## 8. Types, décisions restantes et différés

| Couverture | Traitement initial |
|---|---|
| HOT, HLO, HPA, CAMP, RVA | Socle hébergement et R2 ; accueil proposé HOT/HPA/CAMP ; capacité maximale conservée, aucun inventaire imposé |
| RES | R3/R4 puis C/M/E ; capacité assise, ouverture et équipements conservés |
| ACT, ASC | R1 ; durée/min/max/âge conservés, aucun nouveau droit direct |
| LOI, PCU, PNA, PRD | Modes de visite existants et services pertinents ; aucune nouvelle facette |
| PSV, COM | Socle commun adapté ; aucun catalogue marchand |
| SPU | Socle actuel ; vérifier gestionnaire/attribution avant invitation |
| VIL | Famille front conservée, pas de nouvelle invitation ordinaire ; gouvernance institutionnelle distincte |
| FMA, ITI | Pas de nouveau formulaire ; garder les lecteurs partagés et les responsabilités du gestionnaire |
| ORG | Administration séparée, aucun portail prestataire |

Les **19 types** sont couverts. Départ recommandé sur les quinze types de console, avec précaution SPU ci-dessus. Ne révoquer aucun lien existant pour aligner artificiellement les trois listes UI/SQL/invitation. Toute extension institutionnelle fait l’objet d’un contrat de responsabilité propre.

| Décision à préciser | Recommandation de départ | Bloque uniquement |
|---|---|---|
| Quota menu | Pages effectivement traitées par compte/jour ; valeur selon budget mesuré, cinq pages restant un candidat | Activation E |
| Quota photo IA | Budget distinct, compatible avec vingt ajouts ; stock total vingt déjà acquis | Activation analyse P |
| Bonne note photo | Garder B jusqu’à règle explicite ; automatisation et seuil à préciser ensemble | Publication automatique P |
| Formules tarifées | Modèle existant pour plats ; prix parent si le service formule est retenu sur exemples réels | Formules structurées concernées |
| Nouveaux écrans | Validation groupée d’aperçus isolés ; aucun nouveau vote sur blocs déjà approuvés | Intégration des nouveaux écrans |

Différer visite/langues guidées, nature d’unité par ligne, inventaires complexes et texte matériel partenaire. Leur coût comprend modèle/droits, office, portail, API/exports, reprise et maintenance. Réexaminer sur cas réels impossibles à couvrir autrement ; ne pas détourner langues d’accueil ou facette activité. Le coût complet et les options sont détaillés dans le [volet produit](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/plan-produit.md).

## 9. Déploiement et retour arrière par domaine

1. **Avant code :** confirmer le lot autorisé et ses nouvelles interfaces nécessaires. Aucun lot ne vaut autorisation globale de déploiement.
2. **En développement :** commits courts par correction, tests ciblés de perte/confidentialité/concurrence. Mise à jour graphify après code ; graphe DB après schéma selon son README. CI complète sur la tête finale de la PR et scénario d’upgrade isolé, en plus du fresh-apply.
3. **Préparer la transition :** inventorier tous les writers, y compris imports et ancien client ; relever les définitions/droits vivants et vérifier les sauvegardes. Arrêter le lot si empreinte, signature ou ACL diffèrent de la source attendue ou de la cible déjà appliquée ; comparer et adapter avant de reprendre. Si une fermeture DML impose SECURITY DEFINER, justifier ce choix par domaine, fixer search_path et contrôler identité, portée, rôle, masques et enfants ; aucun accès général acteur.
4. **Appliquer les prérequis SQL additifs manquants :** conserver les dépendances PR73 — SMTP, séjour, messages, plannings, photos, invitations — en utilisant leurs versions corrigées. Intégrer R2/R5 avant toute exposition de leurs mutations, sans installer d’abord un writer séjour sans contrôle de concurrence. Les nouveaux contrats doivent être disponibles avant le client qui les appelle ; leur non-activation transitoire doit être garantie côté serveur/droits, pas seulement par un bouton masqué. R1 peut être livré séparément. Ne pas rejouer le manifeste fresh-install en production ni modifier une migration historique déjà appliquée ; les états du runbook ne remplacent pas un relevé actuel. Préparer séparément la fermeture des anciens droits, qui vient après conversion de leurs consommateurs.
5. **Basculer puis fermer :** déployer le client office sûr, les routes et le niveau de compatibilité requis ; fermer les anciens chemins DML ciblés ; vérifier qu’un ancien client échoue sans mutation. Planifier une courte suspension des écritures du domaine si la bascule coordonnée l’exige. Aucune activation partenaire du domaine tant que cette garantie manque. Les autres lots peuvent continuer.
6. **Vérifier puis activer :** précontrôle vivant en lecture seule, définitions/droits avant-après, recette isolée déjà acquise, contrôles de lecture après déploiement et pilote explicitement autorisé. Paramétrage réel SMTP/IA et envois sont des actes distincts.
7. **Retour arrière :** désactiver le domaine et les relances avant de changer un writer ; conserver fichiers publiés, opérations, propositions et historique. Revenir à une version applicative sûre, pas au writer destructif ; ne pas rouvrir automatiquement l’ancien DML. Ne retirer ni colonne ni fonction encore référencée par une proposition/opération.

La suppression d’une fonctionnalité nouvelle n’est pas une restauration des données : prévoir la conservation/reprise des opérations en cours et le traitement manuel des résultats incertains.

**Cas particulier du lecteur API partagé R1/R3 :** il n’a pas d’interrupteur de domaine. Juste avant chaque patch, conserver définition vivante exacte, signature, attributs de sécurité, propriétaire, ACL et empreinte ; vérifier que seuls les blocs prévus changent. Préparer le secours SQL compatible avec l’état courant. Le point de retour R3 doit préserver l’exclusion R1 et tous les correctifs ultérieurs ; ne pas restaurer une ancienne définition qui réémettrait la nouvelle colonne ou rouvrirait une exposition privée identifiée. En recette isolée, appliquer puis restaurer le point sûr donne les mêmes empreintes/ACL et réponses de référence attendues. Arrêter si un patch concurrent a modifié la source ; ne pas réinstaller un ancien fichier SQL global ni couper l’API comme simple procédure de retour arrière.

## 10. Critères de clôture

Le [suivi des lots et critères de sortie](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/suivi-plan.json) relie A01–A08, les six lots initiaux, les dix-neuf types, les dépendances et les preuves attendues. Chaque lot est fermé séparément ; absence d’un accès ou d’une décision suspend seulement sa partie dépendante.

Le plan est préparé avec les trois agents Sol max de l’audit, sans cascade, puis recoupé et revu. Les notes [base et droits](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/plan-base.json), [code et contrats](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/plan-code.json) et [produit](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/plan-produit.md) détaillent les chemins et scénarios. Les arbitrages consolidés de ce document priment sur leurs propositions, notamment pour les dépendances et les estimations.

À la demande de l’utilisateur, une [revue indépendante de Claude Opus 5.5](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/revue-claude-opus-55-20261103.txt) a été recueillie dans Claude Code. Les constats ont été recoupés et intégrés : R3a/R3b, absence d’ajout JSON R1, preuves SQL réelles, cohérence documentaire, retour arrière précis et fermeture ciblée du DML. Le choix carte conserve l’URL publique existante ; le risque hypothétique sur la carte vivante a été précisé par un nouveau relevé, sans incident inventé.

La [seconde lecture de Claude](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/plan-correction-portail-20261103/revue-claude-opus-55-recontrole.txt) ne relève plus de contradiction bloquante. Sa précision finale sur le scope et les dates du document nouvellement publié est intégrée au lot C. Cette revue porte sur le plan, pas sur une mise en œuvre ou une recette authentifiée de production.

Seuls les documents de planification et de revue ont été créés ou actualisés. Aucun code applicatif, migration, configuration ou donnée métier n’a été modifié ; aucun commit, déploiement, invitation ou envoi métier n’a été effectué. Les échanges avec Claude ont été explicitement demandés. Les contrôles de lecture datés du 03/11 et leurs limites sont conservés ; ils devront être renouvelés au moment d’exécuter.
