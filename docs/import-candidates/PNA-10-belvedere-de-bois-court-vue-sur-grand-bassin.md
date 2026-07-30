# Belvédère de Bois-Court (vue sur Grand Bassin) — PNA (Point naturel d'accueil / point de vue)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Belvédère de Bois-Court (vue sur Grand Bassin)
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `public.object`). Les seules occurrences proches sont des hébergements/restauration HLO du hameau de Grand Bassin et de Bois-Court (`Auberge de Grand Bassin` HLO published ; `Escale du point de vue` HLO draft ; `LE BELVÉDÈRE` HLO draft) — ce sont des établissements distincts (gîtes/restaurants), PAS le point de vue/belvédère lui-même. Aucun objet PNA « Belvédère » ni « point de vue Grand Bassin » n'existe. Action recommandée : créer la fiche PNA ; conserver les HLO homonymes inchangés (objets différents) ; le cas échéant, lier le belvédère aux HLO du hameau via `object_relation` plus tard.

## Identité
- Catégorie / sous-type proposé : Point de vue / belvédère panoramique aménagé (site naturel d'accueil, accès public). Sous-élément remarquable : plateforme en verre suspendue au-dessus du vide (inaugurée le 28 août 2025) + horloge à eau.
- Chapo : Perché à ~1 390 m d'altitude sur la Plaine des Cafres, le Belvédère de Bois-Court offre un panorama spectaculaire sur le hameau isolé de Grand Bassin et la cascade de la Voile de la Mariée. Depuis août 2025, une passerelle en verre suspendue au-dessus du vide — unique à La Réunion — fait marcher les visiteurs « dans le vide ».

## Description
Le Belvédère de Bois-Court est un point de vue aménagé situé au bout de la route départementale D70, sur le territoire de la commune du Tampon (Plaine des Cafres). À environ 1 390 m d'altitude, il domine le cirque encaissé de Grand Bassin, un hameau habité depuis 1789 et accessible uniquement à pied, où convergent trois bras de rivière. Le site permet d'observer le village de Grand Bassin en contrebas ainsi que la cascade dite « Voile de la Mariée ». Réaménagé pour un coût d'environ 4,5 à 6 millions d'euros (financement majoritairement régional/européen FEDER, selon les sources), le belvédère a été doté en 2025 d'une plateforme en verre suspendue au-dessus du vide — la première du genre sur l'île — ainsi que d'une nouvelle horloge à eau (clepsydre) remplaçant celle de Bernard Gitton détruite par les cyclones. Le site comprend un parking, une aire de pique-nique avec kiosques et un marché de producteurs/artisans le dimanche matin. Un sentier réputé descend de là vers Grand Bassin (≈ 4 h aller-retour).

## Adresse & localisation (object_location)
- Adresse : Bois-Court, au terminus de la route départementale D70 (depuis la Route des Plaines / RN3, sortie au Vingt-Troisième « km 23 » direction Bois-Court, puis ~5 km jusqu'au parking)
- Code postal / ville : 97418 Bois-Court — Le Tampon (le secteur Plaine des Cafres porte aussi le CP 97430 ; le toponyme « Bois Court » est référencé en 97418 par la BAN)
- GPS (WGS84) : -21.190556, 55.536944 (≈ 21°11′26″ S, 55°32′13″ E) — source : Wikipédia « Belvédère de Bois Court » (coordonnées du point de vue), consulté le 2026-06-26. NB géocodage BAN (api-adresse.data.gouv.fr, citycode=97422) peu fiable pour ce site non adressé : requête « Belvedere Bois Court » → « Bois Court 97418 Le Tampon » [55.55301, -21.216861] score 0.44 ; requête « Bois-Court Plaine des Cafres Le Tampon » → « La Plaine des Cafres 97430 » [55.559604, -21.222897] score 0.62. Ces points BAN désignent le secteur/voie, PAS le belvédère ; **retenir les coordonnées Wikipédia** plus précises pour le point de vue.
- Altitude : ~1 390 m (Wikipédia : 1 390 m ; sources tourisme : « ~1 400 m »)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (information municipale ; possible accueil via Mairie du Tampon / Office de tourisme — à vérifier)
- Email : Non trouvé — à compléter
- Site web : Pages de référence — letampon.fr (actualités/infos pratiques de la plateforme) ; sudreuniontourisme.fr (OTI du Sud, « Bois-Court et Grand Bassin »). Pas de site web dédié propre identifié — à compléter
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
- Ouvert du mardi au dimanche. Fermé le lundi (opérations de maintenance/entretien).
- Été austral (1er sept. → 30 avr.) : 9h00 – 18h00
- Hiver austral (1er mai → 31 août) : 9h00 – 17h00
- Dernière entrée : 20 minutes avant la fermeture.
- Note : ces horaires concernent l'accès à la **plateforme en verre** (réglementé par les arrêtés municipaux n° 615/2025 et 616/2025, jauge/conditions de visite). L'aire de pique-nique et le point de vue « classique » sont accessibles plus largement — amplitude exacte à confirmer. Source : letampon.fr, consulté le 2026-06-26.

## Tarifs (object_price)
- Accès **GRATUIT** à la date des sources (août 2025) : entrée libre à la plateforme en verre, surchaussures de protection fournies sans frais.
- Réserve / à surveiller : la gratuité totale « pourrait être remise en question à terme » (débat sur une participation symbolique de l'ordre de 2 € évoqué dans la presse, non décidée/non appliquée). À revérifier avant publication — la tarification a pu évoluer depuis 2025. Source : Ko@fé (31/08/2025).

## Données spécifiques PNA
- Pas de table facette type-spécifique (PNA → classifications/labels génériques uniquement).
- Caractère du site : point de vue / belvédère panoramique aménagé, accès public à pied, site municipal.
- Éléments remarquables sur place : plateforme/passerelle en verre suspendue au-dessus du vide (inaugurée 28/08/2025, unique à La Réunion) ; horloge à eau (clepsydre, installée 2025) ; aire de pique-nique avec kiosques ; marché de producteurs/artisans le dimanche matin.
- Panorama : hameau de Grand Bassin (cirque, confluence de trois bras de rivière), cascade « Voile de la Mariée », vallée du Bras de la Plaine.
- Téléphérique/monte-charge : un monte-charge rudimentaire ravitaille le hameau de Grand Bassin en contrebas (équipement de desserte du village, non destiné aux visiteurs).
- Sentier de randonnée associé (objet ITI distinct, déjà proposé séparément : « Grand Bassin Voile de la Mariée » / « Sentier de Grand Bassin ») : descente vers Grand Bassin ≈ 4 h A/R (≈1h30 descente, ≈2h30 montée), eau potable à mi-parcours. Lien recommandé via `object_relation [uses_itinerary]`.

## Équipements & services (object_amenity)
- Parking : oui, au terminus de la D70 (env. 200 places selon la presse post-réaménagement ; à confirmer)
- Aire de pique-nique avec kiosques et espaces ombragés : oui
- Sanitaires : Non trouvé — à compléter
- Restauration sur place : Non trouvé au belvédère même — restaurants/gîtes disponibles dans le hameau de Grand Bassin (objets HLO distincts) ; marché de producteurs le dimanche matin
- Accès à pied / sentier de randonnée : oui (départ du sentier vers Grand Bassin à gauche du point de vue)

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit à ce jour) — Non trouvé pour un éventuel tarif futur
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (la passerelle en verre est récente et de plain-pied côté belvédère, mais aucune information PMR officielle confirmée ; le sentier vers Grand Bassin n'est PAS accessible PMR)

## Labels & classements (object_classification)
- Aucun label touristique formel revendiqué trouvé (pas de mapping LBL_* confirmé). Site municipal d'accueil ; rattaché à l'offre « Trésors du Sud » de l'OTI du Sud (mise en avant éditoriale, non un label). À compléter si un label/classement est ultérieurement attesté.

## Médias suggérés
- Page IRT / Île de la Réunion Tourisme : https://en.reunion.fr/offers/belvedere-de-bois-court-la-plaine-des-cafres-le-tampon-en-6056743/ (photos officielles du site) — NE PAS télécharger sans autorisation.
- Page OTI du Sud « Bois-Court et Grand Bassin » : https://www.sudreuniontourisme.fr/tresors-du-sud/bois-court-et-grand-bassin.html — NE PAS télécharger sans autorisation.
- Reportages presse (passerelle en verre) : la1ere.franceinfo.fr, linfo.re — visuels sous droits, NE PAS télécharger sans autorisation.
- Wikipédia / Wikimedia Commons : « Belvédère de Bois Court » — vérifier la licence de chaque image avant réutilisation.

## Données manquantes / à vérifier
- Coordonnées GPS exactes du point d'accueil/parking (les coordonnées retenues = Wikipédia du belvédère ; à valider terrain/IGN).
- Tarif actuel 2026 (gratuit confirmé en 2025 — vérifier qu'aucune participation n'a été instaurée depuis).
- Téléphone, email, site web officiel dédié, réseaux sociaux.
- Capacité parking exacte, présence et type de sanitaires, accessibilité PMR.
- Amplitude horaire de l'aire de pique-nique / point de vue hors plateforme en verre.
- Langues d'accueil, présence d'un agent/accueil sur site.
- Altitude/CP exacts à harmoniser (1 390 vs « ~1 400 m » ; 97418 vs 97430).
- Texte des arrêtés municipaux 615/2025 et 616/2025 (jauge, règles de visite de la passerelle).

## Sources
- Belvédère de Bois Court — Wikipédia — https://fr.wikipedia.org/wiki/Belv%C3%A9d%C3%A8re_de_Bois_Court — consulté le 2026-06-26 (GPS, altitude, historique horloge à eau, plateforme en verre, accès Grand Bassin).
- Les infos pratiques pour accéder à la plateforme en verre du Belvédère de Bois Court — Ville du Tampon (letampon.fr) — https://letampon.fr/actualites/les-infos-pratiques-pour-acceder-a-la-plateforme-en-verre-du-belvedere-de-bois-court/ — consulté le 2026-06-26 (horaires été/hiver, fermeture lundi, dernière entrée, arrêtés 615/616-2025).
- Bois-Court et Grand Bassin — Offices de Tourisme du Sud (sudreuniontourisme.fr) — https://www.sudreuniontourisme.fr/tresors-du-sud/bois-court-et-grand-bassin.html — consulté le 2026-06-26 (altitude ~1 400 m, kiosque/pique-nique, accès, sentier, Voile de la Mariée).
- Bois Court – Point de vue sur Grand Bassin — guide-reunion.fr — https://guide-reunion.fr/bois-court-point-de-vue-sur-grand-bassin/ — consulté le 2026-06-26 (itinéraire D70 depuis le km 23, parking au terminus, plateforme verre, marché dominical, horloge).
- Une nouvelle passerelle en verre suspendue au Belvédère de Bois Court — La 1ère / France Info (la1ere.franceinfo.fr) — https://la1ere.franceinfo.fr/reunion/tampon/plaine-cafres/une-nouvelle-passerelle-en-verre-suspendue-au-belvedere-de-bois-court-a-la-plaine-des-cafres-1617551.html — consulté le 2026-06-26 (passerelle inaugurée 28/08/2025, ~6 M€, ~200 places de parking, horloge hydraulique).
- Belvédère de Bois-Court : la gratuité en question — Ko@fé (koafe.info, 31/08/2025) — https://www.koafe.info/index.php/2025/08/31/le-belvedere-de-bois-court-la-gratuite-en-question/ — consulté le 2026-06-26 (accès gratuit confirmé en 2025, surchaussures gratuites, débat sur participation future, financement FEDER 80 %).
- Page IRT — Belvédère de Bois-Court (La Plaine Des Cafres, Le Tampon) — en.reunion.fr — https://en.reunion.fr/offers/belvedere-de-bois-court-la-plaine-des-cafres-le-tampon-en-6056743/ — consulté le 2026-06-26 (fiche tourisme officielle ; contenu pratique partiellement chargé).
- Géocodage BAN — api-adresse.data.gouv.fr (citycode=97422) — consulté le 2026-06-26 (résultats de faible score, secteur uniquement ; voir section localisation).
