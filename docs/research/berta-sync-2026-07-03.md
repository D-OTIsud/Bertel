# Sync Berta 2.0 — extraction du 03/07/2026

Source : `Berta 2.0 - Extract03072026.csv` (844 lignes, 58 colonnes) fournie par le PO — état le plus à jour de l'ancienne base Berta. Référence méthodo : réconciliation du 16/06 (`berta2.0-db-reconciliation-2026-06-16.md`, décision §85). Appariement DB↔Berta : `object_origin.source_object_id` où `source_system='berta_v2_csv_export'`. Journal : décision **§168**.

## 1. Diff extraction ↔ base live

| Mesure | Valeur |
|---|---:|
| Lignes extraction | 844 (= 840 de juin + 4 créations) |
| Ids Berta en base avant sync | 840 |
| **Disparus de l'extraction (à archiver par absence)** | **0** |
| **Nouveaux dans l'extraction (à importer)** | **4** |
| Flips `En ligne` oui→non depuis juin | 2 |
| Flips `En ligne` non→oui | 0 |

**Constat structurel : Berta ne supprime pas les fiches fermées** — elle les bascule `En ligne=non`. Les colonnes `Motif Hors ligne`, `Date de fermeture`, `Status`, `Colones modifiées`, `Date de derniere modification` sont vides sur les 844 lignes. Le seul signal de fermeture exploitable est donc le flip `En ligne`.

## 2. Appliqué (base LIVE, 2026-07-03)

### 2a. 4 imports HLO en `draft` (Location saisonnière, créés 19/06 → 02/07)

Pipeline §85 étendu : objet + origin + publisher OTI du Sud + localisation (adresse/GPS/direction) + descriptif canonique (`visibility='public'`) + contacts (mobile/email) + capacité (`max_capacity`/pax) + langues + classement le cas échéant.

| Nouvel id | Nom | Commune | Berta id | Particularités |
|---|---|---|---|---|
| `HLORUN00000001BE` | Villa Les Margosiers | Saint-Joseph (Les Jacques) | `4d698167` | cap. 8 ; pas de descriptif source |
| `HLORUN00000001BF` | La Kaz Bon Dimanche | Saint-Joseph (Vincendo) | `81862a8a` | cap. 2 ; accroche + descriptif |
| `HLORUN00000001BG` | Au Coucher de Lune | Le Tampon (Plaine des Cafres) | `53f93b04` | cap. 6 |
| `HLORUN00000001BH` | Fanjan | Le Tampon (Plaine des Cafres) | `474709b7` | cap. 6 ; fr+en ; `meuble_stars`=3 `granted` |

DML idempotent (garde `object_origin.source_object_id`) ; ids mintés par le trigger ; `geog2` colonne générée depuis lat/long.

### 2b. 2 archivages (`published` → `archived`)

| Id | Nom | Type | Raison |
|---|---|---|---|
| `HLORUN0000000144` | Kaz Mado | HLO | `En ligne` oui→non entre le 16/06 et le 03/07 |
| `LOIRUN00000000QO` | Alain Beaudemoulin (chocolatier) | LOI | idem |

La réconciliation §85 avait vérifié les statuts (1 seul écart, corrigé alors) ⇒ ces deux dépublications Berta sont récentes et réelles. Choix `archived` = lecture PO « fermé » ; **réversible en un UPDATE** si l'OTI apprend qu'il s'agit d'une suspension temporaire (`draft`) ou d'une erreur (`published`).

## 3. Hors périmètre (délibéré)

- **Pas de re-sync champ-à-champ des 838 fiches appariées** : Bertel est la base vivante (fusions horaires §151, Markdown, alignements §85…) ; l'extraction ne porte aucun signal de modification. Écraser depuis Berta détruirait le travail Bertel.
- **Pas d'acteurs/fournisseurs** créés pour les 4 imports (comme §85). Les SIRET/contacts fournisseur restent dans le CSV si besoin.
- **Prestations sur place** non mappées en `object_amenity` (passe dédiée si demandée).

## 4. État final vérifié (SQL live)

| Mesure | Valeur |
|---|---:|
| Ids Berta appariés | **844/844** (0 dup / 0 manquant / 0 orphelin) |
| Berta `published` | 360 = `En ligne=oui` 360 ✔ |
| Berta `draft` + `archived` | 482 + 2 = 484 = `En ligne=non` 484 ✔ |
| Objets en base | 847 = 844 Berta + OTI du Sud + 2 objets test du 22/06 |

⚠ Les 2 objets **test** hors Berta (`FMARUN00000001BC` « test », archived ; `ITIRUN00000001BD` « test iti », draft) sont des artefacts de la création B1 — candidats au nettoyage, décision PO.
