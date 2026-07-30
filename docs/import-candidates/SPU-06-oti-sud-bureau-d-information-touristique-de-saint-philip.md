# OTI Sud — Bureau d'Information Touristique de Saint-Philippe (Domaine des Laves) — SPU (Service public / accueil touristique)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : OTI Sud — Bureau d'Information Touristique de Saint-Philippe (Domaine des Laves)
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 — requêtes sur `object.name` couvrant « tourist », « information », « bureau d'information », « accueil », « BIT », « office tourisme », « domaine des laves », « baril » : 0 bureau d'accueil / office de tourisme en base ; les 10 résultats « baril » sont des hébergements/restaurants/loisirs distincts, sans homologue). **Note de cohérence import** : l'OTI du Sud exploite 4 bureaux (Le Tampon/Plaine des Cafres, Entre-Deux, Saint-Joseph, Saint-Philippe) — si les 3 autres bureaux sont importés ultérieurement, traiter cette série comme 4 objets SPU distincts (une fiche par bureau), tous publiés par l'ORG OTI du Sud. Ne pas confondre l'**ORG** OTI du Sud (structure éditrice) avec ce **point d'accueil physique** (objet SPU localisé).

## Identité
- Catégorie / sous-type proposé : Accueil & information touristique — Bureau d'Information Touristique (BIT) de l'office de tourisme intercommunal (OTI du Sud / CASUD). Antenne d'accueil du public sur la commune de Saint-Philippe, secteur touristique « Domaine des Laves ».
- Chapo : Le bureau d'information touristique de l'OTI du Sud à Saint-Philippe accueille et conseille les visiteurs du secteur « Domaine des Laves », porte d'entrée du Sud Sauvage et de ses coulées de lave.

## Description
Le Bureau d'Information Touristique de Saint-Philippe est l'antenne d'accueil de l'OTI du Sud (office de tourisme intercommunal de la CASUD) sur la commune de Saint-Philippe. Ses conseillers en séjour renseignent les visiteurs sur les activités, hébergements, restaurants, sentiers et événements du secteur « Domaine des Laves » et plus largement du Sud Sauvage (de Saint-Joseph à Sainte-Rose). L'OTI du Sud couvre quatre communes : Le Tampon, L'Entre-Deux, Saint-Joseph et Saint-Philippe. Le bureau est joignable au 0262 97 75 84 / 0692 10 15 79 et ouvert du lundi au samedi de 9h à 17h en continu (source CASUD). Sa localisation est attestée sous deux adresses — la Piscine du Baril (Le Baril) et le 41 A rue Leconte Delisle près de la mairie sur la RN2 — ce qui correspond probablement à une relocalisation ; l'adresse réellement en service est à confirmer auprès de l'OTI avant publication.

## Adresse & localisation (object_location)
- Adresse : Deux adresses attestées (relocalisation probable, à trancher) :
  - (a) **Piscine du Baril, Le Baril** — source CASUD / IRT reunion.fr / sudreuniontourisme.fr / Tripadvisor.
  - (b) **41 A, rue Leconte Delisle**, près de la mairie, en bordure de RN2 — source OTI Sud / résultats de recherche reunion.fr.
- Code postal / ville : 97442 Saint-Philippe
- GPS (WGS84) :
  - Adresse (b) géocodée : **-21.35933, 55.76637** — source : géocodage BAN api-adresse.data.gouv.fr, requête « 41 A rue Leconte Delisle » filtrée citycode=97417 ; label retourné « 41a Rue Leconte de Lisle 97442 Saint-Philippe » ; **score 0.755** ; postcode 97442 ; city Saint-Philippe. (Adresse au niveau du numéro — la plus fiable des deux.)
  - Adresse (a) Piscine du Baril : pas d'adresse numérotée → géocodage BAN faible (meilleur résultat « Rue du Port du Baril 97442 Saint-Philippe » -21.369974, 55.726395, **score 0.536 seulement**) ⇒ NON retenu comme GPS de référence. Coordonnées exactes de la Piscine du Baril à relever sur le terrain / OSM si l'adresse (a) est confirmée.
  - **GPS retenu sous réserve : -21.35933, 55.76637** (adresse b). À reconfirmer une fois l'adresse en service tranchée avec l'OTI.
- Altitude : Non trouvé — à compléter (Le Baril / centre-bourg de Saint-Philippe ≈ niveau de la RN2 littorale, à mesurer).

## Contacts (object_contact)
- Téléphone : 0262 97 75 84 (fixe) — source CASUD ; 0692 10 15 79 (mobile) — source CASUD.
- Email : contact@otisud.com — source CASUD (adresse générique de l'OTI du Sud ; email propre au bureau de Saint-Philippe : Non trouvé — à compléter).
- Site web : https://www.sudreuniontourisme.fr (site officiel de l'OTI du Sud) ; fiche du bureau : https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/accueil-et-information/oti-sud-bureau-d-information-touristique-de-saint-philippe-eta_2755.html
- Réseaux sociaux : Facebook OTI Sud — https://www.facebook.com/Otisud/ (page de l'ORG, non spécifique au bureau). Compte Instagram/autre propre au bureau : Non trouvé — à compléter.

## Horaires (object_opening)
- Lundi au samedi : 9h00–17h00 (ouvert en continu) — source CASUD.
- Dimanche : fermé (déduit ; Tripadvisor liste lun.–sam. 9h–17h, dimanche fermé).
- Jours fériés / fermetures saisonnières : Non trouvé — à compléter.
- Note : Tripadvisor affiche lun.–sam. 9h–17h, cohérent avec CASUD. Horaires à reconfirmer auprès de l'OTI (susceptibles de varier avec la relocalisation).

## Tarifs (object_price)
- Accueil et information : gratuit (service public d'accueil touristique). Certaines prestations de l'OTI (billetterie, réservations, boutique) peuvent être payantes — détail Non trouvé — à compléter.

## Données spécifiques SPU
- Pas de table facette type-spécifique pour SPU (PCU/PNA/VIL/SPU → classifications/labels génériques uniquement).
- Nature : point d'accueil et d'information du public, exploité par l'office de tourisme intercommunal OTI du Sud (CASUD, EPCI).
- Structure exploitante (ORG) : OTI du Sud — siège 168 rue Marius et Ary Leblond, 97430 Le Tampon ; communes couvertes : Le Tampon, L'Entre-Deux, Saint-Joseph, Saint-Philippe (source CASUD). Entreprise immatriculée « OTI DU SUD » (SIREN 882 699 556, source Pappers) — SIRET de l'établissement de Saint-Philippe : Non trouvé — à compléter.
- Secteur touristique de rattachement : « Domaine des Laves » (libellé OTI Sud pour la commune de Saint-Philippe).

## Équipements & services (object_amenity)
- Services : conseil en séjour, documentation touristique, information sur activités/hébergements/restauration/sentiers/événements du Sud Sauvage (source OTI Sud / CASUD).
- Billetterie / réservation : possible (l'OTI Sud propose information, conseils et réservations) — détail au bureau de Saint-Philippe Non trouvé — à compléter.
- Parking / sanitaires / Wi-Fi / boutique / espace documentation : Non trouvé — à compléter (à relever sur place ; un point d'eau et des sanitaires existent à proximité de la Piscine du Baril mais ne sont pas attestés comme équipements du bureau).

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (accueil gratuit ; modalités pour billetterie/boutique inconnues).
- Langues : Français et Anglais (source sudreuniontourisme.fr / reunion.fr). Autres langues : Non trouvé — à compléter.
- Accessibilité PMR : Non trouvé — à compléter (dépend de l'adresse en service ; à vérifier auprès de l'OTI).

## Labels & classements (object_classification)
- Aucun trouvé de façon attestée pour ce bureau précis. L'OTI du Sud met en avant des établissements labellisés « Qualité Tourisme » sur son territoire, mais aucune source consultée n'atteste que le **bureau d'accueil de Saint-Philippe** porte lui-même la marque « Qualité Tourisme » ni un classement office de tourisme (catégorie I/II/III). À vérifier auprès de l'OTI avant d'apposer un LBL_*. (Mapping potentiel si confirmé : LBL_QUALITE_TOURISME.)

## Médias suggérés
- Photo de la fiche bureau sur sudreuniontourisme.fr (https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/accueil-et-information/oti-sud-bureau-d-information-touristique-de-saint-philippe-eta_2755.html) et sur en.reunion.fr (https://en.reunion.fr/offers/oti-sud-bureau-d-information-touristique-de-saint-philippe-saint-philippe-en-559916/). Photo de devanture sur la page Facebook OTI Sud (https://www.facebook.com/Otisud/).
- **NE PAS télécharger sans autorisation** (droits OTI Sud / IRT / contributeurs — obtenir l'accord de l'OTI, propriétaire de la fiche, avant tout usage).

## Données manquantes / à vérifier
- Adresse réellement en service (Piscine du Baril vs 41 A rue Leconte Delisle) — **arbitrage d'import requis auprès de l'OTI** (relocalisation probable).
- GPS définitif (dépend de l'adresse retenue) ; altitude.
- Email et réseaux sociaux propres au bureau (vs génériques de l'ORG).
- Accessibilité PMR ; équipements (parking, sanitaires, Wi-Fi, boutique, point documentation).
- Moyens de paiement ; détail des prestations payantes éventuelles (billetterie/réservation/boutique).
- Confirmation d'un éventuel label/classement (Qualité Tourisme, catégorie office de tourisme).
- Fermetures saisonnières / jours fériés ; horaires post-relocalisation.
- SIRET de l'établissement de Saint-Philippe.

## Sources
- OTI Sud — Bureau d'Information Touristique de Saint-Philippe (fiche officielle, langues FR/EN, secteur Domaine des Laves) — https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/accueil-et-information/oti-sud-bureau-d-information-touristique-de-saint-philippe-eta_2755.html — consulté le 2026-06-26
- CASUD — Les offices de tourisme (adresse Piscine du Baril, tél. 0262 97 75 84 / 0692 10 15 79, email contact@otisud.com, horaires lun.–sam. 9h–17h en continu, 4 communes, siège Le Tampon) — https://www.casud.re/au-quotidien/decouvrir-le-territoire/les-offices-de-tourisme — consulté le 2026-06-26
- IRT / Île de La Réunion Tourisme — OTI Sud, Bureau d'Information Touristique de Saint-Philippe — https://en.reunion.fr/offers/oti-sud-bureau-d-information-touristique-de-saint-philippe-saint-philippe-en-559916/ — consulté le 2026-06-26
- Tripadvisor — Oti SUD, Bureau d'information de Saint-Philippe (Visitor Centers ; adresse Piscine du Baril ; horaires lun.–sam. 9h–17h, dim. fermé) — https://www.tripadvisor.com/Attraction_Review-g2140646-d23733675-Reviews-Oti_SUD_Bureau_d_information_de_Saint_Philippe-Saint_Philippe_Arrondissement_of.html — consulté le 2026-06-26
- Pappers — Société OTI DU SUD (SIREN 882 699 556) — https://www.pappers.fr/entreprise/oti-du-sud-882699556 — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr) — « 41 A rue Leconte Delisle », citycode=97417 → -21.35933, 55.76637, score 0.755 — consulté le 2026-06-26
