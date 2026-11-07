# Fête du Lait de la Plaine des Cafres — FMA (Fête / manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Fête du Lait de la Plaine des Cafres
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `public.object` : seul résultat FMA = « test », `archived` ; aucune occurrence de « lait » / « sica » / « plaine des cafres » dans les noms). Aucun doublon non plus dans la liste « déjà proposé » (31 fiches). Pas d'homologue à lier ou dédupliquer.

## Identité
- Catégorie / sous-type proposé : Fête populaire / manifestation agricole et gastronomique (filière laitière). Événement annuel récurrent (novembre, week-end).
- Chapo : Chaque mois de novembre, la Plaine des Cafres — capitale laitière de La Réunion — célèbre sa Fête du Lait : un week-end gratuit de visites de fermes, traite des vaches, démonstrations culinaires, dégustations et grande tombola, organisé par la coopérative SICALAIT.

## Description
La Fête du Lait est une manifestation annuelle organisée par la coopérative laitière réunionnaise SICALAIT à la Plaine des Cafres (Le Tampon), berceau historique de la production laitière de l'île. La première édition s'est tenue les 2-3 juillet 2022 à l'occasion des 60 ans de la coopérative, avant que l'événement ne s'installe sur un week-end de novembre. La 3e édition (9-10 novembre 2024) avait pour thème « Les Olympiades du Lait » et la 4e édition s'est tenue les 8-9 novembre 2025 (9h-18h). L'entrée est gratuite. Le programme associe vente de lait péi, visites guidées d'exploitations laitières (avec démonstrations de traite), shows culinaires animés par des chefs et dégustations de plats à base de lait, ainsi qu'une grande tombola le dimanche. Des navettes en bus relient le site aux fermes participantes ; un espace pique-nique est aménagé sur place. L'événement met en valeur la filière laitière locale et sensibilise le public aux métiers de l'élevage.

## Adresse & localisation (object_location)
- Adresse : Grands Kiosques de la Plaine des Cafres, 170 rue Alfred Lacroix
- Code postal / ville : 97418 Le Tampon (La Plaine des Cafres / Bourg-Murat) — NB : le site officiel SICALAIT (sica-lait.re/fete-du-lait/) affiche bien « 170 rue Alfred Lacroix, 97430 Le Tampon » ; le géocodage BAN et Mappy retournent le code postal 97418 pour cette même adresse. **Sans impact sur le périmètre** : 97418/97430 sont des codes POSTAUX, la commune reste Le Tampon (INSEE 97422, confirmé par le citycode BAN). À trancher à la révision (97418 = code postal des Hauts du Tampon / Plaine des Cafres).
- GPS (WGS84) : -21.204941, 55.572748 — source : géocodage BAN api-adresse.data.gouv.fr de « 170 rue Alfred Lacroix Le Tampon » (citycode=97422), score 0.975, label retourné « 170 Rue Alfred Lacroix 97418 Le Tampon ». (La BAN renvoie l'ordre [lon, lat] ; reporté ici en lat, lon. Latitude négative = hémisphère sud, cohérent avec La Réunion.)
- Altitude : ~1 500 m environ (la Plaine des Cafres est un plateau d'altitude ; le site est sur la RN3 « Route des Plaines » au PK 27, à proximité de la Cité du Volcan) — valeur indicative à confirmer ; "Non trouvé — à compléter" (altitude exacte du site).

## Contacts (object_contact)
- Téléphone : 0262 59 35 30 (siège SICALAIT) ; ligne info Fête du Lait : 0693 01 79 87 — source : sica-lait.re/fete-du-lait-2025
- Email : communication@sicalait.fr — source : sica-lait.re/fete-du-lait-2025
- Site web : https://sica-lait.re/fete-du-lait/ (page dédiée) ; coopérative : https://sica-lait.re/
- Réseaux sociaux : Facebook https://www.facebook.com/sicalaitreunion/ (page officielle SICALAIT) ; chaîne YouTube SICALAIT (mentionnée sur le site, URL exacte "Non trouvé — à compléter")

## Horaires (object_opening)
- Saisonnalité : événement annuel, un week-end de novembre (samedi + dimanche).
- Éditions connues : 1re éd. 2-3 juillet 2022 ; 2e éd. (date exacte « Non trouvé — à compléter ») ; 3e éd. 9-10 novembre 2024 ; 4e éd. 8-9 novembre 2025.
- Horaires : 9h à 18h (édition 2025) ; les éditions 2022 et 2024 ouvraient à 9h. Navettes fermes : départ toutes les 30 min, 9h30-15h (édition 2022).
- Date de la prochaine édition (novembre 2026) : "Non trouvé — à compléter" (à confirmer auprès de la SICALAIT).

## Tarifs (object_price)
- Entrée gratuite (éditions 2022, 2024 et 2025 — confirmé par Azenda et Free Dom).
- Certains produits sont vendus sur place (ex. lait frais péi vendu ~2 € la bouteille selon Linfo.re ; vente de produits par les exposants alimentaires). Tarifs des produits non détaillés / variables.

## Données spécifiques FMA (object_fma + occurrences)
- Type de manifestation : fête populaire / foire agricole et gastronomique (filière laitière).
- Périodicité : annuelle.
- Mois : novembre (week-end). Historiquement la 1re édition a eu lieu en juillet 2022 (60 ans de la coopérative), puis bascule en novembre.
- Durée : 2 jours (samedi-dimanche).
- Lieu / site : Grands Kiosques de la Plaine des Cafres (Le Tampon).
- Organisateur : SICALAIT (coopérative laitière de La Réunion, fondée en 1962).
- Thème par édition : 2024 = « Les Olympiades du Lait » ; thème 2025 / 2026 "Non trouvé — à compléter".
- Public : tout public / familial.
- Fréquentation : "Non trouvé — à compléter" (chiffres d'affluence non confirmés par les sources consultées).

## Équipements & services (object_amenity)
- Parking : présent (parking des Grands Kiosques, rue des Grands Kiosques / Bourg-Murat — source Waze/Mappy). À confirmer capacité.
- Navettes bus gratuites vers les fermes participantes (toutes les 30 min lors de l'édition 2022).
- Espace pique-nique aménagé sur site (édition 2022).
- Restauration : stands de vente alimentaire d'exposants (produits laitiers et autres).
- Sanitaires / accès : "Non trouvé — à compléter".

## Paiement / langues / accessibilité
- Moyens de paiement : "Non trouvé — à compléter" (vente sur stands ; modalités non précisées).
- Langues : français (présumé ; non précisé) — "Non trouvé — à compléter".
- Accessibilité PMR : "Non trouvé — à compléter".

## Labels & classements (object_classification)
- Aucun label revendiqué trouvé pour l'événement. Aucun mapping LBL_* applicable.

## Médias suggérés
- Photos officielles sur le site SICALAIT : https://sica-lait.re/fete-du-lait/ et https://sica-lait.re/fete-du-lait-2025/
- Page Facebook SICALAIT (albums photos des éditions) : https://www.facebook.com/sicalaitreunion/
- Reportages vidéo (Free Dom, Réunion La 1ère) sur les éditions 2022/2024.
- Mention : NE PAS télécharger / réutiliser sans autorisation de SICALAIT (droits d'auteur / droit à l'image).

## Données manquantes / à vérifier
- Code postal exact du site (97418 d'après BAN/Mappy vs 97430 affiché par SICALAIT) — à trancher.
- Altitude précise du site.
- Date exacte de la 2e édition et dates de l'édition 2026.
- Thème 2025/2026 ; chiffres de fréquentation ; nombre d'exposants/producteurs.
- Horaires précis par jour (samedi vs dimanche) hors édition 2025.
- Moyens de paiement, langues, accessibilité PMR, sanitaires.
- URL exacte de la chaîne YouTube SICALAIT.
- Géométrie/contour du site événementiel (point GPS du parvis des Grands Kiosques à affiner si nécessaire).

## Sources
- Fête du lait — SICALAIT (page dédiée) — https://sica-lait.re/fete-du-lait/ — consulté le 2026-06-26
- Fête du Lait 2025 (4e édition, 8-9 nov., 9h-18h, contacts) — https://sica-lait.re/fete-du-lait-2025/ — consulté le 2026-06-26
- Fête du lait 2024 (3e éd., 9-10 nov., gratuit, « Olympiades du Lait », programme) — Azenda.re — https://azenda.re/loisirs/fete-du-lait-2024/ — consulté le 2026-06-26
- Plaine des Cafres : la 3e édition de la Fête du lait du 9 au 10 novembre — Linfo.re — https://www.linfo.re/la-reunion/societe/plaine-des-cafres-la-3e-edition-de-la-fete-du-lait-du-9-au-10-novembre — consulté le 2026-06-26 (titre/sommaire vus en résultat de recherche)
- Fête du Lait : les clients s'arrachent les bouteilles de lait frais à 2 € — Linfo.re — https://www.linfo.re/la-reunion/societe/fete-du-lait-les-clients-s-arrachent-les-bouteilles-de-lait-frais-vendues-a-2eur — consulté le 2026-06-26 (titre vu en résultat de recherche)
- Page Facebook officielle SICALAIT — https://www.facebook.com/sicalaitreunion/ — consulté le 2026-06-26
- Les Grands Kiosques du Tampon (localisation du site événementiel) — Reuniplans / Mappy — https://fr.mappy.com/plan/4b-rue-des-Grands-Kiosques-97418-Le-Tampon — consulté le 2026-06-26
- Géocodage BAN — https://api-adresse.data.gouv.fr/search/?q=170+rue+Alfred+Lacroix+Le+Tampon&citycode=97422 — consulté le 2026-06-26
