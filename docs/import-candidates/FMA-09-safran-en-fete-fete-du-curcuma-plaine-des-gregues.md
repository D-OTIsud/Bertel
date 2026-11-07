# Safran en Fête (Fête du Curcuma) — Plaine des Grègues — FMA (Fête / manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Safran en Fête (Fête du Curcuma) - Plaine des Grègues
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré (vérification SQL live du 2026-06-26)**. La requête `name ILIKE '%safran%' OR '%curcuma%' OR '%grègues%'` ne renvoie que 3 objets sans rapport : « Au cœur du Safran » (HLO, draft) et « La Villa Safrané » (HLO, draft) — hébergements dont le nom évoque l'épice — et « Maison du Curcuma » (`LOIRUN00000000VE`, LOI, published). Cette dernière est le **musée/boutique ouvert à l'année**, objet **distinct** de la manifestation annuelle. **NB (donnée live)** : en base, « Maison du Curcuma » est localisée au **14 rue du Rond, Saint-Joseph (lat −21,32665 / lon 55,60781)**, soit ~6 km du point géocodé du site de la fête (277 rue Raphaël Babet) — ce ne sont PAS la même adresse. Une éventuelle `object_relation` FMA → « Maison du Curcuma » serait donc thématique (curcuma péï du même territoire), pas une co-localisation : à valider à l'import. La manifestation n'est ni en base ni dans la liste des 31 fiches déjà proposées.

## Identité
- Catégorie / sous-type proposé : Fête / manifestation — fête de terroir / fête agricole et gastronomique (mise en valeur du curcuma « safran péï »).
- Chapo : Chaque novembre, la Plaine des Grègues célèbre son « or jaune », le curcuma péï, lors de cinq jours de marché de producteurs, concerts, trail, concours culinaires et animations — l'une des plus grandes fêtes de terroir du Sud Sauvage (≈ 30 000 visiteurs).

## Description
Le Safran en Fête (aussi appelée Fête du Curcuma) est une manifestation annuelle organisée à la Plaine des Grègues, à Saint-Joseph, autour du curcuma local appelé « safran péï ». Créée en 2002, elle en était à sa 22e édition en 2025 (7 au 11 novembre) et attire chaque année près de 30 000 visiteurs venus de toute l'île. La fête réunit les producteurs de la Plaine des Grègues, considérée comme la capitale du safran péï ; selon les organisateurs, entre 4 et 5 tonnes de curcuma et environ 500 kg d'arrow-root y sont vendus chaque année, soit près d'un tiers de la production annuelle. Le programme mêle défilé inaugural, élection de Miss Saint-Joseph, le trail « Montées Curcuma » (24 km, 12e édition en 2025, plus de 800 participants), concours de gâteaux/pâtisserie, concerts, animations agricoles et scolaires, et journée traditionnelle des aînés. L'édition 2025 a coïncidé avec le 240e anniversaire de la commune de Saint-Joseph. La 23e édition est annoncée pour novembre 2026 (dates communiquées : 11–15 novembre, à confirmer).

## Adresse & localisation (object_location)
- Adresse : Plaine des Grègues — 277, rue Raphaël Babet (site de la fête). NB : la Maison des Associations, co-organisatrice, est domiciliée au 354, rue Raphaël Babet — à distinguer du lieu de l'événement. La « Maison du Curcuma » (musée/boutique, objet LOI distinct) est en base au 14 rue du Rond — autre adresse, à ne pas confondre.
- Code postal / ville : 97480 Saint-Joseph (Plaine des Grègues)
- GPS (WGS84) : -21.378888, 55.619217 — source : géocodage BAN (api-adresse.data.gouv.fr) de « 277 rue Raphaël Babet 97480 Saint-Joseph », citycode 97412, label retourné « 277 Rue Raphaël Babet 97480 Saint-Joseph », score 0,9818. (L'API renvoie la géométrie en [lon, lat] ; coordonnées réordonnées en lat, lon — La Réunion ≈ -21°S / 55°E.)
- Altitude : Non trouvé — à compléter (la Plaine des Grègues est un plateau d'altitude des Hauts de Saint-Joseph ; valeur précise à vérifier).

## Contacts (object_contact)
- Téléphone : 0262 35 80 00 (Ville de Saint-Joseph, organisateur) ; 0262 56 46 66 (Maison des Associations, co-organisateur) — source : frt.re et mda-saintjoseph.re.
- Email : stjo.mda@gmail.com (Maison des Associations) — source : mda-saintjoseph.re. Email dédié à la manifestation : Non trouvé — à compléter.
- Site web : https://saintjoseph.re/ (programme annuel publié par la Ville) ; https://mda-saintjoseph.re/safran-en-fete/ (page dédiée MDA) — source : saintjoseph.re, mda-saintjoseph.re.
- Réseaux sociaux : Facebook Maison des Associations — facebook.com/mdastjoseph ; YouTube MDA — youtube.com/channel/UCHWUtg2Q8Xn6zvY_xWbyZDA ; Facebook Ville de Saint-Joseph — facebook.com/saintjo97480 — source : mda-saintjoseph.re, recherche web. Compte/​page officiel spécifique à l'événement : Non trouvé — à compléter.

## Horaires (object_opening)
- Manifestation annuelle, sur ~5 jours en novembre. Édition 2025 : du vendredi 7 au mardi 11 novembre 2025 ; ouverture au public à 9h00 le vendredi ; programme courant de 9h00 à 17h00 selon les journées (ex. bal musette mardi 9h–17h) — source : saintjoseph.re, freedom.fr.
- Horaires détaillés jour par jour : variables selon le programme annuel (défilé vendredi 17h45, élection Miss 20h, trail samedi 7h–12h30, concours gâteaux dimanche 10h–12h…). À recharger sur le programme officiel de l'année.
- Édition 2026 annoncée : 11 au 15 novembre (source mda-saintjoseph.re) — **à confirmer**.

## Tarifs (object_price)
- Entrée : Non trouvé — à compléter (les fêtes de terroir de ce type sont généralement en accès libre ; à confirmer auprès de l'organisateur). Achats sur place auprès des producteurs/exposants (curcuma, arrow-root, produits péï) à leurs tarifs propres.
- Navettes : des navettes gratuites desservent le site le soir, avec gratuité le samedi et le dimanche (édition 2025) — source : recherche web (programme 2025). Certaines activités annexes (ex. trail « Montées Curcuma ») peuvent être payantes sur inscription — montant Non trouvé — à compléter.

## Données spécifiques FMA (object_fma + occurrences)
- Type d'événement : fête de terroir / fête agricole et gastronomique.
- Périodicité : annuelle.
- Mois : novembre.
- Durée : ~5 jours.
- Lieu (récurrent) : Plaine des Grègues, Saint-Joseph (277 rue Raphaël Babet).
- Première édition : 2002 — source : saintjoseph.re, memento.fr (« depuis 2002 »).
- Édition 2025 : 22e édition, du 7 au 11 novembre 2025.
- Édition 2026 : 23e édition annoncée (dates ~11–15 novembre, à confirmer) — source : mda-saintjoseph.re.
- Organisateurs : Ville de Saint-Joseph + Maison des Associations de Saint-Joseph (MDA) ; président cité (édition 2025) : Jacky Folio — source : memento.fr.
- Fréquentation : ≈ 30 000 visiteurs/an — source : saintjoseph.re, guide-reunion.fr, memento.fr.
- Volume économique : 4 à 5 tonnes de curcuma + ~500 kg d'arrow-root vendus par édition (≈ 1/3 de la production annuelle) — source : memento.fr, guide-reunion.fr.
- Temps forts récurrents : défilé inaugural, élection Miss Saint-Joseph, trail « Montées Curcuma » (24 km), concours de gâteaux/pâtisserie, concerts, journées agricole/scolaire, bal et journée des aînés.
- Occurrences à encoder : occurrence 2025 (2025-11-07 → 2025-11-11, confirmée) ; occurrence 2026 (~2026-11-11 → 2026-11-15, à confirmer avant publication).

## Équipements & services (object_amenity)
- Parking / navettes : navettes gratuites vers le site (le soir ; gratuité samedi/dimanche en 2025) — source : recherche web. Stationnement sur site : Non trouvé — à compléter.
- Restauration : oui (marché de producteurs, stands de produits péï, restauration de fête) — source : descriptions presse. Détail des stands : Non trouvé — à compléter.
- Sanitaires : Non trouvé — à compléter.
- Accès / scène / podium : podium et scène pour concerts et élections ; espace agricole et exposants — source : saintjoseph.re, freedom.fr.
- Animations enfants / scolaires : ateliers pédagogiques sur l'environnement (journée scolaire) — source : saintjoseph.re.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (achats producteurs : espèces très probables, CB à confirmer).
- Langues : français (créole réunionnais usuel) ; autres langues d'accueil : Non trouvé — à compléter.
- Accessibilité PMR : Non trouvé — à compléter.

## Labels & classements (object_classification)
- Aucun label revendiqué trouvé pour la manifestation elle-même. (Le curcuma de la Plaine des Grègues est un produit de terroir emblématique, mais aucun label officiel — type IGP — n'est attesté par les sources consultées.) Mapping LBL_* : aucun à ce stade. À vérifier.

## Médias suggérés
- Page officielle Ville de Saint-Joseph (visuels et affiches programme) : https://saintjoseph.re/Safran-en-fete-2025-l-ame-du-Sud
- Page Maison des Associations (affiche, programme) : https://mda-saintjoseph.re/safran-en-fete/
- Reportage photos/vidéos Free Dom 2025 : https://freedom.fr/le-safran-en-fete-2025-la-plaine-des-gregues-sillumine-du-7-au-11-novembre-videos-photos/
- Article La 1ère (photos) : https://la1ere.franceinfo.fr/reunion/saint-joseph/fete-du-curcuma-le-safran-pei-a-l-honneur-jusqu-au-11-novembre-a-la-plaine-des-gregues-1640983.html
- **NE PAS télécharger sans autorisation** (droits Ville de Saint-Joseph / MDA / médias). Demander des visuels libres de droits à l'organisateur avant publication.

## Données manquantes / à vérifier
- Tarif d'entrée exact (accès libre supposé, non confirmé) et tarifs des activités payantes (trail, concours).
- Horaires d'ouverture détaillés et définitifs par journée (varient chaque année).
- Dates exactes de l'édition 2026 (11–15 novembre annoncé par la MDA, à confirmer).
- Altitude du site.
- Coordonnées de contact dédiées à l'événement (téléphone/email/page propres) vs. contacts génériques Ville/MDA.
- Présence de sanitaires, capacité de stationnement sur site, accessibilité PMR.
- Moyens de paiement acceptés sur les stands.
- Éventuel label/marque de terroir associé au curcuma de la Plaine des Grègues.
- Point GPS précis du site de la fête (le géocodage pointe l'adresse postale 277 rue Raphaël Babet ; vérifier qu'il correspond bien à l'emplacement du podium/marché).

## Sources
- Safran en fête 2025 : l'âme du Sud Sauvage à la Plaine des Grègues — Ville de Saint-Joseph — https://saintjoseph.re/Safran-en-fete-2025-l-ame-du-Sud — consulté le 2026-06-26
- Safran en Fête (fiche événement, 277 rue Raphaël Babet, organisateur Ville de Saint-Joseph) — Fédération Réunionnaise de Tourisme — https://frt.re/evenement/safran-en-fete/ — consulté le 2026-06-26
- Le Safran en fête 2025 : cinq jours d'animations à la Plaine des Grègues autour du curcuma péï (22e édition, ≈30 000 visiteurs, 4–5 t de curcuma, depuis 2002, organisateur MDA / Jacky Folio) — Mémento — https://www.memento.fr/article_06-11-2025-le-safran-en-fete-2025-cinq-jours-d-animations-a-la-plaine-des-gregues-autour-du-curcuma-pei — consulté le 2026-06-26
- Safran en fête (page dédiée : organisateur MDA, 354 rue Raphaël Babet, 23e édition, contacts 0262 56 46 66 / stjo.mda@gmail.com, réseaux sociaux) — Maison des Associations Saint-Joseph — https://mda-saintjoseph.re/safran-en-fete/ — consulté le 2026-06-26
- Fête du curcuma : le safran péï à l'honneur jusqu'au 11 novembre à la Plaine-des-Grègues — La 1ère (France Info) — https://la1ere.franceinfo.fr/reunion/saint-joseph/fete-du-curcuma-le-safran-pei-a-l-honneur-jusqu-au-11-novembre-a-la-plaine-des-gregues-1640983.html — consulté le 2026-06-26 (titre/URL vérifiés en recherche ; page renvoyée 403 au fetch)
- Géocodage Base Adresse Nationale (lat/lon, score 0,9818, citycode 97412) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=277+rue+Rapha%C3%ABl+Babet+97480+Saint-Joseph&citycode=97412 — consulté le 2026-06-26
