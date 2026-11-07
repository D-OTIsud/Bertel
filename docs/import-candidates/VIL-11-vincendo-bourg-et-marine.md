# Vincendo (bourg et Marine) — VIL (Village / localité touristique)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : Vincendo (bourg et Marine)
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun homologue VIL repéré (vérification SQL live du 2026-06-26 : `SELECT … FROM object WHERE name ILIKE '%vincendo%' OR name ILIKE '%marine%'` ⇒ seul `HLORUN0000000195` « Ti Case Mémé Lauret - Villa Marine » (HLO, hébergement, draft), qui n'est PAS le village ; aucun objet VIL « village/bourg » en base sur ce secteur). **Périmètre / portée de la fiche** : la présente fiche VIL couvre le **bourg/localité dans son ensemble** (village créole, hameaux des Hauts, commerces, équipements, accès Sud Sauvage), incluant la **Marine de Vincendo** comme point d'intérêt littoral. **MISE À JOUR (réévaluation 2026-07-30)** : une fiche candidate dédiée « La Marine de Vincendo » existe désormais dans le lot (**PNA-04**, passe 4). Pas de doublon : la présente fiche VIL couvre le bourg dans son ensemble, PNA-04 couvre le site naturel littoral (ZNIEFF, Conservatoire du littoral). Conserver les deux objets distincts (VIL village ⊃ site Marine) et créer une `object_relation` du VIL vers PNA-04 à l'import.

## Identité
- Catégorie / sous-type proposé : Village / localité touristique (porte d'entrée du Sud Sauvage)
- Chapo : Bourg authentique étiré sur près de 5 km entre océan Indien et pentes du volcan, Vincendo est l'une des portes d'entrée du Sud Sauvage : cases créoles, broderie traditionnelle, agriculture des Hauts et littoral sauvage de basalte noir.

## Description
Vincendo est un quartier (bourg intermédiaire) de la commune de Saint-Joseph, situé sur la côte sud de La Réunion le long de la RN2. Le bourg s'étire sur environ 5 kilomètres et conserve une atmosphère authentique, à l'écart des grands centres touristiques. Son histoire remonte au milieu du XVIIIe siècle, lorsque les premiers colons s'installèrent dans cette région d'accès difficile ; l'un d'eux, un certain François Vincendo, laissa son nom au lieu. Aujourd'hui, Vincendo et ses hameaux des Hauts (La Crête, Le Plateau, Jacques Payet, Matouta, Parc à Moutons…) vivent principalement de l'agriculture (canne à sucre, gingembre, palmiste). La broderie y est une tradition artisanale transmise de mère en fille, notamment à La Crête. Le littoral est marqué par des falaises de basalte noir et la Marine de Vincendo, plage de sable noir saisonnière (présente l'été, recouverte de galets et de houle australe le reste de l'année). Le bourg dispose d'équipements publics nombreux : mairie annexe, collège, lycée et équipements sportifs.

## Adresse & localisation (object_location)
- Adresse : Bourg de Vincendo, le long de la RN2 (accès des Hauts par les RD34 et RD37) — Saint-Joseph
- Code postal / ville : 97480 Saint-Joseph (quartier de Vincendo)
- GPS (WGS84) : -21.36964, 55.678107 — source : géocodage BAN (api-adresse.data.gouv.fr) « Chemin des Gingembres Vincendo 97480 Saint-Joseph », score 0.696, citycode 97412, type=street, consulté le 2026-06-26. Recoupement Wikipedia (centroïde du village) : 21°22′17″S 55°40′14″E ≈ -21.3714, 55.6706. Le point précis du centre-bourg reste à affiner sur le terrain.
- Altitude : Non trouvé — à compléter (bourg littoral à faible altitude, RN2 ; hameaux des Hauts plus élevés)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (mairie annexe de Vincendo ; le standard mairie de Saint-Joseph existe mais n'est pas le contact propre de l'objet)
- Email : Non trouvé — à compléter
- Site web : https://saintjoseph.re/Vincendo (page officielle du quartier sur le site de la Ville de Saint-Joseph)
- Réseaux sociaux : Non trouvé — à compléter
- Office de tourisme de rattachement : OTI du Sud ; antenne la plus proche à Manapany-les-Bains (~8 km)

## Horaires (object_opening)
Non trouvé — à compléter. Localité en accès libre permanent (espace public, pas d'horaires). Les commerces et équipements (mairie annexe, marché éventuel) ont leurs horaires propres, non documentés ici.

## Tarifs (object_price)
Accès libre et gratuit (village / localité et littoral en espace public). Aucun droit d'entrée. Les prestations privées (commerces, hébergements, restauration) ont leurs propres tarifs, hors périmètre de cette fiche.

## Données spécifiques VIL
VIL (village / localité) — pas de table facette dédiée (classifications/labels génériques seulement). Éléments descriptifs notables :
- Type : bourg littoral étiré (~5 km) sur la côte du Sud Sauvage, le long de la RN2
- Hameaux des Hauts rattachés : La Crête (1re et 2e), Le Plateau, Jacques Payet, Matouta, Parc à Moutons
- Patrimoine bâti : cases créoles traditionnelles (parmi les dernières de Saint-Joseph) ; mairie annexe
- Patrimoine immatériel / artisanat : broderie (transmission mère-fille, notamment à La Crête)
- Agriculture identitaire : canne à sucre, gingembre, palmiste
- Points d'intérêt naturels : Marine de Vincendo (plage de sable noir saisonnière, falaises de basalte, platier rocheux ; ZNIEFF, ~39,77 ha, gérée par le Conservatoire du littoral) ; proximité du Cap Jaune (sentier littoral, déjà fiche candidate) et des souffleurs
- Avertissement sécurité : baignade officiellement interdite/dangereuse à la Marine (forts courants, houle ; noyades signalées)
- Équipements publics : collège, lycée, équipements sportifs

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (descente carrossable vers la Marine ; stationnement le long du bourg à confirmer)
- Sanitaires publics : Non trouvé — à compléter
- Accès : route (RN2 ; RD34/RD37 vers les Hauts) ; sentier littoral entretenu reliant la Marine au Cap Jaune
- Restauration / commerces : présents dans le bourg (commerces de proximité) — détail non documenté
- Aire de pique-nique : pique-nique pratiqué à la Marine (mais camping, bivouac, feux, véhicules motorisés interdits sur le site classé)

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit) ; pour les commerces : Non trouvé — à compléter
- Langues : français (créole réunionnais usuel localement) ; autres langues d'accueil Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (littoral de basalte/galets et descente vers la Marine probablement peu accessibles ; bourg le long de la RN2 à évaluer)

## Labels & classements (object_classification)
- Aucun label touristique revendiqué trouvé pour le bourg.
- Protection environnementale du site littoral associé : Marine de Vincendo classée ZNIEFF (Zone Naturelle d'Intérêt Écologique, Faunistique et Floristique), ~39,77 ha, gestion Conservatoire du littoral. (Statut réglementaire/environnemental, à porter sur la fiche Marine plutôt que comme label LBL_* du village.)
- Aucun label LBL_* mappable (pas de Village Créole labellisé, Station Verte, etc. confirmé).

## Médias suggérés
- Page officielle du quartier (photos) : https://saintjoseph.re/Vincendo
- Fiche Conservatoire du littoral (photos du site Marine) : https://www.conservatoire-du-littoral.fr/siteLittoral/581/28-marine-de-vincendo-974_la-reunion.htm
- Reportage cases créoles de Vincendo (photos, Paul Clodel) : https://asspaulclodelkas.canalblog.com/archives/2013/07/03/27563162.html
- NE PAS télécharger ces images sans autorisation des ayants droit. Médias officiels libres de droits à solliciter auprès de la Ville de Saint-Joseph / OTI du Sud.

## Données manquantes / à vérifier
- GPS exact du centre-bourg (point retenu = rue du bourg, à affiner ; centroïde Wikipedia divergent de ~700 m)
- Altitude du bourg et des hameaux
- Téléphone / email / horaires de la mairie annexe de Vincendo
- Existence et jour d'un marché forain
- Présence et vocable d'une église/chapelle dans le bourg (non confirmée)
- Stationnement, sanitaires publics, accessibilité PMR
- Liste précise des commerces / restauration / hébergements du bourg
- Date de fondation précise (premiers colons « milieu du XVIIIe s. » / ~1735 cité par une source secondaire, à vérifier)
- Population du quartier
- Relation `object_relation` à créer vers « La Marine de Vincendo » (fiche candidate **PNA-04** du lot, passe 4) et vers « Cap Jaune » si/quand ces sites sont importés en objets distincts (la Marine reste aussi mentionnée ici comme point d'intérêt du VIL)

## Sources
- Vincendo — Ville de Saint-Joseph (site officiel) — https://saintjoseph.re/Vincendo — consulté le 2026-06-26
- Vincendo — Wikipedia (EN, coordonnées 21°22′17″S 55°40′14″E) — https://en.wikipedia.org/wiki/Vincendo — consulté le 2026-06-26
- Visiter Vincendo — Routard — https://www.routard.com/fr/guide/afrique/reunion/cote-sud-et-sud-sauvage/vincendo — consulté le 2026-06-26
- Marine de Vincendo (ZNIEFF, 39,77 ha) — Conservatoire du littoral — https://www.conservatoire-du-littoral.fr/siteLittoral/581/28-marine-de-vincendo-974_la-reunion.htm — consulté le 2026-06-26
- Les dernières cases créoles de Vincendo (Paul Clodel) — canalblog — https://asspaulclodelkas.canalblog.com/archives/2013/07/03/27563162.html — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr), « Chemin des Gingembres Vincendo 97480 Saint-Joseph », score 0.696, citycode 97412 — consulté le 2026-06-26
