# Complétude d'une fiche par type — modèle v2 (gelé, ready-to-code)

> Date : 2026-06-18 · Auteur : réflexion swarm + définition PO + calibrage sur donnée live.
> Source de vérité du modèle : `bertel-tourism-ui/src/features/object-editor/editor-completion.ts`,
> `editor-validation.ts`, `section-config.ts`, `archetypes.ts`,
> `bertel-tourism-ui/src/services/object-workspace-parser.ts`.
> Statut : **conception gelée, non implémentée.** À cross-référencer dans `lot1_mapping_decisions.md`
> quand l'implémentation atterrit.

---

## 0. Définition produit (PO, 2026-06-18)

> « L'objectif est qu'une fiche ne doit jamais paraître comme manquant d'informations à un utilisateur. »

La complétude mesure la **complétude perçue par un visiteur public**, PAS « tous les champs DB remplis ».
Le PO fixe un **bundle d'essentiels visiteur = 80 %**, le reste = **20 % complémentaire**.

Essentiels énoncés : un lieu · un contact · des photos (**4 = 100 %**) · un nom, type et **sous-catégorie** ·
description et accroche · **équipements (ou l'équivalent selon le type)** · au moins 1-2 tags.

---

## 1. Calibrage live (fiches publiées — le benchmark « fiche finie »)

### 1.1 Couverture des essentiels (le bundle visiteur)

| Type | n pub | Lieu | Contact | **≥4 photos** | Desc+accroche | Équip. | Sous-cat. | Tag | **Bundle complet** |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| HLO | 171 | 100 | 100 | **67** | 88 | 99 | 100 | 100 | **64 %** |
| RES | 90 | 100 | 99 | **44** | 89 | 100 | 100 | 100 | **41 %** |
| LOI | 37 | 100 | 100 | **57** | 73 | 70 | 100 | 100 | **43 %** |
| ACT | 23 | 100 | 100 | **30** | 100 | 96 | 100 | 100 | **30 %** |
| PRD | 15 | 100 | 100 | **40** | 80 | 67 | 100 | 100 | **27 %** |
| PSV | 10 | 100 | 100 | **30** | 100 | 50 | 100 | 70 | **20 %** |
| HOT | 7 | 100 | 100 | **71** | 100 | 100 | 100 | 100 | **71 %** |

**Enseignement central : le goulot unique est `≥4 photos` (30-71 %).** Lieu, contact, sous-catégorie,
tags ≈ 100 % ; descriptif+accroche 73-100 % ; équipements/équivalent 50-100 %. → Le north star
« ne jamais paraître incomplète » est, empiriquement, **un problème d'enrichissement média**, pas de modèle.

### 1.2 Couverture du complémentaire (= naturellement absent / non encore peuplé)

| Type | Tarifs §13 | Ouverture §14 | Classement §08 | T&H §09 | Durable §10 | Tags §11 |
|---|--:|--:|--:|--:|--:|--:|
| HLO | **0** | **0** | 43 | 0 | 2 | 100 |
| RES | **0** | 57 | 0 | 1 | 1 | 100 |
| LOI | **0** | 43 | 0 | 0 | 3 | 100 |
| HOT | **0** | **0** | 57 | 14 | 29 | 100 |

**3 classes distinctes d'absence légitime** (à NE PAS mettre dans le dénominateur du cœur) :

| Classe | Dimensions (preuve live) | Traitement | Évolutif ? |
|---|---|---|---|
| **Optionnel par nature** | classement, T&H, durable, labels qualité | **Valorisation (bonus pur)** — jamais pénalisé | non |
| **Attendu mais non peuplé** | tarifs (0 % partout), ouverture (0 % HEB) | **Complémentaire-attendu** ; re-promu quand le pipeline remplit | oui — recalibrer |
| **Saturé / non-discriminant** | tags (~100 %) | poids minimal | surveiller |

### 1.3 Killer fields type-spécifiques (slot 7 « équipements ou équivalent »)

| Archétype | Killer field (champ DB) | Couverture live | Statut |
|---|---|--:|---|
| HEB | `object_capacity[max_capacity]` ∨ `object_room_type` | 100 % | solide |
| RES | `object_capacity[seats]` ∨ `object_menu` | 72 % | bon |
| VIS | mode de visite ∨ `object_amenity` | ~70 % | moyen |
| SRV | prestations (`object_amenity`) | 50-70 % | moyen |
| ASC/ACT | `object_act` (durée/encadrement) | 0 % | **vide — type à venir** |
| ITI | `object_iti` (tracé) | 0 pub | **vide — type à venir** |
| FMA | `object_fma` (dates) | 0 pub | **vide — type à venir** |

> ITI/FMA/ASC/VIL sont des **types vides aujourd'hui mais à venir** : leur slot est défini ci-dessous,
> forward-looking, même sans donnée live.

---

## 2. Le modèle v2 (gelé)

### 2.1 Structure 80 / 15 / 5

```
score = 80 × essentiels      (bundle visiteur, poids égal, dénominateur = essentiels applicables)
      + 15 × complémentaire   (attendu : tarifs/ouverture/juridique/liens/…, poids égal, N-A exclus)
      +  5 × valorisation     (BONUS PUR : distinctions/labels — présent = +pts, absent = +0, jamais pénalisé, plafonné à 5)
```

- Le **20 % « complémentaire »** du PO est raffiné en **15 % attendu + 5 % bonus** pour implémenter sa
  règle « les non-classés ne doivent pas être pénalisés » : les distinctions n'entrent dans AUCUN
  dénominateur. (Collapsable en 20 % plat si le PO préfère.)
- **Tous essentiels présents ⇒ ≥ 80 %** (« ne paraît jamais incomplète »). Le complémentaire + bonus
  montent vers 100 %.
- **Poids égal dans chaque paquet** (KISS — évite ~60 poids réglés à la main ; cf. méta-critique du swarm).

### 2.2 Les essentiels (80 %, poids égal)

| # | Essentiel | Section | Mesure | Champ `ObjectWorkspaceModules` |
|---|---|---|---|---|
| 1 | Nom | §01 | présence | `generalInfo.name` |
| 2 | Type + sous-catégorie | §01 | ≥1 domaine taxonomie assigné | `taxonomy.domains[].assignment` |
| 3 | Lieu | §02 | commune ∨ géoloc | `location.main.{city‖codeInsee‖(lat∧lng)}` |
| 4 | Contact public | §03 | ≥1 public non vide | `contacts.objectItems.some(isPublic ∧ hasText(value))` |
| 5 | Accroche + descriptif | §04 | les deux présents | `descriptions.object.{chapo,description}` (hasTranslatableText) |
| 6 | Photos | §05 | **richesse `min(nPhotos/4, 1)`** | `media.objectItems` filtré photo (filtre de `computeNavHint`) |
| 7 | Équipements / équivalent type | §06 | présence (par archétype ↓) | voir 2.4 |
| 8 | Tags | §11 | ≥1 (idéal 2) | `tags.displayed.length >= 1` |

> Photo #6 = **richesse, pas binaire** : 0 photo = 0, 2 = 0,5, ≥4 = 1. Pas de mur ; 3 photos = orange
> jusqu'à la 4ᵉ. C'est la traduction exacte de « 4 pour 100 % ».

### 2.3 Le complémentaire (15 %, attendu) et la valorisation (5 %, bonus)

**Complémentaire-attendu** (poids égal, **N-A exclus du dénominateur** selon le type — cf. 2.5) :
tarifs §13 · ouverture §14 · juridique §18 · liens/relations §15 · rattachements/adhésions §17 ·
identifiants externes §22 · sous-lieux §16 (ITI/VIS) · MICE & politiques séjour/groupe/animaux (HEB).

**Valorisation / bonus pur** (jamais au dénominateur, plafond +5) :
classement officiel §08 (épis/étoiles/clés) · Tourisme & Handicap §09 · démarche durable §10 ·
labels qualité. Présent ⇒ +pts ; absent ⇒ +0 (un gîte non classé n'est jamais pénalisé). L'incitation
« faites-vous classer » vit dans **PMV-001 (rail de suggestions)**, hors score.

### 2.4 Slot 7 « équipements ou équivalent » par archétype

| Archétype | Mesure du slot 7 |
|---|---|
| **HEB** | `capacityPolicies.capacityItems.some(metricCode==='max_capacity' ∧ hasText)` ∨ `rooms.items>0` ∨ `rooms.unavailableReason` |
| **RES** | `capacityPolicies.capacityItems.some(metricCode==='seats')` ∨ `menus.items>0` |
| **ASC** | `activity.{durationMin ‖ minParticipants ‖ maxParticipants ‖ minAge ‖ difficultyLevel}` renseigné |
| **ITI** | `itinerary.geometrySummary` ‖ `itinerary.stages.length>0` |
| **VIS** | `['visite_libre','visite_guidee','audioguide'].some(c ∈ selectedAmenityCodes)` ‖ médiation (`selectedAmenityCodes` hors famille `accessibility`) |
| **SRV** | `characteristics.selectedAmenityCodes.length>0` (prestations) |
| **FMA** | `event.startDate` ‖ `event.occurrences.length>0` |

### 2.5 Applicabilité (N-A par archétype — exclut du dénominateur)

| Archétype | Essentiels N-A | Complémentaire N-A |
|---|---|---|
| HEB | — | §07 (masqué), §16 |
| RES | — | §16 |
| ASC | — | §16 |
| ITI | — | §07 |
| VIS | — | — |
| SRV | slot 7 N-A pour **SPU** (toilettes/eau : pas de §06) | §06-facette, §07, §10, §13 (SPU gratuit), §16 |
| FMA | — | §07, §16 |

> Règle d'or : **aucune dimension à faible couverture live n'entre dans le dénominateur du cœur**, et le
> tier d'une dimension « attendue » se recalcule depuis la couverture réelle quand la donnée évolue.

### 2.6 Exemple chiffré (illustratif — régénéré par le réducteur + figé par test)

HLO, tous essentiels présents mais **2 photos** seulement, 0 complémentaire, 0 distinction :
- essentiels = (7 × 1 + 1 × 0,5) / 8 = 0,9375 → `80 × 0,9375 = 75 %`
- complémentaire = 0 → +0 · valorisation = 0 → +0
- **score ≈ 75 %**, orange : il manque la 4ᵉ photo (ou un peu de complémentaire) pour franchir 80 %.

---

## 3. Statut tricolore (découplé du %, source unique)

```ts
function completionStatus(draft, permissions, archetype): 'red' | 'orange' | 'green' {
  const v = validateForPublication(draft, permissions, archetype);
  if (v.blockers.length > 0) return 'red';            // non publiable (inclut droits §21)
  const ess = applicableEssentials(draft, archetype);  // les 8 essentiels applicables
  return ess.every(d => d.measure(draft) >= 1) ? 'green' : 'orange';
}
```

- 🔴 **Rouge** = `validateForPublication(...).blockers.length > 0` **directement** (jamais redérivé à la main).
- 🟢 **Vert** = aucun bloquant **ET tous les essentiels = 1** (≥4 photos inclus) = « ne paraît pas incomplète au visiteur ».
- 🟠 **Orange** = aucun bloquant mais ≥1 essentiel < 1 (typiquement < 4 photos).
- Le **%** (richesse) n'entre PAS dans le feu. Label de l'anneau : « prête à publier » → **« richesse de la fiche »** ;
  badge *publiable* séparé piloté par les blockers.

---

## 4. Plan d'implémentation — `editor-completion.ts` (fonctions pures)

**Étape 1 — Modèle déclaratif par dimension**
```ts
type Bucket = 'essentiel' | 'complementaire' | 'valorisation';
interface Dimension {
  id: string; section: string; bucket: Bucket;
  measure: (d: ObjectWorkspaceModules) => number;          // [0,1]
  applicable?: (d: ObjectWorkspaceModules, a: ArchetypeCode) => boolean;  // défaut true
}
const ESSENTIALS: Dimension[] = [...];                       // §2.2 (slot 7 = sélecteur par archétype)
const COMPLEMENTARY: Record<ArchetypeCode, Dimension[]> = {...};
const VALORISATION: Dimension[] = [...];                     // distinctions §08/§09/§10
```

**Étape 2 — `applicableDimensions(draft, archetype)`** : part des 3 paquets, retire les dimensions dont
la `section` n'est pas rendue par `makeSections(archetype)` (réutiliser `isHeb`/`hasPlaces`), celles à
`unavailableReason`, et applique `applicable()` (N-A data-driven §2.5).

**Étape 3 — Réducteur 80/15/5**
```ts
export function computeOverallCompletion(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): number {
  const ess  = bucketScore(applicable(ESSENTIALS, draft, archetype), draft);        // [0,1]
  const comp = bucketScore(applicable(COMPLEMENTARY[archetype], draft, archetype), draft);
  const valo = Math.min(1, sumMeasures(VALORISATION, draft) / VALORISATION.length); // bonus, jamais de pénalité
  return Math.round(80 * ess + 15 * comp + 5 * valo);
}
// bucketScore = Σ measure / nbApplicable (poids égal). Photo: min(countPhotos(d, MEDIA_PHOTO_FILTER)/4, 1).
```

**Étape 4 — `completionStatus(draft, permissions, archetype)`** (§3). Retirer `completionStatusFor(80%)` du global.

**Étape 5 — UI** : `CompletionRing` reste présentational ; relabel « richesse » + badge publiable séparé ;
`ObjectEditPage` passe `meta.archetype` à `computeOverallCompletion` (déjà disponible, `ObjectEditPage.tsx:198-205`).

**Étape 6 — Tests `editor-completion.test.ts` (lockstep)** : supprimer l'assertion moyenne-plate ; ajouter
par archétype : `Σ essentiels applicables`, score d'une fiche-type (généré, jamais à la main), un test
« N-A exclu » (SRV/SPU sans §13 ⇒ hors dénominateur), un test « bonus » (HEB non classé = même score
qu'avec classement sur le cœur, + ≤5 si classé), un test tricolore (3 photos ⇒ orange ; blockers ⇒ rouge).

**Étape 7 — Doc** : consigner l'invariant dans `lot1_mapping_decisions.md` + proposer l'ajout CLAUDE.md
(§ Éditeur) : *« complétude = complétude perçue visiteur (80 % essentiels / 15 % attendu / 5 % bonus) ;
distinctions = bonus pur jamais pénalisant ; le dénominateur exclut les sections non rendues + N-A ;
le score ne se substitue jamais à validateForPublication ; tier recalibré depuis la couverture live ».*

---

## 5. KPI dashboard `/dashboard` (« % de fiches qui paraissent complètes »)

Le score est calculé en TS côté éditeur ; pour l'agrégation portefeuille on réplique le **bundle
essentiels** en SQL (booléens simples — déjà écrits dans le calibrage §1.1). Vue proposée (à matérialiser
ou exposer en RPC DEFINER authorize-once ; ne PAS exposer en PostgREST direct) :

```sql
-- api.v_object_visitor_completeness — % d'essentiels présents par objet + drapeau "paraît complète"
-- (essentiels mesurables en SQL : lieu, contact public, ≥4 photos, descriptif+accroche, sous-catégorie,
--  équipement/équivalent générique, ≥1 tag ; le slot 7 type-spécifique exact reste calculé en TS).
```

KPI à afficher (maille = `object_type`/archétype, posture **non-classante** façon Apidae) :

| KPI | Définition | Lecture métier |
|---|---|---|
| **% fiches « complètes visiteur »** | tous essentiels présents / total publié | le north star, par type |
| **Top essentiel manquant** | par essentiel : `% fiches où measure<1` | **= photos** aujourd'hui (next best action) |
| **Distribution tricolore** | rouge/orange/vert empilé | où sont les « presque prêtes » (orange) |
| **Couverture média** | `% fiches ≥4 photos` + médiane photos/fiche | le levier #1 (benchmark Booking/GBP) |
| **Fiches 100 % cœur mais non publiables** | essentiels=1 ∧ blockers>0 | divorce richesse/droits (souvent §21) |

Extension future (hors périmètre) : **fraîcheur** (`object.updated_at` — « % fiches non touchées > 12 mois »).

---

## 6. Décisions PO restantes

1. **Split 80/15/5 vs 80/20 plat** — valider le bonus pur 5 % pour les distinctions, ou tout mettre en
   complémentaire (et accepter que les non-classés perdent un peu dans le 20 %) ?
2. **Cible photos `k=4`** — confirmer 4 pour tous, ou abaisser (3) pour FMA/SRV (affiche/comptoir) ?
3. **Re-promotion auto** des « attendus non peuplés » (tarifs/ouverture) en cœur quand la couverture live
   franchit un seuil (p.ex. 60 %) — ou décision manuelle ?
4. **Score persisté** `object.completion_score` (recalculé au save, agrégeable SQL) vs calcul TS éphémère ?
5. **Slot 7 pour SPU** — N-A (toilettes/eau sans §06) confirmé ?

## 7. Fichiers de référence
- `bertel-tourism-ui/src/features/object-editor/editor-completion.ts` (réducteur à refondre)
- `bertel-tourism-ui/src/features/object-editor/editor-validation.ts` (miroir du tricolore rouge)
- `bertel-tourism-ui/src/features/object-editor/section-config.ts` (`makeSections` — applicabilité partagée)
- `bertel-tourism-ui/src/features/object-editor/archetypes.ts` (19 types → 7 archétypes)
- `bertel-tourism-ui/src/services/object-workspace-parser.ts` (contrat `ObjectWorkspaceModules`)
- `bertel-tourism-ui/src/features/object-editor/widgets/CompletionRing.tsx` (relabel « richesse »)
- `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx:198-205` (câblage `archetype`)
