# Le Baril (village historique) — VIL (Village / quartier patrimonial)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : Le Baril (village historique)
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : Aucun homologue VIL/patrimonial repéré (vérification SQL live du 2026-06-26 sur `object` : `name ILIKE '%baril%'` ⇒ 6 lignes, toutes des établissements marchands portant le nom du lieu-dit — « Baril O'Thentik » HLO, « La BBO La Bulle by Baril O'thentik » HLO, « Villa Baril Sucré » HLO, « Hôtel les Embruns du Baril » HOT, « Le Baril de Poudre » LOI, « BPRINT BY BARIL AND CO » LOI). Aucune fiche ne décrit le village/quartier du Baril ni l'usine sucrière (MH PA97400067). Pas de doublon ⇒ création recommandée. Note : le périmètre VIL ici = le hameau côtier du Baril structuré autour des vestiges de l'usine sucrière, monument historique inscrit ; ne pas confondre avec les hôtels/locatifs homonymes (à lier ultérieurement via relations de proximité si pertinent).

## Identité
- Catégorie / sous-type proposé : Village créole côtier / quartier patrimonial du Sud Sauvage, organisé autour d'un site industriel sucrier du XIXᵉ siècle (Monument Historique inscrit).
- Chapo : Hameau de bord de mer le long de la RN2 à l'ouest de Saint-Philippe, Le Baril doit son identité aux vestiges monumentaux de son ancienne usine sucrière (1861-1863), dont la haute cheminée inscrite Monument Historique veille encore sur le littoral du Sud Sauvage.

## Description
Le Baril est un lieu-dit côtier de la commune de Saint-Philippe, situé sur la côte sud-est de La Réunion, en bordure de l'océan Indien et le long de la route nationale 2 (RN2). Le village s'est développé autour de l'usine sucrière du Baril, édifice monumental construit de 1861 à 1863 par Jacques-Henri Montbel Fontaine, ancien maire de Saint-Philippe. La production sucrière y cesse en 1887 (date retenue par la notice Mérimée PA97400067 et Wikipédia ; certaines pages secondaires donnent 1882/1892) ; l'usine est reconvertie en féculerie de manioc en 1919 (une seconde cheminée porte la date « 1919 ») puis définitivement abandonnée après le cyclone de 1932. Aujourd'hui propriété de la commune, le site conserve plusieurs vestiges remarquables — cheminée, chaudière, bassin, four — visibles depuis la route. La cheminée et le terrain d'assiette ont été inscrits au titre des Monuments Historiques par arrêté du 11 juillet 2002, inscription étendue à l'ensemble des vestiges de l'usine par arrêté du 22 mars 2022 (notice Mérimée PA97400067). Le hameau abrite par ailleurs un centre de réception de cannes en activité durant la campagne sucrière, ainsi que plusieurs établissements touristiques (hôtellerie, restauration, locatifs).

## Adresse & localisation (object_location)
- Adresse : Le Baril, RN 2 (route nationale 2), lieu-dit Le Baril
- Code postal / ville : 97442 Saint-Philippe (CP du Baril ; commune Saint-Philippe, INSEE 97417 — dans le périmètre OTI du Sud. NB : 97442 = code postal de Saint-Philippe, à ne pas confondre avec un code commune)
- GPS (WGS84) : -21.36761, 55.73087 — source : point des vestiges de l'usine du Baril relevé par Randopitons (« usine sucrière Baril »), cohérent avec la position Wikipédia 21°22′06″S 55°43′49″E (≈ -21.3683, 55.7303). Géocodage BAN api-adresse.data.gouv.fr de « Route Nationale 2 Baril » (citycode 97417) : lon 55.728477 / lat -21.369478, score 0,966, type street, code postal 97442 — donne le centroïde de voirie du hameau (à ~250 m à l'ouest des vestiges). Coordonnée précise des vestiges à confirmer sur le terrain.
- Altitude : Non trouvé — à compléter (site littoral de bord de RN2, proche du niveau de la mer)

## Contacts (object_location / object_contact)
- Téléphone : Non trouvé — à compléter (un numéro 06 92 48 19 25 apparaît sur une fiche Journées du Patrimoine 2020 pour la visite de l'ancienne usine, NON confirmé comme contact officiel courant — à vérifier auprès de la mairie de Saint-Philippe, propriétaire du site)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (le site n'a pas de page dédiée ; voir mairie de Saint-Philippe et notice POP Mérimée)
- Réseaux sociaux : Non trouvé — à compléter (une page Facebook « Le Baril - St Philippe » existe mais sa nature/officialité n'est pas confirmée)

## Horaires (object_opening)
Non trouvé — à compléter. Site patrimonial de plein air visible librement depuis la RN2 (vestiges en accès extérieur). Ouvertures encadrées ponctuelles documentées lors des Journées Européennes du Patrimoine (ex. éditions 2020/2021 : rencontre avec des archéologues, exposition) ; programme variable d'une année à l'autre — se reporter au programme départemental annuel.

## Tarifs (object_price)
Site naturel et patrimonial en plein air : accès libre et gratuit depuis la voie publique (RN2). Aucune tarification d'entrée connue. Visites guidées éventuelles (Journées du Patrimoine) : gratuité non confirmée — à vérifier. « Non trouvé — à compléter » pour toute visite encadrée payante.

## Données spécifiques VIL
VIL = pas de table de facette dédiée (cf. note facettes : PCU/PNA/VIL/SPU ⇒ classifications/labels génériques). Éléments de caractérisation du village/quartier patrimonial :
- Élément patrimonial structurant : ancienne usine sucrière du Baril, Monument Historique inscrit (PA97400067).
- Période de référence : 3ᵉ quart du XIXᵉ siècle (construction 1861-1863) ; reconversion féculerie 1919 ; abandon post-cyclone 1932.
- Constructeur : Jacques-Henri Montbel Fontaine (ancien maire de Saint-Philippe).
- Propriété : communale (commune de Saint-Philippe) — parcelles cadastrales section AY n° 83 et 159 (réf. 2022).
- Vestiges visibles : cheminée principale (inscrite MH), seconde cheminée datée « 1919 », chaudière, bassin, four.
- Durée de visite indicative du site des vestiges : ~20 min (source Randopitons).
- Caractère : hameau côtier du Sud Sauvage, identité créole et sucrière, panoramas littoraux sur l'océan Indien.

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (stationnement le long de la RN2 probable ; à confirmer)
- Sanitaires : Non trouvé — à compléter
- Accès : depuis la RN2, hameau entre Saint-Joseph et Saint-Philippe, après l'aire de stockage de cannes et avant le Souffleur d'Arbonne (source Randopitons) ; vestiges visibles depuis la route
- Restauration / hébergement à proximité (au lieu-dit Le Baril, NON inclus dans cette fiche, à lier si pertinent) : Hôtel/Restaurant les Embruns du Baril, locatifs « Baril O'Thentik », etc.
- Centre de réception de cannes en activité à proximité durant la campagne sucrière

## Paiement / langues / accessibilité
- Moyens de paiement : Sans objet (site en accès libre) / Non trouvé — à compléter pour d'éventuelles prestations
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (site de vestiges en plein air ; accessibilité non documentée)

## Labels & classements (object_classification)
- Monument Historique — Inscription au titre des Monuments Historiques (arrêté du 11 juillet 2002, étendue le 22 mars 2022), notice Mérimée PA97400067, base Patrimoine architectural (POP / Ministère de la Culture). Élément protégé : cheminée + terrain d'assiette, étendu à l'ensemble des vestiges de l'usine.
- Mapping LBL_* : aucun code label tourisme (LBL_*) revendiqué ; la protection MH est une classification patrimoniale (à représenter via `object_classification` schème « monument_historique » / équivalent, à confirmer dans le référentiel). Aucun label tourisme commercial trouvé.

## Médias suggérés
- Photo de la cheminée et des vestiges sur la notice POP/Mérimée : https://pop.culture.gouv.fr/notice/merimee/PA97400067 — NE PAS télécharger sans autorisation
- Illustration de l'article Wikipédia « Usine du Baril » : https://fr.wikipedia.org/wiki/Usine_du_Baril — vérifier la licence Wikimedia Commons avant tout usage
- Photos du site sur Randopitons : https://randopitons.re/tourisme/764-usine-sucriere-baril — NE PAS télécharger sans autorisation
- Recommandation : prévoir une campagne photo terrain (droits OTI) pour la fiche définitive.

## Données manquantes / à vérifier
- Coordonnée GPS précise des vestiges (relevé terrain) et altitude.
- Périmètre exact à retenir pour l'objet VIL : hameau du Baril vs site stricto sensu de l'usine (arbitrage OTI/mairie). Option alternative : créer un objet PCU « Ancienne usine sucrière du Baril » centré sur le MH plutôt qu'un VIL « village ».
- Contact officiel (mairie de Saint-Philippe, service patrimoine/culture) ; confirmer ou écarter le 06 92 48 19 25.
- Conditions de visite réelles : libre accès aux vestiges depuis la RN2, sécurité du site (ruines), visites guidées éventuelles et leur calendrier.
- Stationnement, sanitaires, accessibilité PMR.
- Date exacte d'arrêt de la production sucrière : sources divergentes (1882 / 1887 / 1892 selon les pages) — à trancher sur source primaire (DRAC/POP).
- Schème de classification interne à utiliser pour la protection Monument Historique.

## Sources
- Usine du Baril — Wikipédia — https://fr.wikipedia.org/wiki/Usine_du_Baril — consulté le 2026-06-26
- Usine du Baril, notice Mérimée PA97400067 — POP, Plateforme Ouverte du Patrimoine (Ministère de la Culture) — https://pop.culture.gouv.fr/notice/merimee/PA97400067 — consulté le 2026-06-26
- Usine sucrière du Baril — Randopitons (tourisme) — https://randopitons.re/tourisme/764-usine-sucriere-baril — consulté le 2026-06-26
- Ancienne usine du Baril, Saint-Philippe — Journées du Patrimoine — https://www.journees-du-patrimoine.com/SITE/ancienne-usine-baril--saint-philip-251331.htm — consulté le 2026-06-26
- Géocodage Base Adresse Nationale (api-adresse.data.gouv.fr), « Route Nationale 2 Baril », citycode 97417 — https://api-adresse.data.gouv.fr/search/?q=Route+Nationale+2+Baril+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
