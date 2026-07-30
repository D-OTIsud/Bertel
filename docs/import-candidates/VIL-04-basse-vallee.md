# Basse Vallée — VIL (Village / quartier)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : Basse Vallée
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun homologue VIL repéré** (vérification SQL live du 2026-06-26 sur `object` : `name ILIKE '%basse%vall%'/%baril%/%tresse%/%vacoa%`). Le quartier-village « Basse Vallée » n'existe PAS comme objet propre. Plusieurs objets *situés à* Basse Vallée existent et restent distincts (à NE PAS fusionner avec ce VIL) : `LOIRUN000000010S` « La maison de la tresse et du terroir » (LOI, draft — landmark du village, déjà en base), `HLORUN00000000Z8` / `RESRUN00000001A4` « Le Rond de Basse Vallée », `LOIRUN000000010Y` « Le Baril de Poudre », `HOTRUN0000000104` « Hôtel les Embruns du Baril ». À distinguer aussi des candidats déjà proposés voisins mais distincts : « Cap Méchant », « Puits des Anglais », « La Marine de Vincendo », « Cap Jaune ». Action recommandée : créer le VIL « Basse Vallée » comme objet-village parapluie et y RATTACHER les landmarks ci-dessus via `object_relation` une fois importés (pas de FK directe — voir CLAUDE.md).

## Identité
- Catégorie / sous-type proposé : Village / quartier littoral du Sud Sauvage (côte basaltique), berceau de la tresse de vacoa
- Chapo : Sur la RN2 entre Saint-Joseph et le bourg de Saint-Philippe, Basse Vallée est le village-porte du Sud Sauvage, gardien vivant de la vannerie de vacoa et point d'accès aux sites volcaniques de Cap Méchant et du Puits des Anglais.

## Description
Basse Vallée est un quartier littoral de la commune de Saint-Philippe, sur la RN2, dans la région touristique du Sud Sauvage de La Réunion. Le village est étroitement associé à la tradition de la tresse de vacoa (vannerie de *Pandanus utilis*), savoir-faire inscrit à l'inventaire national du Patrimoine Culturel Immatériel ; il abrite la Maison de la Tresse et du Terroir, où les tresseuses travaillent et exposent leurs créations (bertels, paniers, chapeaux, sacs). Le quartier sert de point d'accès à plusieurs sites naturels et patrimoniaux de la côte basaltique sauvage : Cap Méchant (à droite de la RN2 au niveau de Basse Vallée), le Puits des Anglais (au Baril, juste après Basse Vallée) et le Puits Arabe (~2 km plus loin). Le territoire conserve aussi des éléments de patrimoine bâti : la Chapelle Saint-Jean-Baptiste de La Salle de Basse-Vallée et l'Ancien cimetière de Basse Vallée (ce dernier inscrit au titre des monuments historiques — à confirmer). Chaque année en août, le site de Cap Méchant à Basse Vallée accueille la Fête du Vacoa, manifestation phare de la commune (de l'ordre de 100 000 visiteurs annoncés selon la presse locale).

## Adresse & localisation (object_location)
- Adresse : Basse Vallée, le long de la RN2 (Route Nationale 2), Saint-Philippe (Sud Sauvage)
- Code postal / ville : 97442 Saint-Philippe (INSEE commune 97417 — code postal 97442 ≠ code INSEE 97417)
- GPS (WGS84) : -21.371449, 55.711955 — source : géocodage BAN api-adresse.data.gouv.fr (q=« Basse Vallée Saint-Philippe », citycode=97417), feature « Route Nationale 2 Basse Vallee 97442 Saint-Philippe », type=street, score 0.69, postcode 97442. **Point indicatif (axe RN2 du village) — à affiner sur un centre de village / la Maison de la Tresse lors de la revue terrain.**
- Altitude : Non trouvé — à compléter (quartier de bord de mer / RN2 littorale, altitude faible)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (pas de contact propre au village ; la Maison de la Tresse et du Terroir, landmark distinct, est joignable au 02 62 73 45 19 / 06 92 79 72 76 — source petitfute, à rattacher à l'objet `LOIRUN000000010S`, pas à ce VIL)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (références utiles : Mairie de Saint-Philippe saintphilippe.re ; OTI du Sud sudreuniontourisme.fr ; maisondelatresse.re pour le landmark)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Non trouvé — à compléter. Village/quartier en accès libre permanent (pas d'horaires propres). Les équipements situés dans le village ont leurs horaires propres (ex. Maison de la Tresse et du Terroir : lun–ven 08h30–12h00 / 13h00–16h30, source petitfute — relève de l'objet landmark, pas de ce VIL).

## Tarifs (object_price)
Accès libre et gratuit (quartier/village en bord de RN2). Les visites/ateliers proposés *dans* le village (ex. initiation tresse à la Maison de la Tresse : 20 € adulte / 10 € enfant, source petitfute) relèvent des objets dédiés, pas de ce VIL.

## Données spécifiques VIL
VIL = pas de table facette dédiée (cf. note : PCU/PNA/VIL/SPU → pas de facette ; classifications/labels génériques uniquement).
- Région touristique : Sud Sauvage (Côte sauvage)
- Caractère : village littoral de la côte basaltique, berceau de la tresse de vacoa
- Points d'intérêt à rattacher (via `object_relation`, sous réserve d'import) : Maison de la Tresse et du Terroir (déjà en base, `LOIRUN000000010S`) ; Cap Méchant ; Puits des Anglais ; Puits Arabe ; Puits des Français ; Chapelle Saint-Jean-Baptiste de La Salle de Basse-Vallée ; Ancien cimetière de Basse Vallée
- Événement récurrent associé : Fête du Vacoa (août, site de Cap Méchant à Basse Vallée) — à modéliser en FMA distinct et relier

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (parkings aux sites associés Cap Méchant / Puits des Anglais à vérifier)
- Sanitaires : Non trouvé — à compléter
- Accès : desservi par la RN2 ; arrêt de bus « Case Basse Vallée » référencé (OpenStreetMap/mapcarta) — réseau à confirmer (Car Sud / Car Jaune)
- Restauration : Non trouvé — à compléter (snacks/restos de bord de RN2 à Basse Vallée et au Baril à recenser)

## Paiement / langues / accessibilité
- Moyens de paiement : Non applicable (village en accès libre) / Non trouvé — à compléter pour les commerces
- Langues : Non trouvé — à compléter (français ; créole réunionnais)
- Accessibilité PMR : Non trouvé — à compléter

## Labels & classements (object_classification)
- Aucun label revendiqué trouvé au niveau du village. À vérifier : statut de monument historique inscrit de l'« Ancien cimetière de Basse Vallée » (source Wikipédia, à confirmer auprès de la base Mérimée / DRAC) ; l'inscription PCI de la tresse de vacoa concerne le savoir-faire, pas le village. Pas de mapping LBL_* établi à ce stade.

## Médias suggérés
- Page OTI du Sud « La côte sauvage » : https://www.sudreuniontourisme.fr/tresors-du-sud/la-cote-sauvage.html (NE PAS télécharger sans autorisation)
- Site officiel de la Maison de la Tresse et du Terroir : https://maisondelatresse.re/ (NE PAS télécharger sans autorisation)
- Vidéo YouTube « Maison de la tresse et du terroir de Saint-Philippe » : https://www.youtube.com/watch?v=deXjfi2IGmY (référence, NE PAS réutiliser sans autorisation)
- Photos à obtenir auprès de la Mairie de Saint-Philippe / OTI du Sud avec autorisation.

## Données manquantes / à vérifier
- GPS d'un véritable centre de village (le point fourni est l'axe RN2, score BAN 0.69) — recaler sur la Maison de la Tresse ou la chapelle.
- Altitude.
- Périmètre exact du quartier (limites Basse Vallée vs Le Baril vs Marine — la Maison de la Tresse est parfois adressée « 8 RN2 Le Baril » : trancher l'appartenance Basse Vallée / Le Baril).
- Statut monument historique de l'« Ancien cimetière de Basse Vallée » (vérifier base Mérimée / arrêté).
- Desserte bus précise (ligne, exploitant).
- Équipements publics du village (parking, sanitaires, point d'eau, restauration).
- Liste définitive des points d'intérêt à rattacher + leur statut d'import (créés ou non).
- Population précise du quartier (5 082 hab. = commune entière en 2023, pas le quartier).

## Sources
- Maison de la Tresse et du Terroir — Petit Futé (Saint-Philippe, artisanat) — https://www.petitfute.co.uk/v36681-saint-philippe-97442/c1173-visites-points-d-interet/c976-archeologie-artisanat-science-et-technique/c978-artisanat/81368-maison-de-la-tresse-et-du-terroir.html — consulté le 2026-06-26
- La vannerie du vacoa à La Réunion / la tresse vacoa (Patrimoine Culturel Immatériel) — Ministère de la Culture — https://www.culture.gouv.fr/Media/Thematiques/Patrimoine-culturel-immateriel/Files/Fiches-inventaire-du-PCI/La-vannerie-du-vacoa-a-la-Reunion-La-tresse-vacoa — consulté le 2026-06-26
- La côte sauvage (Basse Vallée, Cap Méchant, Puits des Anglais, Puits Arabe) — OTI du Sud / sudreuniontourisme.fr — https://www.sudreuniontourisme.fr/tresors-du-sud/la-cote-sauvage.html — consulté le 2026-06-26
- Saint-Philippe (La Réunion) — Wikipédia (quartiers, postal 97442, fête du vacoa/palmiste, Chapelle Saint-Jean-Baptiste de La Salle, Ancien cimetière de Basse Vallée) — https://fr.wikipedia.org/wiki/Saint-Philippe_(La_R%C3%A9union) — consulté le 2026-06-26
- Fête du vacoa : 32e édition (site de Cap Méchant à Basse Vallée, ~100 000 visiteurs, tresseuses de la Maison de la Tresse) — France Info La 1ère — https://la1ere.franceinfo.fr/reunion/saint-philippe/fete-du-vacoa-la-32eme-edition-se-prepare-a-saint-philippe-du-8-au-17-aout-1609335.html — consulté le 2026-06-26
- Saint-Philippe – Cap Méchant, Puits des Français, Puits dit arabe (archéologie / patrimoine, quartier Basse Vallée) — ADLFI / OpenEdition — https://journals.openedition.org/adlfi/34419 — consulté le 2026-06-26
- Géocodage : Base Adresse Nationale — api-adresse.data.gouv.fr (q=Basse Vallée Saint-Philippe, citycode=97417) — consulté le 2026-06-26
