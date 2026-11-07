# La Marine de Langevin (débarcadère et port de pêche) — VIL (Village / lieu remarquable)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : La Marine de Langevin (débarcadère et port de pêche)
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). Recherche sur `name` ILIKE `%langevin%`/`%marine%`/`%debarcadere%`/`%port de peche%` → 4 objets de proximité MAIS aucun n'est ce site : `Parc Piscicole de Langevin` (ACT, activité distincte en amont de la vallée), `Terroir de Bras Sec Langevin` (PRD, producteur), `Lilie Location saisonnière Langevin` + `Ti Case Mémé Lauret - Villa Marine` (HLO, hébergements ; « Villa Marine » est un nom d'hébergement, pas la marine portuaire). Le débarcadère/port de pêche de l'embouchure n'a PAS de fiche. Aucune action de déduplication requise. À ne pas confondre non plus avec la fiche candidate déjà proposée « La Marine de Vincendo » (autre marine de Saint-Joseph, autre site).

## Identité
- Catégorie / sous-type proposé : Site patrimonial maritime / point de vue littoral — petit port de pêche traditionnel et débarcadère historique à l'embouchure de la rivière Langevin.
- Chapo : À l'embouchure de la célèbre rivière Langevin, ce débarcadère taillé dans un couloir naturel de lave est l'une des trois marines historiques de Saint-Joseph ; les pêcheurs y halent encore leurs barques à la seule force des bras, dans un décor de côte sauvage battue par la houle.

## Description
La marine de Langevin s'est développée autour d'un débarcadère installé dans un couloir naturel creusé par la lave, à l'embouchure de la rivière Langevin, sur ce qui était à l'origine la propriété d'un certain Baillif, natif d'Angers. Utilisé dès le début du XIXᵉ siècle pour décharger des marchandises sur la terre ferme à l'aide d'un système de poulies et de mâts de charge, le site est l'une des trois marines dont Saint-Joseph s'équipe au XIXᵉ siècle, avec Manapany et Vincendo. Ces marines servaient à approvisionner les habitants en denrées non produites sur place et à exporter les productions locales vers les autres ports de l'île, voire directement vers la métropole. Aujourd'hui, le débarcadère ne sert plus que de cale de halage aux pêcheurs, qui sortent et remontent leurs barques à bras d'homme lorsque l'état de la mer le permet ; par forte houle, l'accès devient impossible et les pêcheurs débarquent à Saint-Philippe. Le site est réputé pour la pêche des « bichiques » (alevins, considérés comme un « caviar créole »), et un court sentier littoral relie le débarcadère au bassin de l'Embouchure et à la cascade Jacqueline.

## Adresse & localisation (object_location)
- Adresse : Embouchure de la rivière Langevin — accès par le port / Pointe Langevin (depuis la RN2 puis la route de Langevin ; au dernier rond-point, direction « port » et Pointe Langevin). Voie locale : Chemin de la Rivière.
- Code postal / ville : 97480 Saint-Joseph (quartier de Langevin)
- GPS (WGS84) : -21.38587, 55.64362 — source : point de l'embouchure de la rivière Langevin (débarcadère/marine) concordant entre deux sources indépendantes : Randopitons « Embouchure Rivière Langevin » (-21.38587, 55.64362) et Wikipédia « Rivière Langevin » (embouchure 21°23′09″S, 55°38′37″E ≈ -21.3858, 55.6436). NB : le géocodage BAN api-adresse.data.gouv.fr (citycode 97412) ne renvoie PAS le débarcadère (« débarcadère de langevin » → 0 résultat ; « chemin de la riviere langevin » → rue, score 0.613, lat -21.367456 / lon 55.623813, mais secteur Jean-Petit-les-Bas en amont, NON le point côtier) ⇒ coordonnée retenue = point d'embouchure ci-dessus, à affiner sur le terrain.
- Altitude : 0 m (niveau de la mer, embouchure océanique) — source : Wikipédia « Rivière Langevin ».

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel/public, pas d'exploitant unique ; contact possible via la mairie de Saint-Joseph ou l'OTI du Sud).
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pages de référence : sudreuniontourisme.fr, saintjoseph.re ; pas de site propre au débarcadère).
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Site naturel en accès libre, ouvert en permanence (plein air, littoral). Aucun horaire d'ouverture institutionnel. L'usage du débarcadère par les pêcheurs dépend de l'état de la mer (impraticable par forte houle). La pêche au bichique est saisonnière (notamment certaines nuits de pleine lune). Horaires précis : Non trouvé — à compléter (sans objet pour un site libre).

## Tarifs (object_price)
Accès libre et gratuit — site naturel/public en plein air, sans billetterie. Parking gratuit à proximité de l'océan. (Confirmé indirectement : aucune mention de tarif sur les sources consultées ; mention d'un « parking spacieux » près de l'océan.)

## Données spécifiques VIL
VIL (village / lieu remarquable) ne porte pas de table de facette dédiée (classifications/labels génériques uniquement). Éléments de caractérisation patrimoniale et d'agrément :
- Nature du site : débarcadère historique + port de pêche traditionnel encore en activité (cale de halage) + point de vue sur la côte sauvage et l'embouchure.
- Intérêt : patrimoine maritime XIXᵉ s. (une des 3 marines de Saint-Joseph), pêche traditionnelle vivante, pêche du bichique, accès au bassin de l'Embouchure et à la cascade Jacqueline (≈ 5–10 min de marche).
- Sentier littoral associé : court (≈ 10 min jusqu'au bassin de l'Embouchure ; cascade Jacqueline à ≈ 5 min de plus par la rive gauche) — distance totale / dénivelé / difficulté / type / balisage : Non trouvé — à compléter (Randopitons ne documente pas ces paramètres ; sentier court et peu balisé).

## Équipements & services (object_amenity)
- Parking : Oui — « parking spacieux » près de l'océan (source Randopitons).
- Sanitaires : Non trouvé — à compléter
- Restauration : Non trouvé — à compléter (à proximité dans le bourg de Langevin / vallée).
- Aire de pique-nique : Probable (le secteur de la vallée de Langevin est un haut lieu de pique-nique dominical) — à confirmer pour le débarcadère précisément ; Non trouvé — à compléter.
- Accès véhicule : Oui, route jusqu'au port / Pointe Langevin.
- Baignade : Bassin de l'Embouchure à proximité (eau douce) — prudence houle côté océan ; Non trouvé — à compléter (conditions/sécurité).

## Paiement / langues / accessibilité
- Moyens de paiement : Sans objet (site gratuit).
- Langues : Sans objet / Non trouvé — à compléter.
- Accessibilité PMR : Non trouvé — à compléter (site rocheux de bord de mer, couloir de lave, débarcadère taillé dans le basalte ⇒ probablement non accessible PMR au-delà du parking ; à vérifier sur le terrain).

## Labels & classements (object_classification)
Aucun trouvé — à compléter. Aucun label touristique ou classement (T&H, etc.) revendiqué sur les sources consultées. Site naturel/patrimonial non labellisé. (Le secteur de la vallée de Langevin relève d'enjeux de gestion littorale/fréquentation, mais aucun label formel attaché au débarcadère n'a été identifié.)

## Médias suggérés
- Photo « Marine Langevin — débarcadère taillé dans le basalte » : https://www.mi-aime-a-ou.com/photo_saint-joseph.php?id_img=4225 — NE PAS télécharger sans autorisation.
- Vidéo « La marine de Langevin, le lieu de pêche de Saint-Joseph » : https://www.youtube.com/watch?v=uyyjqGgJbx0 — NE PAS réutiliser sans autorisation.
- Photos sur les pages de référence (sudreuniontourisme.fr, cartedelareunion.fr, randopitons.re) — NE PAS télécharger sans autorisation.
- À privilégier : médias produits/autorisés par l'OTI du Sud ou la mairie de Saint-Joseph.

## Données manquantes / à vérifier
- Coordonnées GPS exactes du débarcadère lui-même (le point retenu est l'embouchure ; affiner sur le terrain le point de la cale de halage / parking).
- Adresse postale normalisée / nom de voie exact desservant le débarcadère (Chemin de la Rivière vs voie « port / Pointe Langevin »).
- Sanitaires, aire de pique-nique, restauration à proximité immédiate.
- Paramètres du sentier littoral (distance, dénivelé, difficulté, type boucle/aller-retour, balisage) si on veut le décrire comme ITI distinct.
- Accessibilité PMR réelle.
- Contact gestionnaire (mairie / OTI) et éventuelle page web dédiée.
- Conditions/sécurité de baignade au bassin de l'Embouchure et règles de fréquentation (forte fréquentation dominicale, houle).
- Saisonnalité précise de la pêche au bichique.
- Vérifier l'arbitrage type : VIL (lieu remarquable) vs PNA (espace naturel) selon la convention de typage retenue par l'OTI pour ce genre de site littoral patrimonial.

## Sources
- La vallée de Langevin — https://www.sudreuniontourisme.fr/tresors-du-sud/la-vallee-de-langevin.html — consulté le 2026-06-26
- Débarcadère de Langevin — Carte de La Réunion — https://www.cartedelareunion.fr/listings/debarcadere-de-langevin/ — consulté le 2026-06-26 (via recherche ; page 403 en accès direct)
- Embouchure Rivière Langevin — Randopitons (GPS -21.38587, 55.64362 ; accès, parking) — https://randopitons.re/tourisme/763-embouchure-riviere-langevin — consulté le 2026-06-26
- Rivière Langevin — Wikipédia (coordonnées embouchure, altitude) — https://fr.wikipedia.org/wiki/Rivi%C3%A8re_Langevin — consulté le 2026-06-26
- Langevin (La Réunion) — Wikipédia (histoire, marine, marines de Saint-Joseph) — https://fr.wikipedia.org/wiki/Langevin_(La_R%C3%A9union) — consulté le 2026-06-26
- Langevin — Ville de Saint-Joseph (marine, pêche traditionnelle, bichiques) — https://saintjoseph.re/Langevin — consulté le 2026-06-26
