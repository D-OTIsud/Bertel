# Bassin Bleu (vallée de Langevin) — PNA (Patrimoine naturel / site naturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PNA
- name : Bassin Bleu (vallée de Langevin)
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **Aucun doublon réel repéré** (vérification SQL live du 2026-06-26 sur `public.object`). Un objet `HLORUN00000000QG` « Couleurs du Sud Sauvage - Bassin Bleu » existe (type **HLO**, draft) mais c'est un **hébergement** nommé d'après le lieu, PAS le site naturel — ce n'est pas un homologue du PNA. Aucun objet PNA/PCU/SPU/VIL ne porte « Bassin Bleu » ni « Langevin » en tant que site naturel. ATTENTION : il existe d'autres « Bassin Bleu » à La Réunion (Sainte-Anne/Saint-Benoît, Étang-Salé) — HORS périmètre OTI du Sud ; ne pas confondre. Action recommandée : créer la fiche du site naturel ; à terme on pourra relier l'hébergement HLO via une `object_relation [based_at_site]` (optionnel, non bloquant).

## Identité
- Catégorie / sous-type proposé : Site naturel — bassin de rivière / point de baignade (vallée de Langevin)
- Chapo : Premier bassin de la rivière Langevin en remontant depuis le littoral, le Bassin Bleu est un site naturel emblématique de la vallée de Langevin (Saint-Joseph), prisé pour la baignade et le pique-nique lorsque le débit le permet.

## Description
Le Bassin Bleu est l'un des bassins de la vallée de Langevin, à Saint-Joseph, qui jalonne le cours de la rivière Langevin entre le littoral et la cascade de Grand Galet. Il fait partie d'une succession de bassins et de cascades aux noms évocateurs (Bassin Benjoin, Bassin Bleu, cascade du Trou Noir, cascade de Grand Galet) décrite par l'Office de Tourisme du Sud. C'est le bassin le plus en aval, situé à proximité de la centrale hydroélectrique et du pont de la rivière Langevin, facilement accessible depuis la route. Particularité hydrologique notable : la rivière Langevin coule fréquemment en sous-sol sur ce secteur, si bien que la zone est souvent à sec et que les véritables cascades n'apparaissent qu'en période de fortes pluies ou de tempête tropicale (source Randopitons). La baignade y est possible selon les conditions météorologiques mais non surveillée ; elle a déjà fait l'objet d'interdictions municipales après de fortes pluies pour raisons de sécurité (presse La1ère).

## Adresse & localisation (object_location)
- Adresse : Vallée de Langevin, route de Grand Galet (RD32), à proximité du pont de la rivière Langevin / centrale hydroélectrique
- Code postal / ville : 97480 Saint-Joseph (INSEE 97412)
- GPS (WGS84) : **-21.356237, 55.648198** — source : coordonnées du POI « Bassin Bleu de la Rivière Langevin » sur Randopitons (POI 1123), consulté le 2026-06-26. Repère d'accès complémentaire « Route de Grand Galet » géocodé via BAN api-adresse.data.gouv.fr : -21.340651, 55.643866 (score 0.965, citycode 97412) — la route de desserte, pas le bassin lui-même.
- Altitude : Non trouvé — à compléter (site de fond de vallée proche du littoral ; altitude faible mais non confirmée par une source consultée)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel non géré par un exploitant unique ; renseignements via OTI du Sud / mairie de Saint-Joseph)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site dédié ; présence sur sudreuniontourisme.fr en tant que partie de la vallée de Langevin)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Accès libre, site naturel non clôturé. Plusieurs sources indiquent un accès permanent (24h/24, toute l'année) pour la vallée de Langevin. ATTENTION : la baignade peut être **interdite par arrêté** après de fortes pluies (sécurité). Horaires d'accès officiels propres au Bassin Bleu : Non trouvé — à compléter.

## Tarifs (object_price)
**Gratuit** — site naturel à accès libre (la vallée de Langevin / les cascades sont décrites comme entièrement gratuites par les sources consultées ; parking gratuit). Pas de billetterie.

## Données spécifiques PNA
PNA = site/patrimoine naturel, pas de table de facette dédiée (classifications/labels génériques uniquement).
- Type de site : bassin de rivière / point de baignade naturel en fond de vallée
- Élément remarquable : succession de bassins et cascades de la vallée de Langevin ; eau douce des hauts rencontrant le secteur littoral
- Risque / sécurité : baignade non surveillée ; débit pouvant devenir dangereux rapidement après la pluie ; zone parfois à sec (rivière souterraine) ; interdictions municipales ponctuelles. **Mise à jour 2026-07-30 (réévaluation)** : interdictions de baignade récurrentes en 2026 pour **qualité d'eau dégradée** (ARS) — secteur Passerelle–Embouchure interdit à partir du 26/03/2026 « jusqu'à nouvel ordre », plusieurs bassins encore concernés en mai 2026 (sources La1ère/LINFO.re). Le Bassin Bleu étant le bassin le plus en aval (proche embouchure), il est vraisemblablement dans le périmètre — vérifier l'arrêté municipal en vigueur auprès de la mairie de Saint-Joseph avant de communiquer sur la baignade. L'accès au site reste libre.
- Activités associées : baignade (selon conditions), pique-nique, promenade le long de la rivière sur les rochers
- Rattachement possible : object_relation [based_at_site] depuis des prestations/hébergements de la vallée (ex. hébergement HLO « Couleurs du Sud Sauvage - Bassin Bleu ») — optionnel

## Équipements & services (object_amenity)
- Parking : Oui — parking gratuit à proximité (avant le pont / le long de la route de Grand Galet), décrit comme petit. Source : rendez-vous.tv, randopitons.
- Aires de pique-nique : Oui — la vallée de Langevin dispose de plusieurs aires de pique-nique le long de la petite route remontant la rivière (sudreuniontourisme). Présence précise d'une aire AU Bassin Bleu : Non trouvé — à compléter.
- Sanitaires : Non trouvé — à compléter
- Accès en voiture : Oui (site accessible en voiture, marche très courte < 1 km depuis le stationnement)
- Restauration : Non trouvé — à compléter (commerces de proximité à Langevin / Saint-Joseph, hors site)

## Paiement / langues / accessibilité
- Moyens de paiement : Sans objet (site gratuit)
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (site naturel rocheux en bord de rivière ; accès probablement non adapté PMR mais non confirmé par une source)

## Labels & classements (object_classification)
Aucun label revendiqué trouvé pour le site lui-même. La vallée de Langevin est un site touristique majeur du Sud Sauvage mais aucun label formel (ex. ENS, site classé) n'a été confirmé par les sources consultées → Non trouvé — à compléter / Aucun trouvé.

## Médias suggérés
- Page « La vallée de Langevin » de l'OTI du Sud (photos officielles) : https://www.sudreuniontourisme.fr/tresors-du-sud/la-vallee-de-langevin.html — NE PAS télécharger sans autorisation
- Fiche POI Randopitons (photos contributeurs) : https://randopitons.re/poi/1123-bassin-bleu-riviere-langevin — NE PAS télécharger sans autorisation
> Aucune URL d'image directe récupérée ; demander des visuels libres de droits à l'OTI du Sud ou produire des photos propres lors d'une vérification terrain.

## Données manquantes / à vérifier
- Altitude exacte du site
- Présence et nature des sanitaires sur place
- Existence d'une aire de pique-nique spécifiquement au Bassin Bleu (vs autres aires de la vallée)
- Coordonnées GPS à recaler sur le terrain (Randopitons donne le POI ; vérifier le point de baignade exact)
- Accessibilité PMR
- Existence éventuelle d'un arrêté permanent ou d'une signalétique de sécurité / panneau d'information
- Labels / statut de protection (site classé, ENS, Natura 2000 ?) — à vérifier auprès de la mairie de Saint-Joseph et de la DEAL
- Contact gestionnaire (mairie de Saint-Joseph / commune) pour la partie sécurité-baignade
- Photo officielle libre de droits

## Sources
- La vallée de Langevin — Offices de tourisme du Sud de La Réunion — https://www.sudreuniontourisme.fr/tresors-du-sud/la-vallee-de-langevin.html — consulté le 2026-06-26 (mention explicite du « Bassin Bleu » dans l'énumération des bassins de la vallée ; aires de pique-nique ; route de Grand Galet)
- Le Bassin Bleu de la Rivière Langevin — Randopitons (POI 1123) — https://randopitons.re/poi/1123-bassin-bleu-riviere-langevin — consulté le 2026-06-26 (coordonnées GPS -21.356237, 55.648198 ; accès depuis le pont/centrale ; rivière souterraine ; baignade)
- Bassin Bleu - Langevin — visite.reunionsaveurs.com — http://visite.reunionsaveurs.com/randonnees-bassins-du-sud-de-la-reunion/bassin-bleu-langevin/ — consulté le 2026-06-26 (accès via le pont de Langevin et le supermarché « Au Paradis » ; bassin le plus en aval)
- Baignade interdite à Bassin Bleu et à la rivière Langevin après les fortes pluies — La1ère / France Info — https://la1ere.franceinfo.fr/reunion/baignade-interdite-a-bassin-bleu-et-a-la-riviere-langevin-apres-les-fortes-pluies-1204960.html — consulté le 2026-06-26 (atteste le nom officiel « Bassin Bleu » sur la rivière Langevin et le contexte d'interdiction de baignade pour sécurité)
- Baignade Cascade Langevin : accès, horaires & bassins — rendez-vous.tv — https://rendez-vous.tv/voyage/cascade-de-langevin-baignade-acces/ — consulté le 2026-06-26 (accès 20 min depuis Saint-Joseph, parking gratuit/petit, accès libre toute l'année, gratuité)
- Cascades et bassins de La Réunion — guide-reunion.fr — https://guide-reunion.fr/tourisme-loisirs/interet/cascades/ — consulté le 2026-06-26 (cascade Langevin / Grand Galet à Saint-Joseph, contexte de la vallée)
- Géocodage BAN (route de Grand Galet) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=Route+de+Grand+Galet+Saint-Joseph&citycode=97412 — consulté le 2026-06-26 (route de desserte : -21.340651, 55.643866, score 0.965, citycode 97412)
