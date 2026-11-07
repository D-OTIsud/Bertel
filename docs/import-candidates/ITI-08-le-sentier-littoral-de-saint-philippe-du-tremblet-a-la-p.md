# Le sentier littoral de Saint-Philippe, du Tremblet à la Pointe de la Table — ITI (Itinéraire de randonnée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ITI
- name : Le sentier littoral de Saint-Philippe, du Tremblet à la Pointe de la Table
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré (vérification SQL live du 2026-06-26)**. La recherche `public.object` sur `name ILIKE '%littoral%' / '%tremblet%' / '%pointe de la table%' / '%mare longue%' / '%sentier%'` ne renvoie rien ; le seul objet de type ITI en base est `ITIRUN00000001BD` (« test iti », draft). **Distinction à noter** : il existe une fiche candidate sœur `pna-pointe-de-la-table-jardin-volcanique-coulee-2007.md` (le SITE = PNA, point de coulée à pied du Puits Arabe) ; la présente fiche est l'**itinéraire linéaire** Tremblet → Pointe de la Table le long de la côte (objet de type ITI, pas le site). Action recommandée à l'import : créer l'ITI distinct, puis poser une `object_relation` (rôle `passe_par` / `mène_à`) vers la PNA Pointe de la Table si cette dernière est aussi importée — ne PAS fusionner (un trajet ≠ un lieu).

## Identité
- Catégorie / sous-type proposé : Randonnée pédestre — sentier littoral côtier (côte sauvage du Sud), parcours linéaire en aller-simple (retour conseillé en bus) ou aller-retour partiel.
- Chapo : Une marche de bord de mer entre vacoas et filaos, le long des falaises de basalte noir du Sud sauvage, de la Pointe du Tremblet aux coulées de lave de la Pointe de la Table.

## Description
Le sentier littoral de Saint-Philippe suit la côte volcanique entre la zone marine de Saint-Philippe (Mare Longue) et le Vieux Port du Tremblet, en longeant les falaises basaltiques du Sud sauvage. Plusieurs sentiers parallèles permettent de varier le parcours, soit à l'ombre des filaos et des vacoas, soit au ras de l'océan sur l'herbe (source Randopitons). L'itinéraire traverse la Pointe de la Table, cap formé par les coulées de lave du Piton de la Fournaise lors de l'éruption exceptionnelle de 1986 — coulées qui ont agrandi l'île de plusieurs hectares (chiffre « ~25 ha » fréquemment cité localement, non confirmé par une source primaire — à vérifier) — et longe également la coulée de 2007. Le parcours passe par des points remarquables : la plage de la Mer Cassée, le monument du naufrage du Warren Hastings (1897), l'épave du Tresta Star (visible depuis le sentier) et le sable doré-vert (olivine) du Vieux Port (sources Randopitons, sudreuniontourisme.fr). Le balisage est rare (anciennes balises bleues effacées par le temps) ; le sentier reste lisible au sol par le passage. Le tronçon entre Pointe du Tremblet et Pointe de la Table demande environ 3 h aller-retour.

## Adresse & localisation (object_location)
- Adresse : Départ ouest — parking de Mare Longue, à proximité du restaurant/snack « La Mer Cassée », 101 RN2 Mare Longue, Saint-Philippe (source Petit Futé / restaurants-de-france.fr). Départ/arrivée est — RF (route forestière) du Vieux Port, Le Tremblet, Saint-Philippe (source Randopitons).
- Code postal / ville : 97442 Saint-Philippe (commune INSEE 97417)
- GPS (WGS84) :
  - Départ ouest (Mare Longue) : **-21.361143, 55.754820** — source : géocodage BAN api-adresse.data.gouv.fr, requête « Mare Longue Saint-Philippe », citycode 97417, score 0,946 (type « street »).
  - Extrémité est (Le Tremblet) : **-21.307323, 55.801479** — source : géocodage BAN api-adresse.data.gouv.fr, requête « Le Tremblet Saint-Philippe », citycode 97417, score 0,776 (type « street »).
  - NB : géocodage d'adresses/lieux-dits, pas de la tête de sentier précise. Le tracé GPX/KML officiel du Parc national (trek id 24779) existe (`randotectec.reunion-parcnational.fr/.../...kml`) mais n'a pas pu être lu (certificat TLS non vérifiable au 2026-06-26) — à récupérer pour le tracé `object_iti.geom`.
- Altitude : altitude min ~7 m / max ~136 m (source Randopitons, plage d'altitude du tronçon Mare Longue–Tremblet). Point de RDV au niveau de la mer côté Vieux Port.

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (objet « site naturel/itinéraire » sans gestionnaire commercial direct ; le sentier relève du domaine littoral / Parc national)
- Email : Non trouvé — à compléter
- Site web : Fiche officielle Parc national de La Réunion (Rando Tec Tec) — https://randotectec.reunion-parcnational.fr/itineraire/le-sentier-littoral-de-saint-philippe-du-tremblet-a-la-pointe-de-la-table/
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Accès libre, toute l'année, en journée (site naturel non gardé). Non trouvé — à compléter pour d'éventuelles restrictions (alerte volcanique / éruption Piton de la Fournaise, fermetures préfectorales du secteur en cas d'activité). Recommandation des sources : partir tôt si un aller-retour est prévu.

## Tarifs (object_price)
**Gratuit** — sentier en accès libre (site naturel littoral). À titre indicatif, une sortie accompagnée par un accompagnateur en montagne diplômé d'État sur cet itinéraire est proposée par des prestataires privés à ~50 € / personne, max 8 pers./guide (source Esprit Randonnée) — il s'agit d'une prestation tierce, pas d'un tarif du sentier lui-même.

## Données spécifiques ITI (object_iti)
- Distance : **~13,4 km** (Mare Longue → Le Tremblet, aller-simple ; source Randopitons & Parc national). Version courte « tronçon Tremblet ↔ Pointe de la Table » : ~3 h aller-retour ; un autre relevé donne ~6,8 km / +158 m pour Saint-Philippe → Le Tremblet.
- Dénivelé positif : **+160 m** (Parc national / Randopitons) ; Esprit Randonnée indique +150 m / -150 m.
- Dénivelé négatif : ~-150 m (Esprit Randonnée) — à confirmer
- Durée : **3 h à 5 h** selon variante (5 h pour l'aller-simple complet Mare Longue→Tremblet, Randopitons ; ~4 h 30 sortie accompagnée, Esprit Randonnée ; ~3 h aller-retour pour le seul tronçon Tremblet–Pointe de la Table)
- Difficulté : **Facile à moyenne** (« Moyen » Randopitons ; « tranquille » Esprit Randonnée) — terrain pouvant être très humide, herbe glissante, échelles, passerelles bois, marches hautes, passages rocheux et boueux.
- Type : **Aller-simple (point-à-point)**, retour conseillé en bus (réseau Car Jaune / lignes du Sud) ; praticable en aller-retour partiel sur le tronçon Tremblet–Pointe de la Table. Une **boucle balisée de ~2 km** existe localement autour de la Pointe de la Table (balisage céramique, accès depuis le Puits Arabe).
- Balisage : **Rare / bleu effacé** sur le sentier littoral (anciennes balises) ; sentier lisible par le passage. La boucle de la Pointe de la Table est, elle, balisée (céramique). À vérifier : classement PR (« La Pointe de la Table — PR 13 » évoqué par la FFRandonnée Réunion, page non consultable au 2026-06-26).
- Géométrie / tracé : GPX/KML officiel disponible (Parc national, trek 24779) — à importer pour `object_iti.geom` (non lu : certificat TLS).

## Équipements & services (object_amenity)
- Parking : oui — parking de Mare Longue (près du snack La Mer Cassée) côté ouest ; grand parking du Puits Arabe (proche kiosques) côté Pointe de la Table.
- Sanitaires : toilettes publiques présentes au secteur Puits Arabe / Pointe de la Table (kiosques + panneaux didactiques — source sudreuniontourisme.fr) ; aucune sur le reste du linéaire.
- Restauration : restaurant/snack « La Mer Cassée » au départ ouest (Mare Longue) ; aucune en cours de sentier.
- Aires de pique-nique / kiosques : oui, secteur Puits Arabe / Pointe de la Table.
- Eau potable : Non trouvé — à compléter (prévoir 1,5 à 3 L d'eau selon les sources, exposition solaire forte).

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : Non trouvé — à compléter (signalétique du Parc national généralement FR)
- Accessibilité PMR : **Non adapté PMR** — terrain naturel, échelles, marches hautes, passerelles, sol irrégulier et glissant. (La courte boucle de la Pointe de la Table sur plate-forme basaltique est plus accessible mais non labellisée à notre connaissance.) À confirmer.

## Labels & classements (object_classification)
- Aucun label revendiqué confirmé. Itinéraire intégré au réseau du **Parc national de La Réunion** (fiche officielle Rando Tec Tec). Classement FFRandonnée « PR 13 » possible pour le secteur Pointe de la Table — **à vérifier** (page FFRandonnée Réunion inaccessible au 2026-06-26). Pas de mapping LBL_* à ce stade.

## Médias suggérés
- Photos officielles sur la fiche Parc national (Rando Tec Tec) : https://randotectec.reunion-parcnational.fr/itineraire/le-sentier-littoral-de-saint-philippe-du-tremblet-a-la-pointe-de-la-table/ — **NE PAS télécharger sans autorisation** (droits Parc national).
- Galerie AllTrails « Sentier Littoral de Saint-Philippe à Le Tremblet » (65 photos) : https://www.alltrails.com/fr/randonnee/reunion/saint-pierre/sentier-littoral-de-saint-philippe-a-le-tremblet — **NE PAS télécharger sans autorisation** (droits contributeurs).
- Photo libre à fournir par l'OTI du Sud / shooting propre recommandé.

## Données manquantes / à vérifier
- Tracé GPX/KML officiel (Parc national trek 24779) pour `object_iti.geom` — non récupéré (certificat TLS non vérifiable) ; à télécharger via le KML : `randotectec.reunion-parcnational.fr/data/api/fr/treks/24779/...kml`.
- Coordonnées GPS exactes des têtes de sentier (les valeurs reportées sont des géocodages de lieux-dits, scores 0,77–0,95).
- Dénivelé négatif exact, et arbitrage durée/distance entre version « aller-simple complet » (13,4 km / 5 h) et « tronçon Tremblet–Pointe de la Table » (~3 h A/R).
- Classement PR (PR 13 ?) et type de balisage officiel actuel.
- Éventuelles restrictions d'accès liées à l'activité volcanique du Piton de la Fournaise (arrêtés préfectoraux).
- **ALERTE FERMETURES (réévaluation web du 2026-07-30)** : des fermetures préfectorales/ONF touchent le secteur en 2025-2026 — le « Sentier du Vieux Port du Tremblet » figure dans la liste des sentiers FERMÉS (werun.world/la-reunion/sentiers-fermes, référencée à l'arrêté n° 2026-279 du 4 mars 2026) et la RF du Vieux Port du Tremblet a été fermée aux piétons (travaux forestiers, prolongée jusqu'à fin janvier 2026 — zinfos974). guide-reunion.fr signalait le sentier littoral de Saint-Philippe fermé à la circulation SAUF le sentier d'interprétation de la Pointe de la Table. ⇒ L'accès est/l'aller-simple complet est compromis ; vérifier l'état d'ouverture ONF/préfecture AVANT publication (le tronçon Puits Arabe ↔ Pointe de la Table reste le plus sûr à promouvoir).
- Eau potable, langues de signalétique, état d'entretien à jour (un commentaire de janv. 2025 signale échelles en place et tronçons dégagés — à reconfirmer terrain).
- Gestionnaire/contact officiel (Parc national, mairie de Saint-Philippe, ONF pour les RF).
- Liaison retour bus (ligne / arrêts exacts au Tremblet et à Mare Longue).

## Sources
- De Mare Longue au Tremblet par le sentier littoral — Randopitons — https://randopitons.re/randonnee/1435-sentier-littoral-saint-philippe-tremblet — consulté le 2026-06-26
- Le sentier littoral de Saint-Philippe, du Tremblet à la Pointe de la Table — Parc national de La Réunion (Rando Tec Tec) — https://randotectec.reunion-parcnational.fr/itineraire/le-sentier-littoral-de-saint-philippe-du-tremblet-a-la-pointe-de-la-table/ — consulté le 2026-06-26 (page indexée ; certificat TLS non vérifiable au fetch)
- Littoral Saint-Philippe — Esprit Randonnée — https://espritrandonnee.re/project/littoral-saint-philippe/ — consulté le 2026-06-26
- La côte sauvage — Offices de tourisme du Sud (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/la-cote-sauvage.html — consulté le 2026-06-26
- Le circuit de la Pointe de la Table et des coulées de 1986 — Randopitons — https://randopitons.re/randonnee/1061-circuit-pointe-table-coulees-1986 — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr), requêtes « Mare Longue Saint-Philippe » (score 0,946) et « Le Tremblet Saint-Philippe » (score 0,776), citycode 97417 — consulté le 2026-06-26
- La Mer Cassée (départ ouest), 101 RN2 Mare Longue, Saint-Philippe 97442 — Petit Futé / restaurants-de-france.fr — consulté le 2026-06-26
