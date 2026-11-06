# Revue croisée du thésaurus Bertel

6 novembre 2026. La demande est de faire critiquer le plan par Claude, d'évaluer ses objections indépendamment et d'itérer jusqu'à un accord argumenté. Le [plan V3](../superpowers/plans/2026-11-06-thesaurus-api-partenaires-plan.md) a été validé au niveau architectural. La revue technique ultérieure reste **conditionnelle aux preuves de déploiement** décrites dans l'[audit d'implémentation](2026-11-06-thesaurus-implementation.md) ; elle ne déclare pas le plan entier exécuté.

## Validation du plan : trois tours

Au moment de ces trois tours, le CLI installé n'était pas authentifié. La revue a été menée dans l'application Claude connectée, conversation **Thésaurus Bertel : relecture de plan**, modèle affiché **Opus 5.5 Moyen**. Le plan et les faits du dépôt ont été transmis en texte ; Claude n'avait pas le dépôt dans cette conversation et ne devait ni exécuter de test ni modifier de fichier. Les verdicts ci-dessous ont été lus dans l'interface.

| Tour | Verdict de Claude | Évaluation et évolution retenue par Codex |
|---|---|---|
| 1 | **« RÉVISER »** | Quatre blocages confirmés : écritures sources hors workflow, confusion état/assignabilité/validité, devenir des affectations lors des fusions/scissions, frontière d'atomicité des projections. Ajout de gardes DB, dimensions distinctes, conservation historique avec requalification et bascule atomique des dérivés requis. |
| 2 | **« VALIDÉ au niveau de l'architecture »** | Les quatre blocages sont traités. Huit précisions intégrées : mises à jour de contenu comme propositions, inventaire réel des consommateurs, budget de contention, reprise des valeurs retirées, distinction `/catalog`/historique, équivalence opt-in commune, URI authentifiées et volume de resynchronisation annoncé. |
| 3 | **« VALIDÉ. La V3 est un plan d'architecture et de réalisation cohérent. »** | Aucun nouveau blocage architectural. Ajout du signalement des fiches liées à des prédécesseurs quand l'option est désactivée et des cinq livrables de passage du lot 1. La comparaison legacy possède une référence avant modification puis un contrôle réel avant activation. |

Codex n'a pas suivi trois formulations trop larges : une GUC modifiable n'est pas une autorisation ; seuls des prédécesseurs d'équivalence exacte validée peuvent élargir un filtre ; les projections requises ne peuvent pas converger après la bascule. Claude a accepté ces objections au deuxième tour. Un renommage d'un concept actif ne retire pas son assignabilité. La validation commune porte sur ce plan, sans transformer la revue en preuve de tests ou d'activation.

## Revue du code par le CLI demandé

Après la nouvelle demande explicite de l'utilisateur, le CLI **Claude Code** a réellement été exécuté, avec `--model claude-opus-5-5 --effort medium`, en lecture seule (`--permission-mode plan`, outils Read/Grep/Glob). L'artefact JSON confirme `canonicalModel: claude-opus-5-5`, sans sous-agent et sans refus de permission. Il ne s'agit pas d'un agent GPT présenté comme Claude.

Premier verdict CLI : **« À CORRIGER »**, huit constats. Codex a inspecté les faits, retenu les correctifs justifiés et contesté les hypothèses qui n'étaient pas établies.

| Nº | Constat CLI | Décision de Codex et état |
|---|---|---|
| 1 | Dépendances RLS du rôle de publication incomplètes | **Retenu.** Grants EXECUTE ciblés, puis assertion `pg_policy` → `pg_depend` → `pg_proc` pour arrêter l'installation si un helper nécessaire devient inexécutable. Pas de grant global sur les fonctions API. L'hypothèse supplémentaire d'un USAGE nécessaire sur `auth` a été réfutée avec une publication réelle après révocation explicite : les policies stockées appellent les fonctions par OID ; le helper d'identité de confiance résout sa dépendance sous son propriétaire. |
| 2 | Expansion d'équivalence répétée par fiche | **Retenu et corrigé.** Sous-requête non corrélée exécutée une fois par requête. Artefact `runtime-filter-initplan.json` : zéro expansion option fausse, cinq pour cinq requêtes option vraie. La justesse des résultats repose sur huit comparaisons exactes back-office/partenaire, distinctes de ce benchmark sans prédécesseurs. |
| 3 | Rafraîchissement de MV bloquant les lecteurs | **Retenu et corrigé.** `CONCURRENTLY` sur une MV déjà peuplée ; remplissage simple sinon. Mesure isolée : 132 lectures concurrentes, attente maximale 1,80 ms. Les index uniques des deux MV doivent être vérifiés sur la cible. L'essai éditeur sous charge dépasse encore le budget de 10,70 ms et reste visible dans l'audit. |
| 4 | Compatibilité de version PostgreSQL | **Vérifiée.** Cible PostgreSQL 17.6 ; les instructions MAINTAIN et INHERIT/SET utilisées sont disponibles dans cette majeure. La CI doit également réussir sur son environnement Supabase. |
| 5 | Délai et contention sur corpus réel | **Retenu comme preuve d'ouverture manquante.** Les 447 fiches des mesures locales sont synthétiques. La répétition sur copie restaurée de la production et le budget éditeur ≤ 2 s restent requis. Les seuils supplémentaires de publication < 4 s et de ratio filtre < 1,2× suggérés par Claude ne figuraient pas au plan et n'ont pas été transformés en exigences convenues. |
| 6 | Dérive des triggers lors d'une réapplication de fichiers de base | **Retenu.** Les quatre exemptions de publication sont vérifiées à l'installation et par le test du manifeste. Réappliquer des fichiers de base après les overlays peut encore rétablir d'anciennes définitions ; le runbook doit imposer l'ordre et les contrôles finaux, ou les miroirs doivent être alignés. Un simple succès de la migration ne prouve pas une réapplication ultérieure sûre. |
| 7 | Audit d'implémentation contradictoire | **Retenu.** Matrice des 17 critères réécrite autour d'artefacts nommés et de leurs limites ; les mesures successives et l'échec sous charge ne sont plus masqués par d'anciens paragraphes. La preuve HTTP simulée reste explicitement séparée du smoke réel. |
| 8 | Secret de curseur, exclusion du realm test, portée de la réécriture SQL | **Retenu comme contrôle de déploiement.** Configurer `THESAURUS_CURSOR_SECRET` sur les applications concernées, vérifier les deux branches de liste publique et comparer la définition réelle de `get_filtered_object_ids` avant/après. Le repli serveur sur la clé service-role existe, mais une rotation invaliderait ses curseurs ; ce n'est pas une preuve de configuration de production. |

### Seconde revue CLI des correctifs

Le même CLI a relu les changements du commit `745c3a8` et les artefacts mesurés. Résultat conservé dans `claude-cli-corrections-review.json` : **« validation technique conditionnelle »**. Claude indique n'avoir exécuté aucun test lui-même.

Il juge résolus les défauts de droits RLS, d'expansion répétée, de rafraîchissement bloquant et de version PostgreSQL. Il accepte explicitement les deux réfutations de Codex : USAGE sur `auth` non nécessaire dans le cas prouvé ; seuils 1,2×/4 s simples recommandations. L'assertion des exemptions de triggers résout le défaut à l'installation, avec la réserve sur une réapplication ultérieure des fichiers de base.

Les réserves restantes sont précises : contrôles après réapplication des fichiers de base ; dépendances de privilèges des adaptateurs autonomes avant généralisation ; secret de curseur et diff de la fonction filtre ; CI exacte, sauvegarde/restauration représentative, benchmark réel, déploiement, comparaison `/catalog` et smokes partenaires. Le précontrôle réel de 14:13 UTC confirme depuis les deux index uniques valides nécessaires au rafraîchissement concurrent.

Codex partage ce verdict conditionnel : les corrections techniques sont fondées, mais la mesure sous charge et les opérations encore absentes empêchent d'annoncer l'ouverture validée. La validation architecturale V3 et la validation opérationnelle sont deux conclusions distinctes.

### Troisième avis CLI : le budget de contention

Après la mesure sur copie réelle (publication 6,7 s, attente éditeur 5,1 s), le même CLI Opus 5.5, effort moyen, évalue une proposition de refus récupérable après 1,8 s. Artefact : `claude-cli-contention-review.json`. Son verdict distingue un filet de sécurité conforme au mécanisme d'échec récupérable du plan d'un contournement si ce refus sert à déclarer le budget atteint. Un refus borné change une attente en échec de sauvegarde ; il ne raccourcit pas la détention du verrou global.

**Codex est d'accord : le critère 17 reste non satisfait.** Ni un timeout plus long de publication, ni un `PT409` plus rapide ne sont utilisés pour annoncer une réussite. Le bootstrap massif réussi sur copie demeure une opération d'installation à encadrer ; il ne prouve pas une publication interactive dans le budget. L'ouverture et l'élargissement restent conditionnés à une optimisation mesurée ou à la conception générationnelle prévue par le plan, sans réduire arbitrairement les 447 fiches du pilote ni supprimer des projections requises.

Les trois artefacts CLI et les preuves d'exécution sont conservés localement dans `.tmp-thesaurus-implementation/`, exclu de Git. Les archiver avec la livraison en retirant toute donnée sensible. Les verdicts de Claude ne remplacent ni les logs CI ni la recette déployée.
