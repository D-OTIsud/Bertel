# SpéléoCanyon.re (Julien Dez) — ACT (Activité de pleine nature / prestation encadrée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ACT
- name : SpéléoCanyon.re (Julien Dez)
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `object` — recherche `dez|speleo|spéléo|canyon|julien|lave`). Les homologues trouvés sont des prestataires DISTINCTS déjà en base (`Canyon Aventure` ACTRUN…SI, `Spéléolave` ACTRUN…AO, `LAVE'NTURE` ACTRUN…9X, `Waterfalls Canyoning` ACTRUN…6V draft) — aucun n'est Julien Dez / SpéléoCanyon. Action recommandée : importer comme nouvelle fiche ACT.

## Identité
- Catégorie / sous-type proposé : Activité de pleine nature encadrée — spéléologie volcanique (tunnels de lave) et canyoning. Archétype ASC/ACT (prestation commerciale encadrée). Rubrique OTI = « Terre » / « Sensations fortes ».
- Chapo : Guide professionnel diplômé d'État installé à l'Entre-Deux, Julien Dez (SpéléoCanyon.re) encadre depuis ~2005 des sorties de spéléologie dans les tunnels de lave et des descentes de canyon, pour tous publics (tunnels dès 5 ans, canyon dès 15 ans), du niveau Découverte à Exploration.

## Description
SpéléoCanyon.re est l'activité de Julien Dez, éducateur sportif et guide professionnel spécialisé en spéléologie et canyoning, établi à La Réunion depuis ~2005 (siège à l'Entre-Deux). Il propose, selon la saison, des visites guidées de tunnels de lave (spéléologie volcanique) et des descentes de canyon, déclinées en trois niveaux : Découverte, Sportif et Exploration. Les tunnels de lave, formés par les coulées du Piton de la Fournaise (notamment le secteur du Grand Brûlé), sont accessibles dès 5 ans ; le canyoning, pratiqué à Cilaos (Fleur Jaune, Bras Rouge), est accessible dès 15 ans. La prestation comprend l'encadrement par le guide diplômé, le matériel technique et l'assurance responsabilité civile professionnelle ; le transport et l'hébergement ne sont pas inclus. Depuis 2012, le guide propose un événement original en tunnel de lave, la « Spéléo-Musique », expérience musicale souterraine montée avec des artistes de l'île. Membre du SNPSC (Syndicat national des professionnels de la spéléologie et du canyon) et président de la section locale.

> Note de périmètre : le siège social est à l'Entre-Deux (97403, dans le périmètre OTI du Sud). Les sites d'activité réellement décrits par l'opérateur sont à Cilaos (canyon — HORS périmètre OTI du Sud) et au Grand Brûlé / Piton de la Fournaise (tunnels de lave — secteur à cheval Saint-Philippe / Sainte-Rose). Le point de RDV « Langevin » mentionné dans la consigne d'import n'a PAS été confirmé sur le site officiel (les canyons annoncés sont Fleur Jaune et Bras Rouge à Cilaos) → à vérifier auprès du prestataire avant publication. L'ancrage de la fiche ACT reste le siège (Entre-Deux), conformément au modèle.

## Adresse & localisation (object_location)
- Adresse : 11 rue Jean Lauret (siège social)
- Code postal / ville : 97414 Entre-Deux
- GPS (WGS84) : -21.247522, 55.472219 — source : géocodage BAN api-adresse.data.gouv.fr de « 11 rue Jean Lauret » (citycode=97403), label « 11 Rue Jean Lauret 97414 Entre-Deux », score 0.969. NB : c'est le siège ; les points de RDV des sorties sont sur site (Cilaos / Grand Brûlé) et ne sont pas géocodés ici.
- Altitude : Non trouvé — à compléter (l'Entre-Deux centre est aux alentours de 350 m, mais valeur précise à confirmer)

## Contacts (object_contact)
- Téléphone : 0693 20 60 31 — source : site officiel speleocanyon.re + pages produits
- Email : speleocanyon.re@gmail.com — source : site officiel
- Site web : https://speleocanyon.re/ — source : site officiel
- Réseaux sociaux : Facebook https://www.facebook.com/juliendez.reunion/ (juliendez.reunion) ; Instagram speleocanyon.re — source : site officiel / recherche web
- NB : un ancien site speleocanyon.fr existe (legacy) ; le site actif est speleocanyon.re.

## Horaires (object_opening)
- Activité à l'année, selon la saison et les conditions (alternance tunnels de lave / canyon). Sorties en demi-journée (tunnels de lave ~½ journée ; canyon ~journée selon le niveau) — uniquement sur réservation. Réservation en ligne possible sur le site (sans acompte). Horaires précis / jours d'ouverture : Non trouvé — à compléter (à confirmer auprès du prestataire ; dépendent de la réservation et de la météo).

## Tarifs (object_price)
Tarifs publics affichés sur la boutique en ligne speleocanyon.re (au 2026-06-26 ; validité non datée sur le site → à reconfirmer) :
- Tunnel de lave découverte au Grand Brûlé : 40–50 € (adulte ~50 € / jeune 7–17 ans ~40 €)
- Tunnel de lave sportif au Grand Brûlé : 65–75 € (adulte ~75 € / jeune ~65 €)
- Tunnel de lave secret : 75–95 € (adulte ~95 € / jeune ~75 €)
- Spéléo-Musique dans les tunnels au Grand Brûlé : 50–65 € (adulte ~65 € / jeune ~50 €)
- Canyoning Découverte à Cilaos : 70–80 € (adulte ~80 € / jeune 15–17 ans ~70 €)
- Canyoning sportif à Cilaos : 85–95 €
- Bons cadeaux : 40 à 95 €
- Source : pages produits + page « Bon cadeau » de speleocanyon.re. Les fourchettes hautes affichées sur certaines pages produit (jusqu'à 700–750 €) correspondent aux options bon-cadeau/groupe, pas au tarif individuel. À recaler par produit lors de l'import.

## Données spécifiques ACT (object_act)
- Activités : spéléologie volcanique (tunnels de lave) ; canyoning ; événement « Spéléo-Musique » (depuis 2012).
- Niveaux : Découverte / Sportif / Exploration.
- Publics : tunnels de lave dès 5 ans (familles, couples, groupes) ; canyoning dès 15 ans.
- Encadrement : guide professionnel diplômé d'État (voir Données spécifiques ci-dessous) ; matériel technique fourni ; assurance RCP incluse. Transport et hébergement NON inclus.
- Diplômes / qualifications du guide (Julien Dez) : BEES-DEJEPS Spéléologie ; BEES-DEJEPS Canyonisme ; BEES ALPI AMM ; DEJEPS ALPI AMM. Membre SNPSC + président de section ; rattaché au SSF Réunion (secours spéléo). ~20 ans d'expérience locale.
- Matériel : équipement certifié UIAA/CE (mention site officiel).
- Sites d'activité : Grand Brûlé / Piton de la Fournaise (tunnels de lave) ; Cilaos — Fleur Jaune, Bras Rouge (canyon). RDV sur site. (« Langevin » non confirmé — voir note de périmètre.)
- SIRET : 44193398300054 (SIREN 441933983, NAF 93.19Z « Autres activités liées au sport », établissement actif, commune 97403 Entre-Deux) — source : recherche-entreprises.api.gouv.fr.

## Équipements & services (object_amenity)
- Matériel technique de spéléologie/canyon fourni (combinaison, casque, baudrier, etc. — détail à confirmer).
- Bons cadeaux / réservation en ligne.
- Parking / sanitaires sur les sites de RDV : Non trouvé — à compléter (dépend du site).

## Paiement / langues / accessibilité
- Paiement : Visa, MasterCard, PayPal (boutique en ligne speleocanyon.re). Autres moyens (espèces, chèques) : Non trouvé — à compléter.
- Langues : français, anglais, créole réunionnais — source : page « À propos » du site officiel.
- Accessibilité PMR : Non trouvé — à compléter (activité de pleine nature en milieu souterrain/aquatique ; a priori non adaptée PMR, à confirmer).

## Labels & classements (object_classification)
- Label revendiqué sur le site officiel : « Qualité Tourisme » (mention QTIR « depuis 2015 ») → à mapper sur LBL_QUALITE_TOURISME (ou LBL_QUALITE_TOURISME_REUNION selon le référentiel exact — à confirmer, la mention « QTIR » suggère la déclinaison réunionnaise). À vérifier sur la base officielle Qualité Tourisme avant de marquer le label comme `granted`.
- Autres labels : Aucun autre trouvé.

## Médias suggérés
- Photos officielles sur https://speleocanyon.re/ (pages activités/produits) et sur la page Facebook juliendez.reunion / Instagram speleocanyon.re.
- Mention : NE PAS télécharger sans autorisation du prestataire (droits photo).

## Données manquantes / à vérifier
- Confirmation du point de RDV « Langevin » (consigne d'import) — le site officiel n'annonce que Cilaos (canyon) et Grand Brûlé (tunnels) ; à trancher avec le prestataire.
- Horaires / jours d'ouverture précis et calendrier saisonnier (tunnels vs canyon).
- Tarif individuel exact par produit (recaler les fourchettes bon-cadeau).
- Altitude du siège ; coordonnées GPS des points de RDV.
- Détail du matériel fourni ; équipements sur site (parking, sanitaires).
- Accessibilité PMR ; moyens de paiement complémentaires.
- Vérification officielle du label Qualité Tourisme (référentiel exact + millésime de validité).
- E-mail/numéro fixe additionnels (un seul mobile 0693 confirmé).

## Sources
- SpéléoCanyon — site officiel (accueil) — https://speleocanyon.re/ — consulté le 2026-06-26
- SpéléoCanyon — « À propos de moi » (qualifications, diplômes, langues, SIRET) — https://speleocanyon.re/a-propos-de-moi/ — consulté le 2026-06-26
- SpéléoCanyon — page produit « Canyon Fleur Jaune (Cilaos) » — https://speleocanyon.re/product/canyon-fleur-jaune-cilaos/ — consulté le 2026-06-26
- SpéléoCanyon — page produit « Tunnel 2007 Spéléo Sportive » (Grand Brûlé) — https://speleocanyon.re/product/tunnel-2007/ — consulté le 2026-06-26
- SpéléoCanyon — page « Bon cadeau » (liste des activités + fourchettes de prix) — https://speleocanyon.re/product/bon-cadeau-canyoning-tunnel-de-lave-reunion/ — consulté le 2026-06-26
- Île de La Réunion Tourisme (IRT) — fiche « Julien Dez (Entre-deux) » — https://en.reunion.fr/offers/julien-dez-entre-deux-en-1115558/ — consulté le 2026-06-26
- OTI du Sud (sudreuniontourisme.fr) — fiche établissement « Julien Dez » (Entre-Deux / Terre) — https://www.sudreuniontourisme.fr/fiche-etablissement/entre-deux/terre/julien-dez-eta_1661.html — consulté le 2026-06-26 — ⚠️ URL non confirmée à la revue (redirige vers la page d'accueil OTI ; lien à reconfirmer avant import — n'affecte pas l'attestation, couverte par IRT + site officiel + SIREN + BAN)
- OTI du Sud — actualité « Canyoning à Fleurs Jaunes, avec Julien Dez » — https://www.sudreuniontourisme.fr/a-la-une/actualite/canyoning-a-fleurs-jaunes-avec-julien-dez.html — consulté le 2026-06-26
- recherche-entreprises.api.gouv.fr — SIREN 441933983 (NAF 93.19Z, actif, Entre-Deux 97403) — https://recherche-entreprises.api.gouv.fr/search?activite_principale=93.19Z&code_commune=97403 — consulté le 2026-06-26
- BAN / api-adresse.data.gouv.fr — géocodage « 11 rue Jean Lauret » (citycode 97403), score 0.969 — https://api-adresse.data.gouv.fr/search/?q=11+rue+Jean+Lauret+Entre-Deux&citycode=97403 — consulté le 2026-06-26
