# Pointe de la Table — PNA (Patrimoine naturel / site naturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Pointe de la Table
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré (vérification SQL live du 2026-06-26)** — requête sur `object.name ILIKE` pour « pointe de la table », « jardin volcanique », « tremblet », « puits arabe » → 0 ligne. Non présent non plus dans la liste « déjà proposé » (31 fiches). **Note de périmètre** : ne pas confondre avec « Cap Méchant » et « Cap Jaune » déjà proposés (sites distincts de Saint-Philippe/Saint-Joseph). **Note de nommage** : le titre de la commande mentionne « coulée 2007 » ; les sources consultées attribuent la formation de la Pointe de la Table à l'éruption de **1986** — la coulée de **2007** (« éruption du siècle ») a formé la plateforme/plage voisine du **Tremblet** (entité géographique limitrophe mais distincte). Fiche rédigée sur la Pointe de la Table (1986) ; voir « Données manquantes » pour l'arbitrage de périmètre.

## Identité
- Catégorie / sous-type proposé : site naturel volcanique côtier / point de vue & sentier de découverte (delta de lave, « jardin volcanique » du Sud Sauvage)
- Chapo : Cap de roche noire né de la coulée de lave de 1986 du Piton de la Fournaise, la Pointe de la Table offre un saisissant contraste entre basalte sombre, océan et végétation pionnière, à découvrir par une boucle de randonnée facile au départ du Puits Arabe.

## Description
La Pointe de la Table est un cap volcanique du littoral de Saint-Philippe, dans le Sud Sauvage de La Réunion, marquant la pointe sud-est de l'île. Il s'est formé lors de l'éruption exceptionnelle de **1986** du Piton de la Fournaise, lorsque la lave est sortie de l'Enclos et a gagné sur l'océan (delta de lave). Le site présente des formations volcaniques remarquables : lave cordée (pāhoehoe), « orgues volcaniques » (basalte en colonnes) et plaques de basalte battues par les vagues ; un échantillon de basalte prélevé sur place est exposé à la Cité du Volcan. La végétation pionnière (vacoas/pandanus, filaos) recolonise progressivement la coulée, d'où le surnom de « jardin volcanique ». Le contraste entre la côte noire, le bleu de l'océan, l'écume blanche et le vert de la végétation est particulièrement spectaculaire. La découverte se fait à pied par une boucle facile au départ du parking du Puits Arabe.

## Adresse & localisation (object_location)
- Adresse : Pointe de la Table, secteur Le Tremblet / Puits Arabe, accès depuis la RN2 (entre Saint-Philippe et Le Tremblet)
- Code postal / ville : 97442 Le Tremblet — commune de **Saint-Philippe** (code INSEE **97417** ; 97442 est le code postal du quartier Le Tremblet, et non un code commune distinct — citycode BAN confirmé 97417)
- GPS (WGS84) : **-21.33111, 55.80889** (21°19′52″S, 55°48′32″E) — source : Wikipédia « Pointe de la Table » (coordonnées du cap), consulté le 2026-06-26. Point d'accès routier (trailhead RN2/Le Tremblet) géocodé via BAN api-adresse.data.gouv.fr : « Route Nationale 2 le Tremblet 97442 Saint-Philippe » = -21.309383, 55.801557 (type=street, score=0.49, citycode=97417) — score faible (pas d'adresse postale pour un site naturel) ⇒ retenir la coordonnée Wikipédia pour le cap.
- Altitude : ~6 à 30 m (plage altimétrique du sentier littoral, source Randopitons) — point bas en bord de mer

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel non gardé ; renseignements éventuels via Office de tourisme Sud / mairie de Saint-Philippe)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site dédié ; pages tierces IRT / Parc national)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Site naturel en accès libre, en principe accessible toute l'année en journée. **Attention** : le sentier littoral connaît des fermetures périodiques (sécurité, érosion, intempéries) — Randopitons recommande de vérifier l'accessibilité auprès de l'ONF / Parc national avant de s'y rendre. **Mise à jour 2026-07-30 (réévaluation web)** : le retour forestier de la boucle est FERMÉ (panneau officiel « Sentier Fermé » depuis le Puits Arabe vers la forêt, photos de mars 2026 ; panneaux d'interdiction près de plantations privées de vanille — commentaires Randopitons 2025-2026). Le site reste accessible en **aller-retour par le sentier littoral** — le sentier littoral du Tremblet à la Pointe de la Table est officiellement **rouvert par arrêté du 7 mai 2026** (source : Randotectec / Parc national de La Réunion, vérifié 2026-07-30). Horaires d'ouverture formels : Non trouvé — à compléter.

## Tarifs (object_price)
Site naturel en accès libre — **gratuit** (aucun droit d'entrée ; stationnement libre au parking du Puits Arabe). Source : descriptions concordantes IRT / Randopitons / randoreunion (sentier public, pas de billetterie).

## Données spécifiques PNA
PNA = pas de table de facette type-spécifique (classifications/labels génériques uniquement). Caractéristiques du site, à titre informatif (sourcées) :
- Type de site : delta de lave / cap volcanique côtier issu de la coulée de 1986
- Intérêt : géologique (lave cordée pāhoehoe, orgues basaltiques, tunnels de lave) et botanique (recolonisation pionnière, vacoas/filaos)
- Le sentier de découverte associé (boucle Puits Arabe ↔ Pointe de la Table) pourrait être modélisé séparément en objet **ITI** (voir ci-dessous) si l'OTI souhaite distinguer le site (PNA) de l'itinéraire (ITI).

**Données du sentier associé** (pour un éventuel objet ITI lié, NON inclus dans cette fiche PNA) :
- Distance : 5,8 km (Randopitons) — variantes ~3,1 km annoncées par d'autres sources selon le tracé
- Dénivelé positif : ~40 m (Randopitons)
- Durée : ~2 h (Randopitons) ; ~1 h 30 boucle courte (IRT) ; ~3 h aller-retour Pointe du Tremblet ↔ Pointe de la Table (randoreunion)
- Difficulté : Facile
- Type : Boucle
- Balisage : marques bleues et jaunes + bornes céramiques caractéristiques au point d'exclamation rouge au sol
- Départ : parking du Puits Arabe (panneau pédagogique sous les vacoas), accès RN2 puis route forestière n°3 de Takamaka

## Équipements & services (object_amenity)
- Parking : oui — grand parking au départ du Puits Arabe (sous les vacoas) — source : randoreunion / Randopitons
- Sanitaires : Non trouvé — à compléter
- Restauration : Non trouvé — à compléter (aire de pique-nique du Puits Arabe à confirmer)
- Accès : route forestière depuis la RN2 ; site littoral piéton (sentier sur lave, terrain accidenté)
- Panneau pédagogique au départ : oui (sentier d'interprétation)

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (site gratuit)
- Langues : Non trouvé — à compléter
- PMR / accessibilité : **non adapté PMR** a priori — sentier sur coulée de lave, terrain accidenté et rocheux (à confirmer). Non trouvé — à compléter (donnée officielle absente).

## Labels & classements (object_classification)
Aucun label revendiqué trouvé. Le site est situé dans l'aire d'adhésion / à proximité du **Parc national de La Réunion** (sentier référencé sur le portail Randotectec du Parc national) et s'inscrit dans le périmètre du Bien UNESCO « Pitons, cirques et remparts » (cœur du Parc à proximité) — **à vérifier** pour un mapping LBL_* éventuel. Aucun classement formel (T&H, Qualité Tourisme…) trouvé.

## Médias suggérés
- Page IRT / Île de la Réunion Tourisme : https://en.reunion.fr/offers/la-pointe-de-la-table-saint-philippe-en-3791447/ (photos officielles — NE PAS télécharger sans autorisation)
- Fiche sentier Parc national (Randotectec) : https://randotectec.reunion-parcnational.fr/itineraire/le-sentier-littoral-de-saint-philippe-du-tremblet-a-la-pointe-de-la-table/ (NE PAS télécharger sans autorisation)
- Randopitons (photos de la boucle) : https://randopitons.re/randonnee/1061-circuit-pointe-table-coulees-1986 (NE PAS télécharger sans autorisation)

## Données manquantes / à vérifier
- **Arbitrage de périmètre/nommage** : trancher si l'objet à créer est « Pointe de la Table » (cap, formé 1986) ou la « Plage/Pointe du Tremblet » (coulée 2007) — entités voisines distinctes. La fiche couvre la Pointe de la Table (1986), la mieux documentée.
- Distance exacte du sentier (5,8 km vs ~3,1 km selon le tracé) — à fixer si un objet ITI est créé.
- Altitude précise du point d'accès / du cap (estimation 6–30 m).
- Coordonnées exactes du parking du Puits Arabe (GPS précis non publié ; trailhead estimé via BAN RN2 Le Tremblet).
- Horaires d'ouverture formels et statut d'accès courant (fermetures périodiques ONF/Parc national à vérifier au moment de l'import).
- Présence de sanitaires / aire de pique-nique / restauration au Puits Arabe.
- Contacts officiels (gestionnaire : ONF / Parc national / mairie de Saint-Philippe ?), site web, langues.
- Accessibilité PMR (présumée non, à confirmer).
- Labels / appartenance Parc national / UNESCO à confirmer pour mapping classification.
- Existence éventuelle d'une fiche OTI du Sud dédiée (non trouvée sur sudreuniontourisme.fr au 2026-06-26).

## Sources
- Pointe de la Table — Wikipédia — https://fr.wikipedia.org/wiki/Pointe_de_la_Table — consulté le 2026-06-26 (coordonnées GPS -21.33111/55.80889, formation 1986, lave pāhoehoe/orgues volcaniques, accès RFO 3 Takamaka)
- La Pointe de la table (Saint-Philippe) — Île de la Réunion Tourisme (IRT) — https://en.reunion.fr/offers/la-pointe-de-la-table-saint-philippe-en-3791447/ — consulté le 2026-06-26
- Le sentier littoral de Saint-Philippe, du Tremblet à la Pointe de la Table — Randotectec / Parc national de La Réunion — https://randotectec.reunion-parcnational.fr/itineraire/le-sentier-littoral-de-saint-philippe-du-tremblet-a-la-pointe-de-la-table/ — consulté le 2026-06-26
- Le circuit de la Pointe de la Table et des coulées de 1986 — Randopitons — https://randopitons.re/randonnee/1061-circuit-pointe-table-coulees-1986 — consulté le 2026-06-26 (5,8 km, +40 m, ~2 h, boucle facile, balisage, coulée 1986)
- Saint-Philippe, du Puits arabe à la Pointe de la Table — randoreunion.fr — http://www.randoreunion.fr/p121214.html — consulté le 2026-06-26 (accès RN2 / Ravine Ango / Puits Arabe, parking)
- POINTE DE LA TABLE — Petit Futé — https://www.petitfute.co.uk/v36681-saint-philippe-97442/c1173-visites-points-d-interet/c974-site-naturel/81374-pointe-de-la-table.html — consulté le 2026-06-26 (référencé comme site naturel de Saint-Philippe ; contenu détaillé non récupéré)
- Géocodage BAN (api-adresse.data.gouv.fr) — « Route Nationale 2 le Tremblet 97442 Saint-Philippe » -21.309383/55.801557, type=street, score=0.49, citycode=97417 — consulté le 2026-06-26
