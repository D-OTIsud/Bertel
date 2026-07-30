# Cascade du Trou Noir — PNA (Site naturel / point d'intérêt)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Cascade du Trou Noir
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré (vérification SQL live du 2026-06-26)**. Aucun objet `PNA` n'existe en base (0 ligne), et aucun « Trou Noir » / « Grand Galet » / cascade ni bassin de la rivière Langevin comme site naturel. Les seuls homonymes Langevin sont des objets distincts (HLO `Lilie Location saisonnière Langevin`, ACT `Parc Piscicole de Langevin`, PRD `Terroir de Bras Sec Langevin`) ; les « Cascade »/« Bassin » en base sont tous des hébergements (HLO) ou un snack (RES `Snack Bar du Bassin Dinant`), pas le site naturel. Aucune action de dédoublonnage requise.

## Identité
- Catégorie / sous-type proposé : Site naturel — cascade / bassin de baignade en rivière (vallée de Langevin)
- Chapo : Bassin d'eau claire au pied d'une cascade dans un décor sauvage de la vallée de Langevin, accessible par un court sentier de 300 m depuis la route de Grand Galet, en aval de la célèbre cascade de Grand Galet (Langevin).

## Description
Le Trou Noir est un bassin de la rivière Langevin situé sur la commune de Saint-Joseph, en aval de la cascade de Grand Galet (Langevin) et environ 2 km avant celle-ci en remontant la route de Grand Galet. Le site se compose d'un large bassin alimenté par deux chutes : une cascade haute et fine sur la droite, un torrent plus tumultueux sur la gauche, dans un cadre très végétal et préservé. On y accède à pied par un petit sentier d'environ 300 m qui longe la rive droite après avoir traversé la passerelle, depuis le hameau du Grand Défriché. Le bassin est réputé pour la baignade (eau claire et fraîche) et est fréquenté par les pêcheurs de truites de la rivière Langevin. **Restriction importante :** la baignade dans la rivière Langevin entre La Passerelle et l'Embouchure — périmètre qui inclut ce bassin — était interdite par arrêté pour dégradation de la qualité de l'eau (constat ARS) au 13 février 2026, « jusqu'à nouvel ordre ». **Revérifié le 2026-07-30 :** interdiction TOUJOURS EN VIGUEUR — prélèvements ARS du 07/05/2026 jugés mauvais aux bassins Passerelle et Dinan, baignade et activités nautiques suspendues Passerelle↔Embouchure jusqu'à nouvel ordre ; aucune levée trouvée au 30/07/2026. S'ajoute un arrêté municipal du 11/04/2014 (toujours affiché « jusqu'à nouvel ordre » par la mairie) interdisant accès et baignade sur la portion parc piscicole ↔ point de vue de Grand Galet (risque de siphon) — portion qui inclut vraisemblablement le Trou Noir ; portée actuelle à confirmer auprès de la mairie.

## Adresse & localisation (object_location)
- Adresse : Sentier au départ du hameau du Grand Défriché, près de la passerelle (pont Bailay), route de Grand Galet
- Code postal / ville : 97480 Saint-Joseph (Langevin / Grand Défriché)
- GPS (WGS84) : **-21.3293, 55.6424** — source : point du bassin publié par Randopitons (POI 1120), consulté le 2026-06-26. Géocodage BAN de la voie d'accès (`api-adresse.data.gouv.fr`, citycode 97412) : « Chemin du Grand Defriche 97480 Saint-Joseph », coord. 55.642984 / -21.337015, **score 0,699**, type `street` — la voie pointe vers la route, pas vers le trailhead/bassin ; le reverse-geocode sur le point GPS du bassin renvoie une `FeatureCollection` vide (pas d'adresse BAN sur ce point de rivière, attendu pour un site naturel). Le point GPS Randopitons fait foi pour la localisation du bassin.
- Altitude : Non trouvé — à compléter (site en fond de vallée de Langevin ; valeur précise non confirmée par les sources)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel sans gestionnaire dédié ; renvoi possible vers l'OTI du Sud / mairie de Saint-Joseph)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site propre ; référencé sur reunion.fr et sudreuniontourisme.fr)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Accès libre, en journée (site naturel non gardé, pas d'horaires d'ouverture). **Réserve :** accès à la baignade soumis à l'arrêté d'interdiction en vigueur sur la rivière Langevin (qualité de l'eau ; constat ARS, en cours au 13/02/2026) — à revérifier à la date d'import. Stationnement signalé difficile, surtout le week-end (anciennes aires de part et d'autre du pont murées/condamnées depuis 2011).

## Tarifs (object_price)
Gratuit — site naturel en accès libre, aucune billetterie ni droit d'entrée.

## Données spécifiques PNA
PNA = pas de table de facette type-spécifique (classifications / labels génériques uniquement). Données de fréquentation à titre indicatif (sentier d'accès, non un object_iti) :
- Distance d'accès : ~300 m (aller, depuis le stationnement/la passerelle)
- Durée d'accès : ~15-20 min à pied l'aller (Randopitons « tourisme » indique 45 min A/R)
- Type : aller-retour, court sentier le long de la rive droite
- Difficulté : facile / « courte randonnée obligatoire » (Randopitons) ; rochers très mouillés et glissants, sentier parfois encombré de branches tombées
- Balisage : Non trouvé — à compléter (sentier non balisé décrit comme « petit sentier »)
- Nature du site : bassin de baignade + double cascade en rivière (vallée de Langevin)

## Équipements & services (object_amenity)
- Parking : pas de parking dédié ; stationnement le long de la rivière près du Grand Défriché, difficile le week-end (aires murées/condamnées depuis 2011) — source petitedecouverte / Randopitons
- Sanitaires : Non trouvé — à compléter (probablement aucun)
- Restauration : Non trouvé — à compléter (aucune sur site)
- Accès transport : desserte bus possible — ligne 76 depuis la gare routière de Saint-Joseph, arrêt « Le Trou Noir ST-JOSEPH » (source petitedecouverte, à reconfirmer auprès du réseau Alternéo/CASUD)
- Baignade : bassin de baignade (sous réserve de l'arrêté en vigueur) ; saut/plongeon pratiqués par certains visiteurs — à signaler comme à risque (rochers glissants, eau froide, proximité de la chute de droite)

## Paiement / langues / accessibilité
- Moyens de paiement : Sans objet (site gratuit)
- Langues : Sans objet (site naturel non encadré)
- Accessibilité PMR : Non trouvé — à compléter ; vraisemblablement non adapté (traversée de rivière/passerelle + sentier rocheux glissant)

## Labels & classements (object_classification)
Aucun trouvé. Site naturel sans label revendiqué ; aucune classification LBL_* applicable identifiée dans les sources consultées.

## Médias suggérés
- Page officielle IRT : https://en.reunion.fr/offers/la-cascade-de-trou-noir-saint-joseph-en-6056801/ (photos officielles — NE PAS télécharger sans autorisation)
- Randopitons POI 1120 et fiche tourisme 121 (photos — NE PAS télécharger sans autorisation)
- petitedecouverte.fr/trounoir974 (galerie photos — NE PAS télécharger sans autorisation)
> Aucune image ne doit être réutilisée sans accord explicite de l'ayant droit.

## Données manquantes / à vérifier
- Altitude exacte du bassin
- Coordonnées GPS de précision à confirmer sur le terrain (point Randopitons retenu ; pas d'adresse BAN exploitable sur le bassin)
- Statut juridique exact de la baignade à la date d'import (arrêté Passerelle↔Embouchure « jusqu'à nouvel ordre » au 13/02/2026 — confirmer s'il est levé)
- Existence/portée d'un arrêté municipal spécifique « Trou Noir » de 2011 (mentionné par une source secondaire, non sourcé sur l'arrêté lui-même)
- Confirmation de la desserte bus (ligne 76 / arrêt « Le Trou Noir ») auprès du réseau CASUD/Alternéo
- Conditions de stationnement actuelles (aires de 2011 toujours condamnées ?)
- Gestionnaire / référent du site (mairie de Saint-Joseph, ONF, OTI du Sud ?)

## Sources
- La Cascade de Trou Noir (Saint-Joseph) — Île de La Réunion Tourisme — https://en.reunion.fr/offers/la-cascade-de-trou-noir-saint-joseph-en-6056801/ — consulté le 2026-06-26
- La Cascade de Trou Noir au-dessus de Langevin (POI 1120) — Randopitons — https://randopitons.re/poi/1120-cascade-trou-noir-dessus-langevin — consulté le 2026-06-26
- Cascade du Trou Noir (tourisme 121) — Randopitons — https://randopitons.re/tourisme/121-cascade-trou-noir — consulté le 2026-06-26
- Cascade du Trou Noir à Saint-Joseph — guide-reunion.fr — https://guide-reunion.fr/cascade-du-trou-noir/ — consulté le 2026-06-26
- Cascade du Trou Noir à St-Joseph — petitedecouverte.fr — https://www.petitedecouverte.fr/trounoir974/ — consulté le 2026-06-26
- Saint-Joseph : interdiction de baignade à Langevin (qualité de l'eau, Passerelle↔Embouchure) — Imaz Press, 13/02/2026 — https://imazpress.com/toute-l-actu/saint-joseph-interdiction-de-baignade-a-langevin — consulté le 2026-06-26
- Géocodage BAN voie d'accès « Chemin du Grand Defriche » (score 0,699, citycode 97412) — Base Adresse Nationale — https://api-adresse.data.gouv.fr/search/?q=Grand+Defriche+Saint-Joseph&citycode=97412 — consulté le 2026-06-26
