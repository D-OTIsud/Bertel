# Le Dimitile par le Sentier Bayonne (la Jument et le Sentier Marron du Bras Long) — ITI (Itinéraire de randonnée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).
>
> ⚠️ **RÉÉVALUATION 2026-07-30 : SENTIER BAYONNE FERMÉ.** Le sentier Bayonne (Entre-Deux) est fermé à la circulation par arrêté préfectoral — arrêté n°2026-775 du 2 juin 2026, reconduit par l'arrêté n°2026-1022 du 3 juillet 2026 — à la suite d'un éboulement/glissement de terrain ayant endommagé une partie de l'assise du sentier. L'itinéraire complet (montée par Bayonne) est donc **impraticable légalement à ce jour**. Ne pas publier avant réouverture ONF ; importer au mieux en `draft` avec mention de fermeture. Statut des sentiers de descente (Grande Jument, Marron du Bras Long) non précisé dans l'arrêté consulté.

## Proposition d'import
- object_type : ITI
- name : Le Dimitile par le Sentier Bayonne (la Jument et le Sentier Marron du Bras Long)
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 : `object` filtré sur `dimitile|bayonne|bras long|jument|sentier marron` → seuls « Dimitile Hôtel », « La Table du Dimitile », « DIMITILE BIKE », « Dimitile Hôtel - Espace Bien-Être », « Dimitilez-vous » remontent, tous d'autres types — HOT/RES/ACT — distincts de cet ITI). Distinct aussi de la fiche **déjà proposée** « Le Dimitile par le sentier de la Chapelle » : autre voie d'accès au même sommet (sentier de la Chapelle/Bœuf, +700 m, ~5 h A/R, niveau moyen) ≠ sentier Bayonne (boucle ~18,6 km, +1950 m, 10 h, très difficile). Pas de fusion : ce sont deux itinéraires différents partageant seulement le point d'arrivée (Dimitile). Action recommandée : importer comme nouvel ITI.

## Identité
- Catégorie / sous-type proposé : Randonnée pédestre — grande boucle de montagne (très difficile), ascension du Dimitile depuis Entre-Deux par le versant Bras de Cilaos.
- Chapo : L'une des plus exigeantes randonnées de La Réunion : une longue boucle de près de 19 km et +1950 m qui grimpe au Dimitile (1825 m) par le sentier Bayonne, surplombe le cirque de Cilaos et redescend par les sentiers de la Grande Jument et Marron du Bras Long.

## Description
Cette grande boucle pédestre part de l'école primaire de Bras Long, à Entre-Deux, et rejoint le sentier Bayonne après quelques montées sur route servant d'échauffement avant la très longue ascension vers le Dimitile. Le sentier Bayonne est l'une des voies les plus difficiles de l'île en raison d'un dénivelé positif cumulé supérieur à 1900 m. Sur la majeure partie du parcours, l'itinéraire domine le Bras de Cilaos puis le cirque de Cilaos, offrant de vastes panoramas (Petit Serré, Îlet à Cordes, Palmiste Rouge, Îlet Calebasse). Le sommet du Dimitile, haut lieu de l'histoire du marronnage réunionnais, accueille le site muséographique du Camp Marron (en réfection) et une table d'orientation tournée vers Cilaos. La descente emprunte le sentier de la Grande Jument puis le sentier Marron du Bras Long, dont une portion très raide oblige à s'appuyer sur la végétation. L'ONF signale sur le panneau de départ un « sentier très difficile, réservé aux marcheurs expérimentés ».

## Adresse & localisation (object_location)
- Adresse : École primaire de Bras Long (face à l'EHPAD), Chemin / Rue de Bras Long, Entre-Deux — accès depuis Pierrefonds
- Code postal / ville : 97414 Entre-Deux
- GPS (WGS84) : -21.237401, 55.472009 — source : géocodage BAN (api-adresse.data.gouv.fr) sur « Chemin de Bras Long, citycode 97403 », type=street, score 0,61. NB : la BAN ne géocode pas le bâtiment « école primaire » lui-même ; coordonnées de la **rue de Bras Long** (à affiner au point de départ exact). Point de départ alternatif de la trace GPS (randogps.net) ≈ -21.2359, 55.4607 (amorce de trace côté Grand Fond, à la limite communale — à vérifier).
- Altitude : départ ~418 m ; point haut (Dimitile) ~1825 m (source Randopitons : 418 m → 1825 m). Sommet du Dimitile donné à ~1850 m par l'OTI du Sud / table d'orientation.

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel / sentier ONF, pas de contact dédié ; renseignements ONF / Office de tourisme du Sud)
- Email : Non trouvé — à compléter
- Site web : Fiche IRT — https://www.reunion.fr/offres/le-dimitile-par-le-sentier-bayonne-entre-deux-575454/ (offre 575454) ; OTI du Sud — https://www.sudreuniontourisme.fr/tresors-du-sud/le-dimitile.html
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Sentier de montagne accessible en journée toute l'année, sous réserve de conditions météo et d'éventuelles fermetures ONF. État d'ouverture/fermeture à vérifier auprès de l'ONF avant départ (sentiers gérés par l'ONF). Pas d'horaires d'ouverture au sens d'un établissement — départ recommandé très tôt (course de ~10 h). Non trouvé — à compléter (horaires précis).

## Tarifs (object_price)
Gratuit — accès libre à un sentier naturel ONF. Aucun droit d'entrée. (Site naturel en accès libre.)

## Données spécifiques ITI (object_iti)
- Distance : 18,6 km (Randopitons) — variante mesurée 17,5 km (randogps.net)
- Dénivelé positif : +1950 m (Randopitons) — 1850 m (randogps.net) ; cumul > 1700 m confirmé par lemondedechloe / OTI
- Dénivelé négatif : Non trouvé chiffré — à compléter (boucle ⇒ ≈ équivalent au D+, l'arrivée rejoignant le départ)
- Altitude min / max : 418 m / 1825 m (Randopitons)
- Durée : 10 h (Randopitons) — 9 h (randogps.net) ; le panneau ONF affiche 7 h 30 (pour la portion sentier Bayonne seule, 8,5 km, d'après la synthèse de recherche — à recouper sur le terrain)
- Difficulté : Très difficile — « réservé aux randonneurs confirmés / marcheurs expérimentés » (ONF, OTI du Sud, Randopitons)
- Type : Boucle
- Sentiers empruntés : montée par le sentier Bayonne ; descente par le sentier de la Grande Jument puis le sentier Marron du Bras Long (variante possible par le sentier du Zèbre)
- Balisage : Minimal — « très peu de balises » (Randopitons)
- Passages techniques : passages étroits en bordure de ravin, éboulis, hautes marches, échelles, portions glissantes, risque de vertige ; descente Marron très raide (appui sur la végétation)
- Indice de confiance de la trace : Moyen (Randopitons)
- Trace GPX : disponible sur Randopitons (fiche 1371) et randogps.net (n° 48) — NE PAS redistribuer sans vérifier la licence de la source

## Équipements & services (object_amenity)
- Parking : stationnement au départ à Bras Long / Entre-Deux (à confirmer la capacité exacte) — Non trouvé chiffré
- Sanitaires : Non trouvé — à compléter (sentier naturel, pas d'équipement attendu en cours de route)
- Point d'eau / ravitaillement : Non trouvé — à compléter (aucune source d'eau potable balisée signalée ; prévoir autonomie en eau pour ~10 h)
- Restauration : aucune en cours de parcours ; gîte/table du Dimitile au sommet (établissements existants distincts) — à vérifier ouverture
- Accès : par route jusqu'à Bras Long (Entre-Deux) depuis Pierrefonds

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non — sentier de montagne très difficile, non accessible aux personnes à mobilité réduite (passages techniques, échelles, dénivelé extrême)

## Labels & classements (object_classification)
Aucun label revendiqué trouvé. Sentier inscrit/géré par l'ONF ; figure à l'inventaire des itinéraires de l'IRT (reunion.fr) et de l'OTI du Sud. Aucun mapping LBL_* applicable. (Aucun trouvé.)

## Médias suggérés
- Photo d'illustration sur la fiche IRT : https://www.reunion.fr/offres/le-dimitile-par-le-sentier-bayonne-entre-deux-575454/ — NE PAS télécharger sans autorisation
- Photos / panoramas sur le blog lemondedechloe.com et Randopitons (fiche 1371) — NE PAS télécharger sans autorisation
- Recommandation : solliciter une photo libre de droits auprès de l'OTI du Sud ou de l'ONF, ou produire un cliché propre.

## Données manquantes / à vérifier
- Coordonnées GPS exactes du point de départ (bâtiment école de Bras Long) — la BAN ne géocode que la rue (score 0,61) ; relever le point au sol ou via la trace GPX officielle.
- Dénivelé négatif chiffré.
- Réconcilier les écarts entre sources : distance (18,6 vs 17,5 km), D+ (1950 vs 1850 m), durée (10 vs 9 h ; panneau ONF 7 h 30 sur portion).
- Capacité et localisation précise du parking de départ.
- Présence/absence de point d'eau ; consignes de sécurité ONF à jour ; état d'ouverture du sentier.
- État du site muséographique du Camp Marron (signalé « en réfection » par l'OTI).
- Horaires/saison recommandée précis ; langues d'accueil.

## Sources
- Le Dimitile par le Sentier Bayonne, la Jument et le Sentier Marron du Bras Long — Randopitons (fiche 1371) — https://randopitons.re/randonnee/1371-dimitile-sentier-bayonne-jument-sentier-marron-bras-long — consulté le 2026-06-26
- Dimitile by the Bayonne Trail (Entre-Deux) — Île de la Réunion Tourisme / IRT (offre 575454) — https://en.reunion.fr/offers/dimitile-by-the-bayonne-trail-entre-deux-en-575454/ — consulté le 2026-06-26
- Le Dimitile — Offices de Tourisme du Sud (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/le-dimitile.html — consulté le 2026-06-26
- Randonnée à La Réunion : le Dimitile par le sentier Bayonne — lemondedechloe.com — https://www.lemondedechloe.com/le-dimitile-par-le-sentier-bayonne/ — consulté le 2026-06-26
- Le Dimitile par le sentier Bayonne - La Jument et le Sentier Marron du Bras Long (trace GPS n° 48) — randogps.net — https://www.randogps.net/randonnee-pedestre-gps-la-reunion-974.php?num=48 — consulté le 2026-06-26
- Géocodage BAN du point de départ — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=chemin+de+bras+long+entre-deux&citycode=97403 — consulté le 2026-06-26
