# Manapany-les-Bains — VIL (Village / Quartier remarquable)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : Manapany-les-Bains
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). Les seuls homonymes en base sont des hébergements/restaurants distincts du quartier littoral (HLO « Manapany Lodge », « Manapany Team », « Villas Manapany », « Les Terrasses de Manapany - Studio Vacoa / Villa Moringa », RES « CAP MANAPANY ») — ce sont des établissements situés à Manapany, PAS le site/village lui-même. Aucun objet `VIL` n'existe en base. Le « Manapany Festival » (événement annuel sur ce site) n'est PAS en base non plus : il pourra faire l'objet d'une fiche `FMA` distincte ultérieure, rattachée à ce VIL par `object_relation`. Action recommandée : créer le VIL ; relier les HLO/RES de Manapany à ce VIL via une relation de localisation (`based_at_site`-équivalent) lors d'une passe ultérieure.

## Identité
- Catégorie / sous-type proposé : village / quartier littoral remarquable de Saint-Joseph (bord de mer, bassin de baignade naturel, biodiversité endémique). Lieu-dit balnéaire du Sud Sauvage.
- Chapo : Petit coin charmant en bord de mer sur la côte sud de Saint-Joseph, Manapany-les-Bains réunit un bassin de baignade d'eau de mer creusé dans la roche basaltique, un littoral rocheux sauvage et le célèbre gecko vert de Manapany, lézard endémique unique au monde.

## Description
Manapany-les-Bains est un quartier balnéaire du littoral sud de Saint-Joseph, dont le nom — d'origine malgache — est souvent traduit par « chauve-souris » ou « lieu qui émerveille » (selon l'OTI du Sud). Ancien débarcadère du XIXᵉ siècle, le site est aujourd'hui réputé pour son bassin de baignade : une piscine d'eau de mer aménagée dans la roche basaltique, bordée de rochers, qui permet de se baigner à l'abri de la houle. Le site est célèbre pour abriter le gecko vert de Manapany (*Phelsuma inexpectata*), petit lézard diurne vert pomme tacheté de rouge, espèce endémique de La Réunion classée en danger critique d'extinction par l'UICN et protégée au niveau national, dont l'aire de répartition extrêmement réduite se concentre autour de Manapany ; des panneaux didactiques près de l'office de tourisme expliquent ses caractéristiques. Le quartier conserve aussi les ruines d'un ancien four à chaux (lié au blanchiment du sucre de canne). Manapany-les-Bains accueille chaque année en septembre le Manapany Festival, l'un des plus anciens festivals de musique de l'île (créé en 2001). ATTENTION baignade (mis à jour 2026-07-30) : la baignade est autorisée dans le bassin aménagé UNIQUEMENT (jamais dans la baie — risque requin, signalé sur site). Le bassin a été réaménagé et rouvert en avril 2023 ; il connaît depuis des fermetures/réouvertures ponctuelles par arrêté MUNICIPAL de Saint-Joseph (qualité d'eau, observation d'un serpent marin) — réouvertures constatées le 13/12/2024, le 03/01/2025 et le 13/02/2026 (presse locale linfo.re / imazpress / la1ere). Le statut est donc dynamique : consulter l'affichage municipal sur site ; ne pas affirmer « baignade interdite » en permanence dans la fiche publiée.

## Adresse & localisation (object_location)
- Adresse : Manapany-les-Bains (front de mer / bassin), accès par la RN2 puis descente vers le village ; aire belvédère de la Grande Corniche sur la RN2 en surplomb
- Code postal / ville : 97480 Saint-Joseph (commune INSEE 97412 — confirmé par géocodage BAN citycode 97412 ; 97480 est le code POSTAL de Saint-Joseph, ne pas confondre avec l'INSEE)
- GPS (WGS84) : -21.378092, 55.599474 — source : géocodage BAN (api-adresse.data.gouv.fr) de « Rue François Martin Manapany », type=street, score 0.69, citycode 97412 (= Saint-Joseph confirmé). Point de référence du quartier ; les coordonnées exactes du bassin/front de mer restent à affiner sur le terrain (env. -21.378, 55.594 indiqué dans la demande — écart d'environ 500 m en longitude avec le résultat BAN, à arbitrer)
- Altitude : Non trouvé — à compléter (site de bord de mer, proche du niveau 0 m ; belvédère Grande Corniche plus haut sur la RN2)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel/public ; à défaut, contact OTI du Sud / bureau d'information touristique de Saint-Joseph)
- Email : Non trouvé — à compléter
- Site web : page OTI du Sud — https://www.sudreuniontourisme.fr/tresors-du-sud/manapany-les-bains.html ; page IRT — https://www.reunion.fr/planifier/a-voir-a-faire/lieux-remarquables/site-de-manapany-les-bains-586335
- Réseaux sociaux : Non trouvé — à compléter (le Manapany Festival dispose d'un site dédié manapanyfestival.com, à ne pas confondre avec le site VIL)

## Horaires (object_opening)
Site naturel/public de plein air en accès libre — ouvert en permanence (pas d'horaires de fermeture connus). Fréquentation forte en été austral et pendant les vacances scolaires ; plus calme tôt le matin et en semaine. Horaires d'éventuels services (restaurant, surveillance baignade) : Non trouvé — à compléter.

## Tarifs (object_price)
Site naturel en accès libre et gratuit (bassin, front de mer, belvédère). Stationnement gratuit mentionné par plusieurs sources. Aucun droit d'entrée. (Le Manapany Festival, événement distinct, peut avoir sa propre tarification — hors périmètre de cette fiche VIL.)

## Données spécifiques VIL
Type VIL = village / quartier remarquable : pas de table facette type-spécifique (`object_iti`/`object_fma`/`object_act`/`object_room_type`…). Les attributs se portent via classifications/labels génériques, médias, localisation et relations.
- Éléments patrimoniaux / d'intérêt du quartier (à modéliser en sous-lieux `object_place` ou en relations) :
  - Bassin de baignade d'eau de mer creusé dans la roche basaltique (élément emblématique)
  - Belvédère / point de vue du Chemin des Anglais (vue plongeante sur la baie et le bassin, accessible à pied env. 5 min depuis le parking — source OTI Sud / monnuage) et aire belvédère de la Grande Corniche sur la RN2
  - Ruines de l'ancien four à chaux (XIXᵉ, blanchiment du sucre)
  - Habitat du gecko vert de Manapany (*Phelsuma inexpectata*) — vacoas (*Pandanus utilis*) ; panneaux didactiques près de l'OT
  - Balade littorale « Ti Sable » (côte rocheuse, falaises) mentionnée par l'OTI du Sud
- Intérêt biodiversité : espèce phare endémique protégée, en danger critique (UICN) — argument de découverte naturaliste majeur.

## Équipements & services (object_amenity)
- Parking : petit parking gratuit situé juste au-dessus du bassin (source OTI Sud / monnuage / jumbocar)
- Restauration : un restaurant/snack à proximité pour se rafraîchir (source OTI Sud / monnuage) — établissement(s) tiers, à identifier
- Sanitaires / toilettes : Non trouvé — à compléter
- Accès : par la RN2 (axe Saint-Pierre ↔ Saint-Joseph) puis descente au village de Manapany ; belvédère depuis la RN2
- Surveillance baignade / poste de secours : Non trouvé — à compléter (à vérifier au regard du statut réglementaire de la baignade)
- Panneaux d'information (gecko) : oui, à proximité de l'office de tourisme

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (site gratuit) ; pour le restaurant tiers, Non trouvé — à compléter
- Langues : Non trouvé — à compléter (site public ; documentation OTI en FR, page IRT en EN existante)
- Accessibilité PMR : Non trouvé — à compléter (littoral rocheux et sentiers ; accessibilité du bassin et du belvédère du Chemin des Anglais à vérifier sur le terrain)

## Labels & classements (object_classification)
Aucun label touristique revendiqué trouvé pour le site lui-même. À noter (hors classification touristique) : présence d'une espèce protégée au titre du Plan National d'Actions (PNA) « geckos verts de La Réunion » (DEAL Réunion) — enjeu de protection réglementaire, pas un label `LBL_*`. Aucun mapping `LBL_*` proposé.

## Médias suggérés
- Photo de couverture du site sur la page OTI du Sud : https://www.sudreuniontourisme.fr/tresors-du-sud/manapany-les-bains.html (NE PAS télécharger sans autorisation de l'OTI du Sud)
- Photothèque IRT — page du site : https://www.reunion.fr/planifier/a-voir-a-faire/lieux-remarquables/site-de-manapany-les-bains-586335 (NE PAS télécharger sans autorisation)
- Illustrations du gecko vert : page Parcs nationaux de France / Wikipédia (vérifier la licence avant tout usage ; NE PAS télécharger sans autorisation)

## Données manquantes / à vérifier
- Coordonnées GPS exactes du bassin / front de mer (le point BAN « Rue François Martin Manapany » -21.378092, 55.599474 est un point de quartier ; à recaler sur le bassin ; écart ~500 m avec l'estimation -21.378, 55.594 de la demande à arbitrer)
- Altitude
- ~~STATUT RÉGLEMENTAIRE DE LA BAIGNADE~~ RÉSOLU 2026-07-30 : bassin rouvert depuis avril 2023, autorisé en régime normal avec fermetures ponctuelles par arrêté municipal (dernière réouverture constatée 13/02/2026) ; rédiger la fiche avec un statut « dynamique, voir affichage sur site »
- Sanitaires, surveillance/poste de secours, accessibilité PMR
- Coordonnées de contact dédiées (téléphone/email) — probablement via OTI du Sud
- Identification du/des restaurant(s) de proximité (objets RES distincts à relier)
- Surface / délimitation précise du quartier ; éventuel zonage Conservatoire du littoral
- Localisation précise des ruines du four à chaux et du belvédère du Chemin des Anglais (sous-lieux `object_place`)

## Sources
- Manapany-les-Bains — Offices de tourisme du Sud (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/manapany-les-bains.html — consulté le 2026-06-26
- Site de Manapany-les-Bains (Saint-Joseph) — Île de la Réunion Tourisme (IRT) — https://www.reunion.fr/planifier/a-voir-a-faire/lieux-remarquables/site-de-manapany-les-bains-586335 — consulté le 2026-06-26
- Plage / bassin de Manapany-les-Bains — Guide-Réunion — https://guide-reunion.fr/plage-manapany-les-bains/ — consulté le 2026-06-26
- Manapany-les-Bains : baignade et balade en 2026 — Jumbo Car Réunion — https://www.jumbocar-reunion.com/que-faire-reunion/plages/manapany-les-bains — consulté le 2026-06-26
- Lézard vert de Manapany (*Phelsuma inexpectata*) — Wikipédia — https://fr.wikipedia.org/wiki/L%C3%A9zard_vert_de_Manapany — consulté le 2026-06-26
- Le gecko vert de Manapany — Parcs nationaux de France — https://www.parcsnationaux.fr/fr/des-connaissances/biodiversite/faune-emblematique/les-reptiles/le-gecko-vert-de-manapany — consulté le 2026-06-26
- Manapany Festival à Saint-Joseph — Ville de Saint-Joseph / Routard Agenda — https://saintjoseph.re/Manapany-festival-Edition-bloc — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr) « Manapany » citycode 97412 — https://api-adresse.data.gouv.fr/search/?q=Manapany&citycode=97412 — consulté le 2026-06-26
