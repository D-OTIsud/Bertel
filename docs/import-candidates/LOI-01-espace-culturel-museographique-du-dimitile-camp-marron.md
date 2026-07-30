# Espace Culturel Muséographique du Dimitile - Camp Marron — LOI (Lieu / patrimoine culturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : LOI
- name : Espace Culturel Muséographique du Dimitile - Camp Marron
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré. Aucun objet de la liste EN BASE ni DÉJÀ PROPOSÉ ne porte ce nom ni une variante évidente (« Camp Marron », « Camp Dimitile », « Musée du Marronnage », « Espace muséographique »). À distinguer de « Le Dimitile par le sentier de la Chapelle » (DÉJÀ PROPOSÉ — c'est l'ITINÉRAIRE d'accès au sommet, pas le musée) et de « La Cité du Volcan » (EN BASE — autre musée, sans rapport). Recommandation : si l'ITI « Le Dimitile par le sentier de la Chapelle » est importé, créer une `object_relation [based_at_site]` ou `[uses_itinerary]` entre cet espace muséographique et le sentier. Vérification SQL live exécutée le 2026-06-26 (`object` WHERE name LIKE dimitile/camp marron/marronnage/capitaine dimitile/muséographique) : **aucun doublon** — les seuls résultats « Dimitile » sont des établissements commerciaux sans rapport (Dimitile Hôtel HOTRUN00000000ZW, La Table du Dimitile RESRUN0000000153, Dimitile Bike, Dimitile Hôtel - Espace Bien-Être, Dimitilez-vous), pas le lieu de mémoire. Pas de fiche musée/camp marron en base.

## Identité
- Catégorie / sous-type proposé : Lieu de mémoire / espace muséographique (patrimoine culturel et mémoriel — esclavage et marronnage)
- Chapo : Sur le plateau du Guetteur, au sommet du Dimitile (≈1 800 m), un camp marron reconstitué et un parcours d'exposition retracent l'histoire de l'esclavage et du marronnage à La Réunion, sur les traces du capitaine Dimitile.

## Description
L'Espace Culturel Muséographique du Dimitile, dit « Camp Marron », est installé depuis 1998 par l'Association Le Capitaine Dimitile sur le plateau du Guetteur, un Espace Naturel Sensible situé au sommet du massif du Dimitile, dans les hauts de l'Entre-Deux. Le site reconstitue un camp de marrons : six petites cases en bois et feuilles de vacoa (pandanus) évoquant l'habitat des esclaves en fuite, trois statues représentant le capitaine Dimitile, le roi Laverdure (Le Roy) et la reine Sarlave (Tsaralava), une stèle commémorative (installée en 2001) et une vingtaine de panneaux pédagogiques. Le parcours, animé par les bénévoles de l'association, retrace « les années noires de l'esclavage et du marronnage » — le marronnage désignant la fuite des esclaves qui, opprimés, cherchaient à survivre librement dans les hauteurs isolées de l'île. Le lieu honore la mémoire du capitaine Dimitile, esclave marron du milieu du XVIIIᵉ siècle, dit « l'insaisissable », qui mena plusieurs esclaves en fuite se réfugier dans ce massif qui porte désormais son nom. Le site est accessible à pied depuis l'Entre-Deux (plusieurs sentiers, dont celui de la Chapelle) ou en 4x4 selon les conditions.

## Adresse & localisation (object_location)
- Adresse : Plateau du Guetteur, sommet du Dimitile (hauts de l'Entre-Deux) — accès à pied (sentiers depuis l'Entre-Deux) ou 4x4 ; siège de l'association : 10 rue Victor Nativel, Entre-Deux
- Code postal / ville : 97414 Entre-Deux
- GPS (WGS84) : **-21.18960, 55.48160** (site réel du musée, plateau du Guetteur) — source : Randopitons (fiche « Musée du Marronnage du Dimitile »). Corroboré par Cirkwi : -21.18886, 55.4826, altitude 1794 m (point d'intérêt « Camp Marron », maj 07/09/2020). Note : ce sont deux relevés indépendants concordants (~250 m d'écart) pour le site sommital.
  - Géocodage BAN du siège associatif (≠ site du musée) : `https://api-adresse.data.gouv.fr/search/?q=10+rue+Victor+Nativel+Entre-Deux&citycode=97403` → coordonnées 55.47005, -21.246838 ; label « Rue Victor Nativel 97414 Entre-Deux » ; score 0.788 ; citycode 97403 ; postcode 97414. ⚠️ Ce géocodage pointe le BOURG de l'Entre-Deux (adresse de l'association), PAS le site muséographique en altitude — à ne PAS utiliser pour object_location ; coordonnées du site = relevés Randopitons/Cirkwi ci-dessus.
- Altitude : ≈1 794–1 800 m (Randopitons : « 1800 mètres d'altitude sur le Plateau du Guetteur » ; Cirkwi : 1794 m). Le sommet du Dimitile culmine à 1 850 m (sudreuniontourisme.fr).

## Contacts (object_contact)
- Téléphone : 0692 64 52 75 ou 0692 25 10 34 (Association Le Capitaine Dimitile — source OT Entre-Deux / Randopitons). Numéros divergents selon les sources : 06 92 68 87 75 (memoire-esclavage.org, Association Capitaine Dimitile, 12 rue Victor Navitel) ; 0692 39 73 26 (numéro fourni dans la demande d'import, NON confirmé par une source web consultée). **À fiabiliser auprès de l'association / l'OT avant publication.**
- Email : Non trouvé — à compléter (l'OT d'Entre-Deux : ot.entre2@gmail.com — contact relais, pas l'email du musée)
- Site web : http://www.le-capitaine-dimitile.re/ (site officiel de l'association — INACCESSIBLE le 2026-06-26, ECONNREFUSED) ; http://ecmcampmarron.e-monsite.com/ (ancien site — HTTP 404 le 2026-06-26). **Les deux sites officiels sont actuellement hors-ligne** — à vérifier.
- Réseaux sociaux : Non trouvé — à compléter
- Fax (legacy, source OT) : 0262 39 66 52
- Office de tourisme relais : OT Entre-Deux, 13 rue Fortuné Hoarau, 97414 Entre-Deux, tél. 02 62 39 69 80, ot.entre2@gmail.com (lun.–sam. 8h–12h / 13h30–17h)

## Horaires (object_opening)
Jours d'ouverture variables et peu fiables : il est recommandé de contacter l'association ou l'OT d'Entre-Deux avant toute visite (sources : OT Entre-Deux, WhichMuseum). Pas d'horaires fixes publiés. **Non trouvé — à compléter (horaires précis).** Voir aussi le statut « en cours de réfection » ci-dessous (section Données manquantes).

## Tarifs (object_price)
- Entrée : **2 €** (source : OT Entre-Deux / page « camp marron Dimitile »). Validité/date non précisée — à reconfirmer. Visites guidées assurées par les bénévoles de l'association (modalités/tarif guide non précisés — à compléter).

## Données spécifiques LOI
LOI (PCU/PNA/VIL/SPU/LOI) = pas de table de facette type-spécifique ; les caractéristiques passent par les classifications/labels génériques (`object_classification`) et la description.
- Type de lieu : espace muséographique / lieu de mémoire (esclavage et marronnage) en plein air, en milieu naturel (Espace Naturel Sensible — plateau du Guetteur)
- Année de création du site : 1998 (association Le Capitaine Dimitile) ; stèle commémorative 2001 ; statues réalisées par l'artiste Louis Dijoux (pierre et bois)
- Éléments remarquables : camp marron reconstitué (6 cases bois + feuilles de vacoa), 3 statues (Dimitile, Laverdure Le Roy, Sarlave), 1 stèle, ~20 panneaux pédagogiques
- Thématique : histoire de l'esclavage et du marronnage à La Réunion ; figure du capitaine Dimitile
- Gestionnaire : Association Le Capitaine Dimitile (bénévoles) — relation candidate `actor_object_role [operator/gestionnaire]` → Association Le Capitaine Dimitile
- Accès : à pied depuis l'Entre-Deux (sentiers de la Chapelle / Le Zèbre / La Grande Jument / Bayonne) ou 4x4 ; relation candidate `object_relation [uses_itinerary]` → « Le Dimitile par le sentier de la Chapelle » (si importé)

## Équipements & services (object_amenity)
- Parking : au départ des sentiers à l'Entre-Deux (Ravine des Citrons / portail) — pas au site même. Non confirmé sur place — à compléter.
- Sanitaires : Non trouvé — à compléter
- Accès : site en altitude, accessible uniquement après une longue randonnée (≈4–5 h A/R par la Chapelle) ou en 4x4 ; « longue randonnée obligatoire » (Randopitons)
- Restauration : Non trouvé — à compléter (aucune restauration attestée sur le site)
- Visites guidées : oui, par les bénévoles de l'association (sur réservation/contact préalable conseillé)

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (entrée 2 € ; espèces probables sur site, non confirmé)
- Langues : Non trouvé — à compléter (a priori français)
- Accessibilité PMR : Non — site en haute altitude accessible par sentiers de montagne / 4x4, non adapté PMR (déduction du contexte ; à confirmer)

## Labels & classements (object_classification)
- Aucun label touristique formel trouvé (pas de LBL_* revendiqué).
- Le plateau du Guetteur est classé **Espace Naturel Sensible (ENS)** (sources OT Entre-Deux / sudreuniontourisme.fr) — statut de protection, à modéliser le cas échéant comme caractéristique de site, pas comme label touristique.
- Lieu de mémoire référencé par la Fondation pour la mémoire de l'esclavage et le portail « Esclavage Réunion » (reconnaissance mémorielle, non un label classement).

## Médias suggérés
- Photos officielles présentes sur : sudreuniontourisme.fr (page « Le Dimitile »), OT Entre-Deux (otentre2.wixsite.com), Lonely Planet, memoire-esclavage.org, Cirkwi.
- Visite virtuelle : Zinfos974 — « Visite virtuelle : Le Camp marron du Dimitile » (https://www.zinfos974.com/Visite-virtuelle-Le-Camp-marron-du-Dimitile_a104921.html)
- **NE PAS télécharger sans autorisation** — droits à clarifier auprès de l'association / des éditeurs avant toute réutilisation.

## Données manquantes / à vérifier
- **STATUT D'OUVERTURE (CRITIQUE)** : plusieurs sources (sudreuniontourisme.fr, recherche 06/2026) indiquent que l'espace muséographique du camp marron est **« en cours de réfection » et « inaccessible au public »**. Une sortie scolaire (Collège Le Dimitile) atteste un accès physique au camp en juin 2024. **Confirmer impérativement avec l'association/l'OT si le site est ouvert avant publication** (sinon importer en `status: draft` et signaler « temporairement fermé »).
- Numéro de téléphone à fiabiliser (3 numéros divergents selon les sources ; celui de la demande non corroboré).
- Email officiel du musée : inconnu.
- Sites web officiels tous deux hors-ligne au 2026-06-26 (le-capitaine-dimitile.re ECONNREFUSED ; ecmcampmarron.e-monsite.com 404).
- Horaires d'ouverture précis : non publiés.
- Tarif réduit / gratuités / conditions : non précisés (seul « 2 € » attesté, sans date de validité).
- GPS du site à reconfirmer par relevé IGN/terrain (deux sources concordantes ~250 m d'écart ; altitude entre 1794 et 1800 m).
- Coordonnées exactes du point d'accueil/billetterie sur le plateau (vs point GPS générique du camp).
- Modalités de réservation des visites guidées.

## Sources
- Camp Dimitile — Fondation pour la mémoire de l'esclavage — https://memoire-esclavage.org/camp-dimitile — consulté le 2026-06-26
- camp marron Dimitile — Office de Tourisme de l'Entre-Deux — https://otentre2.wixsite.com/otentre-deux/camp-marron-dimitile — consulté le 2026-06-26
- Le Dimitile — Offices de tourisme du Sud (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/le-dimitile.html — consulté le 2026-06-26
- Musée du Marronnage du Dimitile — Randopitons — https://randopitons.re/tourisme/399-musee-marronnage-dimitile — consulté le 2026-06-26 (GPS, altitude, accès)
- Camp Marron — Cirkwi (point d'intérêt 1251633) — https://www.cirkwi.com/fr/point-interet/1251633-camp-marron — consulté le 2026-06-26 (GPS -21.18886/55.4826, alt 1794 m)
- Dimitile (esclave marron) — Wikipédia — https://fr.wikipedia.org/wiki/Dimitile_(esclave_marron) — consulté le 2026-06-26 (biographie, 1998/2001)
- Camp Dimitile — Portail Esclavage Réunion — https://www.portail-esclavage-reunion.fr/en/lieux-de-memoire/camp-dimitile/ — consulté le 2026-06-26 (création 1998, Louis Dijoux, stèle)
- Espace Culturel Muséographique du Dimitile – Camp Marron — Lonely Planet — https://www.lonelyplanet.com/reunion/the-west/entre-deux/attractions/espace-culturel-museographique-du-dimitile-camp-marron/a/poi-sig/1345138/355578 — consulté le 2026-06-26
- Géocodage BAN (siège associatif) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=10+rue+Victor+Nativel+Entre-Deux&citycode=97403 — consulté le 2026-06-26 (commune 97403 confirmée)
