# Berta 2.0  ↔  Base de données Bertel — réconciliation objet par objet

_Date: 2026-06-16 • Source de vérité: Google Sheet **Berta 2.0** (`1BpS1YA2…ABLk`), onglet établissements, export CSV complet (UTF-8)._

**Méthode** — Chaque ligne de l'onglet est appariée à un objet de la base via `object_origin.source_object_id` (le système d'import `berta_v2_csv_export` qui a servi à peupler la base). Vérifié aussi contre `object_external_id`. L'export « langage naturel » de Drive étant tronqué/échantillonné (~210 lignes), l'analyse repose sur l'export CSV complet (840 lignes).

## 1. Chiffres clés

| Mesure | Valeur |
|---|---:|
| Lignes objet dans Berta 2.0 (id unique) | **840** |
| Objets en base (total) | **848** |
| → avec un id source Berta | 837 |
| → sans id source Berta | 1 |
| **Appariés (présents des deux côtés)** | **826** |
| **Berta uniquement (ABSENTS de la base)** | **14** |
| id Berta en base **absent de la feuille actuelle** | 11 |
| **Doublons en base (même id Berta importé 2×)** | **10 groupes / 20 objets** |

Réconciliation : 840 Berta = 826 appariés + 14 Berta-seul ✓ — 848 base = 837 id-Berta-uniques + 1 sans-id (l'ORG « OTI du Sud ») + 10 doublons-en-trop ✓.

## 2. 🔴 Doublons en base — même établissement importé deux fois

Même `source_object_id` Berta → 2 objets distincts en base. Typiquement : objet pilote (id séquentiel bas, import avril) ré-importé lors de l'import complet (id à suffixe lettres). **À fusionner/archiver.**

| Nom (feuille) | id Berta | Objet A | Objet B | Note |
|---|---|---|---|---|
| Canyon Aventure | `recCSnhcZo4XxocjX` | `ACTRUN0000000001` (published) | `ACTRUN00000000SI` (published) | doublon même type ACT |
| Ascendance Parapente | `recdw4lpGQlrscCXF` | `ACTRUN0000000002` (published) | `ACTRUN00000000S1` (published) | doublon même type ACT |
| Maison du Curcuma | `recSSTvKv6Jh4BYzZ` | `ACTRUN0000000003` (published) | `LOIRUN00000000VE` (published) | ⚠ types différents ACT vs LOI |
| Domaine Paille en Queue - Sud Sauvage | `recr8fxU0od0bvvnh` | `HLORUN0000000007` (published) | `HLORUN00000000P7` (published) | doublon même type HLO |
| Côté Volcan | `recr1yhoYV0cSykCz` | `HLORUN0000000008` (published) | `HLORUN00000000OO` (published) | doublon même type HLO |
| Gîte Là-Haut | `d5c7c61d` | `HLORUN0000000009` (published) | `HLORUN00000000QP` (published) | doublon même type HLO |
| Dimitile Hôtel | `rec5vqdPwSdrFzsvs` | `HOTRUN0000000006` (published) | `HOTRUN00000000ZW` (published) | doublon même type HOT |
| La Cité du Volcan | `recmG8eVRN6kwvyRU` | `LOIRUN000000000A` (published) | `LOIRUN000000010V` (published) | ⚠ types différents LOI vs PCU (déjà tracké CLAUDE.md) |
| La Kaz | `recN5bNxgghhfpEHE` | `RESRUN0000000004` (published) | `RESRUN00000000NM` (published) | doublon même type RES |
| Le Gadjak | `rec7uNHsQPt5wZPCY` | `RESRUN0000000005` (published) | `RESRUN00000000NX` (published) | doublon même type RES |

## 3. 🟠 Présents dans Berta 2.0 mais ABSENTS de la base (14)

Vérifiés introuvables dans `object_origin` **et** `object_external_id` (tous systèmes). Tous `En ligne = non` (hors-ligne). Comme Berta 2.0 est la source de vérité, **ces objets devraient être importés.**

| id Berta | Nom commercial | Commune | Catégorie | En ligne |
|---|---|---|---|---|
| `1784423f` | Les Passerelles du Bien-Être | Entre-Deux | Découverte / Art | non |
| `29cb1201` | APIC974 | Entre-Deux | Découverte / Patrimoine agricole | non |
| `36a36be8` | Bat'Karèv & Trois Petits Points | Le Tampon | Découverte / Art | non |
| `56ce0471` | Ti Kaz Épices | Saint-Philippe | Découverte / Patrimoine agricole | non |
| `86c5b430` | Virginie MOUSSA - Thérapie Manuelle | Le Tampon | Loisirs - se divertir / Remise en forme | non |
| `912dfd87` | Allon Manger | Le Tampon | Restauration / Table d'hôtes | non |
| `9f5bffa1` | Kozman La Montagn | Entre-Deux | Découverte / Terroir | non |
| `a4c7e707` | Villa Evilou | Entre-Deux | Hébergement / Location saisonnière | non |
| `b95d9604` | La Récup de TiCha | Saint-Joseph | Découverte / Art | non |
| `bae26646` | L'Océan de Brilune | Saint-Joseph | Hébergement / Location saisonnière | non |
| `c7017fb2` | Chez Mamie Poulette | Entre-Deux | Restauration / Autre type de restauration | non |
| `d09f97f2` | Rando des Z'Iles | Entre-Deux | Découverte / Terroir | non |
| `e0787d46` | L'Or du Temps | Saint-Philippe | Hébergement / Location saisonnière | non |
| `e0836204` | L'instant Philippine | Saint-Philippe | Découverte / Terroir | non |

## 4. 🟡 Objets en base dont l'id Berta n'est plus dans la feuille (11)

Ces objets portent un id source Berta absent de l'export actuel (supprimés de la feuille, ou ré-encodés avec un nouvel id). Aucun n'a été retrouvé par nom dans la feuille. **À arbitrer** (suppression voulue ? renommage d'id ?) — ne pas supprimer sans revue.

| id Berta | Objet base | Nom | Statut |
|---|---|---|---|
| `55e1b535` | `HLORUN00000000OW` | Ô Bon Air | draft |
| `a6fd5816` | `HLORUN00000000T4` | Le Feuille Sonj' by LONBRAZ VOLKAN | draft |
| `b74cbb62` | `HLORUN000000018C` | Terra'péi by Lonbraz Volkan | draft |
| `b7f612c9` | `HLORUN00000000UI` | Le Farin la pluie by LONBRAZ VOLKAN | draft |
| `rec9U1L9JFSF6w2UT` | `HLORUN00000000QB` | Les Palmistes | published |
| `recA27RantHQ6xWRO` | `HLORUN00000000R1` | Villa Nick & Yv | draft |
| `recP4MXflYy2LDQOc` | `HLORUN00000000SJ` | Les Bananiers | draft |
| `recQRpmcaf9Rr00kU` | `HLORUN00000000Q9` | Gîte des Dodos | draft |
| `recQleTGwDegkThgA` | `RESRUN00000000O2` | La Récrée Idéale by Ludo | published |
| `recXJf4CflTBGXPEA` | `HLORUN00000000YT` | Le Village Sauvage | published |
| `recnCbirK0S2umj7c` | `HLORUN00000000QH` | Gîte le 109 | draft |

## 5. Écarts de champ sur les objets appariés (826)

### 5a. Statut en ligne ≠ statut base (1)

| id Berta | Objet base | Nom | Berta `En ligne` | Statut base |
|---|---|---|---|---|
| `recmiDV28icOd30Zx` | `RESRUN00000000P9` | Chez Manman | oui | archived |

→ « Chez Manman » : la feuille la veut **en ligne**, la base la dit **archived**. À réconcilier.

### 5b. Nom différent (7) — surtout typographie/normalisation

| id Berta | Objet base | Nom Berta (source) | Nom base |
|---|---|---|---|
| `11866825` | `HLORUN0000000127` | Les Milles et une nuit du gecko | Les Mille et Une Nuits du Gecko |
| `6183ed99` | `HLORUN0000000182` | Maison Lebon | Logement entier Saint-Joseph "classe 3 étoiles" |
| `6cdcafe1` | `HLORUN000000015G` | Les caze de la mer cassée avec piscine | Les Cazes de la Mer Cassée avec piscine |
| `recF43Hv19LghjB6K` | `HLORUN000000012O` | Les Coeurs d'Amants | Les Cœurs d'Amants |
| `recVdXu0rsUHbC1PP` | `HLORUN00000000YI` | Lodge Les Vanilliers | Les Vanilliers |
| `rechz2Q17RpAE32g0` | `HLORUN0000000105` | Résidence Touristiques des Thés | Résidence Touristique des Thés |
| `recuTyBQOgIlWc2zY` | `HLORUN000000010O` | Chambre et Table d'Hôte Les Hortensias | Chambre et Table d'Hôtes Les Hortensias |

→ 6 sur 7 sont cosmétiques (pluriel, ligature Œ/Oe, « Lodge », accents). **1 divergence de fond** : `6183ed99` la feuille dit « Maison Lebon », la base « Logement entier Saint-Joseph "classe 3 étoiles" ».

### 5c. Commune différente (7) — toutes « Le Tampon » vs « La Plaine des Cafres »

| id Berta | Objet base | Commune Berta | Ville base |
|---|---|---|---|
| `402cda71` | `ACTRUN000000019K` | Le Tampon | La Plaine des Cafres |
| `71f48e35` | `ACTRUN000000019N` | Le Tampon | La Plaine des Cafres |
| `8d37b1bb` | `ACTRUN000000019O` | Le Tampon | La Plaine des Cafres |
| `d9f1c8dd` | `HLORUN000000019T` | Le Tampon | La Plaine des Cafres |
| `recTTSlj16dRzY3u5` | `RESRUN00000001AE` | Le Tampon | La Plaine des Cafres |
| `recmBT3F3xQsKoKUc` | `ACTRUN00000001AK` | Le Tampon | La Plaine des Cafres |
| `recqqYy1KnXoVFHaO` | `LOIRUN00000001AP` | Le Tampon | La Plaine des Cafres |

→ La Plaine des Cafres est une localité **de la commune du Tampon** : la base a stocké la localité fine là où la feuille met la commune officielle. Incohérence de granularité, pas une erreur géographique.

## 6. Note méthodo / hors-périmètre

- 1 objet base sans id Berta : `ORGRUN000000000B` « OTI du Sud » (l'ORG éditeur, natif — normal).
- Les autres onglets du classeur (CRM/contacts, visites, prestataires, tarifs, réseaux sociaux) ne sont pas des objets établissement et sont hors de cette comparaison.
- Les accents de la source contiennent par endroits le caractère de remplacement `�` (corruption d'encodage **dans la donnée Berta elle-même**) ; sans impact sur l'appariement par id.

---

## 7. ✅ CORRECTIONS APPLIQUÉES (2026-06-16, base LIVE)

Validées par le PO ("oui à tout"). Sauvegarde complète des suppressions : `docs/research/berta-deletes-backup-2026-06-16.json` (444 lignes, 19 tables).

### 7a. 14 objets importés (en `draft`)
Identité + localisation (adresse/CP/commune/lieu-dit/GPS) + descriptif canonique + rattachement publisher OTI du Sud. Types dérivés du mapping **live empirique** (post-§57) :

| Nouvel id | Type | Nom | Commune |
|---|---|---|---|
| LOIRUN00000001AW | LOI | Les Passerelles du Bien-Être | Entre-Deux |
| PRDRUN00000001AX | PRD | APIC974 | Entre-Deux |
| LOIRUN00000001AY | LOI | Bat'Karèv & Trois Petits Points | Le Tampon |
| LOIRUN00000001AZ | LOI | Ti Kaz Épices | Saint-Philippe |
| ACTRUN00000001B0 | ACT | Virginie MOUSSA - Thérapie Manuelle | Le Tampon |
| RESRUN00000001B1 | RES | Allon Manger | Le Tampon |
| ACTRUN00000001B2 | ACT | Kozman La Montagn | Entre-Deux |
| HLORUN00000001B3 | HLO | Villa Evilou | Entre-Deux |
| LOIRUN00000001B4 | LOI | La Récup de TiCha | Saint-Joseph |
| HLORUN00000001B5 | HLO | L'Océan de Brilune | Saint-Joseph |
| RESRUN00000001B6 | RES | Chez Mamie Poulette | Entre-Deux |
| ACTRUN00000001B7 | ACT | Rando des Z'Iles | Entre-Deux |
| HLORUN00000001B8 | HLO | L'Or du Temps | Saint-Philippe |
| PRDRUN00000001B9 | PRD | L'instant Philippine | Saint-Philippe |

⚠ **Type à confirmer en revue** : Kozman La Montagn & Rando des Z'Iles ("Guide Accompagnateur") forcés en **ACT** (et non PRD du vote catégorie) ; Ti Kaz Épices en **LOI** (catégorie feuille = Art, mais exploitation agricole → PRD possible). Tous en `draft` : retypables dans l'éditeur.

### 7b. 21 objets supprimés (DELETE cascade)
- **10 doublons** : suppression du stub pilote VIDE (créé 11/04, loc+acteur seulement), copie riche du 01/05 conservée. Inclut la résolution des conflits de type : *Maison du Curcuma* → on garde LOIRUN00000000VE (LOI) ; *La Cité du Volcan* → on garde LOIRUN000000010V (PCU).
- **11 orphelins** (id Berta absent de la feuille) : suppression. ⚠ Contenu détruit (sauvegardé) : 48 médias, 34 interactions CRM, 99 aménités, contacts… — restaurables via le backup.

### 7c. 15 alignements de champ sur la source
- 7 noms recopiés depuis Berta (y compris coquilles : "Les Milles et une nuit", "Résidence Touristiques"…, choix PO).
- 7 communes : `La Plaine des Cafres` → `Le Tampon` (localité → commune parente).
- 1 statut : *Chez Manman* `archived` → `published`.

### 7d. État final vérifié
| Mesure | Avant | Après |
|---|---:|---:|
| Objets en base | 848 | **841** |
| Objets mappés Berta (id distinct) | 837 | **840** |
| Doublons d'id Berta | 10 | **0** |
| Manquants (feuille \ base) | 14 | **0** |
| Orphelins (base \ feuille) | 11 | **0** |

➡ **Réconciliation parfaite 840/840** (+ ORGRUN000000000B « OTI du Sud », natif sans id Berta).
