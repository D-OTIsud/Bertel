# Florilèges du Tampon — FMA (Fête / manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Florilèges du Tampon
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `object` — recherche `%floril%`, `%cambiaire%`, `%tampon%fleur%`, `%fete%fleur%` → 0 ligne). Aucune occurrence non plus dans la liste « déjà proposé » (les fêtes candidates existantes sont Miel Vert, Fête du Vacoa, Fête du Choca — toutes distinctes). Action recommandée : créer la fiche.

## Identité
- Catégorie / sous-type proposé : Grand événement annuel / fête florale, foire commerciale et fête foraine (manifestation municipale d'envergure régionale).
- Chapo : Les Florilèges du Tampon sont la plus grande fête des fleurs de La Réunion et de l'océan Indien. Chaque mois d'octobre, pendant une dizaine de jours, la « cité des fleurs » accueille expositions horticoles, foire commerciale, animations, fête foraine et concerts.

## Description
Les Florilèges sont une manifestation florale et commerciale créée en 1983 par la commune du Tampon, devenue l'un des événements emblématiques de l'île. La fête se déploie chaque année en octobre, pendant les vacances scolaires de la zone, sur une dizaine de jours et autour de trois pôles : le Parc Jean de Cambiaire (vitrine de l'horticulture péi, expositions et vente de fleurs et plantes, ateliers, mini-scène et élection de Miss/Mister Ville du Tampon), la rue Hubert-Delisle au centre-ville (foire commerciale piétonne, stands de marché) et le secteur du SIDR des 400 (fête foraine, manèges et grande scène de concerts en soirée). En 2025, la 41e édition s'est tenue du 10 au 19 octobre sur le thème de l'embellissement et du bien-être, et a réuni, selon la presse locale, près de 300 000 personnes. La manifestation est organisée par la Ville du Tampon.

## Adresse & localisation (object_location)
- Adresse : Parc Jean de Cambiaire, centre-ville (à côté de l'église), rue Hubert-Delisle ; pôle fête foraine / grande scène au SIDR des 400.
- Code postal / ville : 97430 Le Tampon
- GPS (WGS84) : -21.270007, 55.521245 (Rue Jean de Cambiaire) — source : géocodage BAN (api-adresse.data.gouv.fr) de « Parc Jean de Cambiaire Le Tampon », citycode 97422, type=street, score 0.71 ; coordonnées du tableau renvoyées en [lon=55.521245, lat=-21.270007]. Point approximatif au niveau de la rue/du parc (le géocodeur ne renvoie pas le polygone du parc lui-même) → à affiner sur le terrain. À titre indicatif, centre rue Hubert-Delisle : -21.275652, 55.514505 (BAN, score 0.79).
- Altitude : ~550 m (Le Tampon centre, ordre de grandeur) — Non confirmé par source géo précise — à compléter.

## Contacts (object_contact)
- Téléphone : 0262 57 86 86 (Ville du Tampon — service événementiel ; source letampon.fr) — à confirmer comme contact public dédié à l'événement.
- Email : Non trouvé — à compléter.
- Site web : https://letampon.fr/evenements/les-florileges/
- Réseaux sociaux : pages de la Ville du Tampon (Facebook « Ville du Tampon ») — URL exacte de la page événement : Non trouvé — à compléter.

## Horaires (object_opening)
- Période : annuel, mois d'octobre (≈ 10 jours, calé sur les vacances scolaires d'octobre). Édition 2025 : du 10 au 19 octobre 2025 (41e édition).
- Horaires (édition 2025, source letampon.fr) :
  - Parc floral (Jean de Cambiaire) et zone centre-ville / foire : 9 h 00 – 18 h 00.
  - Fête foraine (SIDR des 400) : 13 h 00 – 23 h 30.
- Dates de l'édition 2026 : du vendredi 9 au dimanche 18 octobre 2026 (source : appel à candidatures officiel Ville du Tampon, letampon.fr, publié le 2026-07-23 ; pôle SIDR 400 / place de la Libération confirmé). Vérifié le 2026-07-30.

## Tarifs (object_price)
Source : letampon.fr / guide-reunion.fr, édition 2025 :
- Parc floral : 2 € (gratuit pour les enfants de moins de 1,30 m).
- Fête foraine : 2 € (gratuit pour les enfants de moins de 1,30 m, hors concerts).
- Zone centre-ville / foire commerciale : accès gratuit.
- Concerts : payants, fourchette 2 € à 20 € selon les soirées (source guide-reunion.fr).
- Gratuité PMR + un accompagnant sur présentation de la carte d'invalidité.
- Tarifs susceptibles d'évoluer d'une édition à l'autre — à revalider à chaque édition.

## Données spécifiques FMA (object_fma)
- event_start_date / event_end_date : édition 2026 = 2026-10-09 → 2026-10-18 (source officielle letampon.fr, vérifié 2026-07-30). Édition 2025 = 2025-10-10 → 2025-10-19.
- event_start_time / event_end_time : variable selon le pôle (parc 09:00–18:00 ; fête foraine 13:00–23:30). À modéliser via les horaires plutôt que des heures uniques.
- is_recurring : true.
- recurrence_pattern : annuel, au mois d'octobre (pendant les vacances scolaires d'octobre), durée ≈ 10 jours. Première édition : 1983. Édition 2025 = 41e.
- Lieux de l'occurrence (multi-sites) : Parc Jean de Cambiaire ; rue Hubert-Delisle (centre-ville) ; SIDR des 400 (fête foraine + grande scène).
- Programme-type : expositions et ventes horticoles, ateliers (composition florale, bouturage, tableaux de fleurs), élection Miss/Mister Ville du Tampon, Foulée/Foulées des Florilèges (course à pied, autour du stade Klébert Picard), foire commerciale, fête foraine, concerts d'artistes locaux et nationaux. (Programme détaillé variable chaque année.)

## Équipements & services (object_amenity)
- Restauration : oui (stands de restauration, food trucks sur la zone foraine) — source presse/officielle.
- Sanitaires : probables (événement municipal de masse) — Non confirmé explicitement — à compléter.
- Parking : Non trouvé — à compléter (centre-ville ; stationnement et navettes à vérifier ; la page « Infos pratiques » historique mentionnait des dispositifs mais n'a pas pu être consultée — 404).
- Accès : centre-ville du Tampon, zones piétonnes pendant l'événement.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (entrées à 2 € ; mode de règlement non précisé).
- Langues : français (créole réunionnais d'usage) — autres langues Non trouvé.
- Accessibilité PMR : gratuité PMR + un accompagnant (carte d'invalidité) confirmée pour 2025 ; accessibilité physique des sites Non trouvé — à compléter.

## Labels & classements (object_classification)
Aucun label touristique formel trouvé (l'événement n'est pas un établissement classé). « Plus grande et plus belle fête des fleurs de l'île et de l'océan Indien » est une formule de communication municipale, non un label → ne pas mapper en LBL_*.

## Médias suggérés
- Visuels et affiches officiels sur https://letampon.fr/evenements/les-florileges/ (NE PAS télécharger sans autorisation de la Ville du Tampon).
- Photos de presse sur imazpress.com, zinfos974.com, linfo.re (NE PAS télécharger sans autorisation des ayants droit).
- Recommandation : solliciter le service communication de la Ville du Tampon pour des visuels libres de droits.

## Données manquantes / à vérifier
- Dates exactes de l'édition 2026 (et mécanisme de mise à jour annuelle).
- Email et page réseaux sociaux dédiés à l'événement.
- Adresse postale/point GPS précis de chacun des trois pôles (en particulier SIDR des 400 et emprise exacte du Parc Jean de Cambiaire).
- Altitude exacte.
- Parking, navettes, sanitaires, plan de circulation.
- Moyens de paiement aux entrées.
- Accessibilité physique détaillée des sites (PMR au-delà de la gratuité).
- Confirmation du téléphone comme contact public dédié à l'événement (le 0262 57 86 86 est le standard ville).

## Sources
- Les Florilèges — Ville du Tampon (site officiel) — https://letampon.fr/evenements/les-florileges/ — consulté le 2026-06-26
- Florilèges (festival) — Wikipédia — https://fr.wikipedia.org/wiki/Floril%C3%A8ges — consulté le 2026-06-26
- Florilèges 2025 à La Réunion — Le Tampon — Guide Réunion — https://guide-reunion.fr/florileges/ — consulté le 2026-06-26
- Le Tampon : Florilèges 2025, 300 000 personnes réunies — Imaz Press Réunion — https://imazpress.com/zoom/le-tampon-11 — consulté le 2026-06-26
- Le Tampon lance la 41e édition des Florilèges… — Zinfos974 — https://www.zinfos974.com/le-tampon-lance-la-41e-edition-des-florileges-sous-le-signe-de-lembellissement-et-du-bien-etre/ — consulté le 2026-06-26
- Parc Jean de Cambiaire au Tampon — Guide Réunion — https://guide-reunion.fr/parc-jean-de-cambiaire-le-tampon/ — consulté le 2026-06-26
- Géocodage BAN (adresse.data.gouv.fr) « Parc Jean de Cambiaire Le Tampon », citycode 97422 — https://api-adresse.data.gouv.fr/search/?q=Parc+Jean+de+Cambiaire+Le+Tampon&citycode=97422 — consulté le 2026-06-26
