# Dashboard — séries temporelles / Observatoire (évolution dans le temps)

> Date : 2026-06-18 · Auteur : brainstorming (Claude) + cadrage PO (d.philippe) + vérif live.
> Statut : **conception validée, non implémentée.**
> Companion : la **définition du calcul de complétude** vit dans
> `docs/superpowers/specs/2026-06-18-completude-par-type-design.md` (passe parallèle PO).
> Cette spec NE redéfinit PAS la complétude — elle la **consomme**.
> À cross-référencer dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` à l'atterrissage.

---

## 0. Objectif produit

Donner au dashboard une dimension **temporelle** (« mois après mois ») qui **valorise le travail
de l'ORG** et sert les trois vocations déjà actées en §58 : pilotage qualité (équipe SIT),
observatoire de l'offre (direction/élus), suivi d'activité (managers).

Inspiration directe : le tableau Berta/Google-Sheets fourni par le PO (remplissage, demandes en
cours/traitées, temps de traitement, classés par commune, ouvertures/fermetures, établissements
vs inscrits en SIT, % hébergements classés).

**Toute la statistique existante (§58) est instantanée.** Cette spec ajoute l'axe du temps.

---

## 1. Constat de disponibilité de la donnée (vérifié live, 2026-06-18)

État live : 840 objets non-ORG (361 publiés, 479 draft) · 194 objets classés (`granted`) ·
20 objets avec action durabilité · CRM = 3 141 interactions (2016→2026), **toutes `type=note`,
statut `done`/`planned`**, `first_response_at` 100 % NULL, `resolved_at` sur 1 251/3 141.
**Aucune table d'historique de transitions de statut.** `object` n'a ni `archived_at` ni `closed_at`.

| Métrique (mockup Berta) | Source | Verdict |
|---|---|---|
| Nouvelles requêtes / mois | `crm_interaction.occurred_at` | ✅ dérivable rétroactif |
| Demandes traitées / mois | `resolved_at` | ✅ dérivable (fiable quand `resolved_at` saisi) |
| Demandes en cours (backlog) | créées ≤ M ET non résolues à M | ✅ dérivable des 2 timestamps |
| Établissements classés / commune | `object_classification(granted).awarded_at` × `ref_commune` | ✅ dérivable rétroactif |
| % hébergements classés | HEB classés / total HEB | ✅ dérivable |
| Ouvertures / mois | `object.created_at` / `published_at` | ✅ dérivable rétroactif |
| Temps de traitement **brut** | `resolved_at − created_at` | ✅ dérivable |
| Croissance corpus par catégorie | `object.created_at` + familles Explorer | ✅ dérivable rétroactif |
| Taux de publication | `published_at` | ✅ dérivable |
| % durable / % accessibilité | `object_sustainability_action.created_at` / amenity accessibilité | ✅ dérivable |
| **% complétude** | *aucune date stockée* | 🟡 **snapshot forward** (consomme la fn complétude) |
| **% visites terrain** | `interaction_type='visit'` | 🟡 type existe, 0 utilisé → dérivable dès l'usage, pas rétroactif |
| **Fermetures / mois** | passage `published`→`archived`/`hidden` | 🟠 dérivable de l'audit `object_version` (depuis mars 2026) |
| **Temps de traitement NET** (moins attente prestataire) | durée passée en statut « attente prestataire » | 🔴 **capture nouvelle** (statut + journal de transitions) |

**Point structurant.** Les courbes riches de Berta viennent de son **usage opérationnel**. Bertel a
les *champs* mais ses données CRM importées sont des notes plates → ces courbes deviennent vraies
**au fur et à mesure de l'usage** du CRM avec le bon vocabulaire de statuts. On ne fabrique rien.

**Arbitrage PO acté.** Le « total établissements » n'est PAS un chiffre externe (CCI/INSEE) : ce sont
des **totaux internes par macro-catégorie**. → la courbe « Établissements VS inscrits en SIT »
devient *total objets (tous statuts) vs publiés/diffusés*, déclinée par catégorie. **Aucune table
externe.**

---

## 2. Macro-catégories (source unique = familles Explorer)

Réutilisation de `EXPLORER_TYPE_CODE_FAMILIES` / `EXPLORER_BUCKET_OPTIONS`
(`bertel-tourism-ui/src/utils/facets.ts`) — **jamais de mapping type→famille codé en dur** (invariant
« single registry »). Côté SQL, le découpage est dérivé du même tableau, exposé une seule fois.

| Catégorie | Types | Live |
|---|---|--:|
| Hébergements | HOT·HPA·HLO·CAMP·RVA | 483 |
| Restauration | RES | 135 |
| Activités | ACT·LOI | 156 |
| Itinéraires | ITI | 0 |
| Événements | FMA | 0 |
| Visites / POI | PCU·PNA·VIL·PRD | 38 |
| Services | COM·PSV·ASC·SPU | 25 |

« Établissements commerciaux » = Hébergements ∪ Restauration ∪ Activités ∪ Producteurs(PRD via VIS) —
agrégat d'affichage construit à partir des buckets, défini une seule fois.

---

## 3. Architecture — 3 briques indépendantes

### Brique 1 — `api.get_dashboard_timeseries` *(dérivée, rétroactive, zéro stockage)*

RPC `SECURITY DEFINER`, `STABLE`, gated lecture comme le reste du dashboard (objets non-ORG ;
respecte le périmètre publisher quand le résolveur `publisher_org_any` du lot 5 arrivera — d'ici là
global). Retourne des points `(bucket_date, series_key, breakdown_key, value, denominator)` en
**format long** (un seul contrat pour tous les graphiques ; le front pivote).

Paramètres :
- `p_from date`, `p_to date` (bornes inclusives ; défaut = min(created_at) → mois courant)
- `p_grain text` ∈ `month` (défaut) `| week | day` — `date_trunc`
- `p_metrics text[]` — sélection des séries à calculer (perf : ne calcule que le demandé)
- `p_breakdown text` ∈ `none | category | type | commune` selon la métrique

Séries produites :
- `corpus_count` (cumulatif) — breakdown `category|type` — `object.created_at`
- `published_rate` — `published_at` vs total
- `openings` / `closures` — `created_at`/`published_at` ; closures dérivées de l'audit (cf. §5)
- `classified_count` (cumulatif) — breakdown `commune` — `object_classification(granted).awarded_at`
- `heberg_classified_rate`
- `sustainability_rate` / `accessibility_rate`
- `crm_new` / `crm_resolved` / `crm_backlog` (à M) / `crm_processing_days_raw`
- `crm_by_topic` / `crm_by_sentiment` (breakdown `demand_topic` / `request_sentiment`)
- `field_visits` (`interaction_type='visit'`)

**Contrat d'honnêteté #1** : le cumul par date de création **approxime l'état net** (ignore
suppressions/révocations, rares) ; documenté dans le SQL et affiché en note de bas de widget.
**Contrat d'honnêteté #2** : `crm_resolved`/`crm_processing_days_raw` ne couvrent que les interactions
avec `resolved_at` saisi ; les notes importées sans cycle de vie ne sont pas comptées comme « traitées ».

### Brique 2 — `metric_snapshot` + job pg_cron mensuel *(forward, exact ; dépend de la passe complétude)*

Table générique long-format — **aucun DDL pour de futures métriques** :

```
metric_snapshot(
  id uuid pk default gen_random_uuid(),
  snapshot_date date not null,
  scope text not null,          -- 'global' | 'type' | 'category' | 'commune'
  scope_key text,               -- ex. 'HLO', 'Le Tampon' ; null pour 'global'
  metric_key text not null,     -- ex. 'completeness_avg'
  value numeric not null,
  denominator integer,
  captured_at timestamptz not null default now(),
  unique (snapshot_date, scope, scope_key, metric_key)
)
```

Job `api.capture_metric_snapshots()` (modèle `refresh_open_status` ; `gen_random_uuid()`, pas
`uuid_generate_v4()` — invariant search_path), planifié `cron.schedule('capture-metric-snapshots',
'0 3 1 * *', …)` (1er du mois). Idempotent via la clé unique (`on conflict do update`).

**Dépendance externe (bloquante pour P2)** : la complétude est calculée par la passe
`2026-06-18-completude-par-type-design.md`. Le job **appelle** la fonction/vue qu'elle exposera
(p. ex. `api.object_completeness(...)` → ratio par objet, agrégé par type/global ici). Cette spec ne
fixe NI la formule NI les seuils — seulement l'interface consommée :
> entrée attendue = un ratio de complétude par objet (0–1 ou 0–100), agrégeable par `object_type`.

Tant que la fn n'existe pas, P2 peut snapshoter d'autres métriques d'état net (cf. §4 point ouvert)
mais sa raison d'être principale (complétude) reste en attente.

### Brique 3 — Cycle de vie CRM + journal de transitions *(forward)*

- Étendre l'enum de statut de `crm_interaction` (type à confirmer au plan — la colonne est
  `USER-DEFINED`, valeurs live `done`/`planned`) aux statuts opérationnels :
  `new`, `in_progress`, **`awaiting_provider`**, `resolved`, `closed` (les `done`/`planned` importés
  sont remappés/conservés — décision de migration à préciser au plan, sans casser les 3 141 lignes).
- Table `crm_interaction_status_event(id, interaction_id fk, from_status, to_status, changed_at,
  changed_by)` alimentée par un **trigger** `AFTER UPDATE OF status ON crm_interaction`.
- Débloque `crm_processing_days_net` = `(resolved_at − created_at) − Σ(durée en awaiting_provider)`,
  exposé comme série supplémentaire de Brique 1 une fois le journal peuplé.
- **Forward-only** : précis pour les interactions vivant leur cycle après go-live ; documenté.
- RLS : `crm_interaction_status_event` suit la doctrine CRM (§61) — accès via RPC DEFINER
  authorize-once, jamais en PostgREST direct ; familles par commande.

---

## 4. Frontend — répartition dans les onglets existants (§58)

Décision PO : **répartir par thème** dans les onglets actuels (pas d'onglet dédié).

| Onglet | Widgets temporels |
|---|---|
| **Activité** (placeholder « lot 4 » aujourd'hui) | demandes en cours / traitées / nouvelles, temps de traitement (brut→net), interactions par sujet & par sentiment, visites terrain |
| **Qualité** | % complétude dans le temps, objets classés (global + par commune), % hébergements classés, % durable, % accessibilité |
| **Offre** | croissance corpus par catégorie, taux de publication, ouvertures vs fermetures |

Implémentation : un hook `useDashboardTimeseries(metric, params)` (React Query, modèle
`useDashboardQuery`), un composant `TimeseriesChart` réutilisable (ligne/aire/barres groupées),
`WidgetFrame` existant (états chargement/erreur+retry/**vide**). **Pas de mocks** — `mock-dashboard.ts`
n'est pas étendu pour ces widgets (principe « real DB data », états vides honnêtes quand 0 donnée,
ex. itinéraires/événements à 0). Granularité mensuelle par défaut, sélecteur de période réutilisant
les bornes `p_updated_at_from/to` déjà présentes.

---

## 5. Fermetures / clôtures (détail)

Pas de champ `closed_at`. Deux options :
- **Retenue (P1)** : dériver de l'audit — compter les versions `object_version` où `status` passe de
  `published` à `archived`/`hidden`, par mois. Rétroactif depuis le début du versioning (mars 2026).
- **Raffinement (différé)** : colonne `closed_at`/`archived_at` posée par le trigger de changement de
  statut (propre, mais non rétroactif). À ajouter seulement si l'audit-dérivé s'avère insuffisant.

---

## 6. Phasage (chaque phase livrable seule)

- **P1 — Brique 1 + frontend** : tous les graphiques dérivables, rétroactifs. Valeur immédiate, aucun
  schéma nouveau. Closures via audit.
- **P2 — Brique 2** : `metric_snapshot` + cron mensuel. **Gated** sur la passe complétude parallèle.
- **P3 — Brique 3** : cycle de vie CRM + journal de transitions → temps NET + flux CRM par statut.

---

## 7. Invariants & contraintes (CLAUDE.md)

- **Deploy integrity** : toute DDL (P2/P3) → migration foldée dans `schema_unified.sql` + manifest +
  `SQL_ROLLOUT_RUNBOOK.md` + gate fresh-apply. Ids manifest : série 8 pleine (8z pris) → continuer en
  `14x`.
- **search_path restreint** : `gen_random_uuid()` dans les fonctions/jobs, jamais `uuid_generate_v4()`.
- **RLS** : prédicats wrappés `(select …)` (§39) ; pas de scan whole-catalog dans un hot path (§ hot-path) ;
  set-based pour tout périmètre utilisateur.
- **CRM** : tables crm_* verrouillées PostgREST ; accès via RPC DEFINER authorize-once (§36/§61).
- **Single registry** : familles type→catégorie dérivées des familles Explorer, jamais codées en dur.
- **No write-trap / honnêteté** : widgets à 0 donnée → état vide explicite, pas de mock.

---

## 8. Tests

- SQL : `tests/test_dashboard_timeseries.sql` (BEGIN/ROLLBACK ; asserts sur séries dérivées vs comptages
  directs ; perf chemin chaud). P2 : test du job idempotent. P3 : test trigger + calcul net sur un
  cycle simulé.
- Front : TDD — `useDashboardTimeseries`, `buildTimeseriesParams`, `TimeseriesChart` (états), pivot
  long→série. Cohérence live (échantillon) comme en §58.

---

## 9. Points ouverts / différés

1. **Placement précis & maquette** des widgets dans chaque onglet (lot 4 « Activité » à matérialiser).
2. **Snapshot d'état net des % de couverture** en P2 (capte révocations/suppressions) : à décider —
   la dérivée suffit-elle ? *(le PO traite la complétude en parallèle ; à arbitrer avec lui en P2.)*
3. **Interface exacte de la fn complétude** (nom, signature, échelle) — fixée par la passe complétude.
4. **Remap des statuts CRM importés** (`done`/`planned` → nouveau vocabulaire) — détail de migration P3.
5. **Périmètre publisher** des séries — global jusqu'au résolveur `publisher_org_any` (lot 5).
6. **Granularité par défaut** confirmée mensuelle ; quotidien/hebdo dispo via `p_grain` si besoin.
