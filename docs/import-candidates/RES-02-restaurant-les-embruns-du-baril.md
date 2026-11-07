# Restaurant Les Embruns du Baril — RES (Restaurant)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : RES
- name : Restaurant Les Embruns du Baril
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **NON — distinct, mais à RATTACHER.** Contrôle SQL live du 2026-06-26 sur `object` (name LIKE embrun/baril/soraya/marmite) :
  - `HOTRUN0000000104` « Hôtel les Embruns du Baril » (HOT, published) est à la **MÊME adresse et aux mêmes coordonnées** (62 RN2 Le Baril ; lat -21.36915, lon 55.72791). La fiche proposée est le **restaurant de cet hôtel** (facette distincte, non l'établissement d'hébergement). **Action recommandée : créer le RES puis poser `object_relation [based_at_site]` ou un lien de co-localisation RES → HOTRUN0000000104** (à valider avec le vocabulaire `ref_object_relation_type` retenu pour « restaurant d'un hôtel »).
  - `RESRUN00000000XL` « La Marmite du Pêcheur » (RES, published) N'EST PAS un doublon : objet **à une autre localisation** (18A RN2 Ravine Ango, ~6 km au nord-est ; lat -21.353, lon 55.786). Une source (Tripadvisor) indique que le restaurant de l'hôtel serait « géré par La Marmite du Pêcheur » → **lien d'exploitation potentiel** (`actor_object_role [operator]`) **à confirmer** ; ce n'est PAS le même objet physique.
  - Aucun `object_relation` existant entre l'hôtel et la Marmite (vérifié).

## Identité
- Catégorie / sous-type proposé : Restaurant — cuisine créole / traditionnelle réunionnaise (restaurant d'hôtel, en bord de falaise)
- Chapo : Le restaurant de l'Hôtel Les Embruns du Baril propose une cuisine créole et traditionnelle servie sur une terrasse en bord de falaise, avec une vue panoramique sur l'océan Indien et les couchers de soleil du Sud Sauvage.

## Description
Le Restaurant Les Embruns du Baril est le restaurant de l'Hôtel Les Embruns du Baril, situé au lieu-dit Le Baril, sur la commune de Saint-Philippe (Sud Sauvage de La Réunion). Il met en avant une cuisine « typique et créole », à base de produits locaux et d'épices réunionnaises ; parmi les plats cités figurent la salade de palmiste et le cari de poulet au palmiste frais, ainsi que des cocktails maison. La salle et surtout la terrasse occupent une situation exceptionnelle en bord de falaise, offrant une vue dégagée et intense sur l'océan Indien et de beaux couchers de soleil. La réservation est demandée. (Sources : Ville de Saint-Philippe ; Île de la Réunion Tourisme ; Tripadvisor.)

## Adresse & localisation (object_location)
- Adresse : 62 Route Nationale 2 (RN2), Le Baril
- Code postal / ville : 97442 Saint-Philippe (lieu-dit Le Baril) — NB : code postal 97442 = bureau distributeur du Baril ; **commune INSEE = 97417 Saint-Philippe** (dans le périmètre OTI). Cohérent avec la fiche live `HOTRUN0000000104` (postcode 97442, city Saint-Philippe).
- GPS (WGS84) : -21.369468, 55.727911 — source : géocodage BAN (api-adresse.data.gouv.fr) de « 62 Route Nationale 2 Le Baril Saint-Philippe », citycode 97417 ; label retourné « 62 Route Nationale 2 Baril 97442 Saint-Philippe », type `housenumber`, score 0,818. Cohérent avec les coordonnées de l'hôtel co-localisé en base (`HOTRUN0000000104` : -21.36915, 55.72791).
- Altitude : Non trouvé — à compléter (établissement en bord de falaise basse côtière, alt. estimée faible mais non sourcée → ne pas renseigner sans vérification).

## Contacts (object_contact)
- Téléphone : 0262 20 07 17 — source : Ville de Saint-Philippe ; Île de la Réunion Tourisme
- Téléphone mobile : 0692 72 17 25 — source : Île de la Réunion Tourisme (via résultats de recherche)
- Email : Lesembrunsdubarilreunion@gmail.com — source : Ville de Saint-Philippe
- Site web : https://www.lesembrunsdubarilbysoraya.com (anciennement les-embruns-du-baril.amenitiz.io, redirige vers ce domaine) — source : Ville de Saint-Philippe ; recherche web. NB : site protégé par Cloudflare, non consultable automatiquement le 2026-06-26.
- Réseaux sociaux : Facebook « Hôtel les Embruns du Baril » — https://www.facebook.com/people/H%C3%B4tel-les-Embruns-du-Baril/100057077634918/ — source : Ville de Saint-Philippe ; recherche web

## Horaires (object_opening)
Horaires INCERTAINS — sources divergentes, à confirmer auprès de l'établissement :
- Source Ville de Saint-Philippe (page hôtel) : « 8h00–12h00 / 14h00–19h00 ; restaurant fermé le dimanche soir et le lundi ».
- Source Île de la Réunion Tourisme / recherche : cocktails et plats traditionnels servis « à partir de 15h30 ».
- Source Facebook (semaine du 28–31 juillet 2024) : « 19h–22h » (horaires de service du soir, ponctuels).
→ Non trouvé de manière fiable — à compléter / vérifier (probable amplitude continue le midi + service du soir sur réservation).

## Tarifs (object_price)
- Non trouvé de manière structurée — à compléter. Indications éparses (Tripadvisor) : établissement perçu comme plutôt cher ; une entrée « salade de palmiste » mentionnée à 18 € (avis client, non daté, valeur indicative). Carte/menus officiels non consultables (site Cloudflare). Réservation obligatoire (de préférence via la plateforme de réservation).

## Données spécifiques RES (restaurant — pas de table facette dédiée ; cuisine via object_cuisine_type)
- Type de cuisine : créole / réunionnaise traditionnelle (« typique et créole ») → mapper sur `object_cuisine_type` (cuisine créole / locale) — source : Ville de Saint-Philippe ; Île de la Réunion Tourisme
- Spécialités citées : salade de palmiste ; cari de poulet au palmiste frais ; cocktails maison — source : recherche IRT
- Capacité (couverts) : **CONFLIT de sources, à vérifier** — 120 (recherche IRT, 1er résultat) / 150 (Ville de Saint-Philippe, « 150 couverts ») / 230 (recherche IRT, 2e résultat). Ne PAS renseigner une valeur unique avant confirmation terrain.
- Cadre : salle + terrasse en bord de falaise, vue panoramique océan Indien, couchers de soleil — source : Île de la Réunion Tourisme ; Tripadvisor
- Exploitation : possiblement géré par « La Marmite du Pêcheur » (Tripadvisor) — à confirmer (cf. lien `actor_object_role [operator]` en section Proposition d'import)

## Équipements & services (object_amenity)
- Parking : oui (non surveillé) — source : Ville de Saint-Philippe (fiche hôtel)
- Terrasse : oui (bord de falaise) — source : Île de la Réunion Tourisme ; Ville de Saint-Philippe
- WiFi : oui (parties communes et terrasse) — source : Ville de Saint-Philippe (NB : périmètre hôtel, vraisemblablement partagé avec le restaurant — à confirmer pour la fiche restaurant)
- Piscine : oui sur le site de l'hôtel (jardin fleuri) — source : Ville de Saint-Philippe (équipement hôtelier, pas restaurant)
- Climatisation : chambres climatisées (périmètre hôtel) — source : Ville de Saint-Philippe
- Sanitaires / accès PMR du restaurant : Non trouvé — à compléter

## Paiement / langues / accessibilité
- Moyens de paiement : carte bancaire, chèque, espèces, AMEX, virement bancaire — source : Ville de Saint-Philippe (fiche hôtel ; à confirmer pour le restaurant)
- Langues : français, anglais — source : Ville de Saint-Philippe
- Accessibilité PMR : Non trouvé — à compléter (non mentionnée par les sources)

## Labels & classements (object_classification)
- Aucun label/classement trouvé pour le restaurant (pas de mention de label gastronomique type Qualité Tourisme ou Maître Restaurateur dans les sources consultées). L'hôtel co-localisé ne fait pas non plus état de classement étoilé dans les sources. → Aucun trouvé — à vérifier.

## Médias suggérés
- Photos officielles de l'établissement (intérieur, terrasse, vue océan) disponibles sur la fiche Ville de Saint-Philippe (https://saintphilippe.re/hebergement-restauration/hotel-les-embruns-du-baril/), la fiche Île de la Réunion Tourisme (en.reunion.fr) et le site officiel lesembrunsdubarilbysoraya.com. **NE PAS télécharger sans autorisation** — demander l'accord de l'établissement / des sources.

## Données manquantes / à vérifier
- Capacité exacte du restaurant (120 / 150 / 230 couverts — sources contradictoires)
- Horaires d'ouverture réels du restaurant (service midi/soir, jours de fermeture)
- Tarifs / menus à jour (carte officielle non accessible)
- Type de cuisine à mapper précisément sur `object_cuisine_type`
- Lien d'exploitation : « géré par La Marmite du Pêcheur » ? → confirmer avant de poser `actor_object_role [operator]`
- Relation au site / hôtel : type de `object_relation` à retenir (restaurant d'un hôtel co-localisé `HOTRUN0000000104`)
- Accessibilité PMR, sanitaires, équipements propres au restaurant (vs hôtel)
- Altitude
- Labels/classements éventuels (Qualité Tourisme, etc.)
- Vérifier que les moyens de paiement / langues s'appliquent bien au restaurant (sources = fiche hôtel)

## Sources
- Restauration / Manger et dormir — Hôtel les Embruns du Baril, Ville de Saint-Philippe — https://saintphilippe.re/hebergement-restauration/hotel-les-embruns-du-baril/ — consulté le 2026-06-26
- Restaurant les Embruns du Baril (Saint-Philippe), Île de la Réunion Tourisme — https://en.reunion.fr/offers/restaurant-les-embruns-du-baril-saint-philippe-en-1873816/ — consulté le 2026-06-26
- Restaurant les Embruns du Baril, Offices de tourisme du Sud (sudreuniontourisme.fr) — https://www.sudreuniontourisme.fr/fiche-etablissement/saint-philippe/restaurant/restaurant-les-embruns-du-baril-eta_4542.html — consulté le 2026-06-26
- Avis et photos du restaurant — Les Embruns du Baril, Tripadvisor — https://www.tripadvisor.fr/Hotel_Feature-g2140646-d15780388-zft9165-Les_Embruns_du_Baril.html — consulté le 2026-06-26
- Géocodage BAN (Base Adresse Nationale) — https://api-adresse.data.gouv.fr/search/?q=62+Route+Nationale+2+Le+Baril+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
- Site officiel (référencé, non consultable — Cloudflare) — https://www.lesembrunsdubarilbysoraya.com — consulté le 2026-06-26
