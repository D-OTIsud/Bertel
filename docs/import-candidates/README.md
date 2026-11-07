# Fiches candidates à l'import — couverture des types d'objets non représentés

> Produites le 2026-06-11 par recherche web + vérification adversariale (existence, commune, recoupement 2 sources, plausibilité GPS, contrôle doublon SQL sur la base live). **Statut : À RÉVISER par un humain avant tout import.**

## But

Au 2026-06-11, 8 des 17 types d'objets de la base live étaient à **0 objet** : PCU, PNA, ITI, VIL, HPA, ASC, FMA, RVA. (Un 18ᵉ type, **SPU « Service public »**, a été créé le même jour — décision §53 — et est couvert par la passe 3.) Ces fiches documentent 3 objets touristiques **réels** par type (quand ils existent), situés strictement dans le périmètre OTI du Sud / CASUD — Le Tampon (INSEE 97422), Saint-Joseph (97412), Saint-Philippe (97417), Entre-Deux (97403) — afin qu'après import, un utilisateur externe puisse comprendre tout le périmètre du modèle.

Règle appliquée : **aucune donnée inventée**. Tout téléphone/GPS/horaire/tarif non confirmé par une source consultée est marqué « Non trouvé — à compléter ». Chaque fiche liste ses sources datées et ses lacunes.

## Couverture (31 fiches — 23 de la passe de couverture + 5 ajouts demandés par l'OTI, marqués ² + 3 SPU, marqués ³)

| Type | Fiche | Objet | Commune | Confiance | Alerte |
|---|---|---|---|---|---|
| PCU | [PCU-01](PCU-01-puits-des-anglais.md) | Puits des Anglais (MH 2025) | Saint-Philippe | haute | |
| PCU | [PCU-02](PCU-02-maison-valy.md) | Maison Valy (MH 1996, Loto du patrimoine) | Entre-Deux | moyenne | usage post-travaux 2026 à confirmer |
| PCU | [PCU-03](PCU-03-usine-langevin.md) | Usine Langevin (patrimoine sucrier, MH) | Saint-Joseph | haute | |
| PNA | [PNA-01](PNA-01-cascade-de-grand-galet.md) | Cascade de Grand Galet (Langevin) | Saint-Joseph | haute | statut baignade à confirmer |
| PNA | [PNA-02](PNA-02-cap-mechant.md) | Cap Méchant | Saint-Philippe | haute | |
| PNA | [PNA-03](PNA-03-grand-bassin-cascade-voile-de-la-mariee.md) | Grand Bassin & cascade du Voile de la Mariée | Le Tampon | moyenne | |
| PNA | [PNA-04](PNA-04-marine-de-vincendo.md) | La Marine de Vincendo ² | Saint-Joseph | haute | baignade interdite (noyades signalées) — référence d'arrêté à retrouver |
| PNA | [PNA-05](PNA-05-cap-jaune-vincendo.md) | Cap Jaune (Vincendo) ² | Saint-Joseph | haute | portée de l'arrêté municipal du 18/02/2021 à trancher avec la mairie AVANT publication |
| PNA | [PNA-06](PNA-06-le-vieux-tamarin-plaine-des-cafres.md) | Le Vieux Tamarin (Plaine des Cafres) ² | Le Tampon | moyenne | ⚠ DÉRACINÉ par le cyclone Garance le 28/02/2025 — décision d'import à reconsidérer (lieu de mémoire vs objet actif) |
| PNA | [PNA-07](PNA-07-point-de-vue-du-nez-de-boeuf.md) | Point de vue du Nez de Bœuf ² | Saint-Joseph | moyenne | à cheval sur la limite communale (belvédères → Saint-Joseph, aire d'accueil → Le Tampon, géocodage IGN Admin Express) — validation OTI demandée |
| ITI | [ITI-01](ITI-01-sentier-de-grand-bassin-bois-court.md) | Sentier de Grand Bassin (Bois Court → Voile de la Mariée) | Le Tampon | haute | variante de référence à arbitrer (8,45 vs 13,2 km) |
| ITI | [ITI-02](ITI-02-sentier-botanique-de-mare-longue.md) | Sentier botanique de Mare Longue | Saint-Philippe | haute | déclinaison de référence à arbitrer (850 m / 2,1 km / 4,3 km) |
| ITI | [ITI-03](ITI-03-le-dimitile-par-le-sentier-de-la-chapelle.md) | Le Dimitile par le sentier de la Chapelle | Entre-Deux | haute | |
| ITI | [ITI-04](ITI-04-boucle-des-trous-blancs.md) | La boucle des Trous Blancs ² | Le Tampon | haute | variante de référence à arbitrer (3,23 km Visorando / 5 km OTI / 7 km Randopitons) |
| VIL | [VIL-01](VIL-01-entre-deux-village-creole.md) | L'Entre-Deux, village créole | Entre-Deux | haute | |
| VIL | [VIL-02](VIL-02-grand-coude-plateau-du-the.md) | Grand Coude, plateau du thé | Saint-Joseph | moyenne | |
| VIL | [VIL-03](VIL-03-plaine-des-cafres-bourg-murat.md) | La Plaine des Cafres – Bourg-Murat, porte du volcan | Le Tampon | haute | |
| HPA | [HPA-01](HPA-01-bubble-dome-village-saint-joseph.md) | Bubble Dôme Village Saint-Joseph | Saint-Joseph | haute | ne pas confondre avec le site jumeau de Petite-Île (hors périmètre) |
| HPA | [HPA-02](HPA-02-camping-les-fougeres-entre-deux.md) | Camping les Fougères | Entre-Deux | moyenne | ⚠ « RÉSERVATIONS SUSPENDUES » sur le site officiel au 2026-06-11 — statut d'activité à confirmer AVANT import |
| ASC | [ASC-01](ASC-01-les-ecuries-du-volcan.md) | Les Écuries du Volcan (centre équestre) | Le Tampon | haute | homologue ACT publié en base (prestation) — lier, ne pas dupliquer |
| ASC | [ASC-02](ASC-02-canyon-aventure.md) | Canyon Aventure (structure canyoning) | Saint-Joseph | haute | 2 homologues ACT publiés en base — dédupliquer/rattacher |
| ASC | [ASC-03](ASC-03-ferme-equestre-du-sud-sauvage.md) | Ferme Équestre du Sud Sauvage | Saint-Philippe | moyenne | homologue ACT publié (ACTRUN00000000S3) ; site officiel hors ligne |
| FMA | [FMA-01](FMA-01-miel-vert-plaine-des-cafres.md) | Miel Vert (janvier, Plaine des Cafres) | Le Tampon | haute | |
| FMA | [FMA-02](FMA-02-fete-du-vacoa-saint-philippe.md) | Fête du Vacoa (août) | Saint-Philippe | haute | dates édition 2026 non annoncées |
| FMA | [FMA-03](FMA-03-fete-du-choca-entre-deux.md) | Fête du Choca (juillet) | Entre-Deux | haute | dates édition 2026 non annoncées |
| RVA | [RVA-01](RVA-01-run-vacances-bleu-vert-plaine-des-cafres.md) | Run Vacances Bleu & Vert (village de vacances) | Le Tampon | haute | |
| RVA | [RVA-02](RVA-02-residence-touristique-des-thes-grand-coude.md) | Résidence Touristique des Thés | Saint-Joseph | moyenne | ⚠ DOUBLON CONFIRMÉ en base (HLO, published) — fiche d'**arbitrage de requalification** HLO→RVA, PAS une création ; défaut = maintien HLO tant que les services para-hôteliers ne sont pas documentés |
| RVA | [RVA-03](RVA-03-village-vacances-ilet-creole-entre-deux.md) | Village Vacances L'Îlet Créole | Entre-Deux | moyenne | ⚠ indices d'inactivité (fax, tarifs non millésimés, absent des plateformes) — vérifier mairie/OTI avant import |
| SPU | [SPU-01](SPU-01-borne-recharge-electrique.md) | Borne de recharge — Station TotalEnergies La Châtoire (Freshmile, 50 kW, 24/7) ³ | Le Tampon | haute | tarif €/kWh non publié ; ne pas confondre avec la borne Hyper U du même quartier |
| SPU | [SPU-02](SPU-02-toilettes-publiques.md) | Toilettes publiques de la rue Maury ³ | Saint-Joseph | moyenne | sources 2016/2024 — état actuel à confirmer sur le terrain avant publication |
| SPU | [SPU-03](SPU-03-point-eau-potable.md) | Point d'eau potable — Belvédère de Bois Court ³ | Le Tampon | moyenne | ⚠ robinets attestés en 2021, AVANT le réaménagement du site (plateforme 2025) — persistance + potabilité à vérifier terrain |

## Déficit HPA : 2 fiches au lieu de 3 (justifié)

Après recherche approfondie (OTI du Sud, IRT, Randopitons, Sous les Étoiles 974, Bienvenue à la ferme, Camping-Car Park, Petit Futé, annuaires) croisée avec la base live, il n'existe pas de 3ᵉ hébergement de plein air importable dans les 4 communes :

1. Les autres établissements plein air du périmètre sont **déjà en base** : Camping Pré-Vert Entre 2 Songes et Le Verger de la Chapelle (Entre-Deux, CAMP, published) ; La Ferme du Kilimandjaro et ses roulottes (Le Tampon, en double RES + HLO) ; Au pays du mouton blanc, La Roulotte Géante, La BBO – La Bulle by Baril O'thentik (Saint-Philippe) et Entre 2 Bulles (HLO, drafts).
2. Les hébergements insolites de plein air restants sont **hors périmètre** : Kaz Insolite (Saint-Louis), Bubble Dôme Village de Petite-Île, Glamping Réunion (Saint-Leu), campings à la ferme labellisés (Cilaos/Saint-Louis/Salazie).
3. **Aucune aire de camping-car gérée** n'existe à La Réunion (0 aire au réseau Camping-Car Park).
4. Les spots de plein air libres restants (Puits des Français, Cap Méchant, Pont de Trente) sont des aires de pique-nique/bivouac **gratuites et sans exploitant** — non importables comme HPA (elles relèveraient de LOI/PNA).

## Notes pour l'import

- Toutes les fiches proposent `status: draft` + `object_org_link [publisher] → OTI du Sud`.
- Facettes type-spécifiques (registre `ref_facet_applicability`) : ITI → `object_iti` (+ stages) ; FMA → `object_fma` + `object_fma_occurrence` ; ASC → `object_act` ; HPA/RVA → `object_room_type` ; PCU/PNA/VIL n'ont pas de table facette (classifications/labels génériques).
- Les adresses devront repasser par la standardisation BAN de l'éditeur (§02) ; plusieurs GPS sont issus de géocodage BAN ou de Randopitons et sont à confirmer.
- Les 3 fiches ASC documentent la **structure** (école/club) — distincte des prestations ACT existantes, à rattacher via les liens prévus (acteur/relations), pas à dupliquer.
- Labels revendiqués (Qualité Tourisme, etc.) : faire la correspondance avec les codes canoniques (`LBL_*`) avant tout enregistrement en `object_classification`.

## Méthode (traçabilité)

- **Passe 1 — couverture des 8 types vides** (2026-06-11, run `wf_3559d351-b77`) : 8 agents de recherche (un par type) → 23 vérifications adversariales indépendantes (web + SQL live) → 0 rejet, 16 fiches corrigées en place, 1 tour de remplacement (non nécessaire sauf HPA, déficit documenté ci-dessus) → contrôle final de complétude OK (14 sections du gabarit présentes dans chaque fiche, INSEE corrects, sources datées non vides).
- **Passe 2 — 5 objets demandés par l'OTI** (2026-06-11, run `wf_a05e837a-e78`) : Marine de Vincendo, Cap Jaune, boucle des Trous Blancs, Vieux Tamarin, point de vue du Nez de Bœuf — même protocole (1 chercheur + 1 vérificateur adversarial par objet) → 3 confirmées, 2 corrigées, 0 rejet. Arbitrage communal du Nez de Bœuf tranché par point-dans-polygone geo.api.gouv.fr (contours Admin Express IGN/INSEE) ; déracinement du Vieux Tamarin (cyclone Garance, 28/02/2025) découvert et documenté en alerte majeure.
- **Passe 3 — couverture du nouveau type SPU « Service public »** (2026-06-11, run `wf_eccb94c3-40b`, après la création du type — décision §53, migration 8u) : une fiche par sous-catégorie `taxonomy_spu` (electric_charging / public_toilets / drinking_water) — même protocole → 2 confirmées, 1 corrigée, 0 rejet. La borne s'appuie sur le jeu IRVE consolidé Etalab (enregistrement FRFR1EAFTQ1) recoupé avec Chargemap et TotalEnergies Réunion.
