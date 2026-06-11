# Toilettes publiques de la rue Maury — Saint-Joseph — SPU (Service public)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : Toilettes publiques de la rue Maury — Saint-Joseph
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Sous-catégorie (taxonomy_spu) : public_toilets
- Doublon potentiel en base : aucun — vérifié en base live le 2026-06-11 (`select name, object_type, status from object where name ilike '%toilette%' or name ilike '%Maury%' or name ilike '%sanitaire%'` → 0 ligne) ; aucune fiche SPU existante dans `docs/import-candidates/` ; PNA-02 Cap Méchant est un site naturel distinct, pas un équipement sanitaire

## Identité
- Chapo : Bloc sanitaire public du centre-ville de Saint-Joseph, situé rue Maury, avec cabines hommes/femmes et accès fauteuil roulant. Géré par la commune.

## Description
Implantées en plein cœur commerçant de Saint-Joseph, au niveau du n° 29 de la rue Maury (angle rue Henri Payet), ces toilettes publiques desservent le centre-ville, ses commerces et la Grande Halle voisine où se tient le marché forain chaque vendredi de 8 h à 14 h. L'équipement comprend des cabines séparées hommes et femmes, avec chasse d'eau, et est signalé comme accessible aux personnes en fauteuil roulant ; il ne dispose pas de table à langer. La gestion relève de la Ville de Saint-Joseph, qui y a notamment mené des travaux d'amélioration en novembre 2016. Point de commodité utile pour les visiteurs du Sud sauvage en transit par le centre-bourg (RN2, front de mer et marché à proximité immédiate), l'équipement est recensé sur OpenStreetMap (dernière mise à jour de la fiche contributive : mars 2024).

## Adresse & localisation (object_location)
- Adresse : Rue Maury, au niveau du n° 29 (angle rue Henri Payet), centre-ville — source : géocodage inverse BAN (rue Maury à 16 m du point) + OpenStreetMap
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.377519, 55.617589 — source : OpenStreetMap, nœud 10872920836 (commune confirmée INSEE 97412 par géocodage inverse BAN)

## Contacts (object_contact)
- Gestionnaire / exploitant : Ville de Saint-Joseph (travaux d'amélioration annoncés par la commune en 2016)
- Téléphone : Non trouvé — à compléter (standard mairie de Saint-Joseph, 90 rue Hubert Delisle)
- Site web / appli : https://saintjoseph.re (site de la commune ; pas de page dédiée à l'équipement)

## Horaires (object_opening)
Non trouvé — à compléter (aucun horaire publié par la commune ; pas de tag `opening_hours` sur le nœud OpenStreetMap)

## Coût (object_price)
Non trouvé — à compléter (pas de tag `fee` sur le nœud OpenStreetMap ; gratuité probable pour un sanitaire municipal mais non documentée — ne pas affirmer sans confirmation)

## Données spécifiques SPU
- Sous-catégorie (taxonomy_spu) : public_toilets
- Accès : public (`access=yes` OpenStreetMap) ; amplitude horaire non documentée — à compléter
- Coût : non documenté (voir Coût ci-dessus)
- Accessibilité PMR : oui selon OpenStreetMap (`wheelchair=yes`, mise à jour 2024-03-26) — à confirmer sur le terrain
- Gestionnaire / exploitant : Ville de Saint-Joseph (commune)
- Caractéristiques techniques : cabines séparées hommes (`male=yes`) et femmes (`female=yes`) ; évacuation à chasse d'eau (`toilets:disposal=flush`) ; pas de table à langer (`changing_table=no`) ; nombre de cabines non documenté

## Accessibilité
Accès fauteuil roulant signalé (`wheelchair=yes`, OpenStreetMap, mars 2024). Aucun label (Tourisme & Handicap ou autre) documenté. À confirmer sur le terrain.

## Données manquantes / à vérifier
- Horaires d'ouverture (24/7 ou fermeture nocturne ?) — interroger les services techniques de la mairie
- Gratuité (probable mais non sourcée)
- Nombre exact de cabines et présence d'un urinoir / point d'eau
- Téléphone du service gestionnaire (standard mairie)
- État actuel de l'équipement : la source municipale date de 2016 (travaux d'amélioration) et la dernière confirmation contributive (OSM) de mars 2024 — confirmation terrain 2026 requise avant publication
- Photo de l'équipement (aucune trouvée en ligne)
- Candidats alternatifs relevés dans le périmètre, pour arbitrage OTI :
  - Saint-Joseph / Manapany-les-Bains : WC publics près du bassin de baignade, boulevard de l'Océan (-21.372944, 55.588246), gratuits, 24/7, chasse d'eau selon OpenStreetMap (nœud 12543332122, janv. 2025) — bonne fiche potentielle mais mono-source
  - Saint-Philippe / Cap Méchant : WC de l'aire de pique-nique (-21.369507, 55.732068) marqués `operational_status=non-operational` sur OpenStreetMap — NE PAS importer sans vérification de remise en service
  - Le Tampon / belvédère de Bois Court (-21.220136, 55.553620) et Entre-Deux / rue Césaire (-21.250497, 55.469453) : présence OSM mais sans détail ni seconde source

## Sources
- Fermeture des toilettes publiques (article du 17/11/2016 — confirme l'existence des toilettes publiques rue Maury et leur gestion par la commune) — Ville de Saint-Joseph — https://saintjoseph.re/Fermeture-des-toilettes-publiques — consulté le 2026-06-11
- OpenStreetMap, nœud 10872920836 (amenity=toilets ; access=yes ; male/female ; flush ; wheelchair=yes ; version du 2024-03-26) — https://www.openstreetmap.org/node/10872920836 — consulté le 2026-06-11
- Base Adresse Nationale, géocodage inverse (rue Maury, 97480 Saint-Joseph, citycode 97412, à 16 m du point GPS) — https://api-adresse.data.gouv.fr/reverse/?lon=55.6175891&lat=-21.3775193 — consulté le 2026-06-11
- Toilettes publiques à Saint-Joseph (La Réunion) — toilettespubliques.fr — https://www.toilettespubliques.fr/ville/saint-joseph-la-reunion/ — consulté le 2026-06-11
- Les marchés à Saint-Joseph — jours et horaires (marché du vendredi 8 h–14 h, Grande Halle centre-ville — contexte de proximité) — annuaire-mairie.fr — https://www.annuaire-mairie.fr/marche-saint-joseph-974.html — consulté le 2026-06-11
- OpenStreetMap, nœuds 12543332122 (Manapany-les-Bains) et 4784314733 (Cap Méchant, non opérationnel) — candidats alternatifs — https://www.openstreetmap.org/node/12543332122 / https://www.openstreetmap.org/node/4784314733 — consultés le 2026-06-11
