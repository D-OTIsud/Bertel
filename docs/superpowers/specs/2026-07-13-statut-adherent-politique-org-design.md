# Statut d'adhérent — politique par ORG + statut dérivé (design)

Date : 2026-07-13 · Statut : validé (PO) · Périmètre : DB + API + CRM + API partenaire

## 1. Contexte & règle métier

L'OTI du Sud n'a pas d'adhésion payante : ni campagne, ni palier, ni période d'engagement,
ni date limite. La règle réelle est : **un objet « prestataire » présent en base EST adhérent**,
à partir du moment où il est ajouté. Le modèle existant `object_membership`
(campagne + palier + statut `prospect/invoiced/paid/canceled/lapsed` + dates + trigger
`commercial_visibility`) décrit une adhésion **commerciale** — il est plus lourd que cette
réalité et reste à 0 ligne en production.

Décision : **statut dérivé, sans backfill** (pas de 846 lignes à faux statut `paid`),
avec une **politique explicite par organisation** et un **résolveur unique**. Le module
d'adhésion commerciale existant est conservé tel quel pour de futures ORGs à adhésion
payante (mode explicite).

## 2. Règle verrouillée

- **Politique par ORG** — l'adhésion est toujours relative à une organisation, jamais globale.
- **Allowlist des types éligibles (13)** :
  `HOT, HLO, CAMP, HPA, RVA` (hébergements) · `RES` · `LOI, ACT, ASC` (activités) ·
  `COM, PRD, PSV` (commerce/producteur/prestataire) · `PCU` (sites culturels gérés).
- **Types exclus** : `ITI, PNA, FMA, VIL, SPU, ORG` (POI, itinéraires, événements,
  villes, services publics, organisations).
- **Statuts objet** : `draft` + `published` = adhérent ; `archived` + `hidden` = non-adhérent.
- **Date d'adhésion** (`since`) = `object.created_at`. Limitation assumée : pour le corpus
  importé, c'est la date d'import, pas l'ancienneté réelle de la relation — conforme à la
  règle énoncée (« à partir du moment où un objet est rajouté en base »).
- **Rattachement** : l'objet doit être lié à l'ORG via `object_org_link`. Un objet
  prestataire sans lien vers l'ORG n'est pas adhérent de cette ORG (voir audit §7).

## 3. Modèle — table `org_membership_policy`

Table dédiée (PAS un flag dans `org_config`, qui reste cantonnée au périmètre d'accès) :

- `org_object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE`
  (+ trigger maison `validate_org_object_type` : la cible doit être une ORG) ;
- `mode TEXT NOT NULL CHECK (mode IN ('implicit_by_presence','explicit'))` ;
- `eligible_types object_type[] NOT NULL DEFAULT '{}'` (utilisé en mode implicite) ;
- `created_at` / `updated_at` (+ trigger `update_updated_at_column`).

**Absence de ligne = mode `explicit`** (comportement actuel inchangé) : les ORGs futures
ne changent pas de sémantique par défaut.

Seed : une ligne pour `ORGRUN000000000B` (OTI du Sud), mode `implicit_by_presence`,
les 13 types ci-dessus.

RLS : lecture publique (donnée de configuration non sensible, patron `ref_*`) ; écriture
superuser plateforme OU admin d'ORG rang ≥ 30 (même gate que le branding §172), policies
par commande, forme §39 `(select auth.*())`. Pas d'UI d'administration dans ce chantier —
la politique se gère en SQL (module admin différé).

## 4. Résolveur unique

Deux fonctions, une seule logique (patron set-based §35) :

- **`api.org_adherent_object_ids(p_org_object_id TEXT) RETURNS SETOF TEXT`** — set-based,
  pour les surfaces liste (CRM annuaire, agrégats). Mode-aware : en mode implicite,
  objets liés à l'ORG (`object_org_link`) × type ∈ `eligible_types` × statut ∈
  (`draft`,`published`) ; en mode explicite, objets portant une ligne `object_membership`
  courante (`paid`/`invoiced` dans la fenêtre de dates) — le filtre CRM reste donc
  correct pour une future ORG payante.
- **`api.resolve_object_membership(p_object_id TEXT, p_org_object_id TEXT) RETURNS JSONB`**
  — scalaire, pour les surfaces fiche. Retourne la forme unique :

```json
{
  "is_member": true,
  "since": "2026-05-01T09:24:21Z",
  "mode": "implicit_by_presence",
  "org_object_id": "ORGRUN000000000B",
  "details": null
}
```

Sémantique :
- ORG en mode **implicite** → règle de présence (jamais de lecture `object_membership`).
- ORG en mode **explicite** (ou sans ligne de politique) → logique `current_membership`
  actuelle (`object_membership` statut `paid`/`invoiced` dans la fenêtre de dates),
  enrichie campagne/palier comme aujourd'hui.
- **Jamais de fallback hybride pour une même ORG.**
- `is_member: false` porte quand même `mode` et `org_object_id` (résultat toujours
  auto-descriptif) ; objet non lié à l'ORG → `is_member: false`.

**Découplage `commercial_visibility`** : le calcul implicite n'écrit JAMAIS
`commercial_visibility`. Le trigger existant `trg_membership_status_transition` reste
réservé aux lignes `object_membership` (mode explicite). Aucun trigger nouveau.

## 5. Cohérence avec l'existant (pas de double définition)

- **`api.get_object_resource` — clé `current_membership`** : évolue pour émettre la sortie
  du résolveur (ORG résolue = ORG éditrice principale : `object_org_link.is_primary`,
  fallback premier lien). La forme porte une clé `details` nullable : `null` en mode
  implicite ; en mode explicite, l'objet campagne/palier/statut/dates actuel. Une seule
  clé, pas de champ concurrent. Sweep des consommateurs : `object-workspace-parser.ts`,
  `object-detail-parser.ts`, tests associés.
- **Éditeur §17 (SectionAttachments + MembershipEditModal)** : si l'ORG de l'objet est en
  mode implicite → résumé **lecture seule** (« Adhérent — présence en base depuis {date} »),
  authoring campagne/palier/paiement masqué (pas de write-trap : contrôles retirés, pas
  désactivés silencieusement). ORGs en mode explicite : UI actuelle inchangée.
- **Drawer (mini-cartes adhésions)** : suit la nouvelle forme parsée ; pas de badge
  supplémentaire (surface non retenue).
- Pas de champ « adhérent » sur l'Explorer ni le dashboard (non retenus — aujourd'hui
  100 % des prestataires seraient adhérents, filtre non discriminant).

## 6. Surfaces retenues

### CRM (fiche acteur + annuaire)
- `list_crm_directory(filters)` : `is_adherent` par établissement lié + **filtre serveur**
  `is_adherent` + agrégat acteur « N établissements adhérents sur M ».
- `list_actor_crm` (fiche acteur) : badge par établissement lié.
- L'ORG de résolution = l'ORG du membership actif de l'utilisateur
  (`api.current_user_org_id()`), cohérent avec le périmètre CRM (§61).
- Le statut est porté par chaque **objet**, jamais par la personne (modèle acteur-centré).
- UI : badge/chip dans l'annuaire et la fiche acteur, filtre dans la barre de filtres
  serveur existante.

### API partenaire / exports
- Fiche complète (`/api/public/objects/{id}` et `?view=full`) : hérite automatiquement de
  la clé `membership` via `get_object_resource` (invariant §177 : item full = même fiche).
- Résumés de liste : booléen `membership.is_member` (+ `org_object_id`).
- ORG de résolution = ORG éditrice principale, explicitement indiquée dans le résultat.
- Contrat synchronisé sur les **3 surfaces** : `docs/guide-partenaires.md`,
  `docs/openapi.json`, collection Postman.

## 7. Audit préalable (lecture seule, avant activation)

Avant de seeder la politique :
1. comptes par type × statut × ORG (corpus attendu ≈ 846 objets, 13 types éligibles) ;
2. objets de type éligible **sans `object_org_link`** vers l'OTI (l'auto-rattachement
   ignore les imports et créations sans auteur) — liste à corriger AVANT activation ;
3. l'unique objet `commercial_visibility='lapsed'` existant : identifier, comprendre,
   corriger si résidu de test.

Résultat consigné dans `docs/research/` + décisions dans le decision log.

## 8. Non-objectifs

- Pas de backfill `object_membership` (0 ligne créée).
- Pas d'écriture `commercial_visibility` depuis le mode implicite.
- Pas d'UI d'administration de la politique (SQL seed ; module admin différé).
- Pas de filtre Explorer, pas de KPI dashboard, pas de badge drawer.
- Pas d'exceptions par objet en mode implicite (la règle n'en prévoit pas) ; si le besoin
  émerge, c'est un passage au mode explicite, pas un hybride.
- Pas de date d'adhésion éditable (dérivée de `created_at`).

## 9. Déploiement & tests

- Migration `migration_org_membership_policy.sql` : table + RLS + résolveurs + seed +
  évolution `get_object_resource` — inscrite au manifest/runbook (invariant deploy
  integrity, fresh-apply gate).
- Tests SQL (`tests/test_org_membership_policy.sql`, CI fresh-apply) :
  - type éligible vs exclu ; les 4 statuts objet ; objet non lié ; multi-ORG
    (implicite vs explicite côte à côte) ;
  - mode explicite = parité avec l'actuel `current_membership` ;
  - le résolveur implicite ne modifie pas `commercial_visibility`.
- Tests FE : parsers (nouvelle forme), §17 lecture seule en mode implicite, CRM
  (badge, filtre, agrégat).
- Contrat : openapi.json + guide + Postman mis à jour ensemble.

## 10. Invariant proposé pour CLAUDE.md (à l'issue du chantier)

> **Adhésion = politique par ORG + résolveur unique.** Le statut d'adhérent se lit
> exclusivement via `api.resolve_object_membership(object, org)` /
> `api.org_adherent_object_ids(org)` — jamais `object_membership` en direct dans une
> nouvelle surface. Le mode (`implicit_by_presence` | `explicit`) vit dans
> `org_membership_policy` (absence de ligne = explicite) ; jamais d'hybride pour une même
> ORG. Le mode implicite n'écrit JAMAIS `commercial_visibility` (trigger réservé aux
> lignes explicites).
