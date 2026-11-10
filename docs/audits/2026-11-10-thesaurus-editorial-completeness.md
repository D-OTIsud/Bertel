# Complétude éditoriale du thésaurus, 10 novembre 2026

Le périmètre comprend **1 477 concepts dans 78 domaines** : 1 439 actifs et 38
dépréciés. Les 115 concepts absents de l'instantané courant sont inclus. Le
[registre des décisions](../../tools/thesaurus-content/lots/2026-11-10-editorial-review/review-decisions.json)
donne une justification par identité ; les
[corrections par domaine](../../tools/thesaurus-content/lots/2026-11-10-editorial-review/README.md)
conservent les valeurs précédentes exactes pour détecter les conflits.

## Constats de départ et résultat préparé

| Contrôle | Départ | Résultat du lot hors connexion |
|---|---:|---:|
| Définitions françaises absentes | 27 | 0 |
| Définitions anglaises absentes | 102 | 0 |
| Définitions espagnoles absentes | 102 | 0 |
| Définitions allemandes absentes | 152 | 0 |
| Décisions de revue | 0 dans ce dossier | 1 477 identités uniques |
| Domaines à définition obligatoire | 0 sur la cible auditée | Politique préparée pour les 78 |
| Erreurs structurelles du lot | Sans objet | 0 |
| Avertissements de synonymes du lot | Sans objet | 0 |

Les **1 449 propositions** comprennent 1 177 documents de définition corrigés,
158 noms français clarifiés, 128 documents de synonymes/recherches corrigés et
1 284 documents de notes ajustés. Ces groupes se recouvrent. Un document dont
la définition était déjà adéquate peut recevoir seulement une correction de note.

Les noms de domaines sont français, courts et liés à l'usage : « Hôtellerie »,
« Activités sportives et culturelles », « Services publics », « Villes et villages ».
Les clés techniques restent stables. L'audit des noms et de leurs consommateurs
est dans la [matrice de contexte](2026-11-10-thesaurus-domain-names.md).

## Ce que la revue couvre

Pour chaque concept : libellés préférés, définitions, traductions, synonymes et
termes cachés, notes et provenance, relations, parent et contexte, correspondances,
cycle de vie et recherches héritées. Les quatre langues FR/EN/ES/DE sont complètes,
sans remplacer une définition par le nom ni utiliser sa longueur comme preuve.

Exemples de corrections : l'écran de réunion est distingué du projecteur ; la
plongée d'itinéraire décrit une pratique plutôt qu'un site ; linge de lit et linge
de maison ne sont pas confondus ; les achats locaux sont distingués des aliments
locaux ; les lave-linge et lave-vaisselle ont des noms distincts. Les rubriques
tarifaires différencient public bénéficiaire, nature de ligne et unité de facturation.

Les déclarations des professionnels restent déclaratives : LED sur l'ensemble de
l'éclairage concerné, zéro pesticide, consommations avec leurs unités et seuils
existants, offre alimentaire annoncée. Les tarifs handicap couvrent plusieurs formes
de handicap. Le patrimoine n'est pas limité à l'UNESCO. « Produits locaux » ne devient
pas « produits indigènes ». Les décisions déjà validées ne sont pas remises en attente.

## Relations et correspondances

L'export comprend **761 rattachements parentaux**, **475 paires sémantiques**
associatives représentées dans les deux sens (950 liens dans les documents), ainsi que
**44 correspondances externes**. Les cibles et les contextes ont été relus. Le lot
ne change aucun lien ni parent et n'invente aucune correspondance pour remplir
une case. Des jours, des langues ou des statuts indépendants n'exigent pas une
association artificielle. Les homonymes restent distingués par domaine et contexte.

Une ancienne note de génération renvoyant à son propre concept est une trace
d'historique, pas une autorité externe. Son texte et son URL sont conservés.
Les sources primaires réellement consultées sont identifiées séparément dans les
notes concernées ; leur consultation ne devient pas une certification d'établissement.

## Plan priorisé et livraison

1. **Règles et garde-fous** : rendre les définitions obligatoires pour tous les domaines,
   protéger les langues et refuser les textes invisibles ou provisoires. La phase
   renforcée exige les quatre langues après l'enrichissement complet.
2. **Contenu** : importer les corrections relues en brouillons, valider, examiner
   l'aperçu et publier par le circuit authentifié. Les valeurs historiques gardent
   leur état ; les listes internes gardent leur visibilité.
3. **Fiabilité de l'entretien** : terminer le contrat des recherches héritées
   (enregistrement réel à la publication), tester les conflits, le champ omis et
   l'effacement explicite. Le noyau d'autorisation n'est pas contourné.
4. **Contrôle après livraison** : relire la génération servie, les politiques des
   78 domaines, les 1 477 documents et les tâches d'actualisation. Le runbook sépare
   ces preuves de la réussite des tests locaux et de CI.
5. **Entretien continu** : organiser une relecture humaine des changements de sens
   et des traductions exposées, puis enrichir à partir des recherches réellement
   infructueuses et des besoins des fiches. Conserver la provenance des décisions.

La publication est découpée en lots mesurés : la session HTTP authentifiée de la
cible a un timeout SQL de huit secondes. Un aperçu global de 1 449 corrections
représenterait environ 8,48 Mo et 28 000 éléments de comparaison. Les lots réduits
gardent les mêmes contrôles de version et d'empreinte ; une limite de transport
ne justifie pas un accès direct aux sources. Publier ensemble les définitions
françaises manquantes d'un domaine lors de sa première activation.

## Résultat par domaine

« Corrections » compte les propositions éditoriales, y compris les seules notes.
Chaque ligne couvre aussi les concepts qui n'ont nécessité aucune modification.

| Domaine | Concepts relus | Corrections | Langues finales |
|---|---:|---:|---|
| Familles d’hébergement | 6 | 6 | FR, EN, ES, DE |
| Types d’hébergement historiques | 10 | 10 | FR, EN, ES, DE |
| Types d’unité d’hébergement | 22 | 22 | FR, EN, ES, DE |
| Types d’activité | 10 | 10 | FR, EN, ES, DE |
| Allergènes | 14 | 14 | FR, EN, ES, DE |
| Équipements et services | 167 | 166 | FR, EN, ES, DE |
| Familles d’équipements et services | 22 | 22 | FR, EN, ES, DE |
| Types d’assistance | 10 | 10 | FR, EN, ES, DE |
| Types de lit | 10 | 10 | FR, EN, ES, DE |
| Statuts de réservation | 10 | 10 | FR, EN, ES, DE |
| Labels et classements | 39 | 35 | FR, EN, ES, DE |
| Valeurs des labels et classements | 125 | 120 | FR, EN, ES, DE |
| Types de clientèle | 10 | 10 | FR, EN, ES, DE |
| Communes | 24 | 24 | FR, EN, ES, DE |
| Moyens de contact | 15 | 15 | FR, EN, ES, DE |
| Sentiment relationnel | 6 | 6 | FR, EN, ES, DE |
| Types de cuisine | 43 | 43 | FR, EN, ES, DE |
| Sujets de demande | 20 | 20 | FR, EN, ES, DE |
| Types de destination | 10 | 10 | FR, EN, ES, DE |
| Régimes alimentaires | 12 | 12 | FR, EN, ES, DE |
| Canaux de distribution | 8 | 8 | FR, EN, ES, DE |
| Types de document | 3 | 3 | FR, EN, ES, DE |
| Cadre et environnement | 30 | 30 | FR, EN, ES, DE |
| Types d’événement | 10 | 10 | FR, EN, ES, DE |
| Types de retour | 10 | 10 | FR, EN, ES, DE |
| Types d’assurance | 10 | 10 | FR, EN, ES, DE |
| Difficulté des itinéraires | 5 | 5 | FR, EN, ES, DE |
| Statut des sentiers | 7 | 7 | FR, EN, ES, DE |
| Pratiques d’itinéraire | 16 | 16 | FR, EN, ES, DE |
| Étapes d’itinéraire | 8 | 8 | FR, EN, ES, DE |
| Langues | 20 | 20 | FR, EN, ES, DE |
| Maîtrise des langues | 7 | 7 | FR, EN, ES, DE |
| Mots-clés des médias | 23 | 23 | FR, EN, ES, DE |
| Types de médias | 11 | 11 | FR, EN, ES, DE |
| Équipements de réunion | 11 | 11 | FR, EN, ES, DE |
| Campagnes d’adhésion | 3 | 3 | FR, EN, ES, DE |
| Paliers d’adhésion | 4 | 4 | FR, EN, ES, DE |
| Catégories de menu | 12 | 12 | FR, EN, ES, DE |
| Ambiances touristiques | 10 | 10 | FR, EN, ES, DE |
| Saisons d’ouverture | 3 | 3 | FR, EN, ES, DE |
| Modes d’ouverture | 5 | 5 | FR, EN, ES, DE |
| Types de forfait | 10 | 10 | FR, EN, ES, DE |
| Types de partenariat | 10 | 10 | FR, EN, ES, DE |
| Moyens de paiement | 15 | 15 | FR, EN, ES, DE |
| Publics tarifaires | 15 | 15 | FR, EN, ES, DE |
| Types de tarif | 8 | 8 | FR, EN, ES, DE |
| Unités tarifaires | 20 | 20 | FR, EN, ES, DE |
| Types de promotion | 14 | 14 | FR, EN, ES, DE |
| Types de chambre | 10 | 10 | FR, EN, ES, DE |
| Saisons et périodes | 10 | 10 | FR, EN, ES, DE |
| Types de service | 10 | 10 | FR, EN, ES, DE |
| Réseaux sociaux | 11 | 11 | FR, EN, ES, DE |
| Actions de durabilité | 239 | 239 | FR, EN, ES, DE |
| Catégories d’actions de durabilité | 9 | 9 | FR, EN, ES, DE |
| Activités encadrées | 24 | 21 | FR, EN, ES, DE |
| Activités sportives et culturelles | 7 | 7 | FR, EN, ES, DE |
| Campings | 3 | 3 | FR, EN, ES, DE |
| Commerces | 13 | 11 | FR, EN, ES, DE |
| Fêtes et manifestations | 12 | 9 | FR, EN, ES, DE |
| Hébergements locatifs et collectifs | 15 | 15 | FR, EN, ES, DE |
| Hôtellerie | 11 | 11 | FR, EN, ES, DE |
| Hébergements de plein air | 9 | 9 | FR, EN, ES, DE |
| Itinéraires | 7 | 7 | FR, EN, ES, DE |
| Loisirs et découvertes | 37 | 35 | FR, EN, ES, DE |
| Organisations | 8 | 8 | FR, EN, ES, DE |
| Patrimoine culturel | 7 | 7 | FR, EN, ES, DE |
| Sites naturels | 14 | 14 | FR, EN, ES, DE |
| Producteurs | 11 | 7 | FR, EN, ES, DE |
| Prestataires de services | 17 | 14 | FR, EN, ES, DE |
| Restauration | 30 | 29 | FR, EN, ES, DE |
| Résidences et villages de vacances | 4 | 4 | FR, EN, ES, DE |
| Services publics | 15 | 15 | FR, EN, ES, DE |
| Villes et villages | 5 | 5 | FR, EN, ES, DE |
| Types de tourisme | 10 | 10 | FR, EN, ES, DE |
| Relations aux sentiers | 6 | 6 | FR, EN, ES, DE |
| Types de transport | 10 | 10 | FR, EN, ES, DE |
| Types de vue | 13 | 13 | FR, EN, ES, DE |
| Jours de la semaine | 7 | 7 | FR, EN, ES, DE |

## Preuves et limites

Export intégral stable de l'espace éditorial associé à la publication 8 :
SHA-256 af2a53f11287adcb1838a648a6ea9564069bf7f951aa8f9d42190f032b18114e. Les requêtes d'export sont en
lecture seule, sans comptes, fiches nominatives ni secrets dans les livrables.
Les 39 tableaux de recherches héritées non vides ont également été relus et sont
préservés par les corrections de contenu.

La revue a été réalisée par des agents Codex, avec des relectures croisées et des
sources primaires pour certains points précis. Les contrôles automatiques attestent
la couverture et la cohérence structurelle ; ils ne garantissent pas à eux seuls
la justesse d'une définition ni une relecture humaine ou native des traductions.
Ce dossier décrit le lot préparé. L'application en production et son numéro de
publication exigent un relevé de livraison distinct.

## Qualification de la garde des relations publiques

Le 10 novembre, une publication authentifiée de 27 concepts privés a atteint la
limite de 8 secondes dans la garde qui vérifie les cibles sémantiques publiques.
Cette garde relit le snapshot public entier, même lorsque les corrections portent
sur des domaines privés. Son prédicat `dst.concept_id::text = target.value` ne pouvait
utiliser que la composante `release_id` des index existants.

La migration native `20261110090528_thesaurus_public_target_lookup_index.sql` ajoute
un index non unique sur `(release_id, (concept_id::text))`, partiel `WHERE is_public`,
avec `INCLUDE (concept_id)`. Elle ne change ni le noyau `activate`, ni les droits,
ni la limite de temps. L'empreinte du corps d'activation reste
`985839358c6e0d68eb7db280f42bb6ed`.

Le [reçu EXPLAIN](2026-11-10-thesaurus-public-target-lookup.explain.json) porte sur le
SELECT exact de la garde, appliqué en lecture seule à la publication 8 : 1 362 concepts
publics et 3 422 références. Après index, il s'exécute en **37,609 ms** (planification :
1,547 ms), avec 3 422 recherches `Index Only Scan` utilisant les deux composantes et
**zéro accès au tas**. Le plan précédent utilisait un `Hash Right Anti` qui rescannait
les cibles par concept ; aucune durée exacte de ce plan précédent n'est revendiquée.

Après cette correction, la session réelle a publié les 27 concepts et actualisé
517 fiches dans la publication 10. Cette observation valide ce premier lot ; les
lots suivants doivent encore être vérifiés par leur publication et leur reçu propres.
