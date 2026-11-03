# Cartes restaurant et extraction partenaire — déploiement C/E

État du contrat au 3 novembre 2026 : backend préparé, nouvelles interfaces encore soumises à validation. L’installation des tables/routes ne met pas le produit en service. C est indépendant de l’IA ; les menus manuels M restent indépendants d’E. Ce document complète [le contrat M](portal-menu-publication-v1.md) et le plan de correction du 3 novembre.

## Dépendances et configuration existantes

| Élément | Usage et limite |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Projet Supabase commun à Auth, RPC et Storage. Les cartes anciennes utilisables par E doivent pointer vers le bucket `documents` de ce même projet. Aucun téléchargement d’URL externe arbitraire. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client portant le JWT de l’appelant pour les gardes/RPC. L’authentification serveur passe par `auth.getUser`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur seulement : Storage privé/copie, lecture du secret IA et persistance des reçus de traitement. Elle ne remplace jamais la garde partenaire/correcteur. |
| Registre IA et Vault existants | `app_ai_provider_config`, `api.get_active_ai_provider_secret()` réservé au serveur. E accepte l’adaptateur `openai_compatible` ; fournisseur, endpoint, modèle, limite de sortie et secret proviennent de ce registre, partagé avec l’extraction office. Tout changement de fournisseur doit tenir compte de cet usage partagé. |
| Runtime | Node conforme à `package.json` (`>=22.22.2`), Next standalone. Dépendances verrouillées existantes : `pdfjs-dist` 4.10.38, `sharp` 0.35.4 et canvas natif optionnel transitif `@napi-rs/canvas` 0.1.100 avec son paquet de plateforme. Aucun nouveau service de traitement. |
| Packaging | `next.config.ts` externalise PDF.js/canvas et trace worker, fontes, CMaps et binaires natifs. Le répertoire courant du serveur doit être sa racine de paquet. Le test standalone ci-dessous refuse le recours aux dépendances du checkout. La CSP n’est pas élargie. |
| Storage | `restaurant-cartes-private`, privé, 10 Mio, créé par C ; destination publique `documents`, contrat existant. Les accès directs ordinaires au staging et l’écrasement du nouveau préfixe public sont bloqués. |

L’inventaire vivant en lecture seule transmis au chantier le **3 novembre 2026 à 07:30 UTC** indiquait **zéro profil IA actif**. C’est une observation datée, pas une preuve de configuration actuelle ni de capacité d’un moteur. La vérifier sans lire de secret : `SELECT count(*) FROM public.app_ai_provider_config WHERE is_active;`. Les crédits et réglages de Claude utilisés pour la revue ne configurent pas l’IA du produit.

## Ordre de livraison et cutovers

L’ordre de dépendance prime sur les timestamps : **M `20261103082027` doit précéder E `20261103080731`**, bien que son nom soit numériquement postérieur. Utiliser l’ordre explicite du manifeste et de la recette, pas un tri brut des fichiers pour organiser cette livraison.

| Étape | Fichier ou condition |
| --- | --- |
| 1. Socle | Auth, schéma `api`, Storage/Vault, registre IA et gardes persona/périmètre/realm déjà installés. R4 corrigé pour M : `supabase/migrations/20261103070417_object_menus_atomic_reconcile.sql`. R3b est nécessaire aux lectures de correction M et au lecteur d’impact E ; C seule garde son chemin indépendant de R4/R3b. |
| 2. C additif | `supabase/migrations/20261103072138_partner_restaurant_cartes_contract.sql`. Garder `internal.restaurant_carte_rollout.partner_enabled=false`. |
| 3. M préparatoire | `supabase/migrations/20261103082027_portal_menus_guarded_publication.sql`. Writer R4 partagé, gardes M, configuration `enabled=false`, RPC acteur de publication non accordées. |
| 4. E préparatoire | `supabase/migrations/20261103080731_partner_menu_extraction_operations.sql`. `internal.menu_extraction_settings.enabled=false`, `daily_page_limit=NULL`. |
| 5. Application/recettes | Routes et services compatibles C/M/E, build et recettes isolées. Le manifeste global intercale R6/R5 pour leurs propres lots ; l’analyse photo P n’est pas une dépendance de C/E. |
| 6. Fermeture C | Convertir d’abord tous les writers ordinaires du rôle `carte`, y compris office/imports concernés. Puis `supabase/cutovers/restaurant_cartes_atomic.sql` ferme uniquement leur DML direct. Une carte liée à un type autre que RES fait refuser ce cutover : la résoudre explicitement sans élargir les droits. |
| 7. Ouverture M | Après conversion des consommateurs et fermeture DML R4, `supabase/cutovers/portal_menus_guarded_publication.sql` vérifie la fermeture, accorde les RPC et active M. Conditionner son exécution à la validation produit/UI et à la recette. |
| 8. Ouvertures C puis E | C partenaire nécessite son accord UI et son flag explicite. E nécessite M ouvert, source C autorisée, interface validée, quota exact décidé et fournisseur compatible/configuré. Aucun script livré ne choisit ou n’active ce quota. |

Les cutovers sont séparés des migrations additives et du manifeste fresh. Les migrations C/E sont des installations uniques : leurs `CREATE` refusent un rejeu, elles ne constituent pas des scripts de réinitialisation. M tolère uniquement sa préparation exacte encore OFF, sous contrôles d’empreinte/ACL. Respecter l’historique de migration ; ne pas rejouer C/E pour corriger un état partiel. Les fixtures et activations fictives de CI ne s’exécutent jamais sur une base métier.

Pour E avec lecture d’impact, installer explicitement **`20261103083731_partner_portal_menu_stay_correction_read_scope.sql` avant E** : son helper `api.can_read_object_for_correction(text)` est la garde de lecture office de `api.get_menu_extraction_source_impact`. La recette M/E intervient après R3b dans le workflow. Ce prérequis du lecteur E ne rend pas R3b nécessaire au dépôt/publication C livré séparément.

L’office conserve son interface existante et sa garde canonique. Son client C utilise les mutations ciblées ; le champ d’upload office existant peut encore passer par la route document existante puis `link-existing`. Le nouvel aperçu privé partenaire n’est pas implicitement branché par le déploiement serveur.

## Droits, sources et publication

C n’autorise un acteur qu’à gérer les cartes publiques de sa fiche **RES** liée, dans son realm, avec le module `menus` ouvert et non masqué. Un correcteur doit posséder son droit canonique courant. E réutilise le gate étroit M acteur/RES/périmètre/realm/masques et son ouverture réelle, y compris le droit `EXECUTE` de publication. Aucun rôle ni type d’objet supplémentaire n’est ouvert.

Le dépôt C produit un reçu UUID lié au propriétaire, au hash des octets traités, au type, à la taille et aux chemins immuables. L’aperçu est une URL signée de **120 secondes**, obtenue après authentification et garde. Publier copie les octets du staging vers `documents`, vérifie les hashes, puis finalise sous JWT appelant avec nouvelle garde et CAS du lien ciblé. La copie seule n’est pas une publication. Un retrait concurrent produit `PT409` ; un document acteur non public reste interdit. Titres/dates du lien sont ciblés, les autres cartes et documents partagés sont conservés.

La publication conserve le format HTTPS Storage public et le schéma public existants. Le lecteur respecte portée publique et dates inclusives du lien/document. **Retirer un lien retire sa projection ; une URL Storage déjà publique reste publique**, avec ses caches et usages existants. Aucun retrait de lien ne promet une révocation des octets déjà publiés.

E accepte un dépôt C personnel finalisé ou une carte publique encore liée avec sa baseline exacte. Le serveur compte les pages, scelle empreintes Storage/hash/source/cible et recontrôle avant dispatch et publication. La cible existante doit être un menu public de cette fiche, actif ou inactif ; les menus office privés/partners/NULL restent hors périmètre. Avec cible, seul cet ID peut être associé au résultat. Sans cible, la publication réutilise l’UUID `result.menu.recordId` généré par le serveur.

Le passage canonique du même dépôt privé de `staged` à `copied`, puis la création de son premier lien public C, ne change pas la version de son contenu. La comparaison autorise seulement cette transition, avec mêmes identifiants, hash, taille, type, chemins et cible. Un lien déjà présent modifié, des octets différents, un document non public ou une autre cible restent des conflits. Une extraction déjà commencée n’est donc pas perdue simplement parce que sa carte a été publiée entre-temps.

Le résultat est un brouillon. La publication utilise le writer M/R4 sous une transaction commune : fiche → opération E → source/document/Storage → menus et enfants. Source, pages, unique ID de menu confirmé, reçu et `request_id` sont associés atomiquement ; un échec tardif annule aussi le DML menus.

`api.get_menu_extraction_source_impact(object_id,source_kind,source_id)` lit l’impact d’une carte remplacée/retirée, avec `source_kind='carte'` et ID document, ou `'upload'` et ID reçu C. Le reçu résout les deux formes du même fichier. La lecture couvre toutes les opérations publiées de la fiche, même anciennes ou produites par un autre auteur, et leurs seuls `published_menu_ids` encore existants. Elle retourne uniquement `{menus:[{id,name}]}` : aucun résultat IA, auteur, hash ou chemin privé. L’acteur doit passer la garde C courante, ses masques/realm et la portée publique des menus/cartes ; un reçu privé reste personnel. Le correcteur canonique R3b de la fiche peut aussi lire les menus associés devenus privés. Les autres sources, fiches, menus manuels indépendants et menus supprimés ne sont pas projetés. Cette lecture n’a aucun effet sur les menus ; le futur écran proposera leur vérification.

## Limites techniques et quota à décider

| Limite actuelle | Valeur |
| --- | --- |
| Dépôt C | PDF reconnu par la signature de format `%PDF-` ≤10 Mio ; JPG/PNG/WebP d’entrée ≤20 Mio, réencodés en JPEG ≤10 Mio. Le décodage complet du PDF appartient à E ; un PDF protégé par mot de passe n’est pas analysable. Pas de support HEIC annoncé. Multipart borné à 21 Mio. |
| Sources E | 1 à 8 sources, ≤10 Mio chacune ; PDF/JPEG/PNG/WebP reconnus par signature. Une image compte pour une page. |
| PDF E | Au plus 200 pages par PDF ; **8 pages sélectionnées au total** par opération, limite technique de l’adaptateur, distincte du quota quotidien. Au-delà, sélection explicite obligatoire ; aucune troncature silencieuse. |
| Rendu | PDF rasterisé au serveur, bord ≤2000 px, garde image PDF 16 mégapixels ; réencodage Sharp et suppression des métadonnées avant fournisseur. |
| Durée | Route Node `maxDuration=60`, deadline applicative 55 s ; **au moins 30 s doivent rester avant la marque de dispatch**, sinon préparation annulée sans appel fournisseur. Le rendu a un signal composé déconnexion/deadline sur le budget de préparation restant, y compris le chargement PDF. L’appel fournisseur reçoit le temps restant, une tentative, sans réparation payante automatique. Les RPC mutatrices bornent l’attente de verrou à 5 s. |
| Corps/brouillon | Requête E 128 Kio ; brouillon ≤1 Mio en base et corps HTTP ≤1 Mio +2 Kio. Liste de reprise limitée aux 30 opérations personnelles les plus récentes de la fiche. |
| Quota E | Pages sélectionnées **par compte utilisateur authentifié et jour Réunion**, toutes ses fiches réunies. Valeur livrée NULL ; la borne SQL 1–1000 n’est pas un budget choisi. Cinq pages reste une proposition de produit, pas un réglage activé. |

Réservation et consommation sont durables, atomiques et indépendantes du quota photo. Le serveur calcule `resetAt` avec `Indian/Reunion`. Une préparation arrivée au jour suivant est annulée et sa réservation ancienne libérée ; une nouvelle intention explicite doit gagner le budget du nouveau jour. Un dispatch marqué consomme ses pages, même si le fournisseur échoue ou si son résultat devient incertain. Ce comptage conservateur doit être inclus dans les conditions d’activation et le budget mesuré.

Les annulations du rendu sont coopératives : PDF.js observe le signal et détruit sa tâche, mais le travail synchrone de PDF.js/Sharp/canvas ne peut pas être préempté au milieu d’une exécution. Les bornes de taille/pages/pixels restent nécessaires ; la deadline n’est pas une preuve de limite CPU stricte du processus standalone. Un besoin de préemption forte demanderait des mesures puis une évolution ciblée, pas une promesse de reprise automatique.

Le montant du quota, le fournisseur/modèle et son coût effectif, la recette de ce fournisseur et l’accord UI bloquent uniquement **l’ouverture E**. Ils ne bloquent pas la livraison du backend OFF, la carte C ou la saisie manuelle M autorisée. Les formules structurées non représentables restent une décision distincte.

## Reprise, conflits et formules

Conserver le même UUID et la requête exacte tant que son résultat n’est pas confirmé. `GET /api/portal-menu/extract/status?object_id=...` retrouve les opérations sans dépendre du stockage navigateur ; le POST de cette route relit une opération personnelle. États stockés : `inspected`, `reserved`, `preparing`, `started`, `succeeded`, `failed`, `cancelled`. Un `started` sans résultat depuis deux minutes est exposé `uncertain` ; le reçu reste récupérable et peut encore recevoir sa fin tardive. Une préparation ancienne peut être reprise sous un nouveau claim avant dispatch ; l’ancien worker ne peut plus démarrer.

Après marque de dispatch ou réponse ambiguë, lire le reçu : ni nouvel appel fournisseur automatique, ni remboursement automatique, ni suppression de fichier. Il n’existe pas de worker qui promettrait de reprendre un traitement après crash. Avant dispatch confirmé, l’échec de préparation peut libérer la réservation.

Cas particulier : si la réponse à `mark_menu_extraction_started` est perdue alors que **ce processus n’a pas encore appelé le fournisseur**, il termine le même claim avec `state='failed'`, `error='non_dispatch'`. Le débit conservateur reste conservé ; il n’est pas recrédité implicitement. Si cette fin ne peut pas être confirmée, la reprise passe par le reçu, jamais par un nouvel appel automatique. Une sauvegarde de draft déjà publié retourne un conflit `PT409`/HTTP409.

`result` conserve la sortie d’extraction ; `draft` porte les corrections avec CAS `draftVersion`. Un retry identique d’une sauvegarde retrouve la version ; une autre correction concurrente reçoit `PT409`. La publication M porte obligatoirement `p_payload.extraction_draft_version` quand elle indique une opération E. La version est vérifiée sous verrou E avant DML, en plus des empreintes de source/cible. Cette précondition appartient à l’intention exacte et est retirée avant R4. Une publication déjà réussie est réconciliée avant de revalider une source devenue ancienne ; une nouvelle intention sur la même opération publiée est refusée. Une correction suivante devient manuelle.

Le menu parent n’a pas de prix/devise de formule dans ce contrat. E demande au moteur de séparer les offres non représentables et conserve `result.warnings` avec libellé/prix source et code `formula_price_not_modelled`. Ces avertissements sont parsés séparément : prix NULL, libellé trop long ou plus de cinquante signalements ne font pas perdre des plats valides ni provoquer une nouvelle tentative payante. Les textes sont bornés, les compteurs `omittedOffers`/`adjustedOffers` et le message signalent toute omission/abréviation. Les plats restent soumis au schéma strict ; le mode office par défaut n’est pas assoupli.

Le futur écran doit montrer l’avertissement et la source avant validation, même si le brouillon a été corrigé. La formule ne devient ni faux plat, ni prix réparti entre plats, ni prix ajouté artificiellement au titre. L’avertissement rappelle la vérification des formules même lorsque le moteur n’en a signalé aucune ; l’exhaustivité d’un moteur n’est pas démontrée. Les régimes suggérés restent séparés et les allergènes ne sont jamais inférés pour publication.

Contrat du futur adaptateur draft → module M : les prix extraits restent du texte source jusqu’à validation. Une valeur simple comme `12 €` doit devenir `12` EUR, `12,50 €` doit devenir `12.50`, tandis que vide reste non renseigné (`null` au writer) et `0` reste zéro. Toute formule, devise ou syntaxe ambiguë exige correction explicite ; ne jamais utiliser `parseFloat` permissif ni transformer un échec de conversion en vide/zéro. Cet adaptateur n’est pas branché à un nouvel écran avant accord UI.

## Recettes et preuves

Les workflows versionnés constituent les commandes exécutables : `.github/workflows/sql-fresh-apply.yml` pour **fresh et upgrade sur Supabase17 jetables**, `.github/workflows/frontend.yml` pour Node22/build/tests/standalone. Ils n’emploient pas de fournisseur IA réel.

Dans la base jetable initialisée par le workflow, avec le marqueur `bertel_ci_fixture.bootstrap`, `PGOPTIONS='-c bertel.ephemeral_ci=on'` et `DB_URL` local, exécuter après M puis E :

```sh
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_portal_menus_guarded_publication.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_partner_menu_extraction_operations.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_menu_extraction_source_continuity_and_impact.sql"
python tools/partner-api/test-menu-cutover.py "$DB_URL"
python tools/partner-api/test-extraction-concurrency.py "$DB_URL"
```

Pour C, le workflow sépare recette additive, cutover puis recette du cutover. Après démarrage du Storage réel et génération du status local :

```sh
node tools/partner-api/test-carte-storage.mjs "$RUNNER_TEMP/bertel-local-status.json"
```

Ce dernier script exige localhost:54321/54322 et le marqueur jetable, utilise uniquement ses clés/utilisateur synthétiques et les nettoie. Il vérifie refus privé, signature temporaire, copie interbucket immuable, hashes et GET/HEAD/Range publics avec cache cohérent sans redirection. Il ne prouve pas la révocation d’une URL publique après retrait d’un lien.

Depuis `bertel-tourism-ui`, les vérifications E ciblées et natives sont :

```sh
npm run test:run -- --runInBand src/app/api/portal-menu/extract src/app/api/menu/extract/orchestrate.test.ts src/app/api/menu/extract/extraction.test.ts
npm run build
node scripts/verify-menu-document-native.cjs .next/standalone
```

Preuves locales au 3 novembre : 45 tests ciblés passants, build/TypeScript passants, neuf vérifications natives passantes avec **helper webpack compilé et dépendances provenant uniquement du standalone déplacé hors checkout**. La [preuve JSON locale](C:/Users/dphil/.codex/visualizations/2026/11/03/01a19fed-065f-7991-95fd-598f4161f6e6/implementation-portail/verification/verification-e-native-compiled.json) conserve `compiled=true`, texte rasterisé, sélection explicite des pages 2 et 9 d’un PDF de neuf pages, erreurs MIME/PDF et annulation. Cette preuve locale Windows ne remplace pas le gate CI Linux du commit livré, la recette fournisseur, ni la validation téléphone des écrans encore isolés. Consulter les résultats du workflow du commit exact avant déploiement.

## Arrêt et retour arrière

1. Fermer d’abord la nouvelle entrée UI concernée et désactiver E (`internal.menu_extraction_settings.enabled=false`). Ne pas choisir une nouvelle valeur de quota comme effet de rollback. Les appels déjà marqués peuvent finir ; conserver les RPC de fin et tous les reçus.
2. Pour un arrêt C partenaire, remettre `partner_enabled=false` ; l’office canonique reste servi par son writer sûr. Si M doit aussi être arrêté, fermer son flag et ses RPC acteur selon le plan de rollback M : cela bloque aussi l’accès partenaire aux brouillons E sans supprimer ces données. Un arrêt E seul peut conserver M et la reprise des résultats connus.
3. Garder tables, réservations, compteurs consommés, intentions, drafts, sources et associations publiées. Ne pas réinitialiser les UUID, remettre artificiellement les compteurs à zéro ou relancer les opérations `started`/`uncertain`. Une analyse nouvelle exige une intention et une décision explicites.
4. Conserver les fichiers copiés/publiés et leur URL, les documents partagés et les protections Storage. Aucun GC sur timeout. Un retrait ou retour à une ancienne carte est une nouvelle mutation ciblée avec baseline actuelle et reçu propre, pas une suppression globale de fichiers.
5. Revenir à une version applicative compatible avec les RPC C/R4/M conservés. Ne pas rétablir un ancien client DML après fermeture des droits, ni rouvrir silencieusement ces droits pour le faire fonctionner. Les migrations additives restent en place ; toute réparation de schéma demande un correctif contrôlé.

L’arrêt E empêche les nouvelles analyses ; les publications sont arrêtées en fermant aussi leur entrée C/M concernée. Les preuves nécessaires à la reprise et au traitement manuel restent conservées. Le retour arrière n’annule pas un appel fournisseur déjà parti ni les diffusions d’un fichier déjà public.
