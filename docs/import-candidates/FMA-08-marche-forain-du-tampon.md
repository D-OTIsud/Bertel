# Marché forain du Tampon — FMA (Fête / manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Marché forain du Tampon
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `public.object` — `name ILIKE '%march%' OR '%forain%' OR '%fleur%'` ; seuls des objets sans rapport ressortent : « Entre Fleurs et Plantes », « Fleur de Vanille », « Les Fleurettes », « Mon Voyage Fleuri », etc. Aucun marché forain ni manifestation de marché en base). N'apparaît pas non plus dans la liste « DÉJÀ PROPOSÉ ». Action recommandée : créer la fiche.

## Identité
- Catégorie / sous-type proposé : Marché de plein air / manifestation récurrente (marché forain hebdomadaire + foire/marché aux fleurs mensuelle sur le même site)
- Chapo : Tous les samedis matin, l'esplanade Benjamin Hoarau, en haut de l'Hôtel de Ville du Tampon, accueille le grand marché forain de la commune : fruits et légumes péi, viandes, poissons, plantes, fleurs et artisanat. Le 1er dimanche du mois, le même site se transforme en foire aux fleurs et au jardin doublée d'un vide-grenier.

## Description
Le marché forain du Tampon est l'un des grands rendez-vous hebdomadaires des Hauts du Sud. Il se tient tous les samedis de 6h à 13h sur l'esplanade Benjamin Hoarau, en plein cœur du centre-ville, au-dessus de l'Hôtel de Ville. On y trouve des fruits et légumes de saison, de la viande et de la volaille, du poisson frais, des plantes et des fleurs, ainsi que de la restauration de bouche (samoussas, bonbons piment, achards) et un peu d'artisanat local et malgache. Le marché est organisé par la Ville du Tampon, qui lance régulièrement des appels à candidatures aux exposants. En complément du marché forain, la municipalité organise chaque 1er dimanche du mois, sur la même esplanade, une foire aux fleurs et au jardin couplée à un vide-grenier (orchidées, plantes vertes et fleuries adaptées au climat réunionnais, décoration, mobilier). L'entrée est gratuite et des parkings de centre-ville sont disponibles à proximité.

## Adresse & localisation (object_location)
- Adresse : Esplanade Benjamin Hoarau, en haut de l'Hôtel de Ville
- Code postal / ville : 97430 Le Tampon
- GPS (WGS84) : -21.279845, 55.509789 — source : géocodage BAN (api-adresse.data.gouv.fr) de « Esplanade Benjamin Hoarau Le Tampon », citycode 97422 ; meilleur résultat = « Rue Benjamin Hoarau 97430 Le Tampon », type « street », score 0,659. ⚠️ Géocodage à l'échelle de la rue (l'esplanade n'est pas une adresse postale distincte) — point à affiner sur le terrain / via OSM pour pointer précisément l'esplanade au-dessus de l'Hôtel de Ville (256 rue Hubert Delisle).
- Altitude : Non trouvé — à compléter (centre-ville du Tampon ≈ 550 m, à confirmer)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (contact de l'organisateur = standard Mairie du Tampon, à confirmer)
- Email : Non trouvé — à compléter
- Site web : https://letampon.fr/ (organisateur — Ville du Tampon ; page animations/marchés) — à confirmer comme contact officiel
- Réseaux sociaux : Facebook « Ville du Tampon » (facebook.com/villedutampon) — relaie les annonces de foire aux fleurs ; à confirmer comme canal officiel de l'objet
- Organisateur / gestionnaire : Ville du Tampon — Mairie, 256 rue Hubert Delisle, 97430 Le Tampon (source carte-de-la-réunion / espritparcnational)

## Horaires (object_opening)
- Marché forain : tous les samedis, 6h00 – 13h00 (hebdomadaire, toute l'année) — sources concordantes (espritparcnational, allonslareunion, recherche letampon.fr)
- Foire aux fleurs & au jardin + vide-grenier : 1er dimanche de chaque mois, sur la même esplanade, 6h00 – 14h00 — CONFIRMÉ par l'agenda officiel letampon.fr (éditions 1er février, 1er mars et 3 mai 2026, toutes annoncées 6h–14h ; réévaluation web du 2026-07-30). L'ancien visuel 9h00 – 18h00 est périmé.
- Note FMA : à modéliser comme manifestation à occurrences récurrentes (occurrence hebdo samedi pour le forain ; occurrence mensuelle 1er dimanche pour la foire aux fleurs).

## Tarifs (object_price)
- Accès visiteur : gratuit (entrée libre, foire aux fleurs confirmée gratuite par la presse). Achats à la charge du visiteur.
- Emplacement exposant : payant / sur candidature auprès de la Ville du Tampon (appels à candidatures « Marché forain » et « Marché aux fleurs / Vide grenier ») — tarif non publié, Non trouvé — à compléter.

## Données spécifiques FMA
- object_fma — type de manifestation : marché / foire (manifestation commerciale et de terroir de plein air)
- Périodicité principale : hebdomadaire (samedi)
- Périodicité secondaire (même lieu) : mensuelle (1er dimanche du mois) — foire aux fleurs & jardin + vide-grenier
- Mois concernés : toute l'année (récurrent, sans saisonnalité connue)
- Lieu de la manifestation : Esplanade Benjamin Hoarau, en haut de l'Hôtel de Ville, Le Tampon
- Occurrences à saisir :
  - Marché forain — chaque samedi 6h–13h
  - Foire aux fleurs / jardin + vide-grenier — chaque 1er dimanche du mois (horaires à confirmer, voir §Horaires)
- Public : tout public, entrée libre
- Organisateur : Ville du Tampon
- Thématiques : produits du terroir, fruits & légumes, plantes & fleurs, artisanat, vide-grenier (le 1er dimanche)

## Équipements & services (object_amenity)
- Parking : oui — parkings de centre-ville à proximité (source outremertourisme) ; capacité/gratuité Non trouvé — à compléter
- Restauration : oui — stands de bouche (samoussas, bonbons piment, achards, grillades) selon espritparcnational
- Sanitaires : Non trouvé — à compléter
- Transports en commun : desserte du centre-ville évoquée (à confirmer — réseau Carsud)
- Point d'eau / ombre : Non trouvé — à compléter

## Paiement / langues / accessibilité
- Moyens de paiement : espèces ; carte bancaire acceptée selon allonslareunion (conseil général marchés péi) — à confirmer marchand par marchand
- Langues : français, créole réunionnais (Non spécifié — usuel local)
- Accessibilité PMR : Non trouvé — à compléter (esplanade de plein air en centre-ville ; accessibilité au sol à vérifier sur place)

## Labels & classements (object_classification)
- Aucun trouvé (manifestation municipale ; pas de label revendiqué identifié)

## Médias suggérés
- Photos sur la page espritparcnational (Parc national de La Réunion / « Consommer local ») : https://www.espritparcnational.com/en/consommer-local/marches-points-vente/marche-forain-tampon — NE PAS télécharger sans autorisation
- Photos sur cartedelareunion.fr et sortirautampon.re — NE PAS télécharger sans autorisation
- Visuels foire aux fleurs sur la page Facebook Ville du Tampon — NE PAS télécharger sans autorisation
- Recommandation : solliciter la Ville du Tampon (organisateur) pour des visuels libres de droits

## Données manquantes / à vérifier
- Coordonnées GPS précises de l'esplanade (géocodage actuel = niveau rue, à pointer sur OSM/terrain)
- Altitude exacte
- Horaires exacts de la foire aux fleurs (6h–14h vs 9h–18h selon sources)
- Contact direct dédié (téléphone/email de l'organisateur des marchés)
- Tarifs d'emplacement exposant
- Sanitaires, accessibilité PMR, capacité de parking
- Confirmation de la continuité toute l'année / éventuelles suspensions saisonnières
- Validation du canal Facebook/site comme canaux officiels de l'objet

## Sources
- Marché forain du Tampon — Esprit Parc national (Parc national de La Réunion) — https://www.espritparcnational.com/en/consommer-local/marches-points-vente/marche-forain-tampon — consulté le 2026-06-26
- Marchés forains de La Réunion : jours, horaires et conseils (mise à jour 2025) — Allons La Réunion — https://allonslareunion.fr/marches-forains-de-la-reunion-jours-horaires-et-conseils-mise-a-jour-2025/ — consulté le 2026-06-26
- Appel à candidatures – Marché forain — Ville du Tampon — https://letampon.fr/appel-a-candidatures-marche-forain/ — consulté le 2026-06-26
- Appel à candidatures – Marché aux fleurs / Vide grenier — Ville du Tampon — https://letampon.fr/appel-a-candidatures-marche-aux-fleurs-vide-grenier/ — consulté le 2026-06-26
- Fleurs et bonnes affaires au Tampon : un dimanche incontournable — Outremer Tourisme — https://outremertourisme.fr/fleurs-et-bonnes-affaires-au-tampon-un-dimanche-incontournable-a-la-reunion-en-outre-mer/ — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr) — « Esplanade Benjamin Hoarau Le Tampon », citycode 97422 — consulté le 2026-06-26
