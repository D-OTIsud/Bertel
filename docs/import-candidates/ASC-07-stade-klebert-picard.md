# Stade Klébert Picard — ASC (Activité sportive / complexe)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ASC
- name : Stade Klébert Picard
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 — `SELECT … FROM public.object WHERE lower(name) LIKE '%klebert%'/'%picard%'/'%stade%'/'%complexe%'/'%sportif%'` ⇒ 0 ligne). NB : terrain situé dans le périmètre OTI du Sud (Le Tampon). Réserve « intérêt touristique » : équipement sportif municipal, pas un site marqueté par l'OTI/IRT — la valeur visiteur tient surtout à la **piscine publique** et au city-stade ; à arbitrer par l'OTI (cf. § Données manquantes).

## Identité
- Catégorie / sous-type proposé : Complexe sportif municipal multi-activités (football, athlétisme, natation publique, sports collectifs, sports de combat, haltérophilie) — archétype ASC (activité sportive et de loisirs).
- Chapo : Principal complexe sportif du centre-ville du Tampon, le stade Klébert Picard réunit un terrain de football de 3 275 places (home du club La Tamponnaise), une piste d'athlétisme, une piscine municipale et plusieurs plateaux multisports sur 10 000 m².

## Description
Le complexe Klébert Picard est l'équipement sportif phare du centre-ville du Tampon (rue Roland Garros). Il s'étend sur environ 10 000 m² et regroupe huit installations recensées au Recensement national des équipements sportifs (RES) : un stade de football en gazon naturel éclairé (terrain 100 × 60 m) doté d'une tribune de 3 275 places, une piste d'athlétisme de 400 m (4 couloirs, surface stabilisée), une piscine municipale (bassin sportif 25 m), un bassin ludique de natation, un dojo, un plateau polyvalent (basket/volley en bitume, 40 × 20 m), un plateau basket et une salle d'haltérophilie. Le stade de football sert d'enceinte à domicile du club **La Tamponnaise** (ex-US Stade Tamponnaise, renommé en 2014), pensionnaire des plus hautes divisions réunionnaises. L'équipement est de propriété et de gestion publiques (commune du Tampon). Les activités pratiquées sur le site incluent football, futsal, basket, volley, beach-volley, judo, jujitsu, boxe, natation sportive, aquagym, baignade ludique, athlétisme et haltérophilie.

## Adresse & localisation (object_location)
- Adresse : Rue Roland Garros (n° 57 selon l'adresse de départ ; les sources publiques citent aussi « 86 » et « 86 bis rue Roland Garros » pour l'entrée du club de foot — à confirmer sur le terrain)
- Code postal / ville : 97430 Le Tampon
- GPS (WGS84) : -21.272868, 55.521786 — source : géocodage BAN api-adresse.data.gouv.fr de « 57 rue Roland Garros », citycode 97422, label retourné « 57 Rue Roland Garros 97430 Le Tampon », score 0.976 (numéro de voie exact). Point de contrôle concordant : RES/repertoire-equipements-sportifs.fr donne -21.2725, 55.5219 et Wikipédia 21°16′20″S 55°31′18″E (= -21.2722, 55.5217) — les trois sources convergent à ~50 m.
- Altitude : ~530 m (centre-ville du Tampon ; ordre de grandeur, à confirmer) — Non trouvé — à compléter (altitude précise non sourcée).

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (passer par l'accueil sport de la mairie du Tampon).
- Email : Non trouvé — à compléter.
- Site web : Non trouvé — à compléter (pas de site dédié ; rattachement possible au portail de la Ville du Tampon). Page club La Tamponnaise : https://latamponnaise.footeo.com (non vérifiée — HTTP 403 lors du fetch).
- Réseaux sociaux : page Facebook « Stade Klébert-Picard - Le Tampon, Réunion » (facebook.com/profile.php?id=167041830070180) — existence repérée en recherche, contenu non vérifié.

## Horaires (object_opening)
- Plateau polyvalent : « ouvert 7j/7 – 24h/24 » (source RES via sportenfrance.fr).
- Piscine / bassins / autres installations encadrées (football, athlétisme, dojo, haltérophilie) : horaires d'ouverture au public et créneaux clubs Non trouvés — à compléter (dépendent des créneaux municipaux et associatifs ; à obtenir auprès de la mairie du Tampon).

## Tarifs (object_price)
- Accès aux plateaux extérieurs en libre accès : présumé gratuit (équipement public de plein air) — à confirmer.
- Piscine municipale : tarification d'entrée Non trouvée — à compléter (les piscines municipales du Tampon appliquent généralement un tarif d'entrée ; à confirmer auprès de la régie).
- Créneaux clubs / football / athlétisme : réservés aux associations (hors tarification grand public).

## Données spécifiques ASC (object_act)
- Activités proposées : football, futsal, basket-ball, volley-ball, beach-volley, judo, jujitsu, boxe, natation sportive, aquagym, baignade/loisirs, course sur piste (athlétisme), haltérophilie (source : ville-data / RES). 
- Publics : tous publics pour la piscine et les plateaux libres ; pratique encadrée par les clubs et associations pour les disciplines compétitives.
- Encadrement : pratique libre (plateaux, baignade selon surveillance) + encadrement associatif/club ; football de haut niveau régional avec La Tamponnaise. Détail des éducateurs / MNS / horaires surveillés Non trouvé — à compléter.
- Niveau / matériel requis : Non trouvé — à compléter.

## Équipements & services (object_amenity)
- Stade de football gazon naturel 100 × 60 m, éclairé, tribune 3 275 places.
- Piste d'athlétisme 400 m, 4 couloirs, surface stabilisée, éclairée.
- Piscine municipale (bassin sportif 25 m, ~6 couloirs) + bassin ludique 12,5 × 10 m.
- Dojo (50 m²), plateau polyvalent bitume 40 × 20 m, plateau basket 30 × 15 m, salle d'haltérophilie.
- Vestiaires : 4 vestiaires athlètes + 2 vestiaires arbitres/encadrants avec douches (par installation).
- Parking : 10 places (source RES) — capacité modeste, à vérifier.
- Accès en bus (source Wikipédia/sportenfrance).
- Buvette / snack, club-house, salles de réunion, locaux de rangement (annexes du stade).

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (selon régie piscine).
- Langues : Non trouvé — à compléter (français présumé ; équipement municipal).
- Accessibilité PMR : partielle. Le RES indique l'aire de jeu du stade accessible aux personnes à mobilité réduite, mais **PAS** l'accueil, les cheminements, douches, sanitaires, tribunes ni vestiaires, et pas d'accessibilité pour le handicap sensoriel (source repertoire-equipements-sportifs.fr). À confirmer pour la piscine et les autres installations.

## Labels & classements (object_classification)
- Aucun label touristique trouvé. Équipement recensé au Recensement national des équipements sportifs (RES — ministère des Sports), identifiants installation I974220087 / équipement E003I974220087, exploitant Commune du Tampon (gestion publique, sans délégation). Aucun label LBL_* applicable identifié.

## Médias suggérés
- Page Facebook « Stade Klébert-Picard » (photos potentielles) — NE PAS télécharger sans autorisation.
- Aucune photo officielle libre de droits identifiée. Médias à produire/obtenir auprès de la Ville du Tampon — NE PAS télécharger sans autorisation.

## Données manquantes / à vérifier
- Numéro de voie exact (57 vs 86 vs 86 bis rue Roland Garros) — sources divergentes.
- Téléphone, email, site web officiel, créneaux/horaires d'ouverture au public (piscine surtout).
- Tarifs piscine et conditions d'accès grand public.
- Altitude précise du site.
- Accessibilité PMR de la piscine et des plateaux (RES ne documente que le stade foot).
- Année de construction (1975 évoquée par une source secondaire ville-data, non corroborée — à confirmer).
- **Arbitrage OTI** : pertinence d'une fiche « attraction touristique » pour un complexe sportif municipal. Option recommandée : conserver en draft, valeur visiteur = piscine publique + city-stade ; sinon classer hors périmètre tourisme (équipement de service public).

## Sources
- Stade Klébert Picard — Wikipedia — https://en.wikipedia.org/wiki/Stade_Kl%C3%A9bert_Picard — consulté le 2026-06-26
- Complexe Klébert Picard, sportenfrance.fr (données RES : 8 installations, surfaces, vestiaires, accessibilité) — https://www.sportenfrance.fr/dom/reunion/tampon/974220046-complexe-klebert-picard — consulté le 2026-06-26
- Stade Klébert Picard (Terrain de football), repertoire-equipements-sportifs.fr (RES : commune Le Tampon INSEE 97422 — cf. chemin d'URL `/97422/le-tampon/`, GPS -21.2725/55.5219, propriétaire Commune du Tampon, accessibilité, gazon naturel, 3 275 places) — https://repertoire-equipements-sportifs.fr/france/la-reunion/la-reunion/97422/le-tampon/complexe-klebert-picard/stade-klebert-picard/e003i974220087.html — consulté le 2026-06-26
- Complexe Klébert Picard, ville-data.com (liste des activités, bassins) — https://ville-data.com/loisirs-sports/Complexe-klebert-picard/Le-Tampon/974-134741-97422 — consulté le 2026-06-26
- US Stade Tamponnaise / La Tamponnaise — Wikipedia (club résident, capacité 4 000, renommage 2014, 86 bis rue Roland Garros) — https://en.wikipedia.org/wiki/US_Stade_Tamponnaise — consulté le 2026-06-26
- Géocodage BAN — api-adresse.data.gouv.fr/search/?q=57+rue+Roland+Garros+Le+Tampon&citycode=97422 (lon 55.521786, lat -21.272868, score 0.976, citycode 97422) — consulté le 2026-06-26
