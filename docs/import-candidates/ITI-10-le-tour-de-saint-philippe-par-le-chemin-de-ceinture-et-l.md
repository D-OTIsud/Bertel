# Le tour de Saint-Philippe par le Chemin de Ceinture et le littoral — ITI (Itinéraire de randonnée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ITI
- name : Le tour de Saint-Philippe par le Chemin de Ceinture et le littoral
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). Recherche sur `object` par noms (`%chemin de ceinture%`, `%mare longue%`, `%littoral%`, `%tremblet%`, `%souffleur%`, `%arzule%`, `%saint-philippe%`) → 0 itinéraire correspondant ; seul `Bitasyon Bio du Souffleur d'Arbonne` (type PRD, exploitation agricole, déjà en base) ressort sur « souffleur » mais c'est un objet PRODUCTEUR distinct, pas cet ITI. Le seul objet de type ITI en base est `test iti` (objet de test). Le « Sentier botanique de Mare Longue » figure dans la liste DÉJÀ PROPOSÉ mais c'est un itinéraire DIFFÉRENT et plus court (≈ aller-retour botanique) : cet ITI boucle est un objet à part entière (point de départ commun, parcours distinct). Aucune action de fusion requise.

## Identité
- Catégorie / sous-type proposé : Randonnée pédestre — grande boucle « tour de ville » mêlant forêt de bois de couleurs des bas (vanille), Chemin de Ceinture et sentier littoral du Sud Sauvage.
- Chapo : Une grande boucle de 17 km qui fait le tour de Saint-Philippe, des bois de couleurs et des plantations de vanille de Mare Longue jusqu'au sentier littoral battu par les vagues, entre vacoas, ravines et points de vue sur l'océan.

## Description
Cet itinéraire en boucle de 17 km fait le tour complet du bourg de Saint-Philippe, dans le Sud Sauvage. Le parcours débute dans une belle forêt de bois de couleurs des bas où pousse la vanille, à Mare Longue, puis remonte le Chemin de Ceinture par une route étroite offrant de nombreux panoramas sur l'océan et la côte boisée. Le tracé contourne le Piton Mare d'Arzule et franchit à plusieurs reprises la ravine d'Arzule en longs lacets, avant de rejoindre la RN2. La seconde moitié emprunte le sentier littoral de Saint-Philippe en bord de mer, puis des pistes de pêcheurs à travers un littoral rocheux volcanique et des peuplements de vacoas (pandanus). Une part importante du tracé se fait sur route ou piste bétonnée. La forêt de Mare Longue traversée au départ est, selon l'Office de tourisme du Sud, l'une des dernières forêts tropicales humides de basse altitude de La Réunion (moins de 7 % de la forêt humide originelle subsiste, principalement à Saint-Philippe).

## Adresse & localisation (object_location)
- Adresse : Départ au parking du Sentier de Mare Longue (en direction du Sentier Botanique), Mare Longue, à l'entrée du bourg de Saint-Philippe en venant de Saint-Joseph
- Code postal / ville : 97442 Saint-Philippe (code postal 97442 = commune INSEE 97417 Saint-Philippe ; lieu-dit Mare Longue / Brûlé de Mare Longue)
- GPS (WGS84) : -21.361143, 55.75482 — source : géocodage BAN api-adresse.data.gouv.fr, requête « Mare Longue Saint-Philippe » avec citycode=97417, label « Mare Longue 97442 Saint-Philippe », type=street, score 0,513, citycode 97417. NB : point indicatif du lieu-dit de départ ; le point exact du parking/trailhead reste à relever sur le terrain. (Variante BAN « Brûlé de Mare Longue » : -21.365825, 55.75174, score 0,630.)
- Altitude : amplitude du parcours 296 m → 3 m d'altitude (source Randopitons). Altitude précise du point de départ : Non trouvé — à compléter.

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel sans gestionnaire dédié ; contact possible Office de tourisme du Sud / antenne Saint-Philippe — à confirmer)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (l'itinéraire est décrit sur Randopitons et l'Office de tourisme du Sud, sans page « propriétaire » dédiée)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Itinéraire de randonnée en accès libre, praticable toute l'année. Randopitons recommande de partir tôt pour éviter la chaleur. Sentier littoral parfois envahi par les herbes hautes ; portions boueuses possibles par temps humide. Horaires d'ouverture au sens strict : sans objet (site naturel en accès libre).

## Tarifs (object_price)
Gratuit — itinéraire de randonnée en accès libre (aucun droit d'entrée). Source : nature de l'objet (sentier public) confirmée par les pages Randopitons et Office de tourisme du Sud ; aucune billetterie mentionnée.

## Données spécifiques ITI (object_iti)
- Distance : 17 km (source Randopitons #1316)
- Dénivelé positif : +340 m (source Randopitons)
- Dénivelé négatif : Non trouvé — à compléter (boucle : ≈ −340 m attendu mais non chiffré explicitement)
- Durée estimée : 4h30 (source Randopitons)
- Difficulté : Moyen (source Randopitons ; « Indice de confiance : Excellent »)
- Type de parcours : Boucle
- Balisage : Blanc sur la portion littorale uniquement ; balises et indications « de bonne qualité » sur le reste du parcours (source Randopitons). GPS recommandé.
- Points d'intérêt traversés (source Randopitons) : Arche Saint-Philippe, ravine Arzule, Piton Mare d'Arzule, Souffleurs d'Arbonne, Marine de Saint-Philippe, monument Warren Hastings, chapelles près de Mare Longue.
- Trace GPX / KML : Non trouvé — à compléter (pas de fichier officiel récupéré ; à produire/importer)

## Équipements & services (object_amenity)
- Parking : oui, au départ du Sentier de Mare Longue (source Randopitons)
- Sanitaires : Non trouvé — à compléter
- Restauration sur place : Non trouvé — à compléter (commerces du bourg de Saint-Philippe à proximité du tracé)
- Aire de pique-nique : présente sur le littoral du secteur (Puits Arabe, sur la partie littorale de Saint-Philippe — source guide-reunion.fr) ; à confirmer comme étant sur ce tracé précis
- Accès / stationnement : accès routier par la RN2, départ Mare Longue à l'entrée Sud du bourg
- Eau potable : Non trouvé — à compléter

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : Non trouvé — à compléter
- PMR / accessibilité : Non adapté PMR (itinéraire de randonnée moyen, 17 km, dénivelé, passages littoraux rocheux, portions boueuses) — accessibilité réduite signalée par la nature du terrain ; détail à compléter.

## Labels & classements (object_classification)
Aucun label/classement revendiqué trouvé pour cet itinéraire (pas de classement PR/GR officiel identifié sur les sources consultées ; le tracé recoupe par endroits le GRR2 / sentier littoral mais n'est pas présenté comme un GR labellisé). À vérifier auprès de l'Office de tourisme du Sud / Parc national. → Aucun trouvé.

## Médias suggérés
- Page Randopitons #1316 (vignettes et photos du parcours) : https://randopitons.re/randonnee/1316-tour-saint-philippe-chemin-ceinture-littoral — NE PAS télécharger sans autorisation.
- Page « La forêt de Mare Longue » de l'Office de tourisme du Sud : https://www.sudreuniontourisme.fr/tresors-du-sud/la-foret-de-mare-longue.html — NE PAS télécharger sans autorisation.
- Photos à produire en propre sur le terrain (départ Mare Longue, sentier littoral, Souffleurs d'Arbonne, Marine de Saint-Philippe) — recommandé.

## Données manquantes / à vérifier
- Point GPS exact du parking/trailhead (géocodage actuel = centroïde du lieu-dit Mare Longue, score moyen).
- Altitude précise du départ ; dénivelé négatif chiffré.
- Trace GPX/KML officielle (`object_iti.geom`).
- Sanitaires, eau potable, restauration, confirmation aire de pique-nique sur le tracé.
- Contacts / page web de référence ; rattachement éventuel à un gestionnaire (commune de Saint-Philippe, ONF, Parc national).
- Langues d'accueil ; toute info accessibilité formalisée.
- Vérifier l'entretien actuel du sentier littoral (signalé parfois envahi par les herbes hautes) et l'état des passages (échelle/corde sur certaines variantes littorales voisines).
- NB fermetures (réévaluation 2026-07-30) : le sentier du littoral de Saint-Philippe a été FERMÉ temporairement puis ROUVERT par décision du 2026-05-07 (source werun.world / suivi sentiers ONF) ; suivre les décisions ONF avant publication (la RF36 de Basse Vallée, voisine mais hors tracé, est fermée du 2026-07-17 au 2026-08-14). AllTrails affiche encore « [FERMÉ] » sur le tronçon littoral vers Vieux Port — mention périmée à ne pas reprendre.
- Vérification terrain générale (statut « non vérifié sur le terrain »).

## Sources
- Le tour de Saint-Philippe par le Chemin de Ceinture et le littoral — https://randopitons.re/randonnee/1316-tour-saint-philippe-chemin-ceinture-littoral — consulté le 2026-06-26
- Saint-Philippe et le Tremblet (Sud), toutes les randonnées (Randopitons) — https://randopitons.re/randonnees/region/sud/saint-philippe-tremblet — consulté le 2026-06-26
- Saint-Philippe : les meilleurs itinéraires de randonnée (AllTrails) — https://www.alltrails.com/reunion/saint-pierre/saint-philippe — consulté le 2026-06-26
- La forêt de Mare Longue — Office de tourisme du Sud (sudreuniontourisme.fr) — https://www.sudreuniontourisme.fr/tresors-du-sud/la-foret-de-mare-longue.html — consulté le 2026-06-26
- Randonnée à Saint-Philippe — littoral, Pointe de la Marine / Puits Arabe (guide-reunion.fr) — https://guide-reunion.fr/tourisme-loisirs/loisirs/randonnees/st-philippe-littoral/ — consulté le 2026-06-26
- Géocodage BAN (Base Adresse Nationale) — https://api-adresse.data.gouv.fr/search/?q=Mare+Longue+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
