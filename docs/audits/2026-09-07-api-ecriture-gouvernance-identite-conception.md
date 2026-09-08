# API d’écriture : identité des établissements, protection des données et gouvernance

7 septembre 2026 — conception approfondie, à discuter avant développement.

Ce document prolonge et précise l’[audit initial](../../docs/audits/2026-09-07-api-ecriture-organisations-audit-plan.md). Ses recommandations remplacent les propositions initiales sur la création immédiate d’un objet, l’attribution automatique de sa responsabilité et le retrait global. Il ne décrit pas des fonctions déjà disponibles. Audit du dépôt et de ses scripts uniquement : aucun code applicatif, schéma, droit, clé ou déploiement modifié ; aucune requête en production ni exécution de tests.

## 1. Les garanties à rechercher

Le système doit permettre plusieurs dossiers organisationnels sur **la même fiche commune**, sans créer plusieurs copies concurrentes de cette fiche. Une organisation doit conserver sa relation avec l’établissement, son travail éditorial, ses documents et sa liberté de diffusion, même lorsque la fiche commune a été apportée ou est administrée par une autre organisation.

La proposition repose sur neuf garanties :

1. L’identité d’un établissement ou d’une offre ne dépend pas de l’organisation qui l’a saisie.
2. Une nouvelle demande d’intégration ne crée pas immédiatement un nouvel objet touristique : elle passe d’abord par une résolution d’identité.
3. Une correspondance certaine réutilise l’identité existante. Une incertitude significative bloque l’admission comme nouvelle fiche jusqu’à décision ; elle n’autorise pas une fusion automatique.
4. La responsabilité éditoriale ne donne pas accès aux dossiers privés des autres organisations et ne permet pas d’effacer leur travail.
5. La diffusion, la personnalisation, la contribution et la validation sont des autorisations différentes.
6. Une proposition ne change pas le contenu diffusé avant sa validation et son application contrôlée.
7. Les décisions portent sur le contenu exact, sa version et les pouvoirs effectifs du décideur au moment de l’application.
8. Un retrait local ne retire rien chez les autres. Un retrait global exige une procédure distincte et motivée.
9. Les mêmes règles d’admission et d’identité s’appliquent à l’API, à l’interface, aux imports et aux changements ultérieurs d’identifiants.

**Limite à expliciter dès le départ.** On peut garantir en base l’unicité d’une identité reconnue et bloquer les cas suspects. On ne peut pas promettre de reconnaître infailliblement un établissement réel à partir de descriptions contradictoires ou incomplètes. Le service rendu doit être « doublon certain empêché, doute instruit, erreur corrigible », avec des critères mesurés, et non une promesse de détection parfaite.

## 2. Ce que l’approfondissement a trouvé dans l’existant

| Constat du dépôt | Implication |
| --- | --- |
| La création dans l’interface présente des rapprochements de nom, non bloquants, sur un petit nombre de résultats. La RPC crée sans contrôle d’identité inter-organisations. | Une recherche préalable dans l’écran ne protège ni l’API ni deux créations simultanées. |
| Les identifiants externes sont uniques dans le triplet organisation/source/identifiant, et par objet/organisation/source. | Bonne base de correspondance avec les systèmes partenaires ; elle ne prouve pas l’unicité du même établissement entre A et B. |
| Le SIRET est enregistré dans une valeur JSON de `object_legal`. Le script « SIRET canonique » nettoie des données, mais n’établit pas l’unicité globale d’un établissement. | Ne pas déduire une garantie d’unicité du nom de la migration. |
| Le graphe répertorie une déduplication de staging et un registre de commits d’import. Un ancien import rattache aussi par nom exact/type/région quand il ne trouve qu’un candidat. | Ce sont des pistes à auditer, pas une preuve d’identité réutilisable : l’homonymie reste possible. |
| `publisher` peut ouvrir écriture du commun, statut global, modération et périmètre de lecture des contacts acteurs. | Il serait dangereux de l’attribuer simplement parce que B souhaite diffuser une fiche de A. |
| Le writer interne de relations autorise un éditeur à rattacher un acteur existant, puis le périmètre publisher intervient dans la lecture de ses coordonnées. | Ouvrir ensemble création et rattachement libre pourrait permettre à B d’accéder à un acteur en le liant à sa propre fiche. Cette composition doit être interdite, même si chaque appel semble acceptable séparément. |
| Le « avant/après » de modération est alimenté par les métadonnées du soumetteur. Le writer de relations peut modifier organisations et acteurs. | L’API doit produire un diff indépendant et exclure les relations qui déterminent les droits des modifications descriptives ordinaires. |
| L’approbation ne compare pas l’auteur au validateur ; l’application appelle ensuite un writer avec ses propres droits. | La séparation des personnes et la capacité effective d’application sont à concevoir explicitement. |
| Le sérialiseur partagé contient des identifiants externes, provenance et informations d’adhésion. | La réponse publique doit être une projection autorisée ; elle ne peut pas devenir le miroir du futur dossier organisationnel. La confidentialité attendue de chaque champ actuel reste à classifier. |
| Les historiques internes autorisent la lecture à partir de la lisibilité actuelle de la fiche. | La lecture d’une fiche publiée ne doit pas devenir un droit sur toutes ses anciennes versions privées. Ces RPC ne sont pas actuellement ouvertes par la façade partenaire. |
| Certaines références d’organisation dans descriptions/médias utilisent `ON DELETE SET NULL`, alors que l’absence d’organisation sert au contenu commun. | Une future suppression d’organisation ne doit jamais transformer du contenu local en contenu commun. Risque latent : la suppression des ORG est actuellement refusée par la RPC de suppression. |
| Les buckets de médias et documents généraux sont publics dans les scripts. | Masquer une ligne en base ne suffit pas à rendre inaccessible une URL déjà connue. Les pièces privées exigent un stockage et une délivrance distincts. |

Ces constats sont des observations statiques et des risques de réutilisation. Ils ne constituent pas une affirmation qu’une fuite ou un doublon précis a été observé en production. Les sources sont réunies en section 17.

## 3. Définir ce qu’est « le même établissement »

### Trois identités à ne pas confondre

| Identité | Ce qu’elle représente | Exemples de changements |
| --- | --- | --- |
| Exploitant et établissement administratif | La structure exploitante et son implantation administrative, avec identifiants vérifiés et dates de validité. | Reprise par un autre exploitant, cessation, nouvel identifiant. |
| Site physique | Le lieu, ses bâtiments ou emprises, indépendamment de l’organisation éditrice. | Nouvelle entrée, correction d’adresse, subdivision, déménagement réel. |
| Offre ou objet touristique | Ce que la fiche décrit et que le visiteur peut utiliser : hôtel, restaurant, visite, événement, etc. | Nouvelle activité autonome, changement de nom, nouvelle édition d’un événement. |

Un hôtel et son restaurant peuvent partager adresse, coordonnées et identifiant d’établissement tout en justifiant deux objets liés. Deux hôtels différents peuvent partager un standard ou un site web de groupe. Une fiche appelée « Hôtel des Hauts » et une autre « Les Hauts Hôtel » peuvent au contraire décrire exactement la même offre.

Un SIRET peut identifier l’établissement administratif ; il ne doit pas devenir une contrainte « une seule fiche touristique par SIRET ». De même, `object_type` n’est pas un discriminant d’identité suffisant : changer un type ne doit pas permettre de contourner la détection, et plusieurs offres du même type peuvent être légitimes sur un site.

Les définitions officielles distinguent bien l’unité légale, identifiée par le SIREN, de son établissement, identifié par le SIRET : [SIREN — Insee](https://www.insee.fr/fr/metadonnees/definition/c2047), [SIRET — Insee](https://www.insee.fr/fr/metadonnees/definition/c1841). La distinction supplémentaire entre établissement et offre touristique est une règle de modélisation proposée pour Bertel.

La conception devrait introduire un registre d’identité interne reliant ces niveaux, tout en conservant les identifiants des objets touristiques existants. Le détail des tables reste à spécifier. Chaque objet doit avoir une identité d’offre résolue ; les offres distinctes d’un même site sont reliées au lieu d’être fusionnées.

### Signaux et degré de confiance

| Signal | Usage recommandé | Ce qu’il ne prouve pas |
| --- | --- | --- |
| Identifiant Bertel ou ancien identifiant redirigé | Résolution exacte, puis contrôle d’accès. | Le droit de modifier la fiche ou d’en devenir responsable. |
| Référence externe de A | Retrouver la correspondance déjà enregistrée pour A et cette source. | Qu’une référence homonyme de B désigne la même chose. |
| Identifiant officiel vérifié | Retrouver l’établissement administratif et ses rattachements existants. | L’identité d’une offre particulière ni le mandat du déclarant. |
| Adresse normalisée, position et nom | Générer et expliquer des candidats, en tenant compte des données manquantes et de leur précision. | Une identité certaine ; une adresse peut héberger plusieurs activités. |
| Téléphone, domaine web, ancienne enseigne | Corroborer un rapprochement. | Une clé globale : ces valeurs peuvent être partagées ou réaffectées. |
| Documents, visite terrain, confirmation de l’exploitant | Étayer une décision humaine d’identité ou de distinction. | Un droit de publier intégralement les pièces justificatives. |

Un format ou une clé de contrôle valide n’est pas une preuve d’existence ni de contrôle de l’établissement. Le serveur distingue « déclaré », « vérifié auprès d’une source » et « décision d’identité validée », avec origine, date et version de la règle. Un champ `verified=true` reçu du partenaire n’a aucune valeur d’autorisation.

La source externe doit être une instance d’intégration enregistrée et stable, avec son domaine et sa politique d’identifiants : deux bases utilisant le même logiciel ne partagent pas nécessairement le même espace de numéros. Si une source réutilise un ancien ID pour une autre offre, le changement passe par une résolution explicite ; il ne remplace pas automatiquement l’identité déjà liée. Les mises à jour ordinaires doivent détecter les contradictions majeures d’identité qui signalent cette situation.

Les règles de rapprochement devront être calibrées par famille d’objets sur un jeu annoté : homonymes, hôtel/restaurant, communes voisines, coordonnées approximatives, objets sans SIRET, lieux naturels, itinéraires et événements. Ne pas réutiliser un seuil de distance universel ou un score flou comme preuve. L’absence de candidat dans une liste tronquée ne vaut pas absence de doublon.

### Place recommandée pour un LLM dans la résolution d’identité

Un LLM est pertinent pour interpréter les différences de formulation, rapprocher noms anciens et nouveaux, comparer des descriptions hétérogènes et distinguer même offre et offres liées. La recherche sur l’entity matching soutient l’intérêt de comparer les relations entre plusieurs candidats, plutôt que de poser uniquement des questions binaires isolées ; ces résultats restent à éprouver sur les données touristiques de Bertel. [Match, Compare, or Select?, COLING 2025](https://arxiv.org/abs/2405.16884).

Le pipeline proposé est : **normalisation et clés exactes → recherche de candidats → comparaison argumentée par LLM → décision suivant la politique d’admission → finalisation transactionnelle**. Les correspondances exactes déjà validées n’ont pas besoin d’un appel modèle systématique.

La recherche combine plusieurs voies : identifiants, noms/aliases, adresse, proximité géographique adaptée, et recherche sémantique. Le rappel de cette étape se mesure séparément : la bonne fiche a-t-elle été présentée ? Un LLM ne peut pas reconnaître une fiche omise par la recherche. Une recherche tronquée, indisponible, limitée au public ou dépourvue d’indices essentiels interdit de conclure à l’inexistence.

Le modèle compare un ensemble de candidats suffisamment borné pour être lisible, mais ne transforme pas la limite de contexte en preuve d’absence. Les rapprochements conflictuels dans un groupe doivent être réexaminés : A≈B et B≈C ne justifient pas une fusion transitive si A et C sont incompatibles.

| Avis structuré du modèle | Suite proposée |
| --- | --- |
| Même offre probable, avec candidat identifié | Préparer le rattachement et les preuves pour la décision d’admission. |
| Même établissement/site, offre distincte | Préparer la relation entre offres et expliquer le discriminant ; aucune fusion sur la seule proximité. |
| Candidats examinés distincts | Avis favorable à poursuivre l’examen d’une nouvelle offre, sous réserve de couverture de recherche et contrôles finaux ; aucune certification d’inexistence absolue. |
| Informations insuffisantes ou contradictoires | Poser une question factuelle ciblée ou orienter vers la revue humaine, en conservant le dossier. |

La réponse doit citer les champs et sources fournis qui justifient le rapprochement, les contradictions, les données manquantes et le niveau d’identité concerné. Le serveur vérifie que le candidat appartient à l’ensemble réellement fourni et que les références de preuve existent. Une justification persuasive n’est pas une preuve supplémentaire. La confiance auto-déclarée du modèle n’est pas assimilée à une probabilité mesurée.

Le modèle ne reçoit aucun droit de fusion, de création, d’attribution de responsabilité ou de modification des permissions. Les éventuels outils de recherche supplémentaires restent bornés à la lecture et aux projections autorisées. Les fiches et pièces contiennent des données non fiables, qui peuvent inclure des instructions malveillantes ; format structuré, contrôle des références et absence de pouvoir d’écriture restent nécessaires même avec un prompt prudent.

Ne transmettre que les attributs nécessaires au rapprochement, avec provenance et date. Aucun dossier CRM, contact privé, secret d’intégration ou justificatif complet par défaut. Le traitement éventuel d’attributs non publics nécessite un circuit autorisé pour ce service de rapprochement ; le résultat retourné au partenaire ne révèle pas les candidats ou indices cachés. Le déploiement du modèle, la conservation des requêtes et les journaux doivent respecter ce périmètre.

Commencer en mode observation : le LLM propose, les réviseurs décident, puis les écarts sont analysés sur un jeu d’évaluation séparé des exemples utilisés pour régler le système. Mesurer rappel des candidats, faux rapprochements, doublons manqués, abstentions, charge de revue, délai et coût par dossier. Donner un poids élevé aux faux rapprochements : ils peuvent mélanger deux établissements et contaminer leurs relations. Évaluer aussi changements d’enseigne, hôtel/restaurant, données manquantes, sources nouvelles, instructions malveillantes et contradictions entre candidats.

Après évaluation, une automatisation limitée de cas précisément définis peut être envisagée. Elle conserve tous les contrôles d’accès et d’identité et n’entraîne jamais de transfert de responsabilité. La fusion de deux fiches déjà actives ou une identité contestée reste une décision distincte. Toute évolution du modèle, du prompt ou de la recherche impose une réévaluation ; l’accord de deux modèles ne constitue pas à lui seul une garantie, leurs erreurs pouvant être communes.

Conserver pour l’avis : version du modèle, version du prompt et de la recherche, versions des candidats, références de preuve nécessaires et décision finale, avec minimisation des journaux. Un changement de données après l’analyse périme l’avis concerné et déclenche la revérification finale. Si le modèle est indisponible ou renvoie un résultat invalide, le dossier reste en résolution ou passe en revue humaine ; la panne n’autorise pas une création automatique.

## 4. Une admission en deux temps, avant la création publique

### Le dossier d’apport

Une requête de création crée d’abord un **dossier d’apport privé à l’organisation**, avec un identifiant stable et un état consultable. Ce dossier peut contenir une description encore incomplète, ses références externes et les éléments utiles au rapprochement. Plusieurs dossiers A/B sur la même identité sont acceptables ; plusieurs fiches communes pour cette même identité ne le sont pas.

Le contrat privilégié devient une commande de soumission d’apport, par exemple `POST /api/public/submissions`, plutôt qu’une promesse « POST objects crée toujours un objet ». Si le chemin initial est conservé, sa sémantique doit annoncer clairement un dossier et une résolution, sans fabriquer un `object_id` définitif pour satisfaire le client.

| Situation résolue | Résultat |
| --- | --- |
| Nouvelle tentative identique du même appel | Même dossier, même résultat ; aucun doublon de notification ou d’objet. |
| Référence source déjà liée | Dossier orienté vers l’objet connu ; les différences deviennent une proposition de mise à jour. |
| Même offre reconnue dans le catalogue | Réutilisation de l’objet ; A peut demander son adoption dans son flux et conserver son propre dossier. A n’acquiert pas la responsabilité de l’objet. |
| Plusieurs candidats ou informations insuffisantes | Examen d’identité ; aucun nouvel objet commun avant résolution. |
| Offre distincte démontrée sur un site existant | Nouvelle identité d’offre, explicitement reliée au site et aux autres objets pertinents. |
| Nouvelle identité confirmée | Création unique d’un brouillon canonique et attribution de sa responsabilité selon les règles d’admission. Revue du contenu avant diffusion publique. |

Les décisions possibles d’identité sont « rattacher à l’existant », « admettre une offre distincte », « demander des précisions » et « refuser ». Une distinction validée entre deux candidats doit être mémorisée avec ses raisons et sa version, puis réexaminée si les données d’identité changent. Cela évite de représenter éternellement le même faux positif.

### Pas de prise de possession par le premier arrivé

L’organisation qui apporte une identité réellement nouvelle devient normalement sa responsable éditoriale initiale **après admission**. Une référence SIRET simplement déclarée, un dossier incomplet ou le fait d’être le premier appel ne constitue pas un titre opposable aux autres.

Un dossier douteux ne doit pas réserver indéfiniment un établissement : limiter les dossiers ouverts et prévoir expiration, demande d’éléments et arbitrage des revendications concurrentes. Une réservation d’identité technique ne bloque jamais les corrections de la fiche existante ni sa diffusion. Une tentative de rattachement ne change aucun lien prestataire ou droit de gestion.

### Doublons cachés et confidentialité

La résolution interne doit tenir compte des brouillons, objets masqués, archives, aliases et admissions en cours du même catalogue de production. Se limiter au catalogue public laisserait créer une seconde fiche d’un objet déjà connu.

Cela ne donne pas à A le droit de découvrir les brouillons de B. Aucun retour de candidat privé, nom de B, ID caché, extrait de document, score fondé sur un contact privé ou message « déjà détenu par B ». Les dossiers reçoivent une réponse d’admission neutre ; une correspondance non divulguable est traitée par un acteur autorisé. Le suivi de A reste limité à ses éléments et aux décisions qu’il peut connaître.

Les candidats publiés et accessibles peuvent être présentés avec leurs données publiques. Une pré-vérification de doublon reste indicative et ne remplace pas la vérification finale. Les différences de réponse, compteurs et délais doivent être testées contre l’énumération de données cachées ; ne pas promettre une absence parfaite de canaux temporels sans mesure.

## 5. Empêcher les courses entre deux créations

### Trois garanties différentes

1. **Idempotence de requête** : une reprise réseau ne répète pas une opération. Unicité sur organisation/opération/clé d’idempotence ; empreinte du payload stockée séparément et comparée, jamais ajoutée à la clé unique. Même clé et autre payload produit un conflit, pas une deuxième opération. Résultat persisté au-delà de la seule requête HTTP, puis réautorisé à chaque restitution.
2. **Unicité de correspondance source** : une référence externe de A reste liée à une identité, même si A change de clé API. Ne pas utiliser l’identifiant de clé comme espace de noms métier.
3. **Unicité de l’identité commune** : A et B doivent aboutir à la même identité lorsqu’ils parlent de la même offre, même avec des références externes différentes.

La première ne remplace pas les deux autres. Un `SELECT` suivi d’un `INSERT` ou un `NOT EXISTS` ne protège pas, à lui seul, deux transactions concurrentes. Les contraintes uniques sont le dernier rempart sur les clés exactes retenues ; l’isolation et le protocole d’admission traitent les vérifications multi-lignes. Références : [contraintes PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html), [isolation des transactions](https://www.postgresql.org/docs/current/transaction-iso.html).

### Protocole de finalisation proposé pour une première version

Les recherches externes et la revue humaine se déroulent hors transaction. Au moment de confirmer l’admission :

1. Résoudre l’appelant et vérifier organisation, domaine test/production, autorité du décideur, état et version du dossier.
2. Prendre un verrou transactionnel commun aux admissions du **catalogue concerné**, jamais un verrou par organisation. Pour la première version, sérialiser cette courte phase par domaine est une solution simple à mesurer avant d’optimiser.
3. Après acquisition, relire dans une instruction et un instantané frais les références exactes, aliases, décisions d’identité, admissions concurrentes et candidats pertinents ; revérifier également le dossier et les autorités sous le protocole de verrouillage applicable aux révocations. Une recherche ou autorisation effectuée avant l’attente ne suffit pas.
4. Vérifier que les informations et la décision humaine portent encore sur la même situation. Un nouveau candidat important renvoie à l’examen ; il ne doit pas être ignoré parce qu’une revue avait déjà donné son accord.
5. Réutiliser une identité existante ou insérer l’identité et son unique brouillon ; enregistrer la correspondance source, l’organisation responsable admise et le rattachement du dossier dans la même transaction.
6. Enregistrer le résultat d’idempotence, l’événement et l’audit transactionnels, puis libérer le verrou au commit. Aucune requête réseau ni attente humaine sous verrou.

En cas de collision d’unicité ou d’échec de sérialisation, reprendre le protocole complet avec une limite de tentatives et relire le résultat. Ne pas convertir indistinctement ces erreurs en « création réussie » ni retenter uniquement l’INSERT. Un simple verrou sur le SIRET ne couvre pas A qui le fournit et B qui ne fournit qu’un nom/adresse.

Pour la stratégie de verrou proposée, préciser une transaction `READ COMMITTED` et une instruction de recherche distincte après l’acquisition du verrou. Une instruction supplémentaire sous `REPEATABLE READ` conserve l’instantané ancien ; une unique CTE « verrou puis recherche » ne garantit pas non plus la fraîcheur attendue. Une alternative `SERIALIZABLE` doit être conçue et testée avec reprise complète des transactions rejetées. L’autorité contrôlée est celle du décideur actuel : la rotation ordinaire de l’ancienne clé de dépôt ne suffit pas à invalider une contribution persistée.

Le verrou ne résout pas une identité ambiguë. Il assure que deux finalisations ne décident pas sur l’ignorance de l’autre. Il n’est efficace que si tous les chemins le respectent. Toute création directe, import privilégié non adapté, changement d’identifiant, fusion ou séparation qui peut affecter l’identité doit entrer dans ce protocole. Tant que ce chantier transversal n’est pas fait, la garantie doit être annoncée comme limitée au canal traité.

L’évolution vers des verrous par groupes de candidats ne sera justifiée que par des mesures et une preuve de recouvrement des groupes, notamment aux frontières géographiques. La première version ne doit pas gagner du débit en réintroduisant deux admissions concurrentes invisibles l’une à l’autre.

### Invariants à porter par le modèle physique

| Invariant proposé | Protection attendue |
| --- | --- |
| Une identité d’offre résolue possède au plus un objet canonique actif dans son domaine. | Référence obligatoire et unicité en base ; un type ou un nom différent n’ouvre pas une seconde identité par lui-même. |
| Un identifiant vérifié d’établissement désigne une identité d’établissement, distincte des offres. | Unicité du registre dans son autorité/espace de noms, avec relations historisées vers les offres ; les déclarations non vérifiées n’occupent pas abusivement cet espace. |
| Une référence externe courante de A possède une cible déterminée. | Unicité organisation/source enregistrée/domaine/identifiant ; politique de normalisation propre à la source, sans modifier arbitrairement la casse des IDs. Conservation des anciens aliases. |
| Une offre possède un responsable effectif à un instant donné, ou un état explicite sans responsable/intérimaire. | Pas de deux responsabilités principales actives concurrentes ; transfert atomique et révision de gouvernance. |
| Chaque donnée locale garde son organisation et sa ressource. | Références contraintes ; aucune promotion par NULL, transfert ou fusion ; une seule révision locale publiée effective par ressource/organisation. |
| Une décision applique une version précise de proposition au plus une fois. | Unicité de l’application, verrou/transition sur la proposition et préconditions de contenu/autorité. |
| Un alias mène à une seule identité terminale et ne forme pas de cycle. | Vérification sous le verrou d’identité lors de fusion/séparation ; aucun ancien ID réutilisé. |

Ces règles ne rendent pas un rapprochement flou certain : elles empêchent de représenter deux fois une identité que le service a déjà reconnue. Un lot d’import doit finaliser par unités bornées ; il ne monopolise pas le verrou du catalogue pendant tout son chargement. Définir des délais de verrou et de transaction, ainsi qu’une reprise idempotente, puis mesurer leur comportement.

## 6. Les espaces de données et leurs propriétaires

| Espace logique | Responsable de son contenu | Qui peut le lire/modifier ? |
| --- | --- | --- |
| Registre d’identité et rapprochements | Service d’admission et arbitres habilités | Accès interne restreint ; uniquement les conclusions publiables pour les partenaires. |
| Fiche commune et révisions publiées | Responsable éditorial et validateurs habilités | Lecture publique des champs autorisés ; modification par proposition et décision. |
| Dossier de A sur cette fiche | Organisation A | Membres/identités techniques habilités de A. La responsabilité de B sur le commun n’ouvre pas ce dossier. |
| Textes et sélection de flux de A | Organisation A | Écriture par A ; diffusion des seuls éléments activés selon les droits d’usage et de visibilité. |
| Proposition de A et pièces de preuve | A pour l’apport ; instance de revue pour la décision | A et les réviseurs explicitement compétents ; aucune visibilité globale automatique. |
| Historique de gouvernance et décisions | Autorité de gouvernance | Vues minimisées par rôle ; détails privés réservés au dossier de décision. |
| Correspondances source de A | Organisation A / son intégration | A et services internes nécessaires ; pas un annuaire public des bases des autres organisations. |

Le modèle physique devra rendre ces frontières explicites : identifiant d’organisation obligatoire pour les lignes locales, références cohérentes avec leur périmètre, contraintes et politiques de lignes sur les espaces exposés. Les champs canoniques et locaux ne doivent pas être distingués uniquement par une convention fragile « organisation NULL = commun » lors d’une suppression.

Les données publiques de la fiche ne deviennent pas la propriété privée d’une organisation qui les consulte. Réciproquement, l’adoption de la fiche n’ouvre ni les contacts privés, ni le CRM, ni les pièces administratives, ni les paiements/adhésions, ni les notes des autres organisations. Le partage éventuel de ces éléments est une autorisation distincte avec destinataire, finalité, périmètre et durée.

## 7. Autorisation effective : au-delà des scopes

Chaque action doit passer la conjonction suivante : identité vérifiée, organisation active, domaine correct, scope de la clé, habilitation métier actuelle, relation à la ressource, champs permis, état compatible et absence de restriction applicable. Le rôle de diffuseur satisfait seulement les droits locaux de diffusion/personnalisation définis ; il n’implique aucun rôle `publisher` historique.

Le contrôle vaut aussi pour les identifiants imbriqués : une période, un média, un acteur ou une pièce jointe doit appartenir à l’objet et au périmètre autorisés. Accepter un `object_id` valide tout en écrivant un `period_id` d’une autre fiche serait une brèche. Les protections au niveau de l’objet et au niveau de ses propriétés sont complémentaires : [OWASP sur les objets](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/), [OWASP sur les propriétés](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/).

Une association à un acteur global nécessite sa propre autorisation ou une preuve de relation validée. Le fait d’avoir le droit de créer une fiche n’autorise pas à y rattacher n’importe quel acteur de l’annuaire, puis à utiliser ce lien pour lire ses coordonnées. Cette opération reste hors de la première API partenaire.

Le domaine test/production provient d’une configuration serveur et ne change pas lors d’une adoption, d’une modification du lien principal ou d’un transfert de responsabilité. Les références inter-domaines sont refusées. Un résultat ancien d’idempotence est lui aussi soumis aux droits de lecture actuels : il ne doit pas restituer des données devenues inaccessibles après révocation.

### Frontière serveur/base

Préférer un rôle technique dédié pouvant exécuter un ensemble fermé de commandes, sans droits généraux d’écriture sur les tables. Les opérations privilégiées nécessaires résolvent le contexte de confiance côté serveur/base et répètent leurs contrôles de périmètre ; privilèges d’exécution minimaux, schémas maîtrisés et chemin de recherche fixe.

Un `org_id`, un rôle, un `verified`, une fonction SQL ou un auteur humain envoyé dans le payload n’est jamais une preuve. Un contexte SQL de session arbitrairement modifiable ne doit pas devenir la source d’autorité. Ne pas inventer un JWT utilisateur ou usurper un employé pour satisfaire les RPC existantes fondées sur `auth.uid()`.

Le contrat de commandes doit être défini par opérations métier. Les clés inconnues sont rejetées ; pas de pass-through vers `metadata.rpc`, table/action, JSONB libre de gouvernance ou writer générique de relations. Un scope « proposer » n’autorise pas toutes les colonnes d’une table.

### Révocation et traitements différés

Les droits sont revérifiés à l’exécution, pas seulement à l’entrée HTTP. Les décisions d’application et les révocations concurrentes partagent un ordre transactionnel : une application terminée avant révocation reste une action autorisée historique ; une révocation devenue effective avant application empêche celle-ci. Couvrir la clé, le compte humain, son adhésion, l’organisation et la délégation, pas seulement un compteur sur l’objet.

La rotation d’une clé ne détruit pas les propositions déjà reçues ni les références externes de l’organisation. Les travaux machine encore non exécutés sont réautorisés ; les propositions persistées deviennent des dossiers métier révisables par les personnes compétentes. Une compromission doit être distinguée d’une rotation normale et permettre de mettre en quarantaine les apports de la période suspecte.

Les quotas s’appliquent par clé **et** organisation, avec limites de taille, volume de créations en attente, coût des recherches et notifications. Multiplier les clés ne doit pas multiplier sans limite le droit de créer des dossiers. Une panne des contrôles nécessaires d’écriture ne doit pas élargir les droits.

## 8. Matrice de gouvernance

La provenance historique n’accorde aucun droit permanent. Les fonctions ci-dessous peuvent se cumuler, mais chacune doit être explicitement attribuée.

| Action | Responsable éditorial A | Diffuseur B | Contributeur C | Validateur délégué | Plateforme |
| --- | --- | --- | --- | --- | --- |
| Diffuser/retirer localement | Son flux seulement | Son flux seulement | Son flux s’il diffuse | Son flux s’il diffuse | Assistance exceptionnelle tracée |
| Modifier textes locaux | Ses textes | Ses textes | Ses textes si autorisé | Ses textes si autorisé | Pas d’usurpation silencieuse |
| Proposer une correction commune | Oui | Avec droit de contribution | Oui | Avec droit de contribution | Oui, tracé |
| Valider le commun | Personnes habilitées, pas toute l’organisation | Non du seul fait de diffuser | Non du seul fait de contribuer | Modules/actions/durée délégués | Recours attribué et motivé |
| Lire les preuves d’un dossier | Périmètre de revue autorisé | Aucun accès implicite | Ses preuves et retours autorisés | Périmètre délégué | Accès lié au dossier |
| Lire le CRM privé de B | Non | B uniquement | Non | Non | Pas par simple rôle de revue |
| Déléguer la validation | Administrateur de gouvernance habilité | Non | Non | Pas de sous-délégation implicite | Reprise/arbitrage documenté |
| Transférer la responsabilité | Demande et consentement convenus | Peut demander, sans se l’attribuer | Peut demander | Aucun droit implicite | Recours en cas d’impasse |
| Retirer globalement/supprimer | Demande motivée distincte | Retrait local ou signalement | Signalement | Aucun droit implicite | Procédure exceptionnelle dédiée |

Garder un responsable opérationnel principal avec des délégations bornées est plus lisible qu’une copropriété indifférenciée. Une délégation précise objets ou ensemble identifié, modules, actions, période, donneur et destinataire. L’administration d’une organisation ne donne pas automatiquement le droit de valider des données touristiques.

La plateforme n’est pas un contournement anonyme des règles : ses interventions enregistrent décideur, motif, dossier et effet. Pour transfert contesté, fusion litigieuse ou retrait global sensible, prévoir une seconde validation indépendante selon une règle explicite.

## 9. Validation du contenu et conflits

### Une proposition immuable et compréhensible

Le serveur conserve le contenu exact proposé, le module et ses dépendances, la référence lue, l’auteur technique/humain attesté, la provenance et l’empreinte du payload. Corriger une proposition crée une nouvelle version qui remplace la précédente ; une approbation de l’ancienne ne s’applique pas à la nouvelle.

Le diff affiché est calculé par le serveur sur l’effet réel de la commande, après filtrage des données visibles par le réviseur. Le texte explicatif envoyé par C reste un commentaire. Le réviseur voit référence initiale, proposition et état actuel si celui-ci a changé. Il ne valide jamais une étiquette rassurante qui masquerait une modification des rôles.

Ce filtrage ne doit pas permettre une approbation aveugle : si le réviseur n’a pas le droit de voir l’effet complet d’une commande, celle-ci est refusée, découpée en unités autonomes autorisées ou réorientée vers un réviseur compétent. Une propriété cachée ne peut pas être appliquée au titre d’un écran qui ne l’affiche pas.

### Unité d’application

Privilégier une commande atomique par module cohérent. Les horaires forment un ensemble avec périodes, jours, exceptions et fuseau ; les remplacer nécessite une précondition sur l’ensemble réellement touché. Une modification de la description de B ne doit pas provoquer un conflit sur les horaires communs de A.

Définir pour chaque commande les champs lus pour valider et les champs écrits. Par exemple, un changement de fuseau peut invalider une proposition d’horaires même si la liste de périodes n’a pas changé. Les identifiants enfants sont conservés quand possible et contrôlés contre leur parent ; une collection omise ne signifie pas suppression. Une suppression ou un remplacement complet doit être explicite.

| Comparaison à l’application | Comportement |
| --- | --- |
| Référence inchangée et autorité valable | Appliquer, incrémenter les révisions concernées, journaliser et émettre l’événement dans la même transaction. |
| État actuel déjà égal à l’effet proposé | Résoudre comme déjà satisfait, sans réécriture inutile ; conserver la contribution et sa provenance. |
| Changement indépendant, sans dépendance commune | Fusion contrôlée possible si le contrat du module la définit et si le réviseur a vu l’effet final exact. |
| Même champ/module ou dépendance modifiés | Conflit explicite ; aucune règle « dernier arrivé gagne ». Conserver le travail et demander une nouvelle revue. |
| Autorité ou responsable changé | Réautoriser et réorienter ; ne pas appliquer sous l’ancienne autorité ni rejeter automatiquement l’apport. |

En première version, décision et application automatique devraient être une seule transaction. Le report manuel existant reste une attestation distincte ; il ne doit pas être présenté comme une écriture automatique garantie. Si l’application est différée, une décision en attente d’exécution n’est pas une garantie de succès et toutes les préconditions sont revérifiées.

### Séparation auteur/validateur

Recommandation : une personne ne valide pas le contenu qu’elle a rédigé, même après changement de rôle ou d’organisation. A peut faire relire ses apports par une autre personne de A : il n’est pas nécessaire de confier toutes ses créations à une organisation concurrente.

Si un réviseur corrige le payload, il devient coauteur de la nouvelle version et ne peut pas la valider lui-même. Conserver les auteurs attestés des changements encore présents dans la version soumise ; comparer seulement le décideur au déposant initial laisserait un contournement. Une modification nulle ou un commentaire de revue ne doit pas être confondu avec une réécriture du contenu.

Limite importante : une clé de machine atteste une intégration et une organisation, pas l’identité humaine réelle du rédacteur. Un `author_user_id` librement déclaré ne suffit pas. Pour garantir techniquement deux personnes distinctes, il faut une identité humaine attestée ; sinon le système doit annoncer « revue humaine nominative d’un apport technique », avec attestation d’indépendance et contrôle organisationnel, sans prétendre prouver les quatre yeux.

## 10. Gouvernance versionnée, transferts et litiges

Éviter un seul statut mélangeant identité, publication, gouvernance et modération. Conserver des états indépendants :

- identité/admission : reçu, à préciser, à rapprocher, lié, admis distinct, refusé ;
- contenu commun : brouillon, publié, indisponible selon le cycle retenu ;
- responsabilité : non attribuée, active, intérimaire ;
- diffusion locale : non sélectionnée, prête/à publier, active, suspendue ou retirée ;
- proposition : en revue, à réviser, appliquée, déjà satisfaite, rejetée, retirée ou en conflit ;
- transfert : demandé, accepté et exécuté, refusé, annulé ou expiré ;
- recours : reçu, recevable/en instruction, résolu ou classé.

La révision de gouvernance change lorsqu’un pouvoir change effectivement : responsable, délégation, restriction. Une demande de transfert ou un signalement reçu ne change pas automatiquement les pouvoirs. Les révisions d’organisation/adhésion complètent cette protection pour les révocations globales.

### Transfert consensuel

A demande un transfert vers B ; B l’accepte sur un état identifié. La commande vérifie les deux autorités, la révision attendue, les organisations actives et le traitement des délégations, puis change la responsabilité atomiquement. La demande en attente ne donne aucun droit à B.

L’ID de la fiche, la provenance de chaque contribution, les liens d’exploitation et les dossiers locaux des autres organisations restent distincts. Les propositions ouvertes sont conservées et réorientées. Les délégations de A expirent par défaut au transfert, sauf reprise nominative expressément acceptée par B. Un transfert éditorial ne prouve pas un changement d’exploitant.

Réorienter la revue ne copie pas le dossier privé du déposant. Retirer les accès qui dépendaient seulement de l’ancienne responsabilité/délégation, conserver ses droits propres d’auteur et autoriser les nouveaux réviseurs sur les seules preuves partageables pour cette revue. Une preuve non transférable impose une nouvelle pièce ou une autre autorité compétente. Notifications, téléchargements et liens de fichiers suivent cette réautorisation.

### Départ de A

Désactiver ses accès et son flux, puis organiser une succession ou un intérim pour les fiches dont A est responsable. Ne pas supprimer en cascade les fiches communes ni les personnalisations de B. Archiver ou traiter les données locales de A selon les règles convenues, sans les transformer en données publiques ou en données de B.

### Contestation et inaction

C peut contester un refus ou la responsabilité de A avec des éléments. Le dépôt d’un recours ne gèle pas la fiche et ne retire pas les droits de A : sinon un concurrent disposerait d’un moyen de blocage. Seule une décision de recevabilité et de restriction motivée, attribuée à une autorité indépendante, peut limiter les gestes concernés, pour une durée et un périmètre définis.

Un refus comporte un motif conservé et une voie de recours. Prévoir une cible de délai de traitement, relance puis escalade configurable ; l’expiration n’équivaut jamais à l’approbation automatique. La plateforme peut réassigner une revue ou nommer un intérimaire si le responsable n’est plus opérationnel. Corriger une erreur avérée ne doit pas nécessiter de prendre possession de toute la fiche.

## 11. Retraits, fermetures et urgence

Il faut distinguer cinq opérations :

| Opération | Portée et autorité proposées |
| --- | --- |
| B cesse de diffuser | Au commit, les réponses et délivrances contrôlées par Bertel excluent la fiche de B grâce à une garde indépendante du projecteur. Les copies chez les intégrateurs convergent par événement/réconciliation. Aucun effet dans le flux de A. |
| B cesse d’utiliser un texte ou un média local | Retrait de cet élément local et repli contractuel ; aucun changement du commun. |
| L’établissement a fermé | Fait métier commun à vérifier, avec date et éventuelle réouverture ; pas une suppression de l’historique. |
| Une information/ressource ne doit plus être distribuée | Restriction de visibilité spécifique, motivée, appliquée aux rendus, fichiers et événements concernés. |
| Une fiche doit être supprimée ou fusionnée | Procédure dédiée, analyse des organisations et références impactées, décision traçable. Aucun bouton générique de clé partenaire. |

Une urgence déclarée par un partenaire ne lui donne pas le pouvoir de changer le commun. Il peut retirer localement en attendant une revue prioritaire. Une intervention d’urgence habilitée doit être limitée, motivée et revue ensuite. À son expiration, ne pas restaurer aveuglément une ancienne valeur qui écraserait des modifications légitimes intervenues entre-temps.

La responsabilité éditoriale donne une priorité d’instruction et des devoirs de qualité ; elle ne constitue pas un veto absolu sur les corrections étayées ou la survie du commun.

## 12. Personnalisation et indépendance des flux

La première ouverture devrait se limiter à l’accroche et au descriptif multilingues déjà identifiés. Les horaires, tarifs, adresse, contact principal, accessibilité factuelle et caractéristiques restent communs ou propres à une offre réellement distincte. Une organisation peut éditorialiser son message ; elle ne doit pas contourner la validation des faits par un champ « personnalisé » qui remplacerait silencieusement une donnée structurée.

Définir précisément le repli par champ et par langue : absent signifie héritage, suppression de personnalisation revient à l’héritage, masquage explicite n’est autorisé que pour les champs qui le permettent. Un objet JSON vide ou la suppression de toute la ligne ne doit pas avoir des conséquences implicites différentes selon le sérialiseur.

Le rendu de B combine uniquement la dernière révision commune publiable, les textes publiés de B et les ressources dont l’usage est autorisé. B peut préparer un brouillon local sans l’exposer. Les droits d’administration du commun par A ne lui permettent pas d’éditer le texte local de B.

Quand une donnée commune change, ne pas écraser un texte local. En revanche, signaler à B les personnalisations susceptibles d’être devenues incohérentes : par exemple son descriptif mentionne d’anciens horaires. Conserver la version commune sur laquelle le texte a été rédigé, afficher un besoin de relecture et permettre à B de suspendre son flux. Une détection sémantique automatique éventuelle doit rester une aide, pas une autorisation de réécriture.

La sélection locale seule ne devrait pas geler secrètement une ancienne version du commun. Pour la première version, les flux suivent le commun validé ; si une publication datée doit rester figée, ce sera une ressource éditoriale versionnée explicite avec date, distincte du flux courant.

## 13. Protéger les données sur toute leur durée de vie

### Réponses, recherches et historiques

Construire des schémas de sortie positifs pour catalogue, flux, suivi de dossier, revue et administration. Ne pas réutiliser un `to_jsonb` complet de tables locales. Les références externes privées, métadonnées d’adhésion, paiements, noms de collaborateurs, raisons internes et pièces jointes ne passent pas dans une réponse publique parce qu’ils sont rattachés à un objet publié.

L’historique public est une histoire des révisions publiables ; l’historique de travail et les preuves gardent leur accès propre. Rendre une fiche publique n’ouvre pas rétroactivement son ancien contenu privé. Une restauration d’historique est une nouvelle proposition contrôlée : elle ne restaure ni anciens droits, ni anciennes coordonnées privées, ni médias devenus non diffusables.

Les compteurs, facettes, exports, recherche de doublons, messages d’erreur et notifications doivent respecter le même périmètre que la donnée. Des identifiants opaques ne remplacent pas les autorisations. Les logs techniques ne contiennent pas clés, signatures, documents complets ou payloads personnels non nécessaires.

### Pièces, médias et droits d’usage

Une preuve transmise au réviseur n’est pas un média public. Les preuves privées sont stockées séparément, avec accès temporaire contrôlé à chaque délivrance. Un lien signé expirant reste utilisable pendant sa validité : une révocation stricte exige un service de délivrance qui recontrôle l’accès, avec ses limites de cache explicites.

Une ressource publiable porte au minimum son origine, ses conditions d’usage connues, le périmètre autorisé, le crédit et les éventuelles dates de fin. La diffusion chez A ne prouve pas le droit de republier chez B. L’accès au fichier et l’autorisation de le réutiliser sont deux contrôles distincts. Une fermeture en base ne peut pas reprendre les copies déjà téléchargées ; il faut un mécanisme de retrait dans les flux et des obligations de réconciliation convenues avec les intégrateurs.

Séparer le fichier physique de ses utilisations par objet et organisation. Retirer l’usage chez A ou fusionner une fiche ne supprime pas le fichier encore utilisé légitimement chez B. La suppression physique doit être différée, vérifier les références encore actives et être compatible avec les éventuels blocages de retrait. Le script actuel de suppression contrôle les autres références pour les documents, mais collecte les URL de médias sans contrôle équivalent : ne pas étendre cette hypothèse à des ressources partagées.

Les futurs imports de fichiers ou d’URL devront contrôler taille, format, contenu actif et destinations réseau ; les commentaires et documents fournis restent des entrées non fiables. Ce chantier ne doit pas être implicitement ouvert avec les commandes de texte/horaires.

### Conservation et partage

La responsabilité éditoriale produit ne détermine pas à elle seule le rôle juridique de chaque organisation pour les données personnelles. La charte d’intégration devra préciser finalités, destinataires, droits d’usage, responsabilités, demandes de rectification/retrait et conservation selon les catégories. Ne pas étendre un consentement existant à tous les diffuseurs par déduction.

La CNIL rappelle la limitation à une finalité, la minimisation, la sécurité et la conservation adaptée : [principes](https://www.cnil.fr/fr/comprendre-le-rgpd/les-six-grands-principes-du-rgpd), [durées de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees). La traduction technique proposée est de séparer l’événement de décision, les preuves et les données personnelles, pour conserver une traçabilité utile tout en permettant les purges ou occultations autorisées.

« Historique immuable » ne doit pas signifier « copies de toutes les données privées conservées et accessibles pour toujours ». Le registre minimal empêchant une recréation indésirable après retrait doit avoir une finalité, un accès et une durée définis ; un hash d’identifiant prévisible ne devient pas automatiquement une donnée anonyme.

## 14. Fusion, séparation et évolution d’identité

Même avec une admission stricte, il faut traiter les doublons historiques et les erreurs d’arbitrage. Une fusion est un changement d’identité à fort impact, pas une suppression suivie d’un déplacement de lignes.

### Fusion contrôlée

Préparer un dossier montrant identité cible, raisons, champs communs en conflit, organisations touchées, références externes, propositions ouvertes, médias et effets de diffusion. Chaque organisation ne voit que le détail de ses propres données locales. La plateforme dispose de la vue d’arbitrage autorisée ; un responsable ne reçoit pas les dossiers privés des autres pour « vérifier la fusion ».

Après décision, conserver un identifiant canonique et des aliases des anciens. Ne jamais réattribuer un ancien ID à un autre établissement. Les correspondances externes suivent la résolution sans changer leur organisation/source. Les liens de flux sont consolidés **par organisation** ; si B avait deux textes différents sur les deux doublons, conserver les deux versions et demander à B de choisir, sans règle arbitraire du dernier écrit.

Le schéma actuel ne permet qu’une référence par objet/organisation/source : fusionner deux objets ayant chacun un ID de la même source ferait collision. Il faut un registre d’alias de source pouvant conserver ces deux anciennes références, avec identifiant courant/principal éventuel et résolution explicite. Déplacer simplement toutes les lignes vers la cible ne respecte pas la contrainte actuelle.

Les droits de gouvernance ne sont pas l’union des droits des deux objets. La responsabilité cible et ses délégations doivent être décidées explicitement. Les propositions ouvertes sont réorientées puis revérifiées contre la nouvelle référence ; l’approbation sur l’ancien objet n’autorise pas automatiquement une écriture sur la nouvelle cible.

Les anciens IDs peuvent rediriger en lecture après contrôle d’accès. Une écriture sur un ID fusionné retourne un résultat de résolution/conflit exploitable et exige une cible/version actuelle ; pas de redirection silencieuse d’un patch potentiellement destructif.

### Réversibilité et changement de réalité

Conserver le plan exécuté, les correspondances et les états nécessaires à une séparation auditée, avec accès restreint. Après de nouvelles écritures, « annuler la fusion » ne signifie plus restaurer aveuglément une sauvegarde : il faut répartir les apports ultérieurs et préserver chaque dossier organisationnel. L’annulation est une opération compensatoire révisée.

Un changement d’exploitant, un déménagement, une nouvelle enseigne ou une scission déclenche un examen d’identité distinct d’une simple correction de texte. Historiser les identifiants et périodes d’exploitation ; ne pas écraser un ancien SIRET au point de perdre la capacité de reconnaître un import retardé. Une ancienne référence ne doit pas réactiver automatiquement une offre fermée ni créer une nouvelle fiche parce que le mapping a disparu lors d’une suppression.

## 15. Synchronisation, événements et preuve des effets

Chaque application ou décision locale effective écrit, dans sa transaction, un événement minimal à distribuer. La diffusion vers les intégrateurs intervient après commit, avec reprise et déduplication des livraisons. Ne pas promettre une livraison réseau exactement une fois : l’intégrateur doit pouvoir traiter plusieurs fois le même identifiant d’événement sans effet supplémentaire.

Événements distincts : ajout au flux, modification commune pertinente, modification locale, retrait local, indisponibilité globale, ressource retirée, fusion/redirection et suppression. Une modification des tables enfants doit produire le changement pertinent ; `object.updated_at` seul ne suffit pas.

Le curseur de flux est opaque, lié à l’organisation, au domaine, aux filtres et à la représentation. Il avance dans un ordre total stable, sans perte sur égalité d’horodatage. Prévoir expiration et reprise par snapshot complet, ainsi qu’une frontière cohérente snapshot/événements pour ne perdre aucun changement pendant la resynchronisation.

**Point de concurrence supplémentaire : un numéro de séquence alloué dans la transaction métier ne prouve pas l’ordre des commits.** T1 peut réserver 100, T2 publier 101, puis T1 terminer : un consommateur ayant avancé à 101 perdrait 100. La conception recommandée sépare donc l’événement métier interne du curseur distribué :

1. La transaction métier écrit un événement d’outbox et la révision de la ressource.
2. Un projecteur prend les événements effectivement commités et encore non traités, avec reprise par état de chaque ligne ; il ne saute pas les événements tardifs à partir d’un simple maximum d’ID.
3. Dans une transaction sérialisée par flux, il actualise la représentation autorisée et attribue un numéro de diffusion via un compteur transactionnel protégé, puis marque le traitement. Le curseur externe ne porte que sur ce journal de diffusion.
4. Il rejette les versions métier dépassées et empêche qu’un ancien ajout réactive une fiche après son retrait. Les suppressions/restrictions de visibilité sont revérifiées à la lecture et à la délivrance, même si le projecteur est en retard.

Le snapshot de synchronisation doit correspondre à un état et à un numéro de diffusion cohérents. Pour une première version, une exportation matérialisée à durée limitée peut éviter une longue transaction ouverte pendant la pagination du client. Elle conserve ses droits d’accès propres et n’est pas une archive publiquement accessible ; expiration et changements d’autorisation peuvent obliger à la recommencer.

Lier ce snapshot aux révisions d’autorisation et de restriction pertinentes et contrôler l’accès à chaque page. Si elles changent, invalider le snapshot et demander une reprise ; ne pas maintenir un droit révoqué jusqu’à sa date d’expiration et ne pas modifier silencieusement le contenu de pages promises stables. Le résultat métier mémorisé d’une opération idempotente suit la même règle : réautoriser et minimiser la réponse actuelle, sans renvoyer aveuglément un ancien corps sensible.

Les événements et caches sont des données dérivées protégées. Un webhook ne transporte pas les preuves ou le diff privé ; préférer un signal minimal et une lecture réautorisée. Les destinations sont vérifiées, les livraisons signées, les reprises limitées et les destinations réseau dangereuses exclues. Révocation/retour de droits nécessitent une règle explicite de reprise, sans livrer une file privée accumulée après perte d’autorisation.

Les GET historiques doivent rester compatibles tant qu’ils ne compromettent pas la confidentialité. Ne jamais injecter de nouveaux champs locaux dans leur sérialiseur partagé. Si la classification révèle une exposition sensible existante, la compatibilité ne justifie pas de la conserver : traiter sa correction et la communication aux consommateurs comme une décision distincte. Le nouveau flux organisationnel peut commencer en JSON natif ; les exports spécialisés restent fermés à ce périmètre jusqu’à cohérence prouvée.

## 16. Preuves attendues et ordre de travail

### Scénarios qui doivent être démontrés

| Cas | Résultat attendu |
| --- | --- |
| A et B envoient simultanément la même offre avec références différentes | Une seule identité/fiche après résolution ; deux dossiers et correspondances, aucun écrasement de l’un par l’autre. |
| A fournit un SIRET, B seulement nom/adresse | Finalisations coordonnées ; rapprochement ou revue, pas deux admissions invisibles l’une à l’autre. |
| Hôtel et restaurant au même endroit avec même SIRET | Deux offres légitimes reliées après qualification ; pas de fusion automatique. |
| Deux homonymes dans la même région | Aucune fusion sur nom/type/région seuls. |
| Un objet existe seulement en brouillon chez B | A n’obtient ni ID caché ni contenu privé ; résolution interne sans seconde identité confirmée. |
| Une clé déclare le SIRET d’un concurrent | Pas de transfert de responsabilité, validation ou prise de lien prestataire. |
| B rattache l’acteur de A à une fiche qu’il contrôle | Association non autorisée refusée ; aucun accès indirect aux coordonnées ou documents de l’acteur. |
| Une création UI ou un import contourne l’API | Le protocole d’admission reste obligatoire ; sinon le test révèle que la garantie globale n’est pas satisfaite. |
| Même clé d’idempotence et payload différent | Conflit ; aucune seconde opération sous la même clé. |
| Une source réattribue un ancien numéro à une autre offre | Examen d’identité ; l’ancienne fiche et sa correspondance ne sont pas écrasées. |
| B adopte puis retire la fiche de A | Aucun changement du commun, des contacts accessibles ou du flux de A. |
| B change sa personnalisation privée | Réponses, événements et caches de C inchangés. |
| Une proposition contient l’ID d’une période d’une autre fiche | Refus sans écriture partielle ni divulgation de son contenu. |
| Un résumé innocent accompagne une modification de rôles | Champs rejetés ; le diff serveur ne peut pas masquer l’effet réel. |
| Une délégation est révoquée pendant l’approbation | Ordre transactionnel démontré ; aucune application après révocation effective. |
| Les horaires changent entre proposition et décision | Conflit conservant le travail, sans remplacement silencieux du calendrier. |
| L’auteur devient administrateur puis validateur | La règle de séparation porte sur l’auteur attesté historique, pas son seul rôle actuel. |
| Le réviseur modifie le payload avant d’approuver | Nouvelle version dont il est coauteur ; autre validation nécessaire. |
| La responsabilité change pendant la revue | Nouvelle autorisation sur les preuves partageables seulement ; les anciens droits de revue sont retirés. |
| C multiplie les recours pour bloquer A | Aucun gel automatique, quotas et instruction séparée. |
| A quitte le réseau | Accès/flux de A arrêtés ; commun et données de B préservés ; succession explicite. |
| A est supprimée/archivée | Aucune donnée locale promue en canonique par disparition de son identifiant d’organisation. |
| Fusion de deux fiches déjà diffusées/personnalisées par B | Identité unique, droits non additionnés, choix éditorial de B conservé ou demandé. |
| Fusion avec deux IDs différents de la même source | Les deux références restent résolvables grâce aux aliases, sans violation silencieuse ni perte de mapping. |
| Une fiche devient publique après un brouillon privé | Anciennes pièces, commentaires et versions privées toujours inaccessibles au lecteur public. |
| Retrait d’un document ou expiration de droits | Projections, événements et délivrance contrôlés ; limites des anciennes copies/URL publiques identifiées. |
| Suppression d’un objet partageant un fichier avec une autre fiche | L’usage restant légitime et autorisé garde son fichier ; aucune suppression physique aveugle. |
| Panne après commit avant réponse HTTP | La reprise retourne la même opération et ne crée aucune seconde fiche. |
| Panne après écriture avant envoi de notification | Événement persisté, livraison reprise et dédupliquée. |
| Réorganisation des événements ou dates identiques | Reprise de curseur sans perte ni résurrection d’une fiche retirée. |
| Une transaction d’événement ancienne commite après une autre | Aucun saut de cet événement à cause d’un maximum d’ID déjà livré ; curseur attribué sur le journal de diffusion cohérent. |
| Perte de droits pendant pagination d’un snapshot ou reprise idempotente | Accès réautorisé, snapshot invalidé si nécessaire ; aucun ancien corps privé rejoué. |

Les tests doivent couvrir interface, commande SQL accessible, worker et export, avec des identités peu privilégiées. Les vérifications d’isolement peuvent comparer deux jeux de données identiques du point de vue de B mais différents dans le dossier privé de A : B ne doit pas récupérer ces différences dans sa réponse, ses compteurs ou son historique. Les tests de concurrence doivent être réellement simultanés, pas deux appels successifs.

### Travaux préparatoires avant toute implémentation

1. **Charte de gouvernance et d’usage** : responsabilité initiale, recours, transfert, retrait global, indépendance des organisations, droits sur les apports et niveau réel de séparation auteur/validateur.
2. **Inventaire des écritures et des données** : toutes les créations/imports, changements d’identité, colonnes et projections publiques/privées, accès fichiers, historiques et workflows de suppression.
3. **Profilage en lecture seule autorisé** : doublons probables, identifiants absents/partagés, responsabilités ambiguës, publishers historiques et couverture des validateurs. Ne pas migrer le premier publisher trouvé en propriétaire sans examen.
4. **Jeu d’identité annoté et contrat d’admission** : cas certains/incertains/distincts, traitement sans identifiant, erreurs explicables, seuils calibrés et revue des faux rapprochements.
5. **Spécification des transactions et droits** : contraintes, verrou d’admission, modules et dépendances, contexte technique, révisions de gouvernance, révocations, audit et événements.
6. **Reprise progressive** : correspondances et responsables proposés en mode observation, examen des ambiguïtés, conservation des droits réels des coéditeurs historiques au moyen de délégations ; aucun octroi/retrait massif implicite.
7. **Pilote isolé A/B/C** : création concurrente, adoption, proposition, transfert et fusion ; injection de pannes et tests d’absence de fuite avant activation d’écriture pour les partenaires.

Les indicateurs doivent distinguer doublons empêchés, rapprochements rejetés à tort, doublons détectés après admission, dossiers en attente, délais de revue, conflits, interventions exceptionnelles et organisations sans validateur. Aucun taux de similarité ou délai maximal n’est fixé sans corpus et capacité opérationnelle connus.

**Critère de préparation suffisant :** pouvoir expliquer pour chaque scénario quelle ligne de données change, quelle autorité l’autorise, quelle transaction protège la décision, ce que voient A/B/C, ce qui reste dans l’historique et comment réparer une erreur. Une liste d’endpoints seule ne satisfait pas ce critère.

## 17. Sources vérifiées et limites de l’audit

- [Avertissement de doublon à la création](../../bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx:358) ; [normalisation et rapprochement](../../bertel-tourism-ui/src/features/object-editor/create/duplicate-hint.ts:1) ; [RPC de création](<../../Base de donnée DLL et API/migration_facet_applicability.sql:251>).
- [Unicités des références externes](../../dbdoc/public.object_external_id.md:25) ; [nettoyage SIRET](<../../Base de donnée DLL et API/migration_legal_siret_canonical.sql:1>) ; [fonction de déduplication référencée dans le graphe](../../db-graph-out/FUNCTIONS.md:2654).
- [Rapprochement automatique de l’import historique](<../../Base de donnée DLL et API/old_data_supabase_import_20260501/20_promotion.sql:151>) ; [écriture des correspondances externes](<../../Base de donnée DLL et API/migration_object_external_id_writes.sql:27>).
- [Droits de publisher](<../../Base de donnée DLL et API/rls_policies.sql:3082>) ; [contacts acteurs dans le périmètre publisher](<../../Base de donnée DLL et API/migration_actor_contacts_org_gate.sql:85>) ; [statut global](<../../Base de donnée DLL et API/migration_object_status_lifecycle.sql:44>).
- [Rattachement d’acteurs dans l’éditeur interne](<../../Base de donnée DLL et API/migration_actor_links_editor.sql:269>) ; [projection de leurs canaux](<../../Base de donnée DLL et API/api_views_functions.sql:4079>).
- [Modération et application](<../../Base de donnée DLL et API/migration_actor_portal.sql:1038>) ; [avant/après fourni par les métadonnées](<../../Base de donnée DLL et API/migration_actor_portal.sql:1320>) ; [relations d’organisation modifiables par le writer interne](<../../Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:1030>).
- [Projection des identifiants externes](<../../Base de donnée DLL et API/api_views_functions.sql:3413>) ; [provenance](<../../Base de donnée DLL et API/api_views_functions.sql:3971>) ; [adhésions](<../../Base de donnée DLL et API/api_views_functions.sql:4015>) ; [historiques internes](<../../Base de donnée DLL et API/migration_object_version_read_restore.sql:56>).
- [Référence d’organisation des médias](<../../Base de donnée DLL et API/schema_unified.sql:1292>) ; [référence d’organisation des descriptions](<../../Base de donnée DLL et API/schema_unified.sql:1408>) ; [droits et visibilité des médias](../../dbdoc/public.media.md:20).
- [Bucket média](<../../Base de donnée DLL et API/media_bucket.sql:30>) ; [bucket documents](<../../Base de donnée DLL et API/documents_bucket.sql:26>) ; [limites de la synchronisation actuelle](<../../Base de donnée DLL et API/migration_partner_tombstone_feed.sql:24>).
- [Suppression ORG refusée et collecte des fichiers lors d’une suppression](<../../Base de donnée DLL et API/migration_object_hard_delete.sql:79>).

Le corps effectif de certaines fonctions d’import/staging reste à examiner ; leur nom dans le graphe ne certifie pas leurs garanties. La classification exacte de confidentialité des champs actuels, les droits d’usage sur les apports, le catalogue déployé et le volume réel de doublons restent des points d’audit à résoudre avant développement. Les propositions transactionnelles devront être éprouvées sur la version PostgreSQL effectivement utilisée et tous les chemins d’écriture accessibles.
