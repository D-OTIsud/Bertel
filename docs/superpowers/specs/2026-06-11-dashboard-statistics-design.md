# Module statistiques (Dashboard) — design refonte

**Date :** 2026-06-11
**Statut :** validé en brainstorming (4 décisions de cadrage confirmées par d.philippe@otisud.com)
**Référence :** page `/dashboard` (`src/views/DashboardPage.tsx`), fonctions `api.get_dashboard_*` (Phase 2A, `api_views_functions.sql:8330+`)

---

## 1. État des lieux (vérifié ce jour)

### Live aujourd'hui
- **5 widgets branchés** sur des RPC réelles : ScorecardStrip (`get_dashboard_scorecards`), TypeBreakdown, CommuneDistribution, ActualisationTable (seuil 90 j), DistinctionOverview. Tous suivent le même modèle : SQL STABLE + SECURITY DEFINER, signature `(p_types, p_status, p_filters JSONB, p_updated_at_from/to DATE)`, pool résolu par **`api.get_filtered_object_ids`** (le même résolveur que l'Explorer), ORG exclu, GRANT authenticated uniquement.
- **Filtres exposés en UI** (`DashboardFiltersPanel`) : types, statut (défaut `published`), communes, lieux-dits, période `updated_at` (presets 7 j/30 j/3 mois/1 an), PMR (`amenities_any:['wheelchair_access']`), animaux. Store zustand `dashboard-filter-store` ; chips de retrait via `ActiveFilterStrip`.
- **Fetch** : cascade `useState`+`useEffect` dans `DashboardPage` ; erreurs avalées en `console.error` (aucun état d'erreur visible) ; 5 RPC re-déclenchées à chaque changement de filtre.
- **848 objets importés** : les statistiques sont désormais réellement exploitables.

### Prévu mais jamais construit (stubs `dashboard-rpc.ts:197+`, mocks à `null`, aucun composant)
`getDashboardCompleteness`, `getDashboardCapacity`, `getDashboardVelocity`, `getDashboardContributors`, `getDashboardSeasonality`. Les types provisoires `*_PROVISIONAL` existent dans `types/dashboard.ts` (capacités : sources déjà documentées — `object_room_type`, `object_capacity` seats/pitches, `object_meeting_room.cap_*`, `object_iti.distance_km`).

### Capacités du résolveur de filtres (vérifié dans `get_filtered_object_ids`)
- **~18 clés déjà supportées côté SQL** mais sans UI dashboard : `taxonomy_any`, `classifications_any`, `tags_any`, `amenities_any`, `amenity_families_any`, `payment_methods_any`, `environment_tags_any`, `languages_any`, `media_types_any`, `disability_types_any`, `label_disability_types_any`, `sustainability_categories_any`/`actions_any`, `commercial_visibility_any`, `meeting_room.equipment_any`, `itinerary.practices_any`, `pet_accepted`…
- **Aucune clé « organisation publisher »** : le filtre ORG demande une extension du résolveur.

### Sources de données vérifiées (db-graph, snapshot live)
- Attribution : `object.created_by/updated_by`, `object_version.created_by` (+ `change_type`), `pending_change.submitted_by/reviewed_by/submitted_at/reviewed_at/applied_at`, `object.published_at`.
- Saisonnalité : `opening_period.date_start/date_end` (+ `all_years`), `object_fma.event_start_date/end_date`, `object_fma_occurrence.start_at/end_at`.
- → **Aucune table nouvelle nécessaire** pour tout le catalogue ci-dessous.

---

## 2. Décisions de cadrage (verrouillées ce jour)

| # | Question | Décision |
|---|----------|----------|
| 1 | Vocation | **Les trois** : pilotage qualité de la base (équipe SIT) + observatoire de l'offre (direction/élus) + suivi d'activité (managers). |
| 2 | Filtres | **Drill-down interactif** (graphiques cliquables) + **alignement sur le vocabulaire Explorer** + **filtre par organisation publisher**. Pas de persistance URL ni de vues sauvegardées (écarté). |
| 3 | Périmètre | **Refonte complète phasée** : lots livrables indépendamment. |
| 4 | Structure | **Approche A — onglets par vocation** sur la route `/dashboard` unique, panneau de filtres partagé. (B page unique empilée et C modules de navigation séparés écartés : 12 RPC par changement de filtre / plomberie triplée.) |

---

## 3. Architecture

### Page
- Route `/dashboard` conservée. **Scorecards héro au-dessus des onglets, toujours visibles** (total, publiés %, complétude moyenne, créations 30 j ±%, changements en attente, délai moyen de traitement).
- **3 onglets** : **Qualité de la base** *(défaut — audience quotidienne)* / **Offre du territoire** / **Activité équipe**. L'onglet actif vit dans le store dashboard (pas dans l'URL — cohérent avec la décision n°2).
- Panneau de filtres et `ActiveFilterStrip` **globaux** : changer d'onglet conserve les filtres.
- Widgets existants **re-homés, pas réécrits** : TypeBreakdown + ActualisationTable → Qualité ; CommuneDistribution + DistinctionOverview → Offre.

### Data layer frontend
- Migration du fetch vers **React Query** (déjà dans l'app, `app/query-client.ts`) : clé `['dashboard', <widget>, <filtres sérialisés>]`, `staleTime` ~60 s. Revenir sur un onglet avec les mêmes filtres ne refetch pas ; seuls les widgets de l'onglet visible chargent (3-5 RPC au lieu de 12).
- Chaque widget gère **3 états visibles** : chargement (skeleton), erreur (message + bouton réessayer — fin des `console.error` silencieux), vide (« aucun objet ne correspond aux filtres »).
- Le mode démo (mocks) est conservé tel quel pour les 5 widgets existants ; les nouveaux widgets n'ont **pas** de mock (principe « prefer real DB data ») — en mode démo ils affichent l'état vide.

### Conventions backend (inchangées — modèle Phase 2A)
- 1 widget = 1 fonction `api.get_dashboard_*` : SQL STABLE, SECURITY DEFINER, signature commune `(p_types object_type[], p_status object_status[], p_filters JSONB, p_updated_at_from DATE, p_updated_at_to DATE [+ params propres])`, pool via `get_filtered_object_ids`, **ORG exclu**, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated, service_role`.
- Toutes les fonctions vont dans `api_views_functions.sql`, le manifest/runbook (invariant deploy-integrity §24 P0.1), avec un test SQL CI `tests/test_dashboard_*.sql` chacune.
- Les flags advisor `*_security_definer_function_executable` sur ces RPC sont attendus (exception « authorize-once + DEFINER » documentée §36 ; ici les fonctions agrègent, ne retournent jamais de données champ-par-champ d'objets non publiés — voir « Garde-fous » ci-dessous).

---

## 4. Catalogue des statistiques

### Onglet Qualité de la base (équipe SIT)
| Widget | Source | Nouveau ? |
|---|---|---|
| **Complétude par type** | formule serveur (ci-dessous) | ✦ RPC `get_dashboard_completeness` + composant |
| **Fiches à problème** | absences : photo, contact, géoloc, description, horaires, taxonomie + brouillons dormants (draft sans modification > 30 j) | ✦ RPC `get_dashboard_quality_gaps` + composant |
| Actualisation (à jour / à revoir / obsolète par type) | existant, re-homé | — |
| Répartition par type (avec statuts) | existant, re-homé | — |

**Formule de complétude** (calculée dans la RPC) : score 0–100 par objet = ratio de critères présents sur critères applicables, **à poids égaux** (pas de pondération en v1 — simple, explicable aux agents ; des poids différenciés restent possibles plus tard sans changer le contrat de sortie). Critères : photo (`media`), description (`object_description` canonique non vide), contact (≥ 1 `contact_channel` tel ou email), géolocalisation (`object_location` avec coordonnées), horaires (≥ 1 `opening_period`), tarifs (≥ 1 `object_price`), taxonomie (≥ 1 `object_taxonomy`), capacité (si table de facette applicable au type via `ref_facet_applicability`). Les critères non applicables au type sont retirés du dénominateur (un ITI sans tarif n'est pas pénalisé). La RPC retourne par type : score moyen, top 3 des champs manquants, liste `{id, name, score, missing_fields}` des fiches < 80 (liens directs vers `/objects/[id]/edit`). Elle remplit aussi `avg_completeness` du scorecard (null depuis Phase 2A). Calcul à la volée assumé (≈ 850 objets) ; **plan B documenté** si > ~1 s : matview rafraîchie par cron, même contrat de sortie.

**Fiches à problème** : compteurs cliquables ouvrant un panneau-liste nominatif (liens éditeur) — pas un drill vers l'Explorer, car l'Explorer ne sait pas filtrer sur l'*absence* d'un champ.

### Onglet Offre du territoire (direction/élus)
| Widget | Source | Nouveau ? |
|---|---|---|
| **Capacités** : lits touristiques (HOT/HPA/HLO/RVA/CAMP), couverts (RES), emplacements (CAMP/HPA), MICE théâtre/classe, km d'itinéraires | `object_room_type`, `object_capacity` (seats/pitches), `object_meeting_room.cap_*`, `object_iti.distance_km` — sources des types `_PROVISIONAL` confirmées | ✦ RPC `get_dashboard_capacity` + composant |
| **Saisonnalité** : par mois (année civile courante), nb d'objets ouverts (`opening_period`, `all_years` = ouvert toute l'année) + nb d'événements FMA (`object_fma` + `object_fma_occurrence`) | tables vérifiées | ✦ RPC `get_dashboard_seasonality` + composant |
| **Profil de l'offre** (jauges) : % PMR par type de handicap, % engagés durabilité, langues parlées, animaux acceptés | `cached_amenity_codes`, `object_classification` (T&H subvalues), sustainability, `cached_language_codes` | ✦ RPC `get_dashboard_offer_profile` + composant |
| Distribution par commune | existant, re-homé | — |
| Distinctions (classements + labels) | existant, re-homé | — |

### Onglet Activité équipe (managers)
| Widget | Source | Nouveau ? |
|---|---|---|
| **Vélocité** : créations vs mises à jour par semaine, 12 semaines | `object.created_at`, `object_version` (created_at, change_type) | ✦ RPC `get_dashboard_velocity` + composant |
| **Contributeurs** : modifications par utilisateur, types principaux, tendance vs période précédente | `object_version.created_by` → `app_user_profile` | ✦ RPC `get_dashboard_contributors` + composant |
| **Modération** : pending_change par statut + ancienneté (buckets < 7 j / 7-30 j / > 30 j), délai moyen | `pending_change` | ✦ RPC `get_dashboard_moderation` + composant |
| **Publications par mois** | `object.published_at` | intégré à la RPC vélocité (même balayage temporel) |

**Garde-fou contributeurs/vélocité** : ces RPC agrègent sur **tous** les statuts du pool filtré (un brouillon modifié est de l'activité) — mais ne retournent jamais le contenu des versions, uniquement des comptes et des noms d'utilisateurs (visibles par tout authentifié de la plateforme aujourd'hui ; à revoir quand le multi-ORG réel arrivera, noté en différé).

---

## 5. Filtres

### 5.1 Alignement Explorer (UI seulement — les clés SQL existent)
Le panneau gagne un groupe repliable **« Filtres avancés »** (fermé par défaut) : taxonomie par domaine (`taxonomy_any` — réutiliser les composants de sélection de l'Explorer), distinctions/classements (`classifications_any`, paires scheme+valeur), tags (`tags_any` — slugs `ref_tag`), familles d'équipements (`amenity_families_any` ; le niveau équipement individuel est écarté en v1 : `amenities_any` est déjà réservé au mapping PMR et le besoin réel est au niveau famille), langues (`languages_any`). Le bloc de base reste : types, statut, communes, lieux-dits, période, PMR, animaux. `buildRpcParams` (`dashboard-rpc.ts`) est étendu pour sérialiser les nouvelles clés — il en mappe déjà une partie (`labelsAny`, `taxonomyAny`) sans UI.

### 5.2 Drill-down interactif
- Tout segment de graphique est cliquable **en toggle** : clic « Hôtels » dans TypeBreakdown → `setFilters({types:['HOT']})`, re-clic → retire ; pareil commune (CommuneDistribution — **déjà implémenté**, sert de modèle), type dans Actualisation/Complétude. Saisonnalité : le clic sur un mois ne filtre pas (la période des filtres porte sur `updated_at`, pas sur l'ouverture — pas de mapping honnête) ; il ouvre la liste des objets ouvrants/fermants du mois. **DistinctionOverview : drill par scheme reporté au lot 5** — `classifications_any` exige des paires `{scheme_code, value_code}` (match exact sur `cached_classification_codes` au format `scheme:value`) ; « tout objet distingué du scheme X » demande une nouvelle clé résolveur `classification_schemes_any` (préfixe `scheme:`), ajoutée au lot 5 avec `publisher_org_any`.
- Affordance : curseur pointer + tooltip « Filtrer : <valeur> » ; le segment actif est marqué visuellement.
- Le mapping clic→filtre est une **fonction pure par widget** (testable Jest), qui appelle le `setFilters` du store existant.

### 5.3 Pont vers l'Explorer
Bouton **« Ouvrir dans l'Explorer »** sur la barre de filtres actifs : mappe `DashboardFilters` → état de filtres Explorer (fonction pure `mapDashboardFiltersToExplorer`, champs sans équivalent ignorés explicitement) puis navigue vers `/explorer`. Sens unique dashboard→Explorer. Le shape exact du store Explorer est à relever au moment du plan d'implémentation.

### 5.4 Filtre organisation (publisher) — seule extension SQL du résolveur
- Nouvelle clé **`publisher_org_any`** (TEXT[] d'ids d'objets ORG) dans `get_filtered_object_ids` : `EXISTS (SELECT 1 FROM object_org_link l WHERE l.object_id = src.object_id AND l.org_object_id = ANY(params.publisher_org_any) AND l.role_id = <publisher>)` — **colonne externe qualifiée** (invariant CLAUDE.md §55) ; ajoutée aussi au « OR n.filters ? … » du chemin non-caché.
- Bénéficie à l'Explorer (une source de vérité) ; l'UI Explorer correspondante n'est **pas** dans ce périmètre.
- UI dashboard : select d'organisations (liste des objets ORG) + raccourci « Ma base » (ORG courante via `api.current_user_org_id`). Avec 1 seule ORG seedée aujourd'hui, le widget est fonctionnel mais peu discriminant — c'est assumé (préparation multi-ORG), d'où son rang en dernier lot.

---

## 6. Tests et vérification

- **SQL (CI, pattern existant `tests/test_*.sql`)** : un test par nouvelle fonction — pool filtré correct, exclusion ORG, bornes de dates inclusives, **égalité de compte avec `get_filtered_object_ids` pour les mêmes filtres** (cohérence dashboard ↔ Explorer), complétude : objet complet = 100, objet vide = score plancher attendu, critère non applicable retiré du dénominateur.
- **Jest** : fonctions pures (sérialisation `buildRpcParams` étendue, mappings drill-down par widget, `mapDashboardFiltersToExplorer`) + rendu des nouveaux composants (3 états + clic drill).
- **Live** : après chaque lot SQL, comparaison manuelle dashboard vs Explorer sur 2-3 jeux de filtres ; EXPLAIN sur les nouvelles RPC si latence perçue.

---

## 7. Phasage — 6 lots livrables indépendamment

| Lot | Contenu | SQL | Dépend de |
|---|---|---|---|
| **0 — Socle** | onglets + React Query + états erreur/vide/chargement + re-homing des 5 widgets existants | aucun | — |
| **1 — Filtres** | groupe « Filtres avancés » (clés existantes) + drill-down + pont Explorer | aucun | Lot 0 |
| **2 — Qualité** | complétude (RPC + widget + scorecard `avg_completeness`) + fiches à problème | 2 fonctions | Lot 0 |
| **3 — Offre** | capacités + saisonnalité + profil de l'offre | 3 fonctions | Lot 0 |
| **4 — Activité** | vélocité (+ publications) + contributeurs + modération | 3 fonctions | Lot 0 |
| **5 — Extensions résolveur** | `publisher_org_any` (+ UI select/« Ma base ») et `classification_schemes_any` (drill DistinctionOverview) | résolveur + tests | indépendant, peut glisser |

Les lots 2/3/4 sont permutables ; l'ordre proposé suit la priorité d'usage (l'équipe SIT au quotidien d'abord).

---

## 8. Écarté / différé

- **Persistance des filtres dans l'URL + vues sauvegardées** : écarté au cadrage (décision n°2).
- **Carte choroplèthe des communes** : hors périmètre — la distribution tabulaire suffit ; à reconsidérer si demande.
- **Mocks démo pour les nouveaux widgets** : non écrits (principe « real DB data ») ; état vide en mode démo.
- **Visibilité inter-ORG des stats contributeurs** : à revoir quand le multi-ORG réel arrivera (aujourd'hui une seule équipe).
- **UI Explorer du filtre `publisher_org_any`** : la clé SQL sera disponible, l'UI Explorer est un suivi séparé.
- **Sparkline 12 semaines d'actualisation** (`weekly_rates`, null depuis Phase 2A) : reste null — la vélocité du lot 4 couvre le besoin de tendance temporelle.
