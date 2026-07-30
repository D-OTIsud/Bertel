# Ancien cimetière de Basse Vallée — PCU (Patrimoine culturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PCU
- name : Ancien cimetière de Basse Vallée
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26). Recherche sur `object.name` (motifs `%cimetiere%`, `%basse vallee%`) → seuls « Le Rond de Basse Vallée » (HLO + RES, hébergement/restauration du quartier homonyme, objets distincts) ressortent ; aucun objet patrimonial. Balayage des types PCU/PNA/VIL/SPU → aucun homologue. Le site ne figure pas non plus dans les 31 fiches déjà proposées. **Conclusion : objet réel, non en base, non déjà proposé.**

## Identité
- Catégorie / sous-type proposé : Patrimoine culturel / Monument historique — cimetière ancien (lieu de mémoire de l'esclavage)
- Chapo : Inscrit au titre des Monuments historiques, ce petit cimetière marin abandonné de la fin du XVIIIᵉ siècle conserve une quinzaine de tombes de pierre uniques — dont des sépultures d'esclaves — au cœur du Sud sauvage de Saint-Philippe.

## Description
L'Ancien cimetière de Basse Vallée est un cimetière marin créé à la fin du XVIIIᵉ siècle, l'un des rares témoins des premières traces de l'occupation humaine sur le territoire communal de Saint-Philippe. Une quinzaine de tombes en pierre de taille y subsistent dans une enceinte aujourd'hui abandonnée. Le cimetière était mixte : une section était réservée aux esclaves, et plusieurs inhumations s'y sont poursuivies jusque vers 1870, année de création d'un second cimetière à Saint-Philippe (selon les archives, le site appartint à la commune de Saint-Joseph jusqu'en 1830, puis fut rattaché à Saint-Philippe). Parmi les sépultures figurent un édifice remarquable en forme d'autel surélevé d'une pyramide, ainsi que deux tombes alignées en demi-cylindre ornées chacune d'une base de croix à tête de mort — une disposition que ne présente aucun autre cimetière de l'île. Un mausolée de pierre a été restauré après les dommages causés par des fouilles clandestines (2018). Le site a été inscrit au titre des Monuments historiques par arrêté du 26 janvier 2012 (notice Mérimée PA97400116), protection englobant l'ensemble du cimetière et une maison de type Tomi édifiée sur la parcelle.

## Adresse & localisation (object_location)
- Adresse : 52 Route Labourdonnais, quartier Basse-Vallée
- Code postal / ville : 97442 Saint-Philippe (code postal 97442 ; INSEE 97417 — c'est l'INSEE 97417 qui sert au rattachement périmètre/`ref_commune`)
- GPS (WGS84) : -21.372652, 55.712825 — source : géocodage BAN api-adresse.data.gouv.fr sur « 52 Route Labourdonnais Basse Vallee Saint-Philippe », score 0.6557, citycode 97417, type housenumber. Cohérent avec les coordonnées Wikipédia 21°22′24,4″S / 55°42′45,3″E (≈ -21.3734, 55.7126). **À affiner sur le terrain** : les tombes sont invisibles depuis la route (située ~50 m en amont) et s'atteignent par un petit escalier de maçonnerie ; le point GPS exact des sépultures peut légèrement différer du point d'adresse.
- Altitude : Non trouvé — à compléter (site de bord de mer, quasi niveau zéro ; à confirmer)

## Contacts (object_contact)
- Téléphone : 06 92 48 19 25 (contact figurant sur la fiche Journées du Patrimoine — à requalifier : association/mairie/référent ? — à vérifier)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de page dédiée officielle ; voir notice POP Culture / Mérimée)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Non trouvé — à compléter. Site patrimonial en plein air, abandonné et non aménagé pour l'accueil du public ; ouvert lors d'événements ponctuels (ex. Journées européennes du patrimoine). Accessibilité libre et conditions de visite à confirmer auprès de la mairie de Saint-Philippe.

## Tarifs (object_price)
Non trouvé — à compléter. Site patrimonial extérieur, vraisemblablement **gratuit / accès libre** (à confirmer ; aucune billetterie connue).

## Données spécifiques PCU
PCU (patrimoine culturel) → pas de table facette dédiée ; à porter via classifications / labels génériques.
- Type de patrimoine : cimetière ancien / cimetière marin — lieu de mémoire de l'esclavage
- Protection : Monument historique — Inscrit (inscription au titre des MH par arrêté du 26 janvier 2012)
- Référence Mérimée : PA97400116
- Références cadastrales : BD 147 (source notice Mérimée)
- Dénomination officielle Mérimée : « Cimetière et maison »
- Époque de construction : dernier quart du XVIIIᵉ siècle et XIXᵉ siècle
- Propriétaire : Commune de Saint-Philippe (source notice Mérimée)
- Éléments protégés : l'ensemble du cimetière, y compris une maison de type Tomi édifiée sur la parcelle
- Éléments remarquables : ~15 tombes en pierre de taille ; un édifice en forme d'autel surélevé d'une pyramide ; deux tombes en demi-cylindre à croix et tête de mort ; section de sépultures d'esclaves ; mausolée de pierre restauré

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (stationnement le long de la route à vérifier)
- Sanitaires : Non trouvé — à compléter (vraisemblablement absents — site non aménagé)
- Accès : escalier de maçonnerie depuis la route (les tombes sont invisibles depuis la chaussée, ~50 m en amont) — source presse
- Restauration : Non trouvé — aucune sur site

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès présumé gratuit ; à confirmer)
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter. **Probablement NON accessible PMR** : accès par escalier de maçonnerie depuis la route ; site abandonné non aménagé (à vérifier).

## Labels & classements (object_classification)
- Monument historique — **Inscrit** au titre des Monuments historiques (arrêté du 26 janvier 2012, notice Mérimée PA97400116). → à mapper sur un code label/classement « Monument historique inscrit » dans `ref_classification` (vérifier l'existence du code ; sinon « Aucun trouvé » côté `LBL_*` durabilité/accessibilité — il s'agit d'une protection patrimoniale, pas d'un label tourisme).
- Aucun label tourisme (T&H, Qualité Tourisme, durabilité) connu.

## Médias suggérés
- Photo de la notice POP Culture / Mérimée : https://pop.culture.gouv.fr/notice/merimee/PA97400116 (NE PAS télécharger sans autorisation ; vérifier les droits / licence du Ministère de la Culture)
- Illustrations d'articles de presse (zinfos974, imazpress) — NE PAS télécharger sans autorisation (droits réservés)
- À privilégier : photo libre de droits ou cliché propre OTI à produire sur le terrain.

## Données manquantes / à vérifier
- Point GPS exact des sépultures (vs point d'adresse route) et altitude
- Statut/identité du contact 06 92 48 19 25 (association, référent patrimoine, mairie ?)
- Conditions réelles de visite : accès libre permanent vs ouverture événementielle uniquement ; sécurité du site abandonné
- Tarif (confirmer gratuité) et horaires
- Existence/état du parking, sanitaires, signalétique
- Accessibilité PMR (à confirmer : probablement non)
- Code de classification « Monument historique inscrit » dans le référentiel `ref_classification`
- Vérification cadastrale BD 147 et emprise exacte
- Médias libres de droits

## Sources
- Ancien cimetière de Basse Vallée — Wikipédia — https://fr.wikipedia.org/wiki/Ancien_cimeti%C3%A8re_de_Basse_Vall%C3%A9e — consulté le 2026-06-26
- Notice Mérimée PA97400116, base POP Ministère de la Culture — https://pop.culture.gouv.fr/notice/merimee/PA97400116 — consulté le 2026-06-26
- Ancien cimetière de Basse-Vallée à Saint-Philippe (PA97400116) — Monumentum — https://monumentum.fr/ancien-cimetiere-basse-vallee-pa97400116.html — consulté le 2026-06-26
- Ancien cimetière de Basse Vallée — Journées du Patrimoine 2021 — https://www.journees-du-patrimoine.com/SITE/ancien-cimetiere-basse-vallee--sai-251328.htm — consulté le 2026-06-26
- « Ancien Cimetière marin de Basse Vallée » — Zinfos974 — https://www.zinfos974.com/Ancien-Cimetiere-marin-de-Basse-Vallee_a16924.html — consulté le 2026-06-26 (historique : 1820/1830/1870, section esclaves, accès par escalier)
- Géocodage BAN — api-adresse.data.gouv.fr (q=52 Route Labourdonnais Basse Vallee Saint-Philippe, citycode 97417) — consulté le 2026-06-26
