# Revalidation du gel + manifeste de reprise — taxonomie hébergements v2

Date de relecture : 2026-07-29 (lot 0, étapes 0.3 / 0.4 / 0.7 / 0.9 / 0.10 / 0.11)
Base : Supabase cloud Bertelv3 — lecture seule, aucune écriture
Référence amont : `docs/research/taxonomy-hebergements-existing-objects-audit-2026-07-29.md`
Plan exécuté : `docs/plans/2026-07-29-taxonomie-hebergements-collectifs-campings-aires-plan.md`

## 1. Verdict

Le gel du 29 juillet est **inchangé**. Aucun écart n'a été détecté entre l'audit et l'état live
relu juste avant la migration. Le lot 1 peut démarrer.

## 2. Invariants (étape 0.4 / 0.7)

| Contrôle | Attendu | Live |
|---|---:|---:|
| Doublons `object_taxonomy` (object_id, domain) | 0 | 0 |
| Nœuds hébergement actifs, non-racines, sans `metadata.axis` | 0 | 0 |
| Hébergements sans taxonomie compatible avec leur `object_type` | 0 | 0 |
| Affectations dont le domaine est incompatible avec `object_type` | 0 | 0 |
| Porteurs d'un nœud `is_active=false` ou `is_assignable=false` | 0 | 0 |

Comptes publiés : HOT 8 · HLO 476 · RVA 0 · CAMP 1 · HPA 2.

## 3. Inventaire des nœuds concernés (étape 0.3)

`accommodation_family` — 4 codes, tous actifs : `hotellerie`, `locatif`, `collectif`, `plein_air`.
Les deux codes cibles `campings_terrains` et `aires_haltes_plein_air` sont **absents**, comme attendu.

| domaine | code | axe | famille | porteurs | attendu |
|---|---|---|---|---:|---|
| taxonomy_camp | camping | nature | plein_air | 1 | 1 ✓ |
| taxonomy_hpa | natural_camp_area | nature | plein_air | 0 | 0 ✓ |
| taxonomy_hpa | farm_camping | nature | plein_air | 0 | 0 ✓ |
| taxonomy_hpa | outdoor_glamping | nature | plein_air | **0** | **0 ✓ — condition d'exécution de l'étape 1.6** |
| taxonomy_hpa | motorhome_area | nature | plein_air | 0 | 0 ✓ |
| taxonomy_hpa | homestay_camping | nature | plein_air | 2 | 2 ✓ |
| taxonomy_hlo | auberge_collective | sous_type | collectif | 0 | 0 ✓ |
| taxonomy_hlo | gite_de_groupe | sous_type | collectif | 3 | 3 ✓ |
| taxonomy_hlo | gite_de_randonnee | sous_type | collectif | 17 | 17 ✓ |
| taxonomy_hlo | bulle | type_unite | locatif | 1 | 1 ✓ |
| taxonomy_hlo | lodges | type_unite | locatif | 1 | 1 ✓ |
| taxonomy_hlo | hebergement_insolite | type_unite | locatif | 1 | 1 ✓ |
| taxonomy_rva | tourism_residence / holiday_village / aparthotel | nature | collectif | 0 | 0 ✓ |

Parents live dans `taxonomy_hpa` : les 5 natures sont **toutes filles de `root`**. Le re-parentage de
`farm_camping` et `homestay_camping` sous `declared_campground` est donc bien une création de niveau,
pas un déplacement latéral.

Codes cibles absents, à créer par le lot 1 : `declared_campground`, `residential_leisure_park`,
`bivouac_area`, `motorhome_night_stop`.

## 4. Manifeste de reprise figé (étapes 0.9 à 0.11)

### 4.1 — Écritures `object_taxonomy` (2 lignes, vérification de l'ancienne valeur obligatoire)

| object_id | Fiche | Type | Avant | Après | Origine de la décision |
|---|---|---|---|---|---|
| HLORUN000000017A | Gîte Hydrangea 974 | HLO (inchangé) | taxonomy_hlo.chambre_d_hotes | taxonomy_hlo.gite_de_randonnee | Audit 29/07 §3 — source IRT : gîte d'étape et de randonnée, accueil GRR2 |
| CAMRUN000000013J | Le Verger de la Chapelle | HPA (inchangé) | taxonomy_hpa.homestay_camping | taxonomy_hpa.farm_camping | **Décision PO 2026-07-29 (D2)** — statut d'exploitation agricole retenu contre le libellé IRT |

Les deux écritures sont gardées : si la valeur source diffère de celle figée ci-dessus, la
transaction lève une exception et la migration entière est annulée.

### 4.2 — Backfill « Type d'unité » (7 lignes, lot 5)

| object_id | Fiche | Nature conservée | Type d'unité | Ancienne feuille à retirer |
|---|---|---|---|---|
| HLORUN000000015Q | La BBO La Bulle by Baril O'thentik | Chambre d'hôtes | Bulle | taxonomy_hlo.bulle → chambre_d_hotes |
| HLORUN000000013Y | Héritage Écolodge & Spa | Chambre d'hôtes | Lodge | taxonomy_hlo.lodges → chambre_d_hotes |
| HLORUN000000017V | Entre 2 Bulles | Chambre d'hôtes | Bulle | taxonomy_hlo.hebergement_insolite → chambre_d_hotes |
| HLORUN00000000UW | Anae Lodge | Chambre d'hôtes | Lodge | — (déjà chambre_d_hotes) |
| HLORUN000000018Q | Au pays du mouton blanc | Meublé de tourisme | Cabane | — (déjà location_saisonniere) |
| CAMRUN000000013G | Camping Pré-Vert Entre 2 Songes | Camping | Cabane | — |
| CAMRUN00000000PH | L'Eden du Randonneur (camping) | Camping chez l'habitant | Cabane | — |

Les natures live des 7 fiches ont été relues une à une le 29/07 et correspondent exactement à la
colonne « Nature conservée ». Le retrait des trois feuilles Type d'unité n'a lieu qu'**après**
insertion réussie du lien `object_accommodation_unit_type` (lot 5A, étape 8).

### 4.3 — Décisions métier ouvertes : tranchées le 2026-07-29 par le PO

| Cas | Décision | Conséquence technique |
|---|---|---|
| **D1 — La Roulotte Géante** | Le bivouac reste une **prestation secondaire** décrite dans la fiche HLO existante. | **Aucune écriture.** Pas de fiche HPA créée, pas de retypage. La fiche n'entre dans aucun manifeste. |
| **D2 — Le Verger de la Chapelle** | Bascule en **Camping à la ferme** (statut d'exploitation agricole retenu). | Une ligne `object_taxonomy` (cf. §4.1) + le rafraîchissement borné de son cache. |

### 4.4 — Manifeste borné de rafraîchissement (§14 du plan)

Douze identifiants uniques pour un déploiement combinant les lots 1 et 5. `CAMRUN000000013J`
figurait déjà dans la liste du plan au titre de « porteur homestay_camping » ; la décision D2 en fait
en plus un porteur réaffecté, sans changer le cardinal.

| object_id | Raison | Lot 1 | Lot 5 |
|---|---|:-:|:-:|
| HLORUN00000000ZV | porteur gite_de_groupe — libellé/axe modifié | ✓ | |
| HLORUN000000011E | porteur gite_de_groupe — libellé/axe modifié | ✓ | |
| HLORUN000000012H | porteur gite_de_groupe — libellé/axe modifié | ✓ | |
| HLORUN000000017A | correction de nature Gîte Hydrangea | ✓ | |
| CAMRUN000000013J | porteur homestay_camping + reprise D2 vers farm_camping | ✓ | |
| CAMRUN00000000PH | porteur homestay_camping (re-parenté) + reprise Type d'unité | ✓ | ✓ |
| CAMRUN000000013G | porteur CAMP (libellé/axe) + reprise Type d'unité | ✓ | ✓ |
| HLORUN000000015Q | reprise Type d'unité | | ✓ |
| HLORUN000000013Y | reprise Type d'unité | | ✓ |
| HLORUN000000017V | reprise Type d'unité | | ✓ |
| HLORUN00000000UW | reprise Type d'unité | | ✓ |
| HLORUN000000018Q | reprise Type d'unité | | ✓ |

Lot 1 seul : 7 identifiants. Lot 5 seul : 7 identifiants. Union : 12.

Aucun `object.object_type` n'est modifié par ce chantier. Aucun `DELETE FROM object`.

## 5. Recherche de candidats hors domaines attendus (étape 0.8)

Rejouée par l'audit du 29/07 (§2) sur le nom, le chapo et la description canonique de **tous** les
types d'objet : 31 occurrences, dont 22 faux positifs confirmés (bivouac d'activité, « refuge » au
sens figuré, « lodge » comme nom commercial). Aucune nouvelle fiche n'a été créée depuis le gel dans
les types HOT/HLO/RVA/CAMP/HPA — les comptes publiés sont identiques. Aucun candidat supplémentaire.

Rappel de méthode conservé : un mot-clé n'est jamais une décision. Aucune conversion de masse.
