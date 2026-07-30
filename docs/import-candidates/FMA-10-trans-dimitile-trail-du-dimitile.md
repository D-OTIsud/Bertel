# Trans-Dimitile (Trail du Dimitile) — FMA (Fête / Manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Trans-Dimitile
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). La requête `name ILIKE '%dimitile%'` ne renvoie que des homonymes sans rapport — `Dimitile Hôtel` (HOT), `La Table du Dimitile` (RES), `DIMITILE BIKE` (ACT), `Dimitile Hôtel - Espace Bien-Être` (ACT), `Dimitilez-vous` (ACT) — aucune fiche d'événement/manifestation sportive. Aucun objet de type FMA portant ce nom. Recommandation : créer la fiche FMA (pas de fusion). Lien sémantique possible (non bloquant) : le parcours emprunte le massif du Dimitile / le gîte Émile Payet et passe à proximité d'objets PNA déjà proposés (« Le Dimitile par le sentier de la Chapelle »).

## Identité
- Catégorie / sous-type proposé : Manifestation sportive — trail / course nature (course pédestre de montagne + randonnée pédestre).
- Chapo : Course mythique des hauteurs de l'Entre-Deux, la Trans-Dimitile gravit chaque début décembre le massif du Dimitile sur 32 km et 1 800 m de dénivelé, doublée d'une randonnée de 14 km — l'un des plus anciens trails de l'île.

## Description
La Trans-Dimitile est une manifestation annuelle de trail organisée à l'Entre-Deux par l'association Dimitile Sport Action (DSA), en partenariat avec la commune de l'Entre-Deux. Elle compte parmi les plus anciennes et populaires courses nature de La Réunion (33e édition annoncée pour 2026). L'épreuve propose deux formats : un trail de 32 km pour 1 800 m de dénivelé positif et une randonnée de 14 km pour 900 m de dénivelé positif. Le départ comme l'arrivée se situent dans le bourg de l'Entre-Deux : départ du Stade municipal Victorien Carian, montée exigeante par le sentier du Zèbre et la Grande Jument jusqu'à la Chapelle du Dimitile et le gîte Émile Payet, puis redescente technique par le sentier Citron-Galet, l'Argamasse et le sentier Ledoyen, avec arrivée au cœur du village à proximité du Collège Le Dimitile. L'événement se tient traditionnellement le premier dimanche de décembre (7 décembre 2025 pour l'édition 2025 ; 6 décembre 2026 annoncé pour l'édition 2026).

## Adresse & localisation (object_location)
- Adresse : Stade municipal Victorien Carian, Rue Grand-Fond-Extérieur (départ/arrivée), bourg de l'Entre-Deux
- Code postal / ville : 97414 Entre-Deux (code postal 97414 ; INSEE/citycode 97403 — commune dans le périmètre OTI Sud)
- GPS (WGS84) : -21.23794, 55.464893 — source : géocodage BAN (api-adresse.data.gouv.fr) de « Rue Grand-Fond-Extérieur Entre-Deux », type=street, score 0.965, citycode 97403. NB : le stade Victorien Carian est situé sur cette rue (confirmé par Waze) ; le géocodage par nom du stade ne renvoie rien sur la BAN, coordonnées approchées au niveau de la rue de départ. À affiner sur le terrain.
- Altitude : Non trouvé — à compléter (bourg de l'Entre-Deux ≈ 350-500 m ; point haut du parcours au massif du Dimitile ≈ 1 800 m — non sourcé précisément pour le stade)

## Contacts (object_contact)
- Téléphone : 06 92 04 16 84 (Frédéric Bayard — Dimitile Sport Action) — source : runraid.free.fr / sportpro.re
- Email : dimitilesportaction974@gmail.com — source : werun.world, running-attitude.com
- Site web : Non trouvé — à compléter (pas de site officiel propre identifié ; inscriptions via TOP CHRONO.RUN et plateforme webservices.re/WeRun)
- Réseaux sociaux : Facebook « Dimitile Sport Action » — source : werun.world (URL exacte de la page Non trouvée — à compléter)
- Adresse association : Dimitile Sport Action, 1 impasse Bayard, 97414 Entre-Deux (INSEE 97403) — source : running-attitude.com (géocodage BAN du siège : -21.247735, 55.478334, score 0.952)

## Horaires (object_opening)
- Périodicité : annuelle, premier dimanche de décembre (manifestation ponctuelle d'une journée).
- Éditions confirmées : 7 décembre 2025 (32e édition) ; 6 décembre 2026 (33e édition annoncée).
- Horaires du jour J : accueil/retrait des dossards dès 5h00 ; départ du trail 32 km à 6h00 ; départ de la randonnée 14 km à 7h00 (7h00 selon webservices.re ; 6h30 selon WeRun pour 2026 — à confirmer). Barrière horaire trail : 15 h.
- Inscriptions : ouvertes ~25 septembre → 23 novembre (édition 2025), via TOP CHRONO.RUN exclusivement.

## Tarifs (object_price)
- Trail 32 km : 40 € (édition 2025 ; 38 € annoncé pour 2026 sur WeRun) — source : inscriptions.webservices.re, werun.world. Validité : tarif d'inscription édition 2025/2026.
- Randonnée 14 km : 16 € — source : webservices.re, werun.world.
- NB : événement payant sur inscription préalable (pas d'accès libre). Tarifs susceptibles d'évoluer chaque édition.

## Données spécifiques FMA (object_fma + occurrences)
- Type de manifestation : sportive — trail / course pédestre nature + randonnée.
- Périodicité : annuelle.
- Mois : décembre (1er dimanche).
- Lieu de l'événement : bourg de l'Entre-Deux (départ/arrivée Stade Victorien Carian, arrivée près du Collège Le Dimitile) ; parcours sur le massif du Dimitile.
- Organisateur : association Dimitile Sport Action (DSA), partenariat Ville de l'Entre-Deux.
- Épreuves / occurrences :
  - Trail 32 km — 1 800 m D+ — départ 6h00 — 40 € — capacité limitée à 850 participants — 7 ravitaillements (~tous les 3 km) — catégorie FFA « Espoir » minimum, licence/PPS requise.
  - Randonnée 14 km — 900 m D+ — départ 7h00 — 16 € — capacité limitée (130 selon webservices.re / 200 selon WeRun — à confirmer) — 3 ravitaillements — âge minimum 15 ans (autorisation parentale pour mineurs).
- Itinéraire (parcours) : sentier du Zèbre · Grande Jument · Chapelle du Dimitile · gîte Émile Payet · sentier Citron-Galet · Argamasse · sentier Ledoyen · arrivée Collège Le Dimitile.
- Fédération de tutelle : Fédération Française d'Athlétisme (FFA) pour le trail.
- Matériel obligatoire (variante WeRun 2026) : sifflet, couverture de survie, téléphone chargé, eau, gobelet réutilisable, ration alimentaire, vêtement de pluie ; bâtons interdits — à confirmer par édition.

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (stade municipal / bourg de l'Entre-Deux ; existence probable mais non sourcée).
- Sanitaires : Non trouvé — à compléter.
- Ravitaillements : 7 points sur le trail, 3 sur la randonnée (eau, orange, boissons sucrées ; gobelet personnel requis) — source : inscriptions.webservices.re.
- Restauration / village course : Non trouvé — à compléter.
- Accès : départ/arrivée dans le bourg de l'Entre-Deux (accessible voiture).

## Paiement / langues / accessibilité
- Moyens de paiement : inscription en ligne via plateformes (TOP CHRONO.RUN / WeRun / webservices.re) — paiement CB en ligne. Détail Non trouvé — à compléter.
- Langues : Français (présumé ; non sourcé) — à compléter.
- Accessibilité PMR : Non trouvé — à compléter (épreuve de trail de montagne — non concernée a priori).

## Labels & classements (object_classification)
- Aucun label touristique trouvé. Épreuve affiliée FFA (Fédération Française d'Athlétisme) pour le trail 32 km — affiliation sportive, pas un label touristique LBL_*. Aucun LBL_* revendiqué.

## Médias suggérés
- Photos officielles sur les pages organisateur/inscription (werun.world, inscriptions.webservices.re, runraid.free.fr, guide-reunion.fr). NE PAS télécharger sans autorisation de l'ayant droit (organisateur Dimitile Sport Action / plateformes). URLs précises d'images à recueillir lors de la revue.

## Données manquantes / à vérifier
- Coordonnées GPS exactes du stade Victorien Carian (géocode au niveau rue seulement ; point précis à relever).
- Altitude du point de départ.
- URL exacte de la page Facebook « Dimitile Sport Action » et éventuel site web officiel.
- Horaire de départ randonnée (7h00 vs 6h30) et capacité randonnée (130 vs 200) — divergence entre sources.
- Tarif trail définitif par édition (40 € 2025 / 38 € 2026 annoncé).
- Équipements sur site (parking, sanitaires, restauration, village course).
- Moyens de paiement et langues.
- Présence éventuelle de l'événement dans l'agenda officiel OTI Sud (sudreuniontourisme.fr) — non confirmée par la recherche.
- Statut 2026 : confirmer date (6 déc. 2026) et numéro d'édition (33e) à l'approche.

## Sources
- Trans-Dimitile - La Course (32 km) — https://inscriptions.webservices.re/index.php/events/evenement/788-trans-dimitile-la-course — consulté le 2026-06-26
- Trans-Dimitile - La Randonnée (14 km) — https://webservices.re/index.php/events/evenement/787-trans-dimitile-la-randonnee — consulté le 2026-06-26
- Trans-Dimitile 2026 | WeRun — https://werun.world/course/transdimitile/ — consulté le 2026-06-26
- Transdimitile 2025 — https://guide-reunion.fr/breves/detail/transdimitile/ — consulté le 2026-06-26
- Trans Dimitile - Entre-Deux 2026 (renseignements + contact organisateur) — http://runraid.free.fr/calendrier_detail.php?course=21 — consulté le 2026-06-26 (recherche ; fetch direct en échec de connexion)
- Calendrier des courses 2024 - Entre Deux - Trans-Dimitile (contact Frédéric Bayard / siège DSA) — https://running-attitude.com/calendrier_courses/entre-deux-trans-dimitile/ — consulté le 2026-06-26
- Géocodage BAN — https://api-adresse.data.gouv.fr/search/?q=Rue+Grand-Fond-Exterieur+Entre-Deux&citycode=97403 (stade, lat -21.23794 / lon 55.464893, score 0.965) et siège 1 impasse Bayard (lat -21.247735 / lon 55.478334, score 0.952) — consulté le 2026-06-26
