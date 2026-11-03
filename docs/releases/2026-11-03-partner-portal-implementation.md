# Portail partenaire — mise en œuvre du plan du 3 novembre 2026

Ce journal complète le plan et son audit datés du 3 novembre. Leur conclusion
« aucun code modifié » décrivait la fin de la planification, avant cette mise en
œuvre. La branche de travail est `codex/partner-portal-launch-20261030`, PR 73.
Le checkout principal et la production n'ont pas été modifiés par ces corrections.

## Contrat prestataire

Le contrat externe reste en version `1.0.0`. R1 ajoute une colonne interne et
l'exclut du lecteur dans la même transaction : aucune clé JSON nouvelle, même
avec une valeur `null`. R3a exclut les contenus restaurant non publics ou non
disponibles ; les clés, libellés, types, ordres et conventions `[]` restent les
mêmes. Le volet restaurant reste une projection publique ; l'éditeur office
conserve la collection complète. R3b traite séparément les droits des tables.

Les dates de validité utilisent `CURRENT_DATE` dans le fuseau de la base,
comme l'export régional existant. Ce correctif ne change pas cette convention
en heure de La Réunion. Les quotas IA, distincts, devront utiliser le jour local.

## Preuves acquises et limites

- `0854579` : CI frontend complète verte (types, Jest, build et Playwright).
- `514ac3d` : les deux bases Supabase 17 jetables ont passé le manifeste, les
  tests SQL et 12 tests des vraies routes Next. Les dépendances métier ne sont
  pas simulées. Le nettoyage final était encore rouge à ce commit ; il est
  corrigé dans les commits suivants.
- `9b2479c`, puis `467a4b3` : CI SQL fresh/upgrade et frontend complètes vertes.
  Pour `467a4b3`, runs `41602576959` et `41602576819`. Ils comprennent R2/R4,
  les cartes C, les préconditions R6, le rejeu refusé de l'agrégat historique,
  les vraies routes Next et la contention de deux connexions R2/R4.
  Une revue ultérieure a néanmoins trouvé un filtre realm perdu dans R6 :
  ces résultats ne dispensent pas du correctif et d'un nouveau test après R6.
- Le scénario d'upgrade compare 126 réponses SQL complètes avant/après avec
  six identités, sept fiches et trois variantes. Les différences autorisées
  sont nommées par identifiant. Le scénario fresh vérifie l'état final ; il ne
  prétend pas constituer une seconde preuve avant/après.
- Liste complète de 100 restaurants : médiane SQL 984,05 ms avant et
  972,67 ms après, budget isolé 1 476,08 ms, sur le run `41597103248`.
  Cette mesure ne représente pas la latence réseau de production.
- Le contrôle vivant du 3 novembre a confirmé les routes en ligne sans clé
  (401 attendu), la version 1.0.0 et les appels récents réussis dans le journal.
  Aucun GET authentifié de production n'a encore été exécuté pendant cette recette.

Les changements ultérieurs doivent repasser la CI sur leur propre commit.
Un test ignoré localement faute de Supabase n'est pas compté comme réussi.

Sur `267dc00`, la CI frontend complète est verte (`41610576078`), y compris
les neuf contrôles du rendu PDF compilé et déplacé hors checkout sous Linux.
Les deux scénarios SQL passent R6 et ses quatre courses, R5 et ses trois
courses, les corrections de réservation/URL, R3b, les migrations et recettes
M/E et la vraie bascule M avec restauration OFF. Le harnais de concurrence E
échoue ensuite parce que sa préparation réactive le flag sans rétablir le
droit EXECUTE. `198d939` rétablit les deux portes dans la seule fixture et les
referme dans son nettoyage, sans affaiblir le contrôle métier.

`198d939` a ensuite passé toute la CI SQL fresh/upgrade (`41611619597` et
`41611611096`) et le frontend (`41611619675`). Cela comprend la concurrence E,
le lot P OFF de `3259b44`, le retour au lecteur sûr, douze tests des routes
Next réelles et dix-sept contrôles HTTP Storage. Le graphe isolé issu du vrai
catalogue contient 291 tables, 603 fonctions et 589 politiques ; l'artifact PR
indique le commit de fusion testé `53ea9d582f06834069ba44afd6f74dd0568a5482`.
Le full100 upgrade mesure alors 1001,40 ms avant et 984,60 ms après en médiane,
pour un budget de 1502,09 ms. Le p95 n'est pas encore mesuré à ce commit.

`da8ba97` repasse entièrement la CI SQL (`41613850774`) et frontend
(`41613850807`). Il ajoute la revalidation P après les attentes de verrou
avec révocation concurrente réelle (`8e582ff`), la publication/restitution/
expiration/retrait de carte dans le vrai lecteur public (`7eea304`), et neuf
contrôles PDF dans l'image de production Alpine. Cette dernière recette charge
le helper webpack compilé dans `/app`, avec l'utilisateur non privilégié de
l'image, le réseau coupé et le script de test seul monté en lecture seule ;
aucune dépendance du checkout ou compilation TypeScript n'y sert de repli.

`a187727` passe également tout le SQL (`41615639082`) et les deux jobs frontend
(`41615639275`). Le contrôle de cuisine compare 80 réponses sous quatre rôles,
avant/après les seules politiques R3b : les inférences privées disparaissent
pour anon et l'office étranger, les réponses complètes service/correcteur restent
identiques. Les deux fonctions de recherche elles-mêmes sont inchangées.
Le benchmark comporte désormais une chauffe puis vingt mesures par phase :
médiane 1141,51 → 1286,32 ms (budget 1712,26), p95 empirique 1194,75 → 1330,42 ms
(budget 1792,12). Ces deux budgets de non-régression passent ; ils décrivent
une base isolée et ne constituent pas une mesure de latence réseau de production.

Le relevé vivant du 3 novembre à 10:26 UTC compte 46 appels sur 24 heures,
tous réussis, sans erreur serveur enregistrée ; dernier succès à 06:41 UTC.
Ce SELECT agrégé n'exporte ni clé ni données de réponse partenaire.

`2ee31cd` corrige les remarques M/E de la cinquième revue et ajoute la lecture
de l'impact d'une source sur les menus publiés. Son frontend et l'image Alpine
passent (`41617836078`). Les recettes SQL M et E passent, puis la nouvelle
fixture de continuité s'arrête avant son scénario : le lien publisher recalculait
le realm depuis une configuration d'office absente. La fixture est corrigée en
déclarant son office de test avant ce lien ; aucune garde métier n'est relâchée.
`f7b4fe2` passe ensuite M/E, le scénario intégré et les précontrôles M dans
les deux scénarios SQL (`41619569645`). Le frontend et l'image Alpine passent
entièrement (`41619569671`). La recette SQL P complète passe aussi, dont
l'anonymisation avec document partagé conservé. Le harnais P échoue ensuite
sur la fixture de permutation d'acteur : B appartient déjà à un autre compte.
Le transfert temporaire des deux comptes est corrigé atomiquement en respectant
l'unicité, sans modifier la règle métier. Les dernières courses restent à rejouer.

## Revue indépendante Claude

Claude Opus 5.5, effort Max, a revu `d5f5d4d` en lecture seule. Il n'a relevé
aucun blocage de production dans les correctifs de ce commit, mais a démontré
que le manifeste frais n'atteignait pas l'empreinte attendue par R1.

Traitement des constats :

| Constat | Traitement |
|---|---|
| Écart entre reconstruction et lecteur vivant | `514ac3d` ajoute le packaging exact des correctifs déjà vivants ; garde conservée et tests SQL réellement passés. |
| Heures `expected` tronquées à la minute | Le client R2 conserve un instantané brut séparé de l'affichage, existence/null/secondes compris. Le contrat attendu reste brut ; on ne transforme pas silencieusement une référence obsolète. |
| Prédicat URL des cartes incomplet | Condition HTTP(S), fixture non HTTP et comparaison au régional réellement passées dans les deux scénarios. |
| Ancres SQL sensibles au checkout CRLF | `.gitattributes` impose LF aux migrations du jour, bascules et packaging. |
| Clé publique de test protégée seulement par PGOPTIONS | Marqueur indépendant créé uniquement par le bootstrap jetable et plafond de taille du corpus, requis aussi pour les fixtures. |
| Test de fermeture DML séjour sans identité valable | Assertions de privilèges par colonne et tentative réelle avec une identité autorisée passées en CI. |
| Harnais pouvant passer sans exécuter | Le runner exige un rapport Jest sans test ignoré, sonde l'authentification après le rechargement PostgREST ; les routes vérifient un quota effectivement consommé. |
| Ancien RPC séjour réactivable hors ordre | Retrait du GRANT de la migration encore non livrée, avec test. |
| X1 ignoré si son lecteur manque | En CI, sa présence devient obligatoire ; la migration optionnelle de production conserve sa non-activation. |

La deuxième revue, sur `097b317`, a démontré deux erreurs de réessai R4.
`575c8e5` les corrige : UUID propre à chaque intention, comparaison de la
demande exacte, retour de l'état courant lors d'un rejeu, libération des
erreurs définitives dont `22003`, prix borné et demande datée. Après 24 heures,
le client vérifie l'ancien reçu en lecture seule et exige une nouvelle lecture.
Les scénarios ajout/retrait/ajout d'allergène et création/suppression/rejeu sont
testés. Le protocole interne de l'éditeur passe à `2/2` dans `f1d39bf` ; ce
numéro n'est pas la version de l'API prestataire.

La troisième revue, sur `f1d39bf`, clôt la compatibilité et la garde du vieux
fichier SQL. Elle valide les droits, copies et reçus de C, avec un correctif de
message pour une carte retirée entre-temps (`PT409`, pas un faux refus de droits).
Elle détecte dans R6 la perte du filtre acteur de test et l'ordre de verrous
inverse des deux writers redispatchés. Ces points sont corrigés avant livraison,
avec contrôle des définitions actuelles et tests après la nouvelle migration.
La contre-revue du code consolidé reste nécessaire.

La quatrième revue Opus 5.5 Max, sur `fe8c449`, clôt les remarques R4/R6 et C,
et valide la conservation de la frappe dans le client office C. Elle relève
trois améliorations R5 : nouvelle réservation d'une photo refusée, durée de
réservation bornée et validation des URL nouvellement écrites. `07e6c0b`
les corrige, avec recettes SQL passantes sur `267dc00`. Le CHECK historique
bloquait déjà `javascript:` ; la recette de conservation emploie donc une URL
mal formée réellement admise par l'ancien schéma. `b1b0304` aligne le test Storage sur le `cacheControl: '0'`
de la route réelle. Le quota normal affiche 70 % au dernier relevé ; les crédits
promotionnels existants servent de relais si nécessaire, sans achat.

La cinquième revue porte sur `7cd62e9` : M/E, le contrôle de version du
brouillon à la publication, R3b et les corrections R5. Elle valide R5 et les
gardes principales M/E/R3b, mais trouve une suppression de menus hors cible
encore possible avec une opération d'extraction. `2ee31cd` corrige ce point,
la continuité d'une source publiée, les erreurs et le temps fournisseur, les
brouillons déjà publiés et le précontrôle complet de bascule M. Son constat de préparation du harnais E est
déjà corrigé dans `198d939`, et la réserve Alpine est levée par `da8ba97`.

Le quota normal est monté à 96 %. Une session cloud Opus 5.5 Max a été lancée
pour revoir P sur `da8ba97`, avec 100 USD de crédits promotionnels disponibles
à son lancement, expirant le 5 novembre à 11:59 UTC+4. Aucun crédit acheté,
aucun changement de forfait ni autorisation de dépense produit n'en découle.

Cette sixième revue P est terminée : aucun blocage relevé, mais une course de
compensation et plusieurs défauts de portée, de verrous et de codes HTTP sont
démontrés. Les corrections sont réalisées par les deux sous-agents P, avec une
nouvelle recette concurrente et une contre-revue avant clôture. La copie du texte
du recours est remplacée par l'empreinte de son intention exacte ; le texte reste
uniquement dans le CRM, traité par son effacement existant. Après cette revue,
l'interface Claude affiche 97 % du quota normal et 93 USD de crédits cloud
restants. Aucun achat n'a été effectué.

La septième revue, contre-vérification M/E sur `2ee31cd`, clôt sept des huit
points. Elle démontre deux cas restants : une promotion `staged` → `copied`
sans lien public encore présent est trop permissive, et la comparaison textuelle
des UUID peut masquer l'impact d'une source écrite en majuscules. Les deux cas
sont confiés au sous-agent E avec leurs tests. Le contrôle DML de bascule M est
aussi étendu à `anon` et une suppression autorisée du plat cible est testée.
Les limites de ce contrôle restent explicites : les helpers R4 et hooks E doivent
être comparés sur la cible réelle avant activation. Les tables de fondation
M/E/P sont absentes de la production examinée à 10:33 UTC ; aucune ancienne
préparation n'y a été appliquée par cette tâche.

`14e9c25` convertit les commandes de cartes existantes de l'office au contrat
atomique : instantané brut distinct de l'affichage, demande durable, état
courant relu après reçu, saisie conservée en conflit ou pendant une réponse.
La présentation déjà approuvée est conservée. Les nouveaux écrans restent en attente.

## Consommateurs privilégiés et documentation du schéma

Les écritures ordinaires menus/séjour/cartes sont converties avant leur bascule.
L'inventaire identifie aussi `internal.seed_test_facets`, appelé seulement par
`internal.seed_test_corpus` au bootstrap et par `api.rpc_reset_test_data`.
Ce dernier est SECURITY DEFINER, exige un superuser et le marqueur de l'office
de test, et ne peut pas cibler un office réel. La recette rejoue son test après
les fermetures DML. Cela ne constitue pas une nouvelle voie d'écriture partenaire.
Les importateurs externes et consommateurs API non recensés restent à inventorier
avec l'exploitant avant leur bascule réelle.

Le workflow génère le graphe DB de la release depuis le catalogue
Supabase jetable, avec tbls et le supplément SQL du projet. L'artifact
`schema-isolated/PROVENANCE.txt` indique le commit et le scénario. Le catalogue
vivant committé reste distinct : aucun schéma préparé n'est présenté comme appliqué
en production. `db_graph.py --snapshot-root` permet cette génération séparée.

## Conditions de bascule

Les migrations préparatoires et les scripts de bascule restent séparés. Ne pas
rejouer un ancien fichier de grants ou le manifeste frais en production. Rejouer
la préparation R2 après sa bascule referme sa mutation acteur ; cela ne constitue
pas un retour arrière complet. Le runbook final doit relever l'état des droits
avant d'appliquer chaque étape.

Juste avant R1/R3a, exporter en lecture seule la définition du lecteur, son
empreinte, sa signature, ses attributs de sécurité, son propriétaire et ses ACL.
Conserver cet instantané avec la release. Une empreinte inattendue arrête le
déploiement ; elle ne doit jamais être remplacée par un ancien lecteur global.
Le point de secours R3 doit préserver l'exclusion R1 et la confidentialité déjà
acquise. L'API reste en service pendant ces vérifications.

Les nouveaux écrans Carte/Menus/Extraction/Photos attendent la validation de
l'aperçu isolé. Aucun fournisseur IA actif n'a été trouvé dans la configuration
vivante : extraction et analyse ne seront pas annoncées disponibles sans
configuration et quotas validés. Les crédits Claude servent à la revue du code,
pas aux appels IA du produit. Aucun déploiement, mail réel ou appel IA payant
du produit n'est effectué par cette recette.

Les contrats de préparation [C/E](../schema-workbench/contracts/partner-menu-extraction-contract.md)
et [P](../schema-workbench/contracts/partner-photo-assessment-foundation.md)
détaillent dépendances, quotas, reprise et arrêt. M doit précéder E malgré
l'ordre numérique des deux noms de migration. P suit R5 et la préparation R3b.
Les réglages E/P restent désactivés avec quota NULL ; P n'a aucun fournisseur
sélectionné. Aucun seuil de publication automatique photo n'est créé.
