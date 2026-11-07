# Usine du Baril (cheminée et vestiges) — PCU (Patrimoine culturel)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : PCU
- name : Usine du Baril (cheminée et vestiges)
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun homologue patrimonial repéré** (vérification SQL live du 2026-06-26 sur `object`, motifs `%baril%`/`%usine%`/`%cheminée%`). Les 6 lignes trouvées sont des établissements/produits du lieu-dit Le Baril (HLO « Baril O'Thentik », « La BBO La Bulle by Baril O'thentik », « Villa Baril Sucré » ; HOT « Hôtel les Embruns du Baril » ; LOI « BPRINT BY BARIL AND CO », « Le Baril de Poudre ») — AUCUN ne désigne le monument historique. Le « Puits des Anglais » (déjà proposé) est un site archéologique **distinct et adjacent** (camp de travailleurs en périphérie de l'usine, fouille Inrap séparée) : à ne PAS fusionner, mais à **lier** via `object_relation` (proximité / même ensemble patrimonial du Baril). Action recommandée : créer la fiche.

## Identité
- Catégorie / sous-type proposé : Patrimoine industriel / vestiges d'usine sucrière — monument historique inscrit (PA97400067)
- Chapo : Vestiges spectaculaires d'une usine sucrière du XIXe siècle au bord de l'océan, dominés par une haute cheminée portant la date « 1919 » — un témoin majeur du passé industriel sucrier du Sud Sauvage, visible depuis la RN2.

## Description
L'usine du Baril est une ancienne usine sucrière construite de 1861 à 1863 par Jacques-Henri Montbel Fontaine, ancien maire de Saint-Philippe, sur le littoral sud-est de La Réunion, au bord de l'océan Indien, au lieu-dit Le Baril. Rachetée par le Crédit foncier colonial en 1868, elle cesse la production de sucre en 1887, est reconvertie en usine de fécule de manioc en 1919 (date inscrite sur la grande cheminée), puis définitivement abandonnée après les dégâts du cyclone de 1932. Le site conserve aujourd'hui la cheminée et d'importants vestiges en élévation et archéologiques : un pignon est de l'ancienne sucrerie (bâtiment de 47,50 m × 21 m, sur trois niveaux, hauteur estimée ~20 m), des canaux de chauffe et réseaux hydrauliques, des bassins, ainsi que des éléments métalliques de machinerie mis au jour lors du diagnostic Inrap de 2021. Un arrêté du 11 juillet 2002 avait inscrit la cheminée et le sol au titre des monuments historiques ; un arrêté du 22 mars 2022 a étendu la protection à l'usine « en totalité, comprenant la cheminée et les vestiges, tant en élévation qu'archéologiques ». Les ruines sont visibles depuis la route nationale et leur relative solidité permet aux visiteurs de pénétrer dans les structures pour apprécier une usine du XIXe siècle.

## Adresse & localisation (object_location)
- Adresse : Lieu-dit Le Baril, bord de la RN2 (côté océan), à proximité du Souffleur d'Arbonne ; ruine visible sur la gauche en venant de Saint-Joseph, peu après l'aire de stockage de canne à sucre
- Code postal / ville : 97442 Saint-Philippe
- GPS (WGS84) : **-21.36761, 55.73087** — source : coordonnées du site touristique Randopitons (fiche « Usine sucrière du Baril »). Cohérent avec la coordonnée patrimoniale officielle Wikipédia/POP (21°22′06″S 55°43′49″E ≈ -21.3683, 55.7303). Géocodage BAN api-adresse.data.gouv.fr de « Le Baril Saint-Philippe » (citycode 97417) : meilleur résultat « Route Nationale 2 Baril 97442 » lat -21.369478 / lon 55.728477, score 0.5431 (type=street, voie générique du lieu-dit, moins précis que le point Randopitons sur le monument). Coordonnée Randopitons retenue car centrée sur les vestiges.
- Altitude : faible, niveau littoral (quelques mètres au-dessus de l'océan) — valeur précise : Non trouvé — à compléter

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (un n° 06 92 48 19 25 figurait sur une fiche Journées du Patrimoine **marquée obsolète** ; non fiable pour un site libre d'accès — ne pas reporter tel quel)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site dédié ; références : POP Culture / Wikipédia / Randopitons)
- Réseaux sociaux : Non trouvé — à compléter
- Gestion : propriété de la commune de Saint-Philippe (contact patrimoine via la mairie — à confirmer)

## Horaires (object_opening)
Site patrimonial de plein air, vestiges visibles depuis la RN2 et accessibles à pied. Horaires d'accès non réglementés trouvés — Non trouvé — à compléter (des ouvertures encadrées ont eu lieu lors des Journées européennes du patrimoine, mais sans calendrier permanent confirmé).

## Tarifs (object_price)
Site naturel/patrimonial de plein air **a priori en accès libre et gratuit** (aucun droit d'entrée mentionné par les sources). Tarif officiel/validité : Non trouvé — à compléter (à confirmer avec la mairie, propriétaire).

## Données spécifiques PCU
PCU = pas de table facette type-spécifique (classifications/labels génériques `object_classification`).
- Protection : Monument historique **inscrit** (Inscrit MH), réf. **PA97400067**
- Périmètre protégé : « L'usine du Baril, en totalité, comprenant la cheminée et les vestiges de l'usine, tant en élévation qu'archéologiques »
- Dates de protection : arrêté du **11 juillet 2002** (cheminée + sol) puis arrêté du **22 mars 2022** (extension à la totalité)
- Cadastre : 2022 AY 83, 159
- Datation : 3e quart du XIXe siècle ; construction 1861–1863 ; cheminée 1919
- Propriété : commune de Saint-Philippe
- Diagnostic archéologique : Inrap, 2021, 7 542 m² (parcelles AY 083 et 159), responsable Nicolas Biwer — bon état de conservation des niveaux archéologiques

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (stationnement possible le long de la RN2 / aires proches — à vérifier)
- Sanitaires : Non trouvé — à compléter
- Accès : depuis la RN2, site visible et pénétrable à pied ; aucune restauration/billetterie sur place — Non trouvé pour le reste

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (site présumé gratuit) — Non trouvé si encadrement payant
- Langues : Non trouvé — à compléter
- Accessibilité PMR : Non trouvé — à compléter (terrain de ruines/vestiges archéologiques, accessibilité probablement limitée — à vérifier sur le terrain)

## Labels & classements (object_classification)
- **Monument historique inscrit** (Inscrit MH) — réf. PA97400067 — à mapper sur la classification patrimoniale `object_classification` (scheme « monument historique / inscrit »).
- Aucun label touristique commercial (LBL_*) revendiqué — Aucun trouvé.

## Médias suggérés
- Photo de la cheminée et des ruines : notice POP Culture / Plateforme Ouverte du Patrimoine (PA97400067) — https://pop.culture.gouv.fr/notice/merimee/PA97400067 — **NE PAS télécharger sans autorisation**
- Illustration Wikipédia « Usine du Baril » (vérifier la licence Creative Commons avant tout usage) — https://fr.wikipedia.org/wiki/Usine_du_Baril — **NE PAS télécharger sans autorisation**
- Photos de la fiche Randopitons « Usine sucrière du Baril » — https://randopitons.re/tourisme/764-usine-sucriere-baril — **NE PAS télécharger sans autorisation**

## Données manquantes / à vérifier
- Altitude précise du site
- Contact officiel (mairie de Saint-Philippe / service patrimoine) — le n° de la fiche JEP est obsolète
- Site web / page officielle dédiée éventuelle
- Conditions réelles d'accès au pied des vestiges (libre permanent vs encadré, sécurité des ruines)
- Existence d'un parking dédié et d'une signalétique
- Accessibilité PMR
- Présence éventuelle d'un sentier/panneau d'interprétation
- Confirmer la relation à lier avec « Puits des Anglais » (site archéologique adjacent déjà proposé)

## Sources
- Usine du Baril — Notice Mérimée PA97400067, Plateforme Ouverte du Patrimoine (POP, Ministère de la Culture) — https://pop.culture.gouv.fr/notice/merimee/PA97400067 — consulté le 2026-06-26
- Usine du Baril — Wikipédia — https://fr.wikipedia.org/wiki/Usine_du_Baril — consulté le 2026-06-26
- Saint-Philippe – Usine du Baril, RN 2 (diagnostic archéologique Inrap 2021, N. Biwer) — ADLFI / OpenEdition Journals — https://journals.openedition.org/adlfi/157232 — consulté le 2026-06-26
- Usine sucrière du Baril — Tourisme à La Réunion, Randopitons (accès, GPS, durée de visite) — https://randopitons.re/tourisme/764-usine-sucriere-baril — consulté le 2026-06-26
- Ancienne usine du Baril — Journées du Patrimoine (fiche marquée obsolète) — https://www.journees-du-patrimoine.com/SITE/ancienne-usine-baril--saint-philip-251331.htm — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr), « Le Baril Saint-Philippe », citycode 97417 — https://api-adresse.data.gouv.fr/search/?q=Le+Baril+Saint-Philippe&citycode=97417 — consulté le 2026-06-26
