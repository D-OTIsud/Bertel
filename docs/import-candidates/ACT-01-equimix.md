# Equimix — ACT (Prestation / activité commerciale encadrée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ACT
- name : Equimix
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 : `SELECT … FROM public.object WHERE name ILIKE '%equimix%' / '%equi mix%' / '%equi-mix%'` ⇒ 0 ligne). N'apparaît pas non plus dans la liste « déjà proposé ». Les écuries du secteur déjà en base (Ecurie Notre Dame de la Paix, Ecuries du Volcan, Ferme équestre du Sud Sauvage, Les Poneys de Grand Coude, Haras des Cœurs, Alti Merens) sont des structures distinctes (autres communes / autres SIREN) — pas de fusion recommandée.

## Identité
- Catégorie / sous-type proposé : activité de pleine nature encadrée — équitation / loisirs équestres (association loi 1901, secteur ESS). Sous-type ACT « prestation commerciale encadrée » ; archétype ASC (object_act) côté éditeur.
- Chapo : Association équestre de l'Entre-Deux dédiée aux activités d'équitation et de loisirs de plein air, au pied du massif du Dimitile.

## Description
Equimix est une association loi 1901 immatriculée le 16 juillet 2015 et toujours active, dont le siège est au 4 impasse des Acacias à l'Entre-Deux (source officielle annuaire des entreprises / société.com). Son objet social déclaré au répertoire des associations (net1901) relève des « clubs de loisirs, relations » et des « sports, activités de plein air (équitation) », et son code d'activité principale est le 93.19Z (autres activités liées au sport / autres activités récréatives et de loisir). Plusieurs annuaires la décrivent comme un centre / une association d'équitation située à l'Entre-Deux. La structure relève de l'économie sociale et solidaire et n'est pas déclarée employeur. À noter : Equimix n'apparaît pas (au 2026-06-26) dans la liste des clubs affiliés du Comité régional d'équitation de La Réunion (CRE Réunion), ni sur les sites OTI Sud (sudreuniontourisme.fr) ou IRT (reunion.fr) — son périmètre exact d'activité (cours, balades, encadrement, public accueilli) reste à confirmer auprès de la structure.

## Adresse & localisation (object_location)
- Adresse : 4 impasse des Acacias
- Code postal / ville : 97414 Entre-Deux (code postal 97414 = code INSEE/commune 97403 ; les deux systèmes coexistent, pas de contradiction — périmètre OTI Sud confirmé : 148 objets live portent « Entre-Deux / 97414 »)
- GPS (WGS84) : -21.238839, 55.480205 — source : géocodage BAN api-adresse.data.gouv.fr (label « 4 Impasse des Acacias 97414 Entre-Deux », score 0.955, citycode 97403). Confirmé indépendamment par OpenStreetMap/Nominatim (Impasse des Acacias, Entre-Deux : lat -21.2387915, lon 55.4801291).
- Altitude : Non trouvé — à compléter (centre-bourg de l'Entre-Deux ≈ 350–500 m ; valeur précise au point de RDV à relever)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (non affiché sur societe.com ni dans les annuaires consultés)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (aucun site officiel indexé)
- Réseaux sociaux : Non trouvé — à compléter (aucune page Facebook/Instagram « Equimix » identifiée de façon fiable)

## Horaires (object_opening)
Non trouvé — à compléter (aucune information d'ouverture / saisonnalité publiée ; à recueillir auprès de la structure)

## Tarifs (object_price)
Non trouvé — à compléter (aucun tarif publié ; association équestre, prestations probablement payantes — à confirmer)

## Données spécifiques ACT (object_act)
- Activités proposées : équitation / loisirs équestres de plein air (objet social déclaré net1901). Détail (cours, balades à cheval/poney, randonnée équestre, stages, accueil scolaire) : Non trouvé — à compléter.
- Publics visés : Non trouvé — à compléter (l'établissement est référencé dans une rubrique « sortie enfant » de l'Entre-Deux sur PagesJaunes, suggérant un accueil enfants/familles — à confirmer).
- Encadrement / diplômes : Non trouvé — à compléter (non affiliée CRE/FFE au 2026-06-26 ; statut d'encadrement à vérifier).
- Niveau / prérequis : Non trouvé — à compléter.
- Réservation : Non trouvé — à compléter.
- Rattachements recommandés à l'import (modèle ACT) :
  - object_org_link [publisher] → OTI du Sud
  - actor_object_role [operator] → ACTEUR « Equimix » (association exploitante) — à créer
  - object_location → point de RDV (coordonnées ci-dessus, à affiner si le départ diffère du siège)
  - object_relation [based_at_site] → PNA/massif du Dimitile : optionnel, à confirmer

## Équipements & services (object_amenity)
Non trouvé — à compléter (parking, sanitaires, accès, point d'accueil : aucune donnée publiée)

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter
- Langues : Non trouvé — à compléter (français présumé ; à confirmer)
- Accessibilité PMR : Non trouvé — à compléter

## Labels & classements (object_classification)
Aucun trouvé (pas d'affiliation CRE Réunion / FFE constatée au 2026-06-26 ; aucun label tourisme revendiqué identifié). À vérifier auprès de la structure.

## Médias suggérés
Non trouvé — à compléter (aucune photo officielle identifiée). NE PAS télécharger d'images sans autorisation du titulaire.

## Données manquantes / à vérifier
- Téléphone, email, site web, réseaux sociaux (tous absents des sources publiques).
- Nature précise et étendue des prestations (cours / balades / randonnée / stages / accueil de groupes).
- Public accueilli, encadrement et qualification, statut d'affiliation fédérale.
- Horaires, saisonnalité, tarifs, conditions de réservation.
- Point de RDV réel (siège associatif ≠ lieu d'activité possible) et altitude.
- Équipements, accessibilité PMR, moyens de paiement, langues.
- Identité du/de la responsable (dirigeant non publié dans les données ouvertes).
- Activité réelle en 2026 : structure administrativement ACTIVE mais empreinte web quasi nulle ⇒ confirmer qu'elle opère encore et accueille du public touristique avant publication.

## Sources
- Etablissement EQUIMIX ENTRE-DEUX (97414) — Societe.com (SIREN 812 880 284 / SIRET 81288028400011 ; APE 9319Z ; association loi 1901 ; création 16/07/2015 ; statut actif) — https://www.societe.com/etablissement/equimix-81288028400011.html — consulté le 2026-06-26
- Annuaire des entreprises / recherche-entreprises.api.gouv.fr (EQUIMIX, SIREN 812880284, Entre-Deux, NAF 93.19Z « autres activités récréatives et de loisir », nature 9220 association, statut Actif, ESS non-employeur) — https://recherche-entreprises.api.gouv.fr/search?q=EQUIMIX&code_commune=97403 — consulté le 2026-06-26
- Annuaire des associations net1901 — La Réunion / thème équitation (EQUIMIX, objet : « clubs de loisirs, relations » + « sports, activités de plein air — équitation », Entre-Deux, création 16/07/2015) — https://www.net1901.org/annuaire-association/departement/La-Reunion,974/theme/equitation-equitation-hippisme-courses-camarguaise-landaise,101.html — consulté le 2026-06-26
- Géocodage Base Adresse Nationale — api-adresse.data.gouv.fr (4 Impasse des Acacias 97414 Entre-Deux, score 0.955, citycode 97403, lon 55.480205 / lat -21.238839) — https://api-adresse.data.gouv.fr/search/?q=4+impasse+des+Acacias+Entre-Deux&citycode=97403 — consulté le 2026-06-26
- OpenStreetMap / Nominatim (Impasse des Acacias, Entre-Deux, La Réunion, 97414 ; lat -21.2387915 / lon 55.4801291) — https://nominatim.openstreetmap.org/search?q=Impasse+des+Acacias,+Entre-Deux,+R%C3%A9union — consulté le 2026-06-26
- PagesJaunes — Entre-Deux (974), rubrique « sortie enfant » (Equimix référencé à l'Entre-Deux) — https://www.pagesjaunes.fr/annuaire/entre-deux-974/sortie-enfant-mnemo — consulté le 2026-06-26
