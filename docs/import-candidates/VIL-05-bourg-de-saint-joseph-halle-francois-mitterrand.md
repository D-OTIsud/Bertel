# Bourg de Saint-Joseph (Halle François Mitterrand) — VIL (Village / centre-bourg)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : Bourg de Saint-Joseph (Halle François Mitterrand)
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 — recherche `name ILIKE` sur saint-joseph / mitterrand / halle / forain / bourg / marché + `code_insee = '97412'` : seuls « Chalet Bourg-Murat » (HLO, Le Tampon) et « Paintball de Saint-Joseph » (ACT) remontent, aucun homologue de centre-bourg ni du marché/halle). Réserve : le **marché forain du Sud Sauvage** (vendredi matin sous la Halle) est un objet potentiellement distinct de type **FMA/événement récurrent** ; si l'OTI veut le tracer séparément, créer une fiche FMA dédiée et **relier** les deux objets (le marché « se tient à » le bourg/halle) plutôt que de les fusionner. Cette fiche VIL décrit le centre-bourg comme lieu de découverte, la Halle servant de point d'ancrage.

## Identité
- Catégorie / sous-type proposé : Centre-bourg créole / cœur de ville (place et halle, église, mairie, rues commerçantes, marché forain). Point d'ancrage : la Halle (Place) François Mitterrand.
- Chapo : Au cœur du Sud Sauvage, sur la RN2, le centre-bourg de Saint-Joseph mêle une église de pierre du XIXᵉ siècle, ses rues commerçantes créoles et la grande Halle François Mitterrand qui accueille chaque vendredi matin le marché forain du Sud Sauvage et, toute l'année, concerts et festivités.

## Description
Saint-Joseph, fondée en 1785 par le botaniste Joseph Hubert, est la commune la plus méridionale de La Réunion (et de l'Union européenne). Son centre-bourg, plutôt rural et authentiquement créole, s'organise autour de l'église Saint-Joseph — édifice de pierre consacré en 1851 en remplacement d'une première chapelle en bois, partiellement détruit par le cyclone de 1881 puis reconstruit, et inscrit à l'Inventaire général du patrimoine culturel —, de la mairie (rue Raphaël Babet) et de ses rues commerçantes. Au cœur du bourg, la Halle François Mitterrand, inaugurée en octobre 2015 après d'importants travaux d'aménagement, est l'équipement structurant : elle abrite chaque vendredi matin (6h-12h) le marché forain du Sud Sauvage, où une centaine d'exposants — commerçants de la commune, ambulants extérieurs et producteurs agricoles locaux — proposent fruits, légumes et produits péi (curcuma/safran de Grègues, choux coco et vacoa, taro Maurice, pitayas, combavas, citrons caviar). Hors marché, la halle accueille concerts, fan zones et manifestations culturelles tout au long de l'année. Le bourg constitue une porte d'entrée pratique vers les sites phares de la commune (Langevin, Manapany-les-Bains, Grand Coude).

## Adresse & localisation (object_location)
- Adresse : Place / Halle François Mitterrand, centre-bourg (point d'ancrage administratif : mairie, 276 rue Raphaël Babet)
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.379372, 55.621747 — source : géocodage BAN api-adresse.data.gouv.fr de « 276 rue Raphaël Babet Saint-Joseph » (citycode 97412), label « 276 Rue Raphaël Babet 97480 Saint-Joseph », score 0,9818. NOTE : coordonnée du pôle administratif/centre-bourg ; la Place/Halle François Mitterrand n'est pas géocodable en l'état dans la BAN (rue « Place François Mitterrand » introuvable, score 0,50) ni dans Nominatim (0 résultat). **Point GPS exact de la Halle à relever sur le terrain / via cadastre.**
- Altitude : Non trouvé — à compléter (bourg littoral/bas, ordre de grandeur < 100 m sur la RN2, à confirmer)

## Contacts (object_contact)
- Téléphone : +262 (0)262 35 71 93 (Direction du Développement Économique et Agricole de la mairie, gestionnaire du marché de la halle) — source : saintjoseph.re. Standard mairie / office de tourisme : Non trouvé — à compléter
- Email : deveco@saintjoseph.re (Direction du Développement Économique et Agricole) — source : saintjoseph.re
- Site web : https://saintjoseph.re (ville de Saint-Joseph) ; OTI : https://www.sudreuniontourisme.fr
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
- Centre-bourg : accès libre en permanence (espace public).
- Marché forain du Sud Sauvage sous la Halle : tous les vendredis, 6h00 à 12h00 — source : saintjoseph.re, guide-reunion.fr, cartedelareunion.fr.
- Église, mairie et commerces : horaires propres non relevés — Non trouvé — à compléter.

## Tarifs (object_price)
Accès gratuit (lieu public / centre-bourg). Le marché et la visite du bourg sont en accès libre. (Tarifs éventuels d'emplacement pour exposants = relation commerçant↔mairie, hors périmètre fiche touristique.)

## Données spécifiques VIL
Type VIL = pas de table facette dédiée (classifications / labels génériques). Éléments d'intérêt du centre-bourg à documenter en sous-lieux / relations :
- Église Saint-Joseph (pierre, consacrée 1851, Inventaire général du patrimoine culturel) — adresse exacte à confirmer (centre-bourg, à proximité de la mairie).
- Hôtel de ville / mairie — rue Raphaël Babet.
- Halle (Place) François Mitterrand — équipement marché + événementiel (inaugurée oct. 2015).
- Marché forain du Sud Sauvage (vendredi matin) — candidat objet FMA distinct à relier.
- Rues commerçantes créoles.
- Porte d'entrée vers Langevin, Manapany-les-Bains, Grand Coude (relations object_relation possibles vers ces objets une fois en base).

## Équipements & services (object_amenity)
- Halle couverte (marché abrité).
- Commerces de proximité, restauration du bourg : présents mais non inventoriés — à compléter.
- Parking : présence probable (place aménagée + « parc fermé » mentionné par la mairie pour le marché), capacité/localisation Non trouvé — à compléter.
- Sanitaires publics : Non trouvé — à compléter.
- Accès RN2 / transport en commun (Car Jaune) : desserte du bourg probable — à confirmer.

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet pour le lieu public ; au marché, espèces probables, autres moyens Non trouvé — à compléter.
- Langues : français, créole réunionnais (usuels) — à confirmer pour tout accueil touristique.
- Accessibilité PMR : Non trouvé — à compléter (halle récente 2015, accessibilité probable mais non documentée ; centre-bourg en pente partielle à vérifier).

## Labels & classements (object_classification)
- Église Saint-Joseph : inscrite à l'Inventaire général du patrimoine culturel (protection patrimoniale documentaire, à mapper si un code de classement patrimonial existe ; sinon Aucun trouvé pour l'objet VIL lui-même).
- Aucun label touristique (LBL_*) revendiqué trouvé pour le centre-bourg.

## Médias suggérés
- Photos officielles de la Halle / du marché sur saintjoseph.re (page « Marché forain du Sud Sauvage ») et sur la presse locale (imazpress.com, freedom.fr — concerts/fan zone à la Halle). NE PAS télécharger sans autorisation.
- Photos de l'église Saint-Joseph sur l'Observatoire du patrimoine religieux (recensement.patrimoine-religieux.fr) et Wikipédia. NE PAS télécharger sans autorisation.

## Données manquantes / à vérifier
- GPS exact de la Halle / Place François Mitterrand (relevé terrain ou cadastre ; valeur actuelle = pôle mairie centre-bourg).
- Altitude du bourg.
- Standard téléphonique mairie + éventuel point info touristique du bourg.
- Réseaux sociaux officiels.
- Horaires église / mairie / commerces.
- Inventaire des équipements : parking (capacité, gratuité), sanitaires publics, restauration, desserte Car Jaune.
- Accessibilité PMR (halle et cheminement du bourg).
- Arbitrage OTI : créer ou non un objet FMA « Marché forain du Sud Sauvage » distinct relié à ce VIL.
- Périmètre exact de l'objet VIL (centre-bourg seul vs commune élargie).

## Sources
- Marché forain du Sud Sauvage — Ville de Saint-Joseph — https://saintjoseph.re/Marche-forain-du-Sud-Sauvage — consulté le 2026-06-26
- Saint-Joseph, Île de la Réunion (centre-ville, marché, halle) — guide-reunion.fr — https://guide-reunion.fr/commune/saint-joseph/ — consulté le 2026-06-26
- Marché de Saint-Joseph — cartedelareunion.fr — https://www.cartedelareunion.fr/listings/marche-de-saint-joseph/ — consulté le 2026-06-26
- 1785, naissance d'un quartier — Ville de Saint-Joseph — https://saintjoseph.re/-1785-naissance-d-un-quartier- — consulté le 2026-06-26
- Église Saint-Joseph / patrimoine — Recensement participatif, Observatoire du Patrimoine Religieux — https://recensement.patrimoine-religieux.fr/eglises_edifices/974-LaReunion/974012-Saint-Joseph — consulté le 2026-06-26
- Concerts à la Halle François Mitterrand de Saint-Joseph — Imaz Press Réunion — https://imazpress.com/actus-reunion/a-la-halle-francois-mitterand-de-saint-joseph-frederic-francois-en-concert-les-9-et-10-septembre — consulté le 2026-06-26
- Géocodage BAN (mairie/centre-bourg) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=276+rue+Raphael+Babet+Saint-Joseph&citycode=97412 — consulté le 2026-06-26
