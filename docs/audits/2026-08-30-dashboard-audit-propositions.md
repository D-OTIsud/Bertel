# Audit Dashboard — état des lieux et propositions (2026-08-30)

**Périmètre :** `/dashboard` (`src/views/DashboardPage.tsx`), RPC `api.get_dashboard_*`, registre `metric_snapshot`.
**Méthode :** lecture du code live (worktree `claude/dashboard-audit-c2dead`), specs de référence (`docs/superpowers/specs/2026-06-11-dashboard-statistics-design.md`, `2026-06-18-dashboard-timeseries-observatory-design.md`), vérifications SQL sur la base LIVE ce jour.

---

## 1. État des lieux vérifié (live, 30/08/2026)

### Livré et fonctionnel
- **3 onglets** (Qualité / Offre / Activité), héros ScorecardStrip permanent, filtres = FiltersPanel Explorer complet (instance indépendante, §180) + période `updated_at`, drill-down par type/commune sur les 4 widgets tableaux.
- **6 RPC stats live** : scorecards, type_breakdown, city_distribution, actualisation, completeness, distinction_overview — toutes via `get_filtered_object_ids` (cohérence Explorer garantie).
- **Widgets** : Qualité = TypeBreakdown + CompletenessTable + ActualisationTable ; Offre = CommuneDistribution + DistinctionOverview ; Activité = **placeholder** (« arrivent dans un prochain lot (lot 4) »).

### Conçu, validé en cadrage, jamais construit
| Chantier | Spec | État |
|---|---|---|
| Fiches à problème (`get_dashboard_quality_gaps`) | §58 lot 2 | RPC absente |
| Capacités / Saisonnalité / Profil de l'offre | §58 lot 3 | 3 RPC absentes, stubs front qui `throw` |
| Vélocité / Contributeurs / Modération | §58 lot 4 | 3 RPC absentes, onglet placeholder |
| `publisher_org_any` + `classification_schemes_any` | §58 lot 5 | résolveur non étendu |
| Frontend séries temporelles (TimeseriesChart, YoY) | §100 B2 | RPC lecture **LIVE**, zéro consommateur |
| Séries dérivées rétroactives (`get_dashboard_timeseries`) | §100 B1 | absente |
| Cycle de vie CRM (temps net) | §100 B3 | absente (le module CRM tâches est arrivé entre-temps) |

### Réalité des données (change les plans)
- **Corpus** : 851 objets non-ORG — **843 publiés, 1 draft, 7 archivés**. (Le corpus a basculé quasi intégralement en publié depuis juin : 479 drafts → 1.)
- **`metric_snapshot` : 73 jours de snapshots quotidiens** (19/06 → 30/08), 3 512 lignes, 7 métriques (complétude globale + par type, corpus global/type/statut, classés global/commune, durabilité, accessibilité, backlog CRM). Le cron tourne. **Aucune UI ne lit ce registre.**
- **`pending_change` : 0 ligne depuis toujours.** La modération n'est pas utilisée (le flux réel passe par le CRM et l'édition directe).
- **CRM** : 3 144 interactions (170 `planned`, 2 974 `done`) + module tâches (`crm_task`, `crm_task_assignee`) actif.
- **Capacités** : `object_room_type` **VIDE** (0 objet) ; `object_capacity` : `max_capacity` sur 557 objets (Σ 5 162 personnes), `seats` sur 90 RES (Σ 5 732 couverts).
- **Saisonnalité** : `opening_period` sur 138 objets (~16 % du corpus) ; FMA = 1 (archivé) ; ITI = 0.
- **Activité** : `object_version` 3 960 lignes, 3 éditeurs actifs sur 90 j, `published_at` sur 490 objets.
- **ORG** : 2 organisations (multi-ORG devenu réel depuis la spec, qui n'en comptait qu'une).

### Anomalies constatées (au-delà du « pas fini »)
1. **La carte d'attention du héros ment.** « Demandes en cours » compte `pending_change.status='pending'` (= 0, table vide depuis toujours) et affiche « À jour » avec un CTA vers `/crm` — alors que le CRM contient 170 interactions planifiées et des tâches ouvertes. Étiquette CRM + métrique modération = mismatch sémantique.
2. **`below_80` transite mais n'est jamais rendu.** `get_dashboard_completeness` renvoie déjà, par type, la liste `{id, name, score, missing_fields}` des fiches < 80 ; `CompletenessTable` ne l'affiche pas. La donnée « quoi corriger » est payée à chaque requête et jetée.
3. **Le pont « Ouvrir dans l'Explorer » (lot 1, décision de cadrage n°2) a disparu** lors de la refonte §180 (suppression d'`ActiveFilterStrip.tsx` qui le portait).
4. **`avg_processing_days` est mort-né** (dépend de `pending_change`, vide) ; `delta_pct` est calculé mais jamais affiché ; `delta_30d` est masqué quand ≤ 0 (un mois à zéro création n'affiche rien au lieu d'un zéro honnête).
5. **Placeholder avec jargon interne en prod** : « arrivent dans un prochain lot (lot 4) » est visible par tous les utilisateurs.
6. `published_pct` est tautologique avec le statut par défaut (published-only ⇒ toujours 100 %) — non affiché aujourd'hui, à ne pas ressortir tel quel.

---

## 2. Propositions

Effort : S < 1 j · M = 1-3 j · L > 3 j. « SQL » = nouvelle(s) fonction(s) à folder dans `api_views_functions.sql` + manifest + runbook + test CI (invariant deploy-integrity).

### Axe A — Corriger ce qui ment (à faire d'abord)

**A1. Rebrancher la carte « Demandes en cours » sur le CRM réel.** — **S/M, 1 petite RPC**
La carte est le seul élément « actionnable » du héros et elle affiche « À jour » à tort. Remplacer le compteur `pending_change` par un agrégat CRM (interactions ouvertes + tâches à faire), via RPC DEFINER agrégat (doctrine CRM §61 : jamais de PostgREST direct, aucun contenu nominatif — des comptes seulement). Garder `pending_changes` dans le payload pour compat, ajouter `crm_open_items`.
*Justification : une carte d'attention fausse décrédibilise tout le tableau de bord ; le coût est minime.*

**A2. Honnêteté du héros.** — **S, frontend seul**
Afficher `delta_30d` même à 0 (« +0 ce mois ») et exposer `delta_pct` (déjà calculé) en info-bulle ou sous-libellé ; retirer définitivement `avg_processing_days` du contrat d'affichage (mort avec `pending_change`) au profit du temps de traitement CRM quand C3 arrivera.

**A3. Remplacer le placeholder « lot 4 ».** — **S, frontend seul**
Tant que l'axe C n'est pas livré : formulation neutre sans jargon (« Le suivi d'activité arrive prochainement ») ou masquer l'onglet. Un onglet qui ne sert qu'à annoncer du vide est un coût de crédibilité quotidien.

### Axe B — Valoriser l'existant dormant (meilleur ratio valeur/effort)

**B1. Fiches à corriger (v1) : rendre `below_80`.** — **S, frontend seul, 0 SQL**
Sous chaque ligne de `CompletenessTable`, un dépliant « N fiches sous 80 % » listant nom + score + essentiels manquants, chaque item liant vers l'éditeur (`/objects/[id]/edit`). La donnée est **déjà dans la réponse RPC**.
*Justification : c'est l'action quotidienne n°1 de l'équipe SIT (« quelles fiches corriger en premier ») ; aujourd'hui le dashboard donne le score mais cache les coupables.*

**B2. Séries temporelles (v1) : consommer `metric_snapshot`.** — **M, frontend seul, 0 SQL**
73 jours de données quotidiennes dorment ; les RPC de lecture `get_metric_snapshot_series` / `get_metric_snapshot_yoy` sont **déjà déployées**. Livrer le trio spécifié en §100 : hook `useDashboardTimeseries` + composant `TimeseriesChart` mutualisé + widgets :
- Qualité : « Remplissage dans le temps » (global + par type via `scope='type'`) ;
- Offre : « Corpus dans le temps » (par type/statut) + « Objets classés » (global/commune) ;
- Activité : « Backlog CRM dans le temps ».
Le toggle YoY s'activera mécaniquement quand une 2e année existera (2027).
**Contrainte d'honnêteté à porter dans le cadre du widget** : les snapshots sont figés **globalement** — ils n'obéissent pas au panneau de filtres (sauf le grain type/commune capturé). Mention « série globale, indépendante des filtres » dans le WidgetFrame.
*Justification : c'était l'exigence PO explicite de §100 (« valoriser le travail de l'ORG mois après mois ») ; le backend a été payé, il ne manque que l'affichage. Chaque mois qui passe sans UI est un mois où personne ne voit la courbe monter.*

**B3. Rétablir le pont « Ouvrir dans l'Explorer ».** — **S, frontend seul**
Bouton sur la barre de filtres actifs du dashboard. Depuis §180 les deux états sont des instances du **même** `createExplorerStore` : le mapping n'est plus une traduction mais une copie d'état (instance dashboard → singleton Explorer) + `router.push('/explorer')`. Seule la période `updated_at` est droppée (honnêtement, elle n'existe pas dans le vocabulaire Explorer).
*Justification : décision de cadrage n°2 actée et déjà livrée une fois (lot 1) — c'est une régression de la refonte §180, pas un nouveau besoin.*

### Axe C — Onglet Activité réel (lot 4 re-scopé sur les données vraies)

**C1. Vélocité.** — **M, 1 RPC SQL**
Créations vs modifications par semaine (12 semaines) + publications par mois, depuis `object.created_at` / `object_version` (3 960 lignes) / `published_at` (490). Contrat `VelocityWeek_PROVISIONAL` déjà écrit dans `types/dashboard.ts`.

**C2. Contributeurs.** — **M, 1 RPC SQL**
Modifications par utilisateur (`object_version.created_by` → `app_user_profile`), types principaux, tendance vs période précédente. Garde-fou spec §58 conservé : agrégats et noms seulement, jamais le contenu des versions.

**C3. Activité CRM (remplace le widget « Modération » de la spec).** — **M, 1 RPC SQL**
**Ajustement justifié par les données** : `pending_change` = 0 ligne depuis toujours ⇒ le widget modération spécifié serait mort-né. Le flux de travail réel est le CRM : nouvelles/résolues par mois, backlog, répartition par sujet, tâches par statut/assigné (module `crm_task` arrivé depuis la spec). Même doctrine §61 (RPC DEFINER agrégat).
La brique B3 de §100 (statut `awaiting_provider` + journal de transitions → temps de traitement **net**) reste le raffinement ultérieur ; ne pas la bloquer, ne pas l'attendre.

### Axe D — Onglet Offre complété (lot 3 ajusté aux sources réelles)

**D1. Capacité d'accueil.** — **M, 1 RPC SQL**
**Ajustement justifié** : la spec §58 fondait les « lits touristiques » sur `object_room_type` (total_rooms × capacity_adults) — table **vide** (0 objet). Les sources réelles sont `object_capacity` : `max_capacity` (557 hébergements, 5 162 personnes) et `seats` (90 RES, 5 732 couverts). Widget : personnes hébergeables (HEB), couverts (RES), **avec taux de renseignement affiché** (« 557/643 hébergements renseignés ») pour que le chiffre ne se fasse pas passer pour exhaustif. MICE (`object_meeting_room`) et km d'itinéraires : n'afficher la ligne que si la source est non vide (ITI = 0 aujourd'hui).
*Justification : chiffre-clé d'observatoire pour direction/élus (« combien de lits sur le territoire »), donnée majoritairement présente.*

**D2. Profil de l'offre.** — **M, 1 RPC SQL**
Jauges : % PMR (par type de handicap), % engagés durabilité (22 objets — le montrer, c'est aussi montrer la marge de progrès), langues parlées, animaux acceptés. Sources = les mêmes caches que les filtres Explorer (`cached_amenity_codes`, classification T&H, sustainability, `cached_language_codes`) ⇒ cohérence filtres/stats garantie par construction.

**D3. Saisonnalité (v1 réduite).** — **M, 1 RPC SQL — à faire en dernier de l'axe**
`opening_period` ne couvre que 138 objets (16 %) et FMA = 0 actif. v1 : courbe « objets ouverts par mois » **avec le dénominateur affiché** (« sur 138 fiches aux horaires renseignés ») ; le volet événements reste en état vide honnête jusqu'à l'arrivée de FMA.
*Justification du report partiel : montrer une saisonnalité qui semble couvrir le territoire alors qu'elle en couvre 16 % induirait les élus en erreur — le widget n'a de valeur qu'avec son taux de couverture, et sa valeur croît avec la saisie des horaires (§151).*

### Axe E — Extensions résolveur (lot 5, devenu plus pertinent)

**E1. `publisher_org_any` + raccourci « Ma base ».** — **M, résolveur + tests**
La spec le classait en dernier car une seule ORG existait ; il y en a **2** aujourd'hui et l'équipe multi-ORG est active. Clé dans `get_filtered_object_ids` (EXISTS sur `object_org_link`, colonne qualifiée — invariant §55), bénéfice partagé avec l'Explorer.

**E2. `classification_schemes_any`.** — **S/M, résolveur + tests**
Débloque le drill-down de DistinctionOverview (« tout objet distingué du scheme X ») — seul widget actuel sans drill-down.

### Axe F — Compléments qualité

**F1. Fiches à problème (v2) : RPC `get_dashboard_quality_gaps`.** — **M, 1 RPC SQL**
Compteurs d'absences cliquables (photo, contact, géoloc, description, horaires, taxonomie) avec panneau-liste nominatif → éditeur. **Ajustement** : retirer les « brouillons dormants » de la spec (1 seul draft live — critère vidé de sens depuis la publication de masse).
*Justification : l'Explorer ne sait pas filtrer sur l'ABSENCE d'un champ — le dashboard est la seule surface qui puisse porter cette vue. Complète B1 (B1 = vue par score, F1 = vue par critère).*

---

## 3. Ordre recommandé

| # | Proposition | Effort | SQL | Gain |
|---|---|---|---|---|
| 1 | A1 carte CRM + A2 héros + A3 placeholder | S | 1 mini-RPC | arrêt des affichages faux |
| 2 | B1 fiches < 80 | S | 0 | actionnabilité immédiate |
| 3 | B3 pont Explorer | S | 0 | régression réparée |
| 4 | B2 séries temporelles | M | 0 | 73 j de données enfin visibles |
| 5 | C1+C2+C3 onglet Activité | M/L | 3 RPC | supprime le placeholder |
| 6 | D1+D2 (puis D3) offre | M/L | 3 RPC | vocation observatoire |
| 7 | F1 quality gaps | M | 1 RPC | pilotage qualité complet |
| 8 | E1+E2 résolveur | M | résolveur | multi-ORG + drill distinctions |

Étapes 1-4 = **frontend quasi pur** (une seule mini-RPC), livrables en un lot court ; chaque étape suivante est un lot indépendant conforme au phasage §58.

## 4. Invariants à respecter (rappel projet)
- Toute nouvelle RPC : fold `api_views_functions.sql` + manifest + `SQL_ROLLOUT_RUNBOOK.md` + test CI fresh-apply ; DEFINER, GRANT authenticated, pool via `get_filtered_object_ids`, ORG exclu.
- Familles type→catégorie : dérivées de `EXPLORER_TYPE_CODE_FAMILIES`, jamais codées en dur.
- Drill-down : le seul levier type est le **bucket** (`toggleBucket` / `toggleDrilldownType`) — jamais `filters.types` (invariant §180).
- Widgets : `WidgetFrame` avec `isPending` (sémantique React Query v5), 3 états (chargement/erreur+retry/vide) ; pas de mocks pour les nouveaux widgets (état vide honnête en mode démo).
- CRM : agrégats via RPC DEFINER authorize-once uniquement (§61) ; jamais de PII dans les payloads stats.
- Toute métrique de série temporelle faisant foi passe par `metric_snapshot` (le point-in-time n'est pas rembobinable — invariant §100).
