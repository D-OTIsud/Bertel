# Entretenir le thésaurus Bertel — guide métier

Version du 10 novembre 2026. Ce guide s'adresse aux personnes qui rédigent, relisent et publient les vocabulaires de Bertel. Les droits de votre compte déterminent les actions accessibles dans l'administration.

L'objectif est de donner le même sens aux valeurs utilisées dans les fiches, dans la recherche et chez les partenaires. Un bon thésaurus évite les doublons, explique les différences entre notions voisines et conserve la compréhension des anciennes données.

Accès directs :

- [Rédiger et traduire](#4-rédiger-les-libellés-définitions-et-notes), notamment [en allemand](#5-ajouter-et-relire-les-traductions).
- [Choisir les synonymes et termes cachés](#6-choisir-les-bons-synonymes-et-termes-de-recherche).
- [Construire les relations sémantiques](#7-construire-les-relations-sémantiques) et [les correspondances externes](#8-documenter-une-correspondance-externe).
- [Créer ou modifier un concept](#9-créer-ou-modifier-un-concept), puis [valider et publier](#10-valider-et-publier-un-lot).
- [Résoudre un conflit](#11-gérer-les-conflits-et-les-erreurs) ou [retirer une valeur et reprendre les fiches](#12-déprécier-retirer-et-reprendre-les-fiches).
- [Préparer une revue de domaine et vérifier son lot](#13-garder-une-couverture-cohérente-dans-la-durée).

## Parcours rapide

Pour corriger une définition ou ajouter un synonyme à un concept existant :

1. Ouvrir **Paramètres → Plateforme → Listes & référentiels → Thésaurus**.
2. Dans **Concepts**, choisir le domaine et rechercher le terme ou son code.
3. Lire la définition et la **Version publiée actuelle · lecture seule** avant de modifier.
4. Corriger le contenu, puis **Enregistrer le brouillon**. Rien n'est encore publié.
5. Relire les textes et les relations, puis **Soumettre à validation**. Corriger les erreurs et examiner les avertissements.
6. Dans **Publications**, sélectionner les brouillons validés et **Prévisualiser la publication**.
7. Comparer les valeurs publiées et proposées, vérifier les fiches affectées, puis **Publier cette version**.
8. Contrôler le numéro de version publié et les tâches d'actualisation. Vérifier le résultat sur un exemple de fiche ou de consultation concerné.

Le bouton **Soumettre à validation** lance immédiatement les contrôles du système : il n'envoie pas une demande à un autre relecteur. La relecture humaine reste à organiser dans l'équipe.

## 1. Comprendre les éléments du thésaurus

| Élément | À quoi sert-il ? | Exemple |
|---|---|---|
| Domaine | Regrouper un vocabulaire utilisé dans un contexte précis. | **Hôtellerie**, **Équipements et services**, **Moyens de paiement**. |
| Concept | Identifier une notion, indépendamment de ses formulations. | Un petit hôtel indépendant tenu par une famille. |
| Code stable | Conserver l'identité technique dans son domaine et son contexte. | Un code existant reste le même lorsque son libellé est corrigé. |
| Libellé préféré | Nommer le concept dans une langue. | « Hôtel familial ». |
| Définition | Dire ce que le concept couvre. | Petit hôtel indépendant exploité par une famille ; il reste un hôtel. |
| Synonyme | Donner une autre formulation du même sens. | « Petit hôtel familial indépendant », si le périmètre est identique. |
| Terme caché | Aider à retrouver une variante sans la proposer comme formulation éditoriale. | Une faute de frappe réellement rencontrée. |
| Note d'usage | Préciser quand utiliser le concept et ses limites. | « Ne signifie pas simplement hôtel adapté aux enfants. » |
| Relation | Relier des concepts distincts. | Une action favorable aux pollinisateurs associée à un jardin. |
| Correspondance externe | Relier le concept à un référentiel extérieur identifié. | La langue « Anglais » et son entrée vérifiée dans un vocabulaire de langues. |
| Brouillon | Préparer une modification sans changer la version publiée. | Une définition réécrite et en cours de relecture. |
| Publication | Conserver et diffuser une version cohérente du vocabulaire. | Une nouvelle version avec plusieurs corrections validées. |

Les intitulés des domaines sont rédigés en français et constituent la base commune de l'affichage métier. Ils nomment les rubriques dans lesquelles travailler ; ils sont distincts du libellé préféré et des traductions d'un concept. Par exemple, **Hôtellerie** est le domaine et « Hôtel familial » est une notion de ce domaine.

| Rubrique | La choisir pour… | À distinguer de… |
|---|---|---|
| **Labels et classements** | Définir un label, un classement ou un référentiel de qualification. | Le niveau ou la mention attribuable dans ce référentiel. |
| **Valeurs des labels et classements** | Définir une valeur rattachée à son label ou classement : étoiles, adhésion, mention… | Une valeur de même nom dans un autre référentiel ; « 4 » seul ne précise pas s'il s'agit d'étoiles, d'épis ou de clés. |
| **Types de forfait** | Décrire la composition ou la famille d'une offre forfaitaire : pension, circuit, vol + hôtel… | L'unité tarifaire « par forfait ». |
| **Catégories de menu** | Classer un menu ou organiser ses plats en rubriques : brunch, entrées, desserts… | Le type de cuisine, les régimes et les allergènes. |
| **Équipements et services** | Décrire un équipement ou un service : Wi-Fi, parking, restaurant… | La famille qui sert à les regrouper. |
| **Familles d’équipements et services** | Regrouper les équipements et services : accessibilité, chambre, salle de bain… | L'équipement ou la prestation effectivement proposé. |
| **Publics tarifaires** | Indiquer à qui s'adresse un tarif : adulte, enfant, groupe, personne en situation de handicap… | La nature du tarif et son unité. |
| **Types de tarif** | Distinguer tarif principal, option, menu, abonnement, taxe, caution… | Le public bénéficiaire. |
| **Unités tarifaires** | Exprimer « par personne », « par nuit », « par séjour », « par forfait »… | La composition d'une offre forfaitaire. |

Un code seul n'identifie pas toujours un concept : il peut être réutilisé dans plusieurs domaines ou référentiels. Pour un échange avec l'équipe technique, fournir le domaine, le contexte éventuel et le code, ou l'identifiant pérenne du concept. Deux entrées appelées « Hôtel familial » dans **Hôtellerie** et dans **Valeurs des labels et classements** gardent des identités distinctes.

Pour l'interopérabilité, la clé technique du domaine reste stable : par exemple, **Commerces** est identifié par `taxonomy_com` dans les échanges API. Clarifier son intitulé français ne renomme pas cette clé, les concepts ou leurs relations. Une ancienne publication conserve les noms qu'elle a enregistrés ; on ne réécrit pas son historique pour modifier un intitulé d'affichage.

### Thésaurus, catalogue et fiche : trois niveaux

Le **thésaurus** décrit les notions, leurs traductions, leurs relations et leur histoire. Le **catalogue** propose les valeurs actuellement utilisables dans les formulaires. Une **fiche** porte les valeurs choisies pour un établissement, un lieu ou une offre.

Modifier une définition change le sens documenté de la valeur, sans remplacer les valeurs attribuées aux fiches. Ajouter une relation ne crée pas une prestation, une certification ou une affectation sur une fiche. Une ancienne valeur peut rester lisible dans le thésaurus tout en n'étant plus proposée pour une nouvelle affectation.

## 2. Accéder à l'administration et répartir le travail

Dans l'interface actuelle, le parcours **Listes & référentiels → Thésaurus** est réservé au profil affiché `super_admin`. Être administrateur d'une organisation ne suffit pas. Les opérations serveur exigent une session de superuser plateforme. Si l'entrée n'apparaît pas ou si l'accès est refusé, demander à l'administrateur plateforme de vérifier le compte.

Pour organiser le travail, désigner une personne qui rédige, une personne qui relit les changements de sens et une personne qui publie le lot. Ce sont des responsabilités d'équipe, pas trois rôles distincts imposés par l'application : un même compte habilité peut techniquement réaliser les trois étapes.

Les quatre onglets sont :

| Onglet | Usage |
|---|---|
| **Concepts** | Rechercher, créer et modifier les concepts et leurs brouillons. |
| **Publications** | Sélectionner les brouillons validés, examiner l'aperçu, publier et suivre les actualisations. |
| **Fiches à reprendre** | Ouvrir les fiches signalées pour revoir leurs valeurs historiques. |
| **Configuration** | Gérer les règles des domaines et l'identité de publication de l'instance. |

La configuration relève de l'administration du vocabulaire ; elle ne constitue pas une étape à refaire pour chaque correction.

## 3. Chercher avant de créer

1. Choisir le domaine correspondant à la donnée : un équipement, un label et une catégorie d'hébergement ne sont pas interchangeables.
2. Saisir le nom, une variante ou le code dans **Rechercher un terme ou un code**, puis lancer la recherche.
3. Lire les résultats et ouvrir les concepts proches. Si nécessaire, passer aux pages **Précédents** et **Suivants**.
4. Examiner les définitions, les termes, le parent et les relations avant de décider.

La liste est paginée. Une valeur absente de la page affichée n'est pas nécessairement absente du thésaurus. Dans les sélecteurs de concepts liés, saisir au moins deux lettres pour lancer une recherche plus large. L'indentation de la liste dépend des parents présents dans la page : elle n'est pas un inventaire exhaustif de toute la hiérarchie.

| Besoin constaté | Action adaptée |
|---|---|
| Faute ou formulation peu claire, sens inchangé | Modifier le libellé ou la définition du concept existant. |
| Autre manière de dire exactement la même chose | Ajouter un synonyme dans la langue concernée. |
| Notion plus précise ou sens différent | Étudier un nouveau concept et son éventuel parent. |
| Deux notions utiles l'une à côté de l'autre | Ajouter une relation de type **Terme associé** si elle est justifiée. |
| Valeur devenue obsolète | Préparer sa dépréciation ou son retrait et la reprise des fiches concernées. |

## 4. Rédiger les libellés, définitions et notes

### Donner un sens précis et durable

Le libellé doit être compréhensible dans une liste de choix. Choisir un nom français court : « Hôtellerie », « Activités sportives et culturelles », « Services publics ». Ne pas afficher une clé technique, le mot « taxonomie » ou une longue formule administrative à la place du nom métier.

Chaque concept doit avoir une définition expliquant sa notion particulière et son contexte métier. Cette règle s'applique à tous les domaines, y compris aux listes internes et aux valeurs historiques. Dans **Configuration**, **Définition obligatoire** est cochée et ne peut pas être désactivée. La définition ne répète pas seulement le nom ; une phrase telle que « Écran » ne permet pas de savoir s'il s'agit d'un écran de projection de réunion ou d'un autre équipement. Privilégier une ou deux phrases concrètes, puis une note d'usage pour les exclusions utiles. La longueur seule ne prouve pas la qualité.

**Exemple — Hôtel familial**

> Petit hôtel indépendant exploité par une famille. Il reste dans la catégorie des hôtels ; le terme ne désigne pas simplement un hôtel proposant des services aux familles avec enfants.

L'analogie avec une auberge aide à comprendre la taille ou l'ambiance, mais ne suffit pas à faire d'« auberge » un synonyme exact.

**Exemple — Tarif pour personnes en situation de handicap**

> Tarif adapté proposé aux personnes en situation de handicap, selon les conditions annoncées par le prestataire.

Ce périmètre couvre différentes formes de handicap. « Tarif PMR » ne constitue pas un synonyme exact de cette notion plus large. La présence du concept ne signifie ni réduction systématique ni conditions identiques chez tous les prestataires.

### Respecter la nature déclarative des données

Bertel consigne les informations fournies par les professionnels ; il ne devient pas un organisme de labellisation en ajoutant une définition.

- **Tout l'éclairage en LED** : le périmètre est l'ensemble de l'éclairage concerné, selon la déclaration du prestataire ; quelques ampoules LED ne décrivent pas ce même engagement.
- **Zéro pesticide** et les indicateurs de consommation : expliciter la déclaration et, lorsqu'elles existent dans le concept, les unités et le périmètre. Ne pas inventer une certification, un contrôle ou une norme officielle.
- **Faible en glucides** : décrire l'offre annoncée par le professionnel sans lui ajouter une promesse médicale.
- **Produits locaux** : parler de produits locaux ou de leur origine locale. Ne jamais traduire cette notion par « produits indigènes ».
- **Label Rouge, IGP ou agriculture biologique** : distinguer le signe de qualité déclaré et les produits concernés. Ne pas étendre un signe portant sur certains produits à toute l'activité d'un établissement.

### Utiliser les notes à bon escient

Dans **Notes d'usage et sources**, cliquer sur **Ajouter une note**, indiquer sa langue, son type et son texte. Ajouter une référence ou une URL lorsque cela aide à comprendre la décision.

| Type proposé | Contenu attendu |
|---|---|
| **Quand employer ce terme** | Conditions d'emploi, exclusions et cas limites. |
| **Source** | Référence utilisée pour établir le sens ou une correspondance. |
| **Historique** | Ancienne formulation et raison d'une évolution. |
| **Précision de définition** | Complément utile à la définition principale. |

Une note historique ne rend pas automatiquement le concept « Déprécié ». Les notes d'un vocabulaire public peuvent être exposées aux partenaires : utiliser les espaces de travail internes pour les échanges nominatifs ou les arbitrages confidentiels.

## 5. Ajouter et relire les traductions

Les champs français sont dans **Libellé préféré (fr)** et **Définition (fr)**. Pour une langue absente, saisir son code dans **Ajouter une langue**, puis **Ajouter** : `en` pour l'anglais, `es` pour l'espagnol, `de` pour l'allemand.

Renseigner le libellé et la définition dans chacune des quatre langues obligatoires : **FR / EN / ES / DE**. Ces champs sont présents dans l'éditeur et les langues obligatoires ne peuvent pas être retirées. Une langue supplémentaire reste possible ; elle doit elle aussi avoir un libellé et une définition. Relire les synonymes et les notes nécessaires dans chaque langue. Une traduction du nom seul ne remplace pas la traduction de sa définition.

Une traduction doit garder le même sens et les mêmes exclusions. Pour le concept de produits locaux réunionnais, conserver aussi la portée géographique : **Produits locaux de La Réunion**, **Local products from Réunion**, **Productos locales de La Reunión** et **Lokale Produkte aus La Réunion**. Ces traductions ne doivent pas introduire une notion d'autochtonie ou d'espèce indigène.

La traduction du libellé français « Anglais » est **English** en anglais ; ce n'est pas un synonyme français à ajouter dans le champ des termes français.

Il n'y a pas de traduction automatique implicite. Si une langue manque, l'API peut utiliser une autre langue et indique la langue réellement fournie. Le nom et la définition peuvent avoir des langues de repli différentes. Un texte français affiché en repli ne prouve donc pas que la traduction allemande a été rédigée.

**Retirer cette langue** est proposé uniquement pour une langue supplémentaire. Il enlève ses champs de libellé et de définition du brouillon. Vérifier séparément les synonymes et les notes qui portent cette langue, ainsi que les conséquences pour les partenaires.

## 6. Choisir les bons synonymes et termes de recherche

Dans **Synonymes et termes de recherche**, cliquer sur **Ajouter un terme**, renseigner sa langue, choisir **Synonyme** ou **Terme caché**, puis saisir le texte.

### Le test du même sens

Demander : « Si je remplace le libellé préféré par ce terme, est-ce que je décris toujours exactement la même chose dans ce domaine ? » Si la réponse dépend d'une condition supplémentaire, ce n'est probablement pas un synonyme exact.

| Proposition | Décision éditoriale |
|---|---|
| « Petit hôtel familial indépendant » pour le concept d'hôtel familial défini plus haut | Synonyme possible si cette formulation correspond bien au périmètre retenu. |
| « Hôtel adapté aux enfants » pour ce même concept | Sens différent : ne pas l'ajouter comme synonyme. |
| « Produits du terroir » pour « Produits locaux » | Pas d'équivalence automatique : l'ancrage culturel et l'origine géographique ne recouvrent pas nécessairement le même périmètre. |
| « Tarif PMR » pour le tarif couvrant toutes les formes de handicap | Trop restrictif : ne pas l'ajouter comme synonyme exact. |
| « Plantes mellifères » pour « Plantes favorables aux pollinisateurs » | Plus étroit : ne pas effacer la différence par un synonyme. |

Ne pas créer des synonymes pour chaque pluriel, accent ou combinaison de mots sans besoin réel. Un concept peut ne pas avoir de synonyme pertinent : cela vaut mieux qu'une fausse équivalence.

### Quand employer un terme caché ?

Un terme caché peut servir à conserver une variante de saisie non souhaitée comme formulation officielle. Exemple pédagogique : une faute récurrente comme « hotel famillial », si elle est réellement observée et utile à la recherche.

**« Caché » ne signifie pas « confidentiel »** : ces termes restent présents dans les données du thésaurus et peuvent figurer dans l'API ou l'export. Ne pas s'en servir pour contourner une différence de sens ou pour placer un terme métier refusé.

L'effet sur la recherche dépend du parcours utilisé. Les taxonomies exploitent notamment des alias français dans Explorer ; l'ajout d'un alias ne garantit pas sa prise en compte par tous les moteurs, dans tous les domaines et toutes les langues. Vérifier le parcours concerné lorsqu'un synonyme a été ajouté pour répondre à un besoin de recherche précis.

## 7. Construire les relations sémantiques

Une relation relie deux concepts ; un synonyme est une formulation du même concept. Partir de cette distinction avant de choisir un champ.

### Parent et enfant : une notion plus générale ou plus précise

Un concept possède au plus un parent dans cette structure. Pour une taxonomie, le parent est choisi dans le même domaine avec **Concept parent**. Exemple réel : **Hôtel familial** reste rattaché à **Hôtel** dans la taxonomie des hôtels.

Le parent et ses enfants apparaissent aussi comme relations « plus général » et « plus spécifique » dans les données publiées. Il n'est pas nécessaire de recréer cette hiérarchie avec **Ajouter une relation**.

Selon le catalogue, le rattachement a un rôle particulier : **Famille d'équipement**, **Catégorie de durabilité** ou **Schéma ou valeur de classement parent**. Une famille d'équipement ne se choisit pas comme un équipement simplement ressemblant. Le système contrôle les rattachements compatibles et refuse les cycles.

### Terme associé : deux notions différentes mais liées

Dans **Hiérarchie et relations**, choisir **Ajouter une relation → Terme associé**, puis rechercher et sélectionner le concept lié. Vérifier son domaine et son code dans le sélecteur.

**Exemple réel :** l'action **Plantes favorables aux pollinisateurs** et l'équipement **Jardin** peuvent être associés. Un jardin n'implique pas cet engagement ; l'action ne désigne pas à elle seule un jardin. Leur association aide à comprendre le vocabulaire.

La relation associée est symétrique dans le vocabulaire publié. Elle ne fait pas d'un concept le parent de l'autre et ne doit pas doubler un lien entre ancêtre et descendant. Elle ne signifie pas qu'une fiche portant l'un possède automatiquement l'autre, et n'élargit pas automatiquement les filtres.

### Équivalence exacte validée : un emploi exceptionnel

L'interface propose également **Équivalence exacte validée** entre deux concepts internes distincts. Réserver cette relation aux cas dont le sens identique a été réellement établi et expliqué par une note de source ou d'historique.

Une proximité de nom, une traduction ou une relation de remplacement ne suffit pas. En particulier, deux successeurs plus précis issus d'une scission ne sont pas chacun exactement équivalents à l'ancien concept général.

Certains filtres de taxonomie peuvent inclure les prédécesseurs exactement équivalents sur option explicite, dans le même domaine. Cette possibilité ne constitue pas une fusion ni une réaffectation des fiches.

### Remplacement : faire évoluer le vocabulaire

Pour un concept **Déprécié** ou **Retiré**, la rubrique **Remplacements proposés** permet d'ajouter un ou plusieurs successeurs. Ce lien est orienté : l'ancien concept est remplacé par le ou les nouveaux.

Exemple pédagogique de scission : une ancienne catégorie trop générale est remplacée par deux catégories plus précises. Les deux peuvent être indiquées comme successeurs ; il faut ensuite examiner chaque fiche pour choisir la bonne. Ne pas choisir arbitrairement un successeur et ne pas déclarer les trois concepts équivalents.

## 8. Documenter une correspondance externe

Une correspondance externe pointe vers un concept d'un autre référentiel, avec une URI et une source de validation. Une règle d'export ou un intitulé identique n'établit pas à lui seul cette correspondance.

Dans **Correspondances externes → Ajouter une correspondance**, renseigner le type, le vocabulaire, l'URI du concept cible, la version lorsqu'elle est connue et la source ayant permis de comparer les concepts.

| Choix dans l'interface | Sens de la relation depuis le concept Bertel |
|---|---|
| **Exacte** | La cible porte le même sens. |
| **Proche** | Les sens sont proches, avec une différence qui empêche une équivalence exacte. |
| **Cible plus générale** | La cible couvre un périmètre plus large. |
| **Cible plus précise** | La cible couvre un périmètre plus étroit. |
| **Associée** | La cible est liée, sans hiérarchie ni équivalence. |

Exemple réel : le concept de langue **Anglais** possède une correspondance exacte vers l'entrée **ENG** d'EU Vocabularies. Pour compléter une telle correspondance, reprendre l'URI exacte du concept dans la source officielle, vérifier le sens et noter la référence utilisée. Ne pas inventer une URI à partir du nom de la langue.

Le système contrôle la structure des champs ; la comparaison des sens reste une responsabilité éditoriale. Une correspondance ne transfère ni une certification ni les droits de réutilisation du vocabulaire extérieur.

## 9. Créer ou modifier un concept

### Modifier un concept existant

1. Ouvrir le concept et comparer sa version publiée avec le brouillon éventuel.
2. Modifier seulement les champs nécessaires. Garder les traductions cohérentes avec toute modification de sens.
3. Ajouter une note si le changement nécessite une explication durable.
4. Cliquer sur **Enregistrer le brouillon**.

Le badge distingue notamment **Publié**, **Brouillon**, **Brouillon validé** et **Modifications non enregistrées**. Tant que la saisie n'est pas enregistrée, elle reste locale à l'écran. Le brouillon enregistré ne modifie pas le contenu publié.

### Créer un concept absent

1. Vérifier l'absence de doublon dans le bon domaine.
2. Choisir **Nouveau concept**. Le domaine doit déjà être activé dans le thésaurus.
3. Définir le code stable selon les conventions du domaine, le libellé, la définition, les traductions et le rattachement requis.
4. Compléter les termes, notes et relations qui ont un sens réel, puis enregistrer.

**Le code se verrouille dès le premier enregistrement.** Une correction de formulation ne justifie pas de créer un autre code. Si le sens doit être remplacé, traiter explicitement le nouveau concept et le devenir de l'ancien.

L'écran ne permet pas de créer un nouveau domaine ni de modifier toutes les propriétés des catalogues : applicabilités aux types de fiches, choix simple ou multiple, positions et caractère sélectionnable peuvent nécessiter l'équipe technique. Une catégorie structurante peut être active tout en n'étant pas proposée comme valeur affectable.

### Cas particulier : nouveau label et valeurs de classement

Dans **Valeurs des labels et classements**, les valeurs d'un nouveau label ont besoin que leur référentiel parent, dans **Labels et classements**, soit déjà publié. Préparer les étapes suivantes :

1. Créer, valider et publier le label.
2. Faire définir et vérifier ses types de fiches applicables avec l'équipe technique.
3. Créer ses valeurs rattachées au label publié, puis les valider et les publier.

Cette dépendance native ne signifie pas que toutes les relations parent-enfant doivent être publiées en deux fois. Pour un lot comportant des dépendances nouvelles, faire vérifier l'ordre de publication avant de commencer.

Les lots volumineux peuvent être préparés avec les [outils de contribution](../tools/thesaurus-content/README.md). Les outils ordinaires y créent des brouillons ; la validation et la publication restent des étapes distinctes. Les opérations techniques exceptionnelles de maintenance ne constituent pas la procédure métier courante.

### Importer un lot de corrections préparé

Dans **Publications**, **Importer des corrections** ouvre le même circuit pour plusieurs concepts existants :

1. Coller le lot JSON préparé, puis cliquer sur **Analyser le lot**. Le rapport compare les valeurs précédentes du lot aux valeurs réellement courantes, avec le domaine et le contexte de chaque concept.
2. Résoudre tous les conflits. Un brouillon déjà présent est préservé ; l'import ne le remplace pas. Si tout le contenu proposé est déjà en place, il est indiqué comme déjà à jour.
3. Cliquer sur **Créer les brouillons privés**. Une nouvelle comparaison précède l'enregistrement. Les écritures se font par groupes de 100 au maximum ; un groupe échoué est annulé, les groupes précédents restent enregistrés.
4. Relire le lot, puis cliquer séparément sur **Valider les brouillons du lot**. Corriger les erreurs éventuelles. Cette action ne publie rien.
5. Revenir à **Publications** : les brouillons validés du lot sont sélectionnés. Examiner l'aperçu complet puis publier comme indiqué ci-dessous.

L'analyse ne montre que les premières corrections lorsqu'un lot est volumineux ; l'aperçu de publication expose la comparaison complète. En cas de réponse réseau incertaine, recharger la liste et comparer les brouillons avant de reprendre. Ne pas relancer automatiquement tout le lot. Fermer puis rouvrir l'import permet de traiter un autre lot.

## 10. Valider et publier un lot

### Étape 1 — Relire le contenu

Vérifier le sens, les exclusions, les quatre langues visées, les synonymes et les cibles des relations. Faire relire par une autre personne les changements de sens, retraits, scissions et équivalences exactes. Cette seconde relecture est une pratique d'équipe recommandée ; l'application ne l'impose pas par une séparation des comptes.

### Étape 2 — Soumettre à validation

Cliquer sur **Soumettre à validation**. Le système enregistre la saisie si nécessaire puis vérifie le brouillon.

- **À corriger avant validation** : erreurs bloquantes à résoudre.
- **Points à vérifier** : avertissements à lire et à traiter ou expliquer ; ils ne bloquent pas tous techniquement la publication.
- **Brouillon validé** : la proposition peut être sélectionnée pour une publication.

Une validation technique réussie ne garantit pas qu'une traduction ou une équivalence est juste. Toute nouvelle modification enregistrée annule la validation précédente et exige une nouvelle validation.

### Étape 3 — Prévisualiser le lot exact

Dans **Publications**, sélectionner uniquement les brouillons validés du lot voulu, puis **Prévisualiser la publication**. Examiner :

- les concepts et les révisions sélectionnés ;
- les valeurs **Publié** et **Proposé** pour chaque champ modifié ;
- les erreurs et avertissements ;
- le nombre de concepts concernés et de fiches dont la représentation sera à resynchroniser ;
- les changements de parent, de portée, de langue, d'état et les remplacements.

Le nombre de fiches affectées n'est pas le nombre de fiches dont les choix ont été réattribués : il mesure l'impact sur leurs représentations. Des changements sémantiques peuvent affecter davantage de concepts que les seuls brouillons sélectionnés.

### Étape 4 — Publier cette version

Si l'aperçu correspond au résultat attendu, cliquer sur **Publier cette version**. L'application vérifie à nouveau que les brouillons et la version courante n'ont pas changé depuis l'aperçu.

La publication applique ensemble le vocabulaire et ses mises à jour requises. Une ancienne publication reste immuable et consultable par les voies prévues pour les partenaires ; ce tableau d'administration ne propose pas un bouton de retour arrière.

**Exemple complet — clarifier un tarif handicap :** choisir **Publics tarifaires**, conserver le code existant, rédiger le libellé et la définition couvrant les différentes formes de handicap, relire EN/ES/DE, retirer un éventuel alias exact limité aux PMR, puis enregistrer et valider. Dans l'aperçu, vérifier ces champs et l'impact annoncé avant de publier. Les conditions tarifaires de chaque prestataire restent dans les fiches ; cette publication ne leur attribue pas automatiquement une réduction.

### Étape 5 — Contrôler le résultat

Relever le nouveau numéro de publication et vérifier les concepts corrigés. Dans **Actualisations et tâches de publication**, contrôler les états. Le service tente automatiquement l'envoi de la notification d'actualisation.

En cas d'**Échec à reprendre** ou d'attente persistante, utiliser **Reprendre** et vérifier à nouveau. Une tâche **Terminée** confirme son traitement et l'émission de la notification ; elle ne prouve pas la réception par chaque partenaire. Un échec de notification n'annule pas une publication déjà réussie : ne pas republier le même contenu uniquement pour réparer cette tâche.

Quand le changement répond à un problème concret, refaire ce parcours : retrouver une valeur avec son synonyme, consulter la traduction concernée ou relire la valeur sur une fiche. Pour un partenaire API, le [guide partenaires](guide-partenaires.md#35-thésaurus-versionné) décrit la consultation d'une publication, ses exports et la synchronisation des changements.

## 11. Gérer les conflits et les erreurs

| Situation | Conduite à tenir |
|---|---|
| Le contenu a changé depuis l'ouverture | Conserver une copie de la saisie utile avant de recharger. Comparer la version courante ; ne pas forcer l'écrasement. |
| Le brouillon repose sur une ancienne publication | Dans **Historique et reprise du brouillon**, utiliser **Reprendre sur la publication courante**, puis vérifier les champs repris. |
| Des champs modifiés des deux côtés sont signalés | Comparer explicitement les contenus, résoudre les chevauchements et cocher la confirmation de comparaison après cette revue. Enregistrer et valider à nouveau. |
| L'aperçu ou la publication devient périmé, avec un conflit `PT409` | Recharger les données nécessaires, revoir les brouillons et leur validation, puis produire un nouvel aperçu. La tentative refusée ne publie pas une partie du lot. |
| Une cible ou un parent est refusé | Vérifier l'identité, le domaine, l'état, les dépendances et l'absence de cycle ; corriger la relation plutôt que contourner le contrôle. |
| Le brouillon n'est plus utile | **Abandonner ce brouillon**, puis confirmer. Le brouillon et la saisie locale sont abandonnés ; la version publiée et les affectations des fiches restent conservées. |
| Une erreur de sens est découverte après publication | Préparer une nouvelle révision corrective, la valider et publier une nouvelle version. Ne pas réécrire l'historique. |
| L'accès est refusé ou l'actualisation reste en échec | Transmettre le message, le domaine, le code, la révision et le numéro de publication à l'administrateur plateforme. |

Le bouton **Recharger la version courante** n'est pas une sauvegarde de la saisie locale. Les avertissements de navigation signalent les modifications non enregistrées ; ne pas les ignorer pour changer d'onglet.

## 12. Déprécier, retirer et reprendre les fiches

Ne pas recycler le code d'une ancienne notion pour un autre sens.

| État du concept | Usage attendu |
|---|---|
| **Actif** | Notion courante. Sa sélection dépend aussi des règles du catalogue et de sa validité. |
| **Déprécié — usage historique conservé** | Ne plus utiliser pour de nouvelles affectations ; les usages existants restent lisibles et un remplacement peut être recommandé. |
| **Retiré — fiches à requalifier** | Retrait du vocabulaire courant et reprise des usages historiques signalés ; conserver leur compréhension dans l'historique. |

L'état du concept et le statut de son brouillon sont deux choses différentes. Un brouillon validé peut proposer le retrait d'un concept encore actif dans la version publiée. Les anciennes affectations ne sont pas effacées par ce retrait.

Pour faire évoluer une valeur :

1. Identifier ses usages et la raison du changement.
2. Préparer les successeurs s'ils sont nécessaires, sans inventer une équivalence.
3. Modifier l'état, renseigner les remplacements et une note d'historique, puis suivre le circuit de publication.
4. Dans **Fiches à reprendre**, utiliser **Ouvrir la fiche** et choisir le remplacement adapté à sa situation réelle.
5. Pour un chantier important, demander un inventaire complet des usages : l'absence d'élément dans la liste affichée ne vaut pas à elle seule un contrôle exhaustif de toutes les fiches.

Les dates de validité proposées pour certains catalogues sont distinctes de l'état du concept. Les renseigner lorsqu'elles sont établies ; une publication conserve les dates qu'elle contient et ne se réécrit pas au passage du calendrier.

## 13. Garder une couverture cohérente dans la durée

À chaque ajout, vérifier les notions voisines, les traductions FR/EN/ES/DE, les exclusions utiles et les relations possibles. La complétude ne consiste pas à imposer un synonyme ou une relation à chaque concept : une absence justifiée est préférable à un lien artificiel.

Pour la revue périodique d'un domaine, examiner les termes que les agents ne retrouvent pas, les doublons apparents, les définitions ambiguës, les traductions manquantes, les parents incohérents et les fiches à reprendre. Noter pour chaque décision le besoin, la solution retenue, les sources utiles et les personnes ayant relu.

### Fiche de préparation d'un changement

| Point à renseigner | Question |
|---|---|
| Identification | Quel domaine, quel contexte éventuel et quel code ? |
| Besoin | Quel cas concret ne peut-on pas décrire ou retrouver aujourd'hui ? |
| Solution | Correction, synonyme, nouveau concept, relation ou retrait ? |
| Sens | Que couvre la notion et qu'exclut-elle ? |
| Langues | FR, EN, ES et DE ont-ils été relus avec le même périmètre ? |
| Relations | Les parents et cibles désignent-ils les bons concepts ? |
| Impact | Quelles fiches ou quels usages partenaires faut-il vérifier ? |
| Relecture | Qui a relu les décisions de sens et les correspondances ? |
| Publication | Quel lot, quelle version publiée et quel résultat de contrôle ? |

### Avant de cliquer sur « Publier cette version »

- [ ] Le lot ne contient que les révisions souhaitées, toutes validées.
- [ ] Les définitions, traductions, synonymes et notes gardent le sens retenu.
- [ ] Les liens sont justifiés ; aucune proximité n'a été transformée en équivalence exacte.
- [ ] Les données restent déclaratives quand elles proviennent des professionnels.
- [ ] Les dépendances, avertissements, différences avant/après et fiches affectées ont été examinés.
- [ ] Les remplacements et la reprise des fiches sont prévus si une valeur devient historique.

Après publication, relever la version, contrôler les tâches d'actualisation et vérifier les exemples concernés.

## 14. Références et périmètre du guide

- [Documentation du projet](README.md) et [manuel utilisateur général](conformite-rgpd/01_Manuel_utilisateur_Bertel.md).
- [Guide partenaires : thésaurus et synchronisation](guide-partenaires.md#35-thésaurus-versionné), pour les personnes qui intègrent l'API.
- [Outils de contribution](../tools/thesaurus-content/README.md), pour préparer des lots accompagnés par l'équipe technique.
- [Procédure d'exploitation](SQL_ROLLOUT_RUNBOOK.md), pour l'installation et les incidents techniques.
- Les décisions métier de l'enrichissement de novembre et son compte rendu de production sont conservés dans le dossier de travail interne de l'équipe. L'administrateur du vocabulaire peut fournir les références utiles à la relecture des exemples.

Les intitulés et parcours ont été vérifiés dans la [navigation des paramètres](../bertel-tourism-ui/src/views/settings-nav.ts), l'[administration du thésaurus](../bertel-tourism-ui/src/views/ThesaurusAdmin.tsx), l'[éditeur de concept](../bertel-tourism-ui/src/features/settings/ThesaurusConceptEditor.tsx), le [service de publication](../bertel-tourism-ui/src/services/thesaurus-admin.ts) et les règles de [validation et publication](../supabase/migrations/20261106112948_thesaurus_publication.sql) et de [publication préparée](../supabase/migrations/20261106160017_thesaurus_prepared_publication.sql).

Ce guide est également consultable sur le [site de documentation Bertel](https://doc.bertel.otisud.re/thesaurus.html). La version du dépôt conserve les références internes utiles à l'équipe technique ; la version de consultation présente les mêmes consignes métier avec des liens adaptés au site.
