# Galops du Sud Sauvage — ACT (Activité / prestation de loisir encadrée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ACT
- name : Galops du Sud Sauvage
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : ⚠️ **ARBITRAGE OTI REQUIS — risque de doublon de SITE relevé à la réévaluation du 2026-07-30 (l'analyse du 2026-06-26 ci-dessous concluait à tort « aucun doublon »).**
  - **Constat initial (2026-06-26, vérification SQL live)** : la base contient « Ferme équestre du Sud Sauvage » (`ACTRUN00000000S3`, published) à l'adresse *4 Rue de la Pompe, Quéplate, 97442 Saint-Philippe* (lat -21.36083 / lon 55.77111), soit ~6 km à l'est ; « Galops du Sud Sauvage » est une association loi 1901 autonome (RNA W9R2004476, SIREN 807545587, responsable Thérésien Martin) sise *89 RN2, Basse Vallée* (lat -21.37056 / lon 55.71507). D'où la conclusion « deux entités distinctes ».
  - **Élément CONTRADICTOIRE trouvé le 2026-07-30** : plusieurs annuaires donnent à l'**EARL Ferme Equestre du Sud Sauvage** (l'entité déjà en base) l'adresse principale ***« Basse Vallée 89 Route Nationale 2, 97442 Saint-Philippe »*** — c'est-à-dire **la même adresse que « Galops du Sud Sauvage »** — le *4 rue de la Pompe* n'étant qu'une adresse secondaire. De plus, les descriptions des DEUX entités mentionnent **la même prestation par la même personne** : les promenades en calèche menées par **Véronique, titulaire du Galop 5 d'attelage**. Le site officiel `fermeequestresudsauvage.com` ne résout plus (DNS ENOTFOUND au 2026-07-30), ce qui empêche la levée de doute par la source primaire.
  - **Lecture la plus probable** : un **même site équestre** porté par **deux structures juridiques complémentaires** — une **EARL** (exploitation agricole, déjà en base comme ACT) et une **association loi 1901 affiliée FFE/CRE Réunion** (le *club*, qui porte l'enseignement et les galops). C'est le schéma classique du projet : **structure ≠ prestation**.
  - **Action recommandée** : **NE PAS importer tel quel comme un second ACT.** Trancher entre (a) rattacher « Galops du Sud Sauvage » à l'objet existant `ACTRUN00000000S3` comme **entité juridique / club affilié** (alias + `actor_object_role`), ou (b) le créer comme **ASC** (structure/club) lié à l'ACT existant — sachant que la candidate **ASC-03 « Ferme Équestre du Sud Sauvage »** couvre déjà la structure de ce site : dans ce cas, **fusionner ACT-02 dans ASC-03** plutôt que créer un troisième objet. Vérification terrain/téléphonique recommandée (une seule adresse réelle à confirmer).

## Identité
- Catégorie / sous-type proposé : Centre équestre / activité équestre encadrée (balades à cheval, initiation, découverte du Sud Sauvage à cheval). Archétype ACT/ASC (object_act). NAF 93.29Z « Autres activités récréatives et de loisirs ».
- Chapo : Centre équestre associatif de Basse Vallée, à Saint-Philippe, proposant initiation, balades et découverte du Sud Sauvage à cheval, avec encadrement par moniteurs.

## Description
Galops du Sud Sauvage est une association loi 1901 (déclarée le 14 octobre 2014, RNA W9R2004476, SIREN 807545587 — actif au 2026-06-26) basée à Basse Vallée, sur la commune de Saint-Philippe. Son objet déclaré couvre l'initiation équestre, la location d'équidés et la découverte du sud de l'île à cheval, ainsi que l'animation lors de foires et festivités, la pension et l'organisation de randonnées, concours et manifestations équestres. Le club est référencé par le Comité régional d'équitation (CRE Réunion) parmi les centres équestres de l'île. Responsable : Thérésien Martin. (Les disciplines précises proposées par CE club ne sont pas détaillées par les sources consultées — « Non trouvé — à compléter ».)

## Adresse & localisation (object_location)
- Adresse : 89 Route Nationale 2 (RN2), Basse Vallée
- Code postal / ville : 97442 Saint-Philippe — code INSEE commune 97417
- GPS (WGS84) : -21.370536, 55.714960 — source : géocodage BAN api-adresse.data.gouv.fr (label « 89 Route Nationale 2 Basse Vallee 97442 Saint-Philippe », **score 0.965**, type housenumber, citycode 97417). Cohérent avec le siège INSEE/SIRENE : -21.37056, 55.71507 (recherche-entreprises.api.gouv.fr). Les deux sources convergent à ~1 m.
- Altitude : Non trouvé — à compléter (Basse Vallée littoral/bas de RN2 ; valeur précise non confirmée par source).

## Contacts (object_contact)
- Téléphone : 0692 69 28 30 (sources concordantes : cheval-reunion.re, net1901.org, PagesJaunes/Mappy)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (aucun site propre identifié ; à NE PAS confondre avec fermeequestresudsauvage.com qui appartient à l'autre entité « Ferme équestre du Sud Sauvage »)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Non trouvé — à compléter (PagesJaunes/Mappy listent le centre sans horaires renseignés ; activité probablement sur réservation — à confirmer auprès du responsable).

## Tarifs (object_price)
Non trouvé — à compléter (aucune grille tarifaire publiée par les sources consultées ; tarifs à confirmer auprès du centre).

## Données spécifiques ACT (object_act)
- Activités proposées : initiation équestre ; balades / randonnées à cheval ; découverte du sud (« Sud Sauvage ») à cheval ; location d'équidés ; animation foires & festivités ; pension ; organisation de concours et manifestations équestres (objet associatif déclaré au JO / net1901).
- Publics cibles : Non trouvé — à compléter (l'objet mentionne « initiation » ⇒ probable accueil débutants ; à confirmer — ne pas inventer le détail enfants/adultes/niveaux).
- Encadrement : moniteurs / instructeurs présents (mention « professional instructors / moniteurs » sur cheval-reunion.re ; diplômes et nombre non précisés — à compléter).
- Durée / format des prestations : Non trouvé — à compléter.
- Réservation : Non trouvé — à compléter (probable, à confirmer).

## Équipements & services (object_amenity)
- Parking / sanitaires / accueil / restauration : Non trouvé — à compléter.
- Accès : en bordure de la RN2 (Route Nationale 2) à Basse Vallée — desserte routière directe ; détails (parking dédié, accès handi) non confirmés.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter.
- Langues : Non trouvé — à compléter (FR par défaut, île de La Réunion).
- Accessibilité PMR : Non trouvé — à compléter.

## Labels & classements (object_classification)
Aucun trouvé. Aucun label (Qualité Tourisme, Tourisme & Handicap, etc.) ni agrément revendiqué par les sources consultées. Club référencé au CRE Réunion (Comité régional d'équitation) — affiliation fédérale possible (FFE) mais non confirmée explicitement ⇒ à vérifier ; ne pas mapper de LBL_* sans confirmation.

## Médias suggérés
- cheval-reunion.re indique « photos à venir » (placeholder) — aucune photo officielle exploitable identifiée.
- Aucune URL média officielle confirmée. NE PAS télécharger sans autorisation. (Médias à demander au responsable lors de la validation OTI.)

## Données manquantes / à vérifier
- Email, site web, réseaux sociaux du club.
- Horaires d'ouverture et modalités de réservation.
- Grille tarifaire (balades, initiation, pension) + validité.
- Disciplines précises et publics accueillis (débutants/confirmés, âge minimum, poids max).
- Encadrement : diplômes des moniteurs, effectif, affiliation FFE/agrément.
- Équipements sur site (parking, sanitaires, point d'eau, restauration), accès PMR.
- Moyens de paiement, langues parlées.
- Altitude exacte du point de départ.
- Photos officielles (autorisation requise).
- Confirmer la pérennité d'activité sur le terrain (dernière maj net1901 = 2014 ; SIRENE actif 2026, mais l'OTI doit valider l'exploitation effective).

## Sources
- Galops du Sud Sauvage — CRE Réunion (Comité régional d'équitation 974) — https://cheval-reunion.re/property/galops-du-sud-sauvage/ — consulté le 2026-06-26
- GALOPS DU SUD SAUVAGE (association loi 1901, RNA W9R2004476, objet social) — net1901.org — https://www.net1901.org/association/GALOPS-DU-SUD-SAUVAGE,1323893.html — consulté le 2026-06-26
- Galops Du Sud Sauvage, centre équestre et d'équitation, 89 rte Nationale 2, 97442 Saint-Philippe — Mappy — https://fr.mappy.com/poi/5f73cfa55e26a26ef847f6d9 — consulté le 2026-06-26
- Galops Du Sud Sauvage Saint Philippe — PagesJaunes — https://www.pagesjaunes.fr/pros/58070102 — consulté le 2026-06-26
- Annuaire des entreprises (SIREN 807545587, NAF 93.29Z, association active, siège 97417) — recherche-entreprises.api.gouv.fr — https://recherche-entreprises.api.gouv.fr/search?q=Galops+du+Sud+Sauvage&code_commune=97417 — consulté le 2026-06-26
- Géocodage BAN (score 0.965, citycode 97417) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=89+Route+Nationale+2+Basse+Vall%C3%A9e+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
- Vérification anti-doublon base live (homologue distinct ACTRUN00000000S3 « Ferme équestre du Sud Sauvage », adresse Quéplate) — Supabase `public.object` / `object_location` — requête du 2026-06-26
