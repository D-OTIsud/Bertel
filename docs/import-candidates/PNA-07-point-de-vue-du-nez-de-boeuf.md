# Point de vue du Nez de Bœuf — PNA (Site naturel)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Point de vue du Nez de Bœuf
- status : draft
- commune : Saint-Joseph (INSEE 97412) — arbitrage documenté ci-dessous (site à cheval sur la limite Le Tampon / Saint-Joseph ; le belvédère lui-même tombe à Saint-Joseph selon les contours administratifs IGN/INSEE et le cadastre)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (recherche live sur `object` : aucun objet « Nez de Bœuf » ; les seuls résultats « Remparts » sont des hébergements HLO/RES sans rapport)

## Identité
- Catégorie / sous-type proposé : Point de vue / belvédère aménagé (site de montagne avec aire d'accueil forestière attenante)
- Chapo : Belvédère aménagé en bordure de la route forestière du Volcan, à environ 2 040 m d'altitude, offrant une vue plongeante sur la vallée de la Rivière des Remparts et l'îlet de Roche Plate. Site équipé d'une aire d'accueil et d'un cheminement accessible aux personnes à mobilité réduite.

## Description
Aménagé en bordure de la route forestière du Volcan, à environ 8 km de Bourg-Murat, le point de vue du Nez de Bœuf domine la vallée encaissée de la Rivière des Remparts. Depuis le belvédère (environ 2 040 m d'altitude), équipé d'une murette basse surmontée d'une rambarde, le regard plonge de plus de 1 000 m vers le lit de la rivière ; par temps dégagé, on distingue les toitures des cases de l'îlet de Roche Plate, toujours habité, et l'océan en direction de Saint-Joseph. Le site se trouve au pied du piton du Nez de Bœuf (2 136 m), dont le sommet s'atteint en une vingtaine de minutes de marche. À proximité immédiate, l'aire d'accueil du Plateau du Nez de Bœuf, aménagée par le Département de La Réunion avec l'ONF, propose kiosques couverts, tables-bancs, bancs en pierre, foyers pour feux de bois et boulodrome. Depuis 2019, un cheminement en béton fibré d'environ 660 m, accessible aux personnes à mobilité réduite, relie le parking à un belvédère dédié, complété d'une table de lecture du paysage adaptée aux personnes malvoyantes. Le site est également le point de départ de plusieurs randonnées (sommet du Nez de Bœuf, source du Nez de Bœuf, descente vers Roche Plate). Le belvédère est situé sur la limite communale entre Le Tampon et Saint-Joseph, en bordure du cœur du Parc national de La Réunion.

## Adresse & localisation (object_location)
- Adresse : Route forestière du Volcan (RF n° 5 selon l'OTI du Sud ; certaines sources indiquent RF n° 6), à environ 8 km de Bourg-Murat — site naturel non adressé
- Code postal / ville : 97480 Saint-Joseph (belvédère) — accès routier exclusivement côté Le Tampon via Bourg-Murat / La Plaine des Cafres (97418)
- GPS (WGS84) : -21.20851, 55.61664 — source : OpenStreetMap (nœud 300020244, point de vue « Nez de Boeuf », via Overpass API). Points complémentaires : belvédère PMR ≈ -21.20430, 55.62305 (OSM) ; aire d'accueil du Plateau ≈ -21.20127, 55.62084 (OSM/Mapcarta)
- Altitude : ≈ 2 040 m au belvédère (guide-reunion.fr) ; piste PMR entre 2 024 et 2 035 m (Randopitons) ; sommet du piton à 2 136 m (Wikipédia)

**Arbitrage de commune (raisonnement)** : la limite Le Tampon / Saint-Joseph suit la crête du rempart ouest de la Rivière des Remparts au droit du site. Vérifications par géocodage administratif du 2026-06-11 :
- Belvédère routier (-21.20851, 55.61664) → **Saint-Joseph, INSEE 97412** (API Découpage administratif geo.api.gouv.fr, contours Admin Express IGN/INSEE) ; confirmé par le cadastre IGN (apicarto : commune cadastrale Saint-Joseph 97412 ; parcelle la plus proche 97412000AB0001 via géocodage inverse Géoplateforme).
- Belvédère PMR (-21.20430, 55.62305) → **Saint-Joseph, INSEE 97412** (geo.api.gouv.fr).
- Aire d'accueil du Plateau (-21.20127, 55.62084) → **Le Tampon, INSEE 97422** (geo.api.gouv.fr) ; idem pour un point 170 m à l'ouest du belvédère (-21.2085, 55.6150).
Conclusion : les deux belvédères (objet de la fiche) sont sur Saint-Joseph ; le parking, l'aire de pique-nique et la route d'accès sont au Tampon. L'IRT (reunion.fr) rattache également son offre « Nez de Boeuf-Roche Plate (rivière des remparts) » à Saint-Joseph ; à l'inverse OSM/Mapcarta étiquettent le point de vue « Le Tampon ». Choix retenu : **Saint-Joseph (97412)**, à faire valider par l'OTI (la position exacte de la plateforme par rapport à la ligne de crête se joue à quelques mètres).

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (gestionnaires : Département de La Réunion / ONF)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pages descriptives : sudreuniontourisme.fr « La Route du Volcan » ; departement974.fr)
- Réseaux sociaux : Non trouvé

## Horaires (object_opening)
Site naturel en accès libre ; aucun horaire publié dans les sources consultées. À vérifier : fermetures ponctuelles de la route forestière du Volcan par arrêté (éruption, intempéries) — Non trouvé — à compléter.

## Tarifs (object_price)
Accès libre et gratuit (site naturel public) — aucun tarif mentionné dans les sources consultées (2026). À confirmer auprès du gestionnaire.

## Données spécifiques PNA
- Type de site : point de vue / belvédère de montagne (bord de rempart), avec aire d'accueil forestière attenante (plateau du Nez de Bœuf)
- Parc national de La Réunion : le piton du Nez de Bœuf est « situé sur une frontière du parc national de La Réunion » (Wikipédia). La vallée de la Rivière des Remparts surplombée relève du cœur du Parc (massif de la Fournaise, bien UNESCO « Pitons, cirques et remparts ») ; l'aire d'accueil elle-même est en forêt aménagée gérée Département/ONF, a priori hors cœur. Situation exacte cœur / aire d'adhésion à confirmer sur la carte officielle du Parc national — à compléter.
- Réglementation : feux de bois uniquement dans les foyers aménagés (14 foyers recensés par le Département) ; le site est présenté par plusieurs guides comme aire de pique-nique et de bivouac — statut exact du bivouac/camping à confirmer auprès de l'ONF ; baignade : sans objet ; cueillette : Non trouvé — à compléter.
- Modalités d'accès : en voiture depuis Bourg-Murat (RN3) par la route forestière du Volcan, environ 8 km ; parking le long de la route au belvédère et parking avec 2 places PMR à l'entrée du parcours accessible (300 m après l'aire d'accueil du Plateau, selon Randopitons). Point de vue routier sans marche d'approche ; boucle PMR de 0,8 km (~30 min, dénivelé ~10 m, « très facile » selon Randopitons). Sentiers au départ du site : sommet du Nez de Bœuf (~20 min de montée), source du Nez de Bœuf, descente vers Roche Plate (~3 h 30 – 4 h).
- Dangers connus : bord de rempart vertigineux — belvédère sécurisé par murette et rambarde, mais rempart non sécurisé hors aménagements ; la route « côtoie soudain de très près le vide » (OTI du Sud) ; sur la piste PMR, croisement difficile de deux fauteuils sur certains passages (Randopitons). Aucun signalement officiel (préfecture/ONF) consulté — à compléter.

## Équipements & services (object_amenity)
Recensés par le Département de La Réunion (inauguration du 26/02/2019) et les guides :
- 2 kiosques équipés de tables-bancs (toiture en bardeaux), dont un aménagé pour recevoir une chaise roulante
- 1 belvédère dédié PMR (cheminement en béton fibré ~660 m, bordé de pierres sciées)
- Table de lecture du paysage adaptée aux personnes malvoyantes
- 7 tables avec bancs, 19 bancs en pierre, 14 foyers (feux de bois)
- Boulodrome
- Parking (dont 2 places PMR à l'entrée du parcours accessible)
- Toilettes : Non trouvé

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : sans objet (site naturel non accueilli)
- Accessibilité PMR : oui — parcours en béton fibré d'environ 660 m (« près de 700 mètres linéaires » selon le titre du Département ; 860 m linéaires également cités — longueur exacte à confirmer), présenté en 2019 comme « le plus grand cheminement PMR de l'île » en milieu naturel ; belvédère accessible sur la Rivière des Remparts ; 2 places de parking réservées ; kiosque adapté ; table de lecture adaptée aux malvoyants. Financement FEADER 75 % UE / 25 % Département (> 400 000 €).

## Labels & classements (object_classification)
Aucun trouvé (l'aménagement PMR est documenté mais aucun label Tourisme & Handicap n'est mentionné dans les sources consultées).

## Médias suggérés
- Wikimedia Commons, catégorie « Nez de Bœuf » (6 fichiers, licences libres à vérifier fichier par fichier) : https://commons.wikimedia.org/wiki/Category:Nez_de_B%C5%93uf
- Wikimedia Commons, catégorie « Nez de Bœuf (massif du Piton de la Fournaise) » : https://commons.wikimedia.org/wiki/Category:Nez_de_B%C5%93uf_(massif_du_Piton_de_la_Fournaise)
- Photos officielles (droits réservés, demander autorisation) : article du Département https://www.departement974.fr/actualite/plateau-nez-de-boeuf-somin-volcan-pres-de-700-metres-lineaires-de-parcours-accessibles ; page OTI du Sud https://www.sudreuniontourisme.fr/tresors-du-sud/la-route-du-volcan.html

## Données manquantes / à vérifier
- Commune : choix Saint-Joseph (97412) fondé sur les contours administratifs et le cadastre au droit des deux belvédères ; à faire valider par l'OTI car le site est à cheval sur la limite (parking + aire d'accueil au Tampon 97422) et OSM/Mapcarta étiquettent « Le Tampon »
- Longueur exacte du parcours PMR : 660 m (béton fibré), « près de 700 m linéaires » et 860 m linéaires coexistent dans les sources
- Numéro de la route forestière : RF n° 5 (OTI du Sud) vs RF n° 6 (reunion-tourisme.com) — trancher avec l'ONF
- Situation exacte vis-à-vis du cœur du Parc national (carte officielle) et réglementation applicable (bivouac, feux, cueillette, drones)
- Statut du bivouac/camping sur l'aire d'accueil (toléré ? réglementé ?) — à confirmer auprès de l'ONF
- Fermetures ponctuelles de la route forestière du Volcan (éruptions, intempéries) et conditions hivernales
- Contact du gestionnaire (Département de La Réunion / ONF Réunion) pour la fiche publique
- Présence de toilettes sur l'aire d'accueil
- Position GPS exacte de la plateforme du belvédère (le nœud OSM est à quelques mètres près ; la limite communale passe à proximité immédiate)
- Licences précises des photos Wikimedia Commons avant réutilisation
- Éventuel label Tourisme & Handicap sur l'aménagement PMR

## Sources
- Nez de Boeuf : Point de vue d'exception sur la rivière des Remparts — guide-reunion.fr — https://guide-reunion.fr/nez-de-boeuf-route-du-volcan/ — consulté le 2026-06-11
- Nez de Boeuf - Le Sommet - Altitude 2136 mètres — guide-reunion.fr — https://guide-reunion.fr/sommet-nez-de-boeuf/ — consulté le 2026-06-11 (via extraits de recherche)
- La Route du Volcan — Offices de tourisme du Sud de l'île de La Réunion (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/la-route-du-volcan.html — consulté le 2026-06-11
- Point de vue du Nez de Bœuf par la piste pour personnes à mobilité réduite — Randopitons — https://randopitons.re/randonnee/1709-point-vue-nez-uf-piste-pour-personnes-mobilite-reduite — consulté le 2026-06-11
- Le plateau du Nez de Boeuf, Somin Volcan : près de 700 mètres linéaires de parcours accessibles aux PMR — Département de La Réunion — https://www.departement974.fr/actualite/plateau-nez-de-boeuf-somin-volcan-pres-de-700-metres-lineaires-de-parcours-accessibles — consulté le 2026-06-11
- Route forestière du volcan : Aire d'accueil du Nez-de-Boeuf — La Réunion Pour Tous — https://lareunionpourtous.re/route-forestiere-du-volcan-aire-daccueil-du-nez-de-boeuf/ — consulté le 2026-06-11
- Nez de Bœuf (massif du Piton de la Fournaise) — Wikipédia — https://fr.wikipedia.org/wiki/Nez_de_B%C5%93uf_(massif_du_Piton_de_la_Fournaise) — consulté le 2026-06-11
- Nez de Boeuf-Roche Plate (rivière des remparts) (Saint-Joseph) — Île de la Réunion Tourisme (IRT) — https://en.reunion.fr/offers/nez-de-boeuf-roche-plate-riviere-des-remparts-saint-joseph-en-575442/ — consulté le 2026-06-11
- API Découpage administratif (contours Admin Express IGN/INSEE) — geo.api.gouv.fr — https://geo.api.gouv.fr/communes?lat=-21.2085073&lon=55.6166431 (et points -21.20430/55.62305 ; -21.20127/55.62084 ; -21.2085/55.6150) — consulté le 2026-06-11
- API Carto IGN, module cadastre (commune cadastrale au point du belvédère) — apicarto.ign.fr — https://apicarto.ign.fr/api/cadastre/commune — consulté le 2026-06-11
- Géoplateforme IGN, géocodage inverse (parcelle 97412000AB0001) — data.geopf.fr — https://data.geopf.fr/geocodage/reverse?lat=-21.2085073&lon=55.6166431&index=parcel — consulté le 2026-06-11
- OpenStreetMap (nœuds points de vue, via Overpass API) — https://overpass-api.de/api/interpreter — consulté le 2026-06-11
- Aire de pique-nique du Plateau Nez de Boeuf — Mapcarta (données OSM) — https://mapcarta.com/fr/W397740532 — consulté le 2026-06-11 (via extraits de recherche)
- Volcan : le site du Nez de Boeuf accessible aux personnes à mobilité réduite — linfo.re — https://www.linfo.re/la-reunion/societe/chemin-volcan-le-site-du-nez-de-boeuf-accessible-aux-personnes-a-mobilite-reduite — consulté le 2026-06-11 (via extraits de recherche)
- Category:Nez de Bœuf — Wikimedia Commons — https://commons.wikimedia.org/wiki/Category:Nez_de_B%C5%93uf — consulté le 2026-06-11
