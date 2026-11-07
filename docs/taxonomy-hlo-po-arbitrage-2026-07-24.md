# Support d’arbitrage PO — Taxonomie HLO nature/forme (§190)

**Date du gel de lecture** : 2026-07-24  
**Base consultée** : cloud, lecture seule  
**Périmètre** : 40 décisions nominatives, 3 décisions de structure et PO-5 à PO-8  
**Décision** : VALIDÉE sans exception — voir `docs/taxonomy-hlo-po-decision-2026-07-24.md`. Toutes les cellules « À DÉCIDER » ci-dessous sont résolues par validation de leur recommandation.
**Règle de séance** : la nature métier prime sur la forme du logement.

## Mode d’emploi

Pour chaque ligne, remplacer `À DÉCIDER` par le code cible retenu ou par `VALIDÉ : <code>`. Les recommandations sont conçues pour permettre une validation en bloc ; seules les exceptions connues doivent être détaillées. Après la séance, ce document complété devient l’entrée humaine du manifeste de migration.

Codes cibles utiles :

- `cdh_maison`, `cdh_bungalow`, `chambre_d_hotes`, `bulle`, `lodges`, `hebergement_insolite` ;
- `location_saisonniere`, `maison`, `appartement`, `bungalow`, `chalet`, `gite_rural` ;
- `gite_de_randonnee`, `gite_de_groupe`.

## Série 1 — Nature métier (14 fiches)

### Chambres d’hôtes importées comme meublés (6)

Recommandation en bloc : valider les cinq premières en `cdh_maison` et Trésor d’Ange en `cdh_bungalow`, sous réserve que l’activité réelle soit bien une chambre d’hôtes chez l’habitant avec accueil/petit-déjeuner.

| ID | Fiche | Berta | Actuel | Recommandation | Décision PO |
|---|---|---|---|---|---|
| HLORUN0000000183 | La Belle du Sud | Chambre d’hôtes / Maison | `maison` | `cdh_maison` | À DÉCIDER |
| HLORUN000000018R | La Maison Verte | Chambre d’hôtes / Maison | `maison` | `cdh_maison` | À DÉCIDER |
| HLORUN00000000WT | Le Bougainvillier | Chambre d’hôtes / Maison | `maison` | `cdh_maison` | À DÉCIDER |
| HLORUN000000018H | Le Clos Gentil | Chambre d’hôtes / Maison | `maison` | `cdh_maison` | À DÉCIDER |
| HLORUN00000000RF | Villa Ti MoOn | Chambre d’hôtes / Gîte & Villa | `gite_villa` | `cdh_maison` | À DÉCIDER |
| HLORUN000000014W | Trésor d’Ange | Chambre d’hôtes / Bungalow & Chalet | `bungalow_chalet` | `cdh_bungalow` | À DÉCIDER |

### Hébergements collectifs importés comme meublés (4)

Recommandation en bloc : `gite_de_randonnee` (« Refuge et gîte d’étape »). Si une fiche est en réalité un gîte privatisé autonome et non un accueil d’étape/collectif, l’indiquer comme exception.

| ID | Fiche | Berta | Actuel | Recommandation | Décision PO |
|---|---|---|---|---|---|
| HLORUN00000000RM | Le Chalet Co Gite | Gîte d’étape et de randonnée / Bungalow & Chalet | `bungalow_chalet` | `gite_de_randonnee` | À DÉCIDER |
| HLORUN000000014I | Tit Caze Gilbert François | Gîte d’étape et de randonnée / Bungalow & Chalet | `bungalow_chalet` | `gite_de_randonnee` | À DÉCIDER |
| HLORUN00000000Q7 | Escale du point de vue | Gîte d’étape et de randonnée / Gîte rural | `gite_rural` | `gite_de_randonnee` | À DÉCIDER |
| HLORUN00000000QP | Gîte Là-Haut | Gîte d’étape et de randonnée / Gîte & Villa | `gite_villa` | `gite_de_randonnee` | À DÉCIDER |

### Nature contradictoire (1)

La copie canonique cloud la décrit comme « charmantes chambres d’hôtes » avec deux chambres, salle de bains/toilettes indépendantes et cuisine extérieure. Recommandation : conserver `chambre_d_hotes`, sous réserve de validation PO/OTI (la présence du petit-déjeuner n’est pas documentée).

| ID | Fiche | Berta | Actuel | Recommandation | Décision PO |
|---|---|---|---|---|---|
| HLORUN000000016B | Entr’Deux Gones | Location saisonnière / Chambre d’hôte | `chambre_d_hotes` | conserver `chambre_d_hotes` | À DÉCIDER |

### Insolites présumés chambres d’hôtes (3)

Recommandation en bloc : conserver les codes actuels sous `chambre_d_hotes`. Ne déplacer vers `location_saisonniere` que si le logement est autonome et n’est pas exploité comme chambre d’hôtes.

| ID | Fiche | Actuel | Recommandation | Décision PO |
|---|---|---|---|---|
| HLORUN000000017V | Entre 2 Bulles | `hebergement_insolite` | conserver | À DÉCIDER |
| HLORUN000000013Y | Héritage Écolodge & Spa | `lodges` | conserver | À DÉCIDER |
| HLORUN000000015Q | La BBO La Bulle by Baril O’thentik | `bulle` | conserver | À DÉCIDER |

## Série 2 — Structure et produits (PO-4 à PO-8)

| Décision | Recommandation | Alternative / conséquence | Décision PO |
|---|---|---|---|
| PO-4a `gite_rural` (5 porteurs avant corrections) | Conserver comme feuille-appellation | Fondre dans `maison`, perte d’une appellation familière | À DÉCIDER |
| PO-4b `cottage` (1 porteur) | Fondre dans `maison`, puis désactiver le code | Conserver une micro-feuille isolée | À DÉCIDER |
| PO-4c `rez_de_chaussee_d_une_maison` (2 porteurs) | Fondre dans `appartement`, puis désactiver le code | Conserver une forme trop précise comme feuille | À DÉCIDER |
| PO-5 libellé Listes | Garder « Location » / « Rental » | Aligner sur le libellé HLO long, moins adapté à cette surface | À DÉCIDER |
| PO-6 DATAtourisme | Valider les mappings ci-dessous | Modifier une ou plusieurs classes avant le lot crosswalk | À DÉCIDER |
| PO-7 partenaires | Pré-annonce + bump `updated_at` + confirmation et re-pull `/catalog` | Pas de pré-annonce, risque de surprise partenaire | À DÉCIDER |
| PO-8 intégrité crosswalk | FK composite `(taxonomy_domain, taxonomy_code)` + contrôle paire NULL | FK UUID moins portable ou texte sans FK moins sûr | À DÉCIDER |

Mappings PO-6 proposés :

| Taxonomie Bertel | Classe DATAtourisme |
|---|---|
| `chambre_d_hotes` et descendants | `Guesthouse` |
| `location_saisonniere` et descendants | `SelfCateringAccommodation` |
| `hebergement_collectif` | `GroupLodging` |
| `gite_de_randonnee` | `StopOverOrGroupLodge` |
| aucune correspondance plus précise | `Accommodation` |

## Série 3 — `gite_villa` sans signal (16 fiches)

Recommandation en bloc : `location_saisonniere` (« Meublé de tourisme / gîte »), sans inventer une forme. Remplacer uniquement les fiches dont la forme est connue avec certitude.

| ID | Fiche | Recommandation | Décision PO |
|---|---|---|---|
| HLORUN0000000142 | 3 Boyer Teddy | `location_saisonniere` | À DÉCIDER |
| HLORUN0000000122 | Anadele | `location_saisonniere` | À DÉCIDER |
| HLORUN0000000140 | Bleu Azur | `location_saisonniere` | À DÉCIDER |
| HLORUN0000000121 | La Créole Améthyste | `location_saisonniere` | À DÉCIDER |
| HLORUN000000014N | Le Ti’son Dort | `location_saisonniere` | À DÉCIDER |
| HLORUN000000014F | Palmier Bleu | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000VK | Au Grand R’ | `location_saisonniere` | À DÉCIDER |
| HLORUN000000018Q | Au pays du mouton blanc | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000OV | Chez Gérard | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000UK | Entre Mer et Montagne - Meublé Volcan | `location_saisonniere` | À DÉCIDER |
| HLORUN000000015R | L’Empreinte | `location_saisonniere` | À DÉCIDER |
| HLORUN00000001B8 | L’Or du Temps | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000YF | La Ferme des Pitayas | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000R0 | Le Flamboyant | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000S7 | LES HIBISCUS | `location_saisonniere` | À DÉCIDER |
| HLORUN000000013F | Meublé Arc-en-Ciel | `location_saisonniere` | À DÉCIDER |

## Série 4 — `bungalow_chalet` sans signal (10 fiches)

Recommandation en bloc : `location_saisonniere`, puis préciser `bungalow`, `chalet` ou `mobil-home` uniquement quand l’OTI connaît la forme réelle. Cette liste est issue du gel cloud et inclut nom, description et chapo canoniques dans la détection.

| ID | Fiche | Recommandation | Décision PO |
|---|---|---|---|
| HLORUN00000000P2 | L’Instant d’Évasion 1 | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000RK | L’Antre du Fouquet | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000V4 | Vel’Hauts Run | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000VT | Le Niaouli | `location_saisonniere` | À DÉCIDER |
| HLORUN00000000ZI | Lilie Location saisonnière Langevin | `location_saisonniere` | À DÉCIDER |
| HLORUN000000011S | Lodge Bel Air | `location_saisonniere` | À DÉCIDER |
| HLORUN000000011Y | Le Bismarckia | `location_saisonniere` | À DÉCIDER |
| HLORUN000000013D | L’Écrin Péi | `location_saisonniere` | À DÉCIDER |
| HLORUN0000000172 | Chez Rodolphe | `location_saisonniere` | À DÉCIDER |
| HLORUN000000017Y | Le Nid House | `location_saisonniere` | À DÉCIDER |

## Contrôle rapide du pool transféré depuis `gite_villa` (3 fiches)

Ces lignes sont automatiques et ne comptent pas dans les 40 arbitrages. Le PO peut toutefois les corriger avant le gel du manifeste.

| ID | Fiche | Signal | Cible proposée | Validation PO |
|---|---|---|---|---|
| HLORUN000000012T | Gîte du Malmany | description : bungalow | `bungalow` | À CONFIRMER |
| HLORUN00000000T3 | Cap Vanisa | description : bungalow | `bungalow` | À CONFIRMER |
| HLORUN0000000125 | Manapany Lodge | description : bungalow ; nom : Lodge | `bungalow` | À CONFIRMER D’UN COUP D’ŒIL |

## Formule de validation en bloc

Le PO peut répondre avec la formule suivante, en complétant seulement le cas Entr’Deux Gones et les exceptions éventuelles :

> Je valide toutes les recommandations du support §190. Entr’Deux Gones = `<code cible>`. Exceptions : `<aucune ou liste ID → code>`. Je confirme aussi les trois fiches du pool en `bungalow`.

Sans cette validation explicite, aucune migration taxonomique n’est appliquée à la base cloud.
