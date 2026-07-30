# Roche Plate depuis Saint-Joseph par la Rivière des Remparts — ITI (Itinéraire de randonnée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ITI
- name : Roche Plate depuis Saint-Joseph par la Rivière des Remparts
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). Recherche `object` sur `%roche plate%`, `%remparts%`, `%rivière des remparts%` → 3 résultats, tous des hébergements et non l'itinéraire : « Gîte de la Rivière des Remparts » (RES `RESRUN000000011R`, draft + HLO `HLORUN0000000113`, published) et « La Maison des Remparts » (HLO `HLORUN00000000WI`, draft) — il s'agit d'un gîte d'étape à Roche Plate, pas de la randonnée. Recherche `object_type='ITI'` → 1 seul résultat, `test iti` (placeholder de test). Aucun ITI réel en base. Conclusion : objet NON doublon. Action recommandée : importer ; pourra ensuite être relié via `object_relation` au gîte de Roche Plate (point d'étape) et au point de vue du Nez de Bœuf (déjà proposé) qui partagent le même fond de vallée.

## Identité
- Catégorie / sous-type proposé : Randonnée pédestre — itinéraire de remontée de rivière vers un hameau isolé (grande randonnée à la journée, niveau confirmé). Archétype éditeur : ITI.
- Chapo : Remontée spectaculaire de la Rivière des Remparts au départ de Saint-Joseph jusqu'au hameau préservé et isolé de Roche Plate, une longue traversée minérale au cœur de l'une des plus impressionnantes vallées encaissées de l'île.

## Description
La Rivière des Remparts dessine une vallée profonde et rectiligne entaillée dans les remparts du massif du Piton de la Fournaise, que ce sentier remonte depuis la sortie de Saint-Joseph jusqu'au hameau de Roche Plate. L'itinéraire suit le lit et les berges de la rivière, qu'il faut traverser à de nombreuses reprises, sur un terrain très majoritairement minéral (galets, rochers, blocs et passages sableux), avec peu d'ombre. Le parcours emprunte la piste utilisée par les 4x4 qui desservent le hameau et passe notamment par le barrage naturel de Mahavel, vestige de l'éboulement de 1965 qui obstrua la vallée et provoqua le départ des habitants de Roche Plate. Le hameau de Roche Plate, situé à environ trois heures de marche de la première route, conserve des lambeaux de forêt de bois de couleur des bas mêlés d'espèces introduites (manguiers, jacquiers, jamblons) et abrite une avifaune variée. Selon Randopitons, le parcours aller-retour mesure 33 km pour 670 m de dénivelé positif (altitudes 148–738 m) et 8 h de marche ; la mairie de Saint-Joseph et l'OTI du Sud décrivent un accès d'environ 13 km depuis le départ (≈ 4 h à pied, ≈ 1 h 30 en 4x4).

## Adresse & localisation (object_location)
- Adresse : Départ au rond-point de la Rivière des Remparts, en direction de la zone de concassage (route des Goyaves / Route des Remparts), en sortie de Saint-Joseph. Variante de départ par le centre-ville (rues Joseph Hubert et Guy de Ferrière) puis traversée des vergers de l'Îlet Delbon.
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.318664, 55.590132 — source : géocodage BAN api-adresse.data.gouv.fr, requête « rond-point riviere des remparts Saint-Joseph » → résultat « Route des Remparts 97480 Saint-Joseph », score 0.533, citycode 97412, type=street. Point de départ approché (entrée de la route remontant la vallée) ; à affiner par relevé GPS terrain du parking après le concassage. (Le hameau d'arrivée Roche Plate n'a pas de coordonnée confirmée par source consultée → à compléter par tracé GPX.)
- Altitude : Départ ≈ 148 m, point haut du parcours ≈ 738 m (source Randopitons : « 148-738 m »). Roche Plate village ≈ "Non trouvé — à compléter" (altitude exacte du hameau non confirmée).

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (itinéraire en accès libre, pas d'exploitant ; renseignements possibles auprès de l'OTI du Sud / mairie de Saint-Joseph).
- Email : Non trouvé — à compléter
- Site web : https://saintjoseph.re/Roche-Plate (page d'information de la commune) ; https://www.sudreuniontourisme.fr/tresors-du-sud/roche-plate.html (OTI du Sud)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Accès libre toute l'année (sentier de pleine nature, non gardé). Pratique fortement déconseillée par temps de pluie ou en cas d'alerte fortes pluies / crue : la Rivière des Remparts est sujette aux crues brutales et le sentier la traverse de nombreuses fois. Départ tôt le matin recommandé (8 h de marche A/R, peu d'ombre). Horaires d'ouverture stricto sensu : sans objet — à signaler comme « site naturel en accès libre ».

## Tarifs (object_price)
Gratuit — itinéraire de randonnée en accès libre (aucun droit d'entrée). Le bivouac/hébergement éventuel au gîte de Roche Plate et le transport 4x4 vers le hameau relèvent de prestataires tiers et ne sont pas couverts par cette fiche.

## Données spécifiques ITI (object_iti)
- distance : 33 km (aller-retour) — source Randopitons. Variante « accès simple » ≈ 13 km annoncée par la mairie/OTI (correspond au trajet montant jusqu'au hameau, hors retour).
- dénivelé positif : +670 m — source Randopitons.
- dénivelé négatif : Non trouvé — à compléter (probablement ≈ équivalent au D+ sur un A/R ; non chiffré par les sources).
- durée : 8 h (parcours A/R complet, source Randopitons) ; ≈ 4 h à pied pour l'accès montant seul (mairie/OTI).
- difficulté : Moyen (source Randopitons, indice de confiance « Excellent ») — réservé aux bons marcheurs ; certains passages déconseillés aux débutants et aux enfants (source mairie).
- type : Aller-retour (out-and-back) — source Randopitons.
- balisage : Très peu de balises, voire aucune (« Très peu de balises, voire pas du tout », source Randopitons). À considérer comme NON balisé.
- nature du sol / terrain : galets, rochers, blocs et passages sableux ; nombreuses traversées de la rivière ; éboulis présents ; piste 4x4 sur une partie du parcours.
- points remarquables (étapes potentielles object_iti_stage) : Îlet Delbon, Îlet Dimitile, Source Cazala, Jean Petit, Grand Coude, Bras de Mahavel, Barrage de Mahavel (éboulement de 1965), hameau de Roche Plate, Cascades des Trois Sources (source Randopitons).
- tracé GPX/KML : Non trouvé — à compléter (à produire par relevé terrain ; aucun fichier de tracé officiel récupéré sur source ouverte autorisée).

## Équipements & services (object_amenity)
- Parking : oui, le long de la route de la zone de concassage / au rond-point en sortie de ville (source Randopitons). Capacité/aménagement : Non trouvé — à compléter.
- Sanitaires : Non trouvé — à compléter (aucun signalé en début de sentier).
- Eau potable : Non trouvé — à compléter (présence de sources naturelles le long du parcours — Source Cazala — mais potabilité non garantie ; prévoir son eau).
- Restauration / ravitaillement : au hameau de Roche Plate (le village « offre du ravitaillement et des possibilités d'hébergement » selon les sources) — à confirmer auprès du gîte. En début de parcours : Non trouvé.
- Accès véhicule : circulation de poids lourds en semaine sur la première section (zone de concassage) — vigilance signalée par Randopitons.

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès libre gratuit).
- Langues : Non trouvé — à compléter.
- Accessibilité PMR : NON accessible PMR — itinéraire de pleine nature, terrain minéral instable, traversées de rivière, non balisé. Non adapté aux poussettes ni aux jeunes enfants pour la totalité du parcours (source mairie).

## Labels & classements (object_classification)
Aucun label trouvé sur les sources consultées. Itinéraire de randonnée non labellisé (non inscrit au PR/GR balisé d'après l'absence de balisage signalée). « Non trouvé — à compléter » pour une éventuelle inscription au PDIPR.

## Médias suggérés
- Photo et carte sur la fiche Randopitons : https://randopitons.re/randonnee/1011-roche-plate-depuis-saint-joseph-riviere-remparts
- Photos sur la fiche « Trésors du Sud » de l'OTI : https://www.sudreuniontourisme.fr/tresors-du-sud/roche-plate.html
- Photos sur la page de la mairie : https://saintjoseph.re/Roche-Plate

NE PAS télécharger sans autorisation — vérifier les droits auprès de chaque éditeur (Randopitons, OTI du Sud, Ville de Saint-Joseph) avant toute réutilisation.

## Données manquantes / à vérifier
- Coordonnées GPS précises du parking de départ (après le concassage) et du hameau de Roche Plate (arrivée) — à relever sur le terrain.
- Tracé GPX/KML officiel de l'itinéraire (géométrie `object_iti.geom`).
- Dénivelé négatif chiffré.
- Altitude exacte du hameau de Roche Plate.
- Sanitaires, eau potable, capacité du parking au départ.
- Détail des prestations de ravitaillement/hébergement à Roche Plate (et leur statut d'ouverture actuel).
- Confirmation de l'état praticable du sentier (érosion, éboulis, crues) — donnée volatile à valider avant publication.
- Langues d'accueil, éventuelle inscription PDIPR/PR.
- Distinction claire dans la fiche entre la version A/R complète (33 km / 8 h) et l'accès montant simple (13 km / 4 h) pour ne pas induire le visiteur en erreur.

## Sources
- Roche Plate depuis Saint-Joseph par la Rivière des Remparts — Randopitons — https://randopitons.re/randonnee/1011-roche-plate-depuis-saint-joseph-riviere-remparts — consulté le 2026-06-26
- Roche Plate (Trésors du Sud) — Office de Tourisme Intercommunal du Sud — https://www.sudreuniontourisme.fr/tresors-du-sud/roche-plate.html — consulté le 2026-06-26
- Roche Plate — Ville de Saint-Joseph — https://saintjoseph.re/Roche-Plate — consulté le 2026-06-26
- Nez de Bœuf-Roche Plate (rivière des remparts) (Saint-Joseph) — Île de La Réunion Tourisme (IRT) — https://en.reunion.fr/offers/nez-de-boeuf-roche-plate-riviere-des-remparts-saint-joseph-en-575442/ — consulté le 2026-06-26
- Géocodage trailhead — Base Adresse Nationale (api-adresse.data.gouv.fr), requête « rond-point riviere des remparts Saint-Joseph », citycode 97412 — consulté le 2026-06-26
