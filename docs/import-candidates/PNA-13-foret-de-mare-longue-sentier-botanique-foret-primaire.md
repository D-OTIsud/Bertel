# Forêt de Mare Longue — PNA (Patrimoine naturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Forêt de Mare Longue
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun homologue en base** (vérification SQL live du 2026-06-26 : `SELECT … FROM object WHERE name ILIKE '%mare longue%' OR '%sentier botanique%' OR '%forêt primaire%'` → 0 ligne). **ATTENTION dédoublonnage interne aux candidates** : « Sentier botanique de Mare Longue » figure DÉJÀ dans la liste des 31 fiches proposées, en tant qu'**itinéraire (ITI)**. La présente fiche couvre le **site naturel / forêt primaire** (PNA = patrimoine naturel, la réserve et la forêt en tant que lieu de découverte), distinct du tracé de randonnée. **Action recommandée** : conserver les deux comme objets distincts et les **lier** par `object_relation` (le sentier botanique [ITI] `based_at_site` / part de la Forêt de Mare Longue [PNA]). Si l'OTI préfère un seul objet, fusionner l'ITI dans cette fiche PNA et porter la facette ITI ici.

## Identité
- Catégorie / sous-type proposé : Site naturel / forêt — réserve naturelle nationale (forêt primaire tropicale humide de basse altitude)
- Chapo : L'une des dernières forêts tropicales primaires de basse altitude des Mascareignes, la plus riche de La Réunion. Un sentier botanique aménagé par l'ONF parcourt cette réserve naturelle de 68 ha, au cœur du Sud sauvage, classée au patrimoine mondial de l'UNESCO.

## Description
La forêt de Mare Longue, à Saint-Philippe, est l'une des rares forêts naturelles originelles encore préservées des régions chaudes et humides du globe et la forêt tropicale la plus riche de La Réunion. Installée sur une coulée de lave, elle présente un enchevêtrement de racines dans les roches basaltiques, mousses, fougères, orchidées et de nombreuses espèces endémiques (bois de couleur). Moins de 7 % de la forêt tropicale humide d'origine de l'île subsiste, principalement ici. Le site a d'abord été classé réserve biologique en 1958 (23 ha) puis agrandi en 1981 à 68 ha, devenant la première réserve naturelle de La Réunion ; il est géré par l'Office national des forêts (ONF). Une stèle rend hommage au professeur Thérésien Cadet (1937-1987), premier à avoir étudié en profondeur cette végétation et à avoir alerté, au début des années 1970, sur la nécessité de la préserver. La forêt est partiellement comprise dans le territoire du Parc national de La Réunion et dans le bien UNESCO « Pitons, cirques et remparts de l'île de La Réunion ».

## Adresse & localisation (object_location)
- Adresse : Route forestière de Mare Longue (RF.4), Le Baril — accès depuis la RN2 ; après le panneau « Puits des Anglais » au Baril, suivre « Sentier botanique de Mare-Longue », puis la RF.4 sur ~1,2 km jusqu'au parking
- Code postal / ville : 97442 Saint-Philippe (Le Baril)
- GPS (WGS84) : **-21.33220, 55.74530** (départ du sentier botanique ONF — source ONF) ; corroboré par la réserve à -21.3403, 55.7472 (Wikipédia, 21°20′25″S 55°44′50″E). Géocodage BAN de l'adresse « route forestière de Mare Longue, Le Baril, Saint-Philippe » (api-adresse.data.gouv.fr, citycode 97417) → « Route Forestiere Mare Longue 97442 Saint-Philippe », lat -21.36383 / lon 55.743235, **score 0.68** (voie, moins précis que le point ONF). **Coordonnée retenue : -21.33220, 55.74530 (ONF, départ sentier).**
- Altitude : 212 m au départ du sentier botanique (ONF) ; la réserve s'étage de 150 à 700 m (Wikipédia)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (gestionnaire ONF Réunion ; OTI du Sud pour l'accueil touristique)
- Email : Non trouvé — à compléter
- Site web : https://www.sudreuniontourisme.fr/tresors-du-sud/la-foret-de-mare-longue.html (OTI du Sud) ; fiche ONF : https://www.onf.fr/vivre-la-foret/activites/+/120d::sentier-botanique-de-mare-longue.html
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Non trouvé — à compléter. Site naturel en accès libre et réglementé (ONF) ; en pratique accessible en journée. Aucune plage horaire officielle publiée sur les sources consultées.

## Tarifs (object_price)
**Gratuit** — accès libre et réglementé au sentier botanique (ONF). Aucun droit d'entrée. Visites guidées possibles (mention Wikipédia d'un service de guidage) — tarifs des prestations guidées : Non trouvé — à compléter.

## Données spécifiques PNA
PNA = patrimoine naturel : pas de table de facette type-spécifique (classifications/labels génériques + `object_location`).
- Nature du site : forêt primaire tropicale humide de basse altitude sur coulée de lave
- Statut de protection : Réserve naturelle nationale (classée réserve biologique 1958, 23 ha → réserve naturelle 1981, 68 ha) ; partiellement dans le Parc national de La Réunion ; bien UNESCO « Pitons, cirques et remparts »
- Surface : 68 ha (réserve)
- Gestionnaire : Office national des forêts (ONF)
- Intérêt : flore endémique (bois de couleur, fougères, orchidées dont *Bulbophyllum nutans*), succession végétale de colonisation des laves, stèle Thérésien Cadet
- NB : un itinéraire de randonnée associé (« Sentier botanique de Mare Longue ») existe comme objet ITI distinct — voir la note de doublon. Caractéristiques du parcours court ONF : boucle 850 m, ~1 h, balisage GR (rouge/blanc) puis bleu, altitude 212 m (à porter sur l'objet ITI, pas sur ce PNA).

## Équipements & services (object_amenity)
- Parking : OUI (parking au départ du sentier — ONF)
- Panneau d'information + kiosque au départ du sentier (ONF)
- Tables de pique-nique : signalées le long du parcours (Randopitons)
- Sanitaires : Non trouvé — à compléter (aucune mention de toilettes sur les sources)
- Restauration : Non trouvé — à compléter (aucune sur site ; restauration au Baril / Saint-Philippe)

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (sentier forestier en sous-bois sur coulée de lave, dénivelé > 200 m sur la boucle longue ; la boucle courte ONF de 850 m est courte mais le terrain reste naturel — à vérifier sur le terrain)

## Labels & classements (object_classification)
- Réserve naturelle nationale (statut réglementaire ONF — à mapper sur la taxonomie patrimoine/protection ; pas un LBL_* commercial)
- Inscrit au patrimoine mondial de l'UNESCO (zone cœur du Parc national « Pitons, cirques et remparts ») — à mapper si vocabulaire dédié
- Aucun label touristique commercial (LBL_*) revendiqué / trouvé

## Médias suggérés
- Photos officielles sur la fiche OTI du Sud : https://www.sudreuniontourisme.fr/tresors-du-sud/la-foret-de-mare-longue.html
- Photos sur la fiche ONF : https://www.onf.fr/vivre-la-foret/activites/+/120d::sentier-botanique-de-mare-longue.html
- Photos sur en.reunion.fr (IRT) : https://en.reunion.fr/offers/foret-de-mare-longue-saint-philippe-en-575461/
- **NE PAS télécharger sans autorisation** (droits ONF / OTI / IRT à vérifier avant tout usage)

## Données manquantes / à vérifier
- Téléphone, email, réseaux sociaux du gestionnaire / point d'accueil
- Horaires officiels d'accès (le cas échéant période de fermeture saisonnière / sécurité)
- Sanitaires sur site (présence/absence)
- Accessibilité PMR réelle du sentier court ONF
- Existence et tarifs d'éventuelles visites guidées (mention Wikipédia à confirmer)
- Code postal : 97442 (CP de la commune de Saint-Philippe, dont le hameau du Baril fait partie). NB : INSEE de la commune = 97417 ; CP = 97442 (les deux désignent bien Saint-Philippe, ils ne se correspondent pas chiffre à chiffre). Rien à confirmer ici.
- Distinction définitive PNA (site) vs ITI (sentier déjà proposé) : décision OTI (lier ou fusionner)
- Coordonnée GPS de référence à valider terrain (point ONF -21.33220/55.74530 retenu vs point réserve Wikipédia)

## Sources
- Sentier botanique de Mare-Longue — ONF — https://www.onf.fr/vivre-la-foret/activites/+/120d::sentier-botanique-de-mare-longue.html — consulté le 2026-06-26
- La forêt de Mare Longue — OTI du Sud (sudreuniontourisme.fr) — https://www.sudreuniontourisme.fr/tresors-du-sud/la-foret-de-mare-longue.html — consulté le 2026-06-26
- Forêt de Mare Longue (Saint-Philippe) — Île de la Réunion Tourisme (IRT) — https://en.reunion.fr/offers/foret-de-mare-longue-saint-philippe-en-575461/ — consulté le 2026-06-26
- Le sentier botanique de Mare Longue à Saint-Philippe — Randopitons — https://randopitons.re/randonnee/1328-sentier-botanique-mare-longue-saint-philippe — consulté le 2026-06-26
- Forêt de Mare Longue — Wikipédia — https://fr.wikipedia.org/wiki/For%C3%AAt_de_Mare_Longue — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr, citycode 97417), label « Route Forestiere Mare Longue 97442 Saint-Philippe », score 0.68 — consulté le 2026-06-26
