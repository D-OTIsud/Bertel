# Audit taxonomique complet — tous domaines (2026-07-17)

Suite de l'audit ACT (§186, `docs/act-taxonomy-recategorization-2026-07-17.md`). Périmètre :
**les ~790 assignations `object_taxonomy` restantes** (12 domaines porteurs de données) + les
**16 fiches publiées sans aucune sous-catégorie**. Méthode identique : nom + description (et
canaux web/contacts pour les cas ambigus) confrontés au code assigné, fiche par fiche —
scan groupé nom↔code pour HLO (472). Les 6 domaines sans objet (VIL, ITI, FMA, HPA, RVA, ASC)
sont vides : rien à auditer.

## Synthèse

| Domaine | Volume | Verdict | Mismatches sûrs | Frontière de type | Arbitrages |
|---|---|---|---|---|---|
| ACT | 52 | ✅ corrigé §186 | — | — | — |
| HLO | 472 (+6 sans taxo) | ✅ **sain** (~0 % d'erreur) | 0 (+4 sans-taxo évidents) | 0 | 4 |
| RES | 133 (+2 sans taxo) | 🟡 propre, retouches | 6 (+2 sans-taxo) | 0 | 4 |
| LOI | 97 (+5 sans taxo) | 🔴 **le domaine atteint** | 3 (+3 sans-taxo) | **~19 fiches mal typées** | 5 |
| PRD | 34 (+2 sans taxo) | 🟢 2 retouches | 2 (+2 sans-taxo) | 0 | 0 |
| PSV | 18 | 🟢 1 retouche | 1 | 0 | 2 |
| COM 6 · HOT 8 · CAMP 3 · PCU 2 · SPU 1 | 20 | ✅ sains | 0 | 0 | 0 |

**Conclusion clé** : contrairement à l'ACT (~48 % d'erreur), l'heuristique d'import
`old_data_enrichment_20260512` a bien fonctionné là où Berta avait des catégories natives
(HLO/RES/HOT/CAMP). Le problème résiduel n'est pas le code assigné mais la **frontière de
type** : ~19 fiches typées LOI sont en réalité des prestations encadrées (→ ACT), des
producteurs (→ PRD, règle d'arbitrage §57), des loueurs/transporteurs (→ PSV) ou une
structure sportive (→ ASC).

**Fausse alerte notable** : les 3 gîtes « Crypto-Sign n° 56/561/562 » (HLO `gite_rural`) ne
sont PAS des artefacts d'import — c'est le nom commercial réel (chalets en rondins de
**cryptomérias**, labellisés Gîtes de France, Le Tampon).

---

## A. Corrections sûres intra-domaine (23 fiches)

### RES (8)

| Fiche | Code actuel | Correction | Justification |
|---|---|---|---|
| La Ferme du Kilimandjaro (`RESRUN00000000XP`) | chambre_d_hote | **table_d_hote** | La fiche RES du binôme HLO/RES ; le code « chambre d'hôte » appartient au volet hébergement |
| Le Caloupilé (`RESRUN00000000X9`) | chambre_d_hote | **table_d_hote** | Idem (binôme avec HLO Le Caloupilé) |
| L'Orchidéa (`RESRUN00000000OG`) | salle_de_reception | **restaurant** | « le restaurant L'Orchidéa propose une cuisine créole » |
| Fleur de Vanille (`RESRUN000000019W`) | auberge_de_campagne | **table_d_hote** | Chapo : « Table d'hôtes - Fleur de Vanille » |
| LABEL FOURCHETTE (`RESRUN00000000SY`) | restauration_traditionnelle | **restaurant** | Restaurant/coffee shop ; harmonise le code isolé (1 usage) |
| Kaban'a Jus (`RESRUN00000000WC`) | gato_pei | **bar_a_jus** | « jus de fruits frais et de légumes, smoothies » |
| Allon Manger (`RESRUN00000001B1`) | *(aucune)* | **restaurant** | Fiche récente sans sous-catégorie |
| Chez Mamie Poulette (`RESRUN00000001B6`) | *(aucune)* | **restaurant** | Idem |

### LOI (6)

| Fiche | Code actuel | Correction | Justification |
|---|---|---|---|
| Mon Voyage Fleuri (`LOIRUN000000013W`) | artisanat_bijoux | **wellness** | Soins énergétiques Lahochi, ateliers de reconnexion — rien à voir avec des bijoux |
| GAMIKIT (`LOIRUN000000019H`) | atelier | **divertissement** | Escape games, jeux de piste, animations (Somnica-Event) |
| Association Tradition et Passions (`LOIRUN000000016S`) | restauration_traditionnelle | **patrimoine_culturel** | Association de transmission du savoir-faire réunionnais (culinaire, artisanal) |
| Bat'Karèv & Trois Petits Points (`LOIRUN00000001AY`) | *(aucune)* | **atelier** | Ateliers créatifs (jeu de peindre, cartes à gratter) |
| La Récup de TiCha (`LOIRUN00000001B4`) | *(aucune)* | **art_artisanat** | Artisanat récup (chambre à air → cabas, bertels, bijoux) |
| Les Passerelles du Bien-Être (`LOIRUN00000001AW`) | *(aucune)* | **wellness** | Association bien-être |

### PRD (4)

| Fiche | Code actuel | Correction | Justification |
|---|---|---|---|
| Apiculture Reunion (`LOIRUN00000001AJ`) | agrotourisme | **apiculture** | « Stage apicole » ; le nœud apiculture était à 0 usage |
| Le Rucher du Petit Piton (`LOIRUN000000016Z`) | exploitation_agricole | **apiculture** | « apiculture et maraîchage » — le rucher domine |
| APIC974 (`PRDRUN00000001AX`) | *(aucune)* | **apiculture** | « un apiculteur, une passion » |
| L'instant Philippine (`PRDRUN00000001B9`) | *(aucune)* | **produits_terroir** | « produits locaux » |

### PSV (1)

| Fiche | Code actuel | Correction | Justification |
|---|---|---|---|
| HGL Location (`PSVRUN000000014A`) | vtc | **location_vehicule** | « HGL Location de voiture » — location sans chauffeur, pas du VTC |

### HLO (4 — fiches récentes sans sous-catégorie, indice fort)

| Fiche | Correction | Justification |
|---|---|---|
| Fanjan (`HLORUN00000001BH`) | **bungalow_chalet** | « le chalet Fanjan » |
| L'Océan de Brilune (`HLORUN00000001B5`) | **gite_villa** | « La villa L'Océan de Brilune est une location saisonnière » |
| Villa Evilou (`HLORUN00000001B3`) | **gite_villa** | « maison de vacances tout confort » |
| Villa Les Margosiers (`HLORUN00000001BE`) | **gite_villa** | Nom « Villa » (description vide) |

---

## B. Frontières de type — fiches LOI mal typées (~19, méthode 13d : capture → delete liens → retype → re-insert)

### LOI → ACT (11 : prestations encadrées, règle §57 « prestation encadrée → ACT »)

| Fiche | Code LOI actuel | Taxonomie ACT cible |
|---|---|---|
| AGENCE AVENTURE LA REUNION (`LOIRUN00000001AQ`) | randonnee_pedestre | guided_hiking (accompagnateur ARGAT) |
| Découvertes en Terres Signées (`LOIRUN000000019U`) | randonnee_pedestre | guided_tour* |
| Rando Péizaj 974 (`LOIRUN0000000191`) | visite_guidee | guided_hiking (accompagnateur moyenne montagne) |
| Ricaric (`LOIRUN00000001AH`) | speleologie_tunnels_de_lave | caving |
| Ti Karé Dan Péi (`LOIRUN0000000198`) | guide_accompagnateur_touristique | guided_tour* |
| Alexandre DIJOUX - Guide Conférencier (`LOIRUN000000017M`) | visite_guidee | guided_tour* |
| Enis Rockel (`LOIRUN00000000YC`) | visite_guidee | guided_tour* |
| Insel Tours (`LOIRUN0000000177`) | visite_guidee | guided_tour* (accompagnateur germanophone) |
| Naturev (`LOIRUN00000000S6`) | visite_guidee | guided_tour* |
| Dalon La Kour (`LOIRUN000000017I`) | visite_guidee | guided_tour* |
| Au Coeur de La Réunion (`LOIRUN000000015J`) | visite_guidee | guided_tour* (circuits accompagnés, visitemonile.re) |

\* **`guided_tour` = nouveau nœud `taxonomy_act` à créer** (« Visite guidée / accompagnement
touristique ») — 7 porteurs immédiats ; le catalogue ACT n'a pas de foyer pour les guides
non-montagne.

### LOI → PRD (5 : production + accueil, règle §57)

| Fiche | Code LOI actuel | Taxonomie PRD cible |
|---|---|---|
| Papilles des Hauts (`LOIRUN00000000U5`) | terroir | produits_terroir (transformation de sa production) |
| Maison du Curcuma (`LOIRUN00000000VE`) | visite_guidee | produits_terroir (« Agriculteur actif, producteur sélectif ») |
| Escale Bleue - Atelier Vanille (`LOIRUN000000010R`) | visite_guidee | plantation (production/préparation de vanille depuis 1986) |
| Entre Fleurs et Plantes (`LOIRUN000000019G`) | horticulture | exploitation_agricole (horticultrice) |
| Ti Kaz Épices (`LOIRUN00000001AZ`) | *(aucune)* | exploitation_agricole (« exploitation familiale agricole ») |

### LOI → PSV (2 : location/transport)

| Fiche | Code LOI actuel | Taxonomie PSV cible |
|---|---|---|
| RODBIKELOC (`LOIRUN000000019P`) | v_t_t_autres_cycles | cycle_scooter_rental (location VTTAE) |
| Au temps pour vous (`LOIRUN00000001A0`) | *(aucune)* | vtc (« Transport de personnes / véhicules de tourisme ») |

### LOI → ASC (1 — à arbitrer)

| Fiche | Code LOI actuel | Cible |
|---|---|---|
| Bouillon d'Aventure (`LOIRUN00000000YR`) | terre | ASC `sports_club` (séjours multi-activités + natation enfants/adultes) — ou rester LOI `divertissement` |

---

## C. Arbitrages PO (douteux — ne pas corriger sans avis)

| Fiche | Situation | Options |
|---|---|---|
| NANA BARKET & FASTFOOD (RES, service_de_livraison) | Fastfood ; livraison peut être réelle | snack_bar ou garder |
| Ti Macaron PéÏ (RES, salon_de_the) | « Biscuiterie artisanale » | garder salon_de_the / PRD produits_terroir |
| Irise Traiteur (RES, restaurant) | Traiteur qui accueille aussi sur place | traiteur ou garder |
| Pizzeria La Gondole + L'Impériale Pirun (RES, restaurant) | Noms « pizzeria », descriptions « restaurant-pizzeria » | pizzeria (harmonisation) ou garder |
| Le Tinto (RES, restaurant) | « Crêperie... cuisine savoyarde » | creperie ou garder |
| Snack Le Boi Zoly (RES, restaurant) | Nom « Snack » | snack_bar ou garder |
| Dolly La Fêe (RES, atelier_cuisine) | « Cuisine végétale » — atelier ou chef ? | garder / chef_a_domicile |
| Les Crins de Bel Air (LOI, centre_d_equitation) | Ferme pédagogique + élevage | garder (pas de code « ferme pédagogique ») |
| Association Aster Lontan (LOI, art_artisanat) | Promotion du patrimoine culturel | patrimoine_culturel ou garder |
| Sucette péï (LOI, atelier) | Sucettes personnalisées + ateliers + impression | garder |
| Couleurs du Sud Sauvage - EXCURSIONS (PSV, private_driver) | « Excursions, découverte de l'île » | tourist_excursion_transport ou garder |
| Austral Taxis Réunion (PSV, tourist_excursion_transport) | Taxi qui fait aussi de l'excursion | garder |
| L'Or du Temps (`HLORUN00000001B8`) + La Kaz Bon Dimanche (`HLORUN00000001BF`) | Sans sous-catégorie, description sans indice de forme | à renseigner par l'éditeur de la fiche |
| Zévi sur Mer (HLO, `chambre`) | Code vague (1 usage) | chambre_d_hotes ? à vérifier |
| Bungalow Ti Kaz Misouk (HLO, studio) | Nom dit bungalow, code dit studio | vérifier la forme réelle |

**Doublons homonymes même type (arbitrage fusion/archivage)** :
- **Auberge de campagne Les 4 Saisons** ×2 HLO Le Tampon (`WW` 1 média / `19T` 0 média) — doublon quasi certain ;
- **La Caverne des Hirondelles** ×2 HLO Saint-Joseph (`PD`/`PX`) ;
- **La Rose du Sud** ×2 HLO Saint-Joseph (`RO` 7 médias / `RQ` 5) — possiblement deux unités légitimes.

---

## D. Hygiène de vocabulaire (catalogue, après corrections)

- **RES** : fusionner `table_d_hotes` (0 usage) → `table_d_hote` (doublon orthographique) ;
  désactiver `chambre_d_hote` (concept d'hébergement, 0 usage après corrections) ;
  `autre_type_de_restauration` (0) à garder comme fourre-tout ou désactiver.
- **LOI** : après les retypes B, désactiver les codes « prestation » qui doublonnent ACT et
  tomberont à 0 : `randonnee_pedestre`, `speleologie_tunnels_de_lave`,
  `guide_accompagnateur_touristique`, `v_t_t_autres_cycles`, `restauration_traditionnelle`,
  `terre`, `terroir`, `horticulture` ; fusionner les quasi-doublons `art` (0) / `artisanat` (1)
  → `art_artisanat` ; la branche bien-être (spa/massage/thermes/wellness, seedée §57) devient
  enfin portée (3 fiches).
- **taxonomy_org** : 7 codes hérités, 0 usage, et une ORG ne porte pas de taxonomie métier →
  désactiver le domaine entier (`is_active=false`) ou le supprimer.
- **HLO** : `gite_d_etape_et_de_randonnee` (0) doublonne `gite_de_randonnee` (13) → désactiver ;
  `location_saisonniere` (15) est un générique qui recouvre les types précis — règle d'usage à
  documenter (préférer le type de forme), pas une erreur de données ; `auberge` HLO (0) —
  désactiver (les auberges vivent en RES/HOT).
- **ACT** : créer `guided_tour` (« Visite guidée / accompagnement touristique ») — cf. B.

---

## Plan d'action proposé

1. **Lot A** — 23 corrections intra-domaine sûres : une migration données (même forme que §186).
2. **Lot B** — ~19 retypes LOI→ACT/PRD/PSV(/ASC) : migration méthode 13d (capture → delete
   liens → retype → re-insert) + création du nœud ACT `guided_tour` + refresh caches/MV.
   NB : les retypes créent ~19 nouveaux cas « préfixe d'id ≠ type » (classe cosmétique connue).
3. **Lot C** — arbitrages : liste à trancher par l'OTI (16 fiches + 3 paires de doublons).
4. **Lot D** — hygiène du catalogue : désactivations/fusions ci-dessus (seeds + live), après A+B.

Vérifications faites pendant l'audit : 0 incohérence domaine↔type (trigger), préfixes d'id
hérités = 56 fiches (classe cosmétique documentée §186), doublon Cité du Volcan disparu.
