# Vanille 100% Réunion — LOI (Loisir / Découverte agritouristique)

> ## ⛔ REJETÉE — DOUBLON AVÉRÉ (réévaluation du 2026-07-30). NE PAS IMPORTER.
>
> **« Vanille 100% Réunion » est le nom d'affichage OTI/IRT de « Kaban' à Vanille », DÉJÀ EN BASE** (PRD, `published`). Preuves concordantes recueillies le 2026-07-30 (Petit Futé « La Kaban' à Vanille », TripAdvisor « Kaban'a Vanille », page Facebook officielle `@HarryLeichnig`) : **même adresse (48 Route Nationale 2, Le Baril)**, **même exploitant (Harry Leichnig)**, **mêmes horaires (visites gratuites lun→ven 9h30–17h30)**, **mêmes produits (Vanille Bourbon AB + eau de parfum « Vanille gourmande »)**, **même mention IGP « Vanille de l'île de la Réunion » (2021)**.
>
> Le premier passage de vérification (2026-06-26) avait déjà signalé ce doublon sur la lentille PRD ; l'arbitrage de finalisation l'avait écarté à tort en supposant deux opérateurs distincts. **La réévaluation confirme le verdict initial.**
>
> **Que faire de cette fiche :** ne pas créer d'objet. Son contenu (description, horaires, IGP, produits, GPS géocodé BAN) reste utile pour **enrichir l'objet existant `Kaban' à Vanille`**, et le nom « Vanille 100% Réunion » peut être conservé comme **alias/nom commercial**. L'ACTOR « Mr Harry Leichnig » existe déjà en base — le réutiliser, ne jamais le recréer.
>
> ---
>
> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : ~~À RÉVISER~~ → **REJETÉE (doublon)**.

## Proposition d'import
- object_type : LOI
- name : Vanille 100% Réunion
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). L'objet est exploité par **Harry Leichnig**. Attention à ne PAS le confondre avec deux homologues vanille présents/voisins en base :
  - `LOIRUN00000000ZE "Ti Planterre"` (PRD, draft) = exploitation de **Louis Leichnig** (vanille BIO IGP, agroforesterie en forêt à ~400 m) — producteur DIFFÉRENT (autre personne, autre site, autre gamme). Ce n'est PAS un doublon, mais les deux portent le patronyme « Leichnig » : bien les distinguer à l'import (Harry = boutique « Vanille 100% Réunion » au bord de la RN2 au Baril ; Louis = « Ti Planterre / Maison Louis Leichnig », vanille IGP en forêt).
  - `LOIRUN000000010R "Escale Bleue - Atelier Vanille"` (LOI, published) = atelier vanille au Tremblet (Saint-Philippe), exploitant encore différent (« vanille bleue »). Pas un doublon.
  - `LOIRUN00000000WD "Kaban' à Vanille"` (PRD, déjà en base) = boutique/produits vanille à Saint-Philippe, opérateur distinct. Pas un doublon.
  - Recommandation : créer la fiche en tant qu'objet distinct. **ATTENTION — l'ACTOR exploitant existe DÉJÀ en base** : `actor` « Mr Harry Leichnig » id `14746773-7937-491c-9a99-aff16b7f693b` (vérifié SQL live 2026-06-26). NE PAS créer un nouvel ACTOR : rattacher l'objet à cet acteur existant via `actor_object_role [operator]`. (NB : la famille Leichnig est très présente en base — Aimé, Louis, Nathalie, Lauriane — ne pas confondre.)

## Identité
- Catégorie / sous-type proposé : Patrimoine agricole / agritourisme — visite découverte d'une exploitation de vanille avec vente directe au producteur. (La fiche OTI du Sud le classe en « Patrimoine agricole ».) Sous-type LOI proposé : visite de site de production / découverte du savoir-faire local.
- Chapo : Au bord de la RN2 au Baril, l'agriculteur Harry Leichnig ouvre gratuitement son exploitation et fait découvrir tout le parcours de la vanille Bourbon, de la pollinisation de la fleur à la commercialisation de la gousse.

## Description
« Vanille 100% Réunion » est l'exploitation de Harry Leichnig, agriculteur installé depuis plus de vingt ans dans les hauts du Baril, à Saint-Philippe, au sud-est de l'île. Le climat chaud et humide de Saint-Philippe est réputé idéal pour la culture de la vanille Bourbon, variété prisée dans le monde entier. Le producteur propose un parcours de découverte de l'élaboration de la vanille — fécondation manuelle de la fleur, transformation puis commercialisation de la gousse — et la vente directe de sa production. On y trouve notamment de la « Vanille Bourbon AB » (issue de l'agriculture biologique), reconnue par des chefs, ainsi qu'une eau de parfum « Vanille gourmande ». La visite est annoncée comme gratuite. (Sources : IRT reunion.fr, OTI du Sud, page guide touristique ; voir Sources.)

## Adresse & localisation (object_location)
- Adresse : 48, Route Nationale 2 (RN2), lieu-dit Le Baril
- Code postal / ville : 97442 Saint-Philippe (Le Baril) — commune INSEE 97417
- GPS (WGS84) : -21.369432, 55.726086 — source : géocodage BAN (api-adresse.data.gouv.fr) de « 48 Route Nationale 2 Baril Saint-Philippe », citycode 97417 ; label retourné « 48 Route Nationale 2 Baril 97442 Saint-Philippe » ; score 0,818 (correspondance au numéro de voirie sur la RN2). À affiner sur le terrain (point d'entrée exact de l'exploitation).
- Altitude : Non trouvé — à compléter (description « hauts du Baril » ; valeur précise non confirmée).

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (une fiche annuaire « LEICHNIG HARRY, agriculteur, Saint-Philippe » existe sur PagesJaunes mais n'a pas pu être ouverte ; numéro non confirmé par une source consultée).
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site propre identifié ; les produits sont aussi revendus via des boutiques tierces, ex. reunionboutik.com, non officiel).
- Réseaux sociaux : Non trouvé — à compléter (une publication descriptive existe sur la page Facebook « Guide touristique Réunion », mais ce n'est pas le compte officiel de l'exploitant).

## Horaires (object_opening)
- Visites du lundi au vendredi, de 9h30 à 17h30 (annoncé par IRT reunion.fr et la page guide touristique).
- Week-end / jours fériés : Non trouvé — à compléter.
- Saisonnalité : Non trouvé — à compléter (la floraison/fécondation de la vanille est saisonnière ; calendrier de visite spécifique non confirmé).

## Tarifs (object_price)
- Visite : gratuite (annoncé « free visits » / « visites gratuites » par les sources, du lundi au vendredi 9h30–17h30), proposée à des groupes d'au moins 6 personnes (IRT). Vente de produits au tarif producteur (gousses de vanille, eau de parfum) — grille tarifaire non publiée par une source officielle consultée → Non trouvé — à compléter.

## Données spécifiques LOI
- Type d'objet LOI (loisir/découverte) : pas de table facette type-spécifique (PCU/PNA/VIL/SPU/LOI → classifications/labels génériques, object_act non requis sauf encadrement formel).
- Nature de l'activité : visite découverte d'une exploitation agricole de vanille + vente directe ; parcours « de la fleur à la gousse » (pollinisation manuelle → transformation → commercialisation).
- Public : visite découverte de l'exploitation. **Modalité attestée par l'IRT : visites pour des groupes d'au moins 6 personnes** (« for groups of at least six people »). Durée, réservation et accueil individuel exacts à confirmer sur le terrain.
- Production : vanille Bourbon, dont gamme « Vanille Bourbon AB » (agriculture biologique) ; produit dérivé « eau de parfum Vanille gourmande ».
- NB : si l'OTI souhaite modéliser l'encadrement (visite guidée par l'exploitant comme prestation), envisager plutôt un volet ASC/object_act ; en l'état (visite gratuite d'un site de production + boutique), LOI est cohérent.

## Équipements & services (object_amenity)
- Boutique / vente directe au producteur sur place : oui.
- Parking : Non trouvé — à compléter (situé en bord de RN2, accès voiture probable mais non confirmé).
- Sanitaires : Non trouvé — à compléter.
- Restauration : Non trouvé — à compléter (non mentionné).
- Accès : bord de Route Nationale 2 au Baril (accès routier direct).

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter.
- Langues : Non trouvé — à compléter (la fiche IRT existe en FR/EN/DE — multilinguisme de l'accueil non confirmé).
- Accessibilité PMR : Non trouvé — à compléter.

## Labels & classements (object_classification)
- Vanille « Bourbon AB » = issue de l'Agriculture Biologique (label produit AB). À traiter comme attribut produit/mention bio, pas nécessairement comme classement de l'objet touristique. Pas de label tourisme (T&H, Qualité Tourisme, etc.) revendiqué par une source consultée → Aucun trouvé pour l'objet (hors mentions « AB » et « IGP » sur la gamme vanille).
- IGP : selon l'IRT (en.reunion.fr), Harry Leichnig est « transformateur de la "Vanille de l'île de la Réunion" reconnue IGP (septembre 2021) » — la mention IGP s'applique donc bien à ce producteur (à traiter comme attribut produit, pas comme classement de l'objet touristique). Correction d'une version antérieure de cette fiche qui attribuait l'IGP au seul Louis Leichnig : les deux Leichnig relèvent de l'IGP « Vanille de l'île de la Réunion ». Bien distinguer les deux exploitations (Harry = boutique « Vanille 100% Réunion », Le Baril ; Louis = « Ti Planterre / Maison Louis Leichnig », vanille BIO IGP en forêt).

## Médias suggérés
- Page offre IRT : https://en.reunion.fr/offers/vanille-100-reunion-saint-philippe-en-558139/ (visuels officiels IRT) — NE PAS télécharger sans autorisation.
- Fiche OTI du Sud : https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/patrimoine-agricole/vanille-100-reunion-eta_2847.html — NE PAS télécharger sans autorisation.
- Aucune photo libre de droits confirmée — à demander à l'exploitant / à l'OTI lors de la révision.

## Données manquantes / à vérifier
- Téléphone, email, site web, réseaux sociaux officiels de l'exploitant.
- Adresse exacte (numéro/point d'entrée de l'exploitation sur la RN2) et altitude.
- Coordonnées GPS du point d'accueil (le géocodage BAN positionne le n°48 sur la RN2 ; vérifier sur le terrain / OSM).
- Modalités de visite : libre ou guidée, durée, réservation, accueil de groupes, accessibilité PMR.
- Horaires week-end/fériés et saisonnalité (vanille saisonnière).
- Grille de tarifs des produits (gousses, eau de parfum).
- Moyens de paiement et langues d'accueil.
- ~~Existence éventuelle d'un actor « Harry Leichnig » déjà en base~~ → **RÉSOLU (SQL live 2026-06-26)** : l'ACTOR « Mr Harry Leichnig » existe (id `14746773-7937-491c-9a99-aff16b7f693b`) ⇒ réutiliser, ne pas recréer.
- Statut juridique/SIRET de l'exploitation (pour object_legal) — non recherché ici.

## Sources
- Vanille 100% Réunion (Saint-Philippe) — Île de la Réunion Tourisme — https://en.reunion.fr/offers/vanille-100-reunion-saint-philippe-en-558139/ — consulté le 2026-06-26
- Offices de tourisme du Sud de la Réunion, fiche « Vanille 100% Réunion » (Patrimoine agricole, Saint-Philippe) — https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/patrimoine-agricole/vanille-100-reunion-eta_2847.html — consulté le 2026-06-26
- Île de la Réunion Tourisme, mirror allemand (Insel La Réunion) — https://www.insel-la-reunion.com/angebote/vanille-100-reunion-saint-philippe-de-558139/ — consulté le 2026-06-26
- Publication descriptive « Vanille 100% Réunion … situé à Saint-Philippe dit Le Baril, agriculteur de métier Har[ry Leichnig] » — page Facebook Guide touristique Réunion — https://www.facebook.com/guidetouristiquereunion/posts/264664517287489/ — consulté le 2026-06-26
- Géocodage BAN (Base Adresse Nationale) — https://api-adresse.data.gouv.fr/search/?q=48+Route+Nationale+2+Baril+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
- Mention produit « Vanille Réunion givrée Harry Leichnig » (revendeur tiers, atteste l'existence de l'opérateur) — reunionboutik.com — https://reunionboutik.com/index.php?id_category=51&controller=category — consulté le 2026-06-26
