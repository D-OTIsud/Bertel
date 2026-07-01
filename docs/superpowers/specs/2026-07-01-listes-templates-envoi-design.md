# Listes & templates d'envoi — Design

**Date:** 2026-07-01
**Statut:** design en revue (avant plan d'implémentation)
**Source design:** projet claude.ai/design `019e20ac-a4f0-74eb-971b-27b681d02941` → `Listes et Templates.html` (+ sources `lists-app.jsx`, `lists-manage.jsx`, `lists-compose.jsx`, `lists-data.jsx`, `oti-templates.jsx`, `lists.css`)

---

## 1. Objectif & besoin

Permettre à un conseiller OTI de transformer une **sélection** ou un **jeu de filtres** de l'Explorer en une **liste** qu'il curate (mot d'intro, ordre, notes), puis **imprime / envoie par email / partage par lien**, rendue dans un habillage public brandé OTI.

Deux natures de liste, demandées explicitement par le PO :

- **Liste STATIQUE** — figée à partir d'une **sélection active** de l'Explorer (`selectedObjectIds`). L'ensemble d'objets ne change plus, sauf édition manuelle.
- **Liste DYNAMIQUE** — issue des **filtres actifs**. On sauvegarde les critères ; à chaque accès/impression/ouverture du lien, la liste est **ré-évaluée** pour contenir **tous les objets qui matchent les filtres, même ceux ajoutés plus tard**.

Les deux se composent et se rendent avec la **même** UI (3 vues) et les **mêmes** canaux.

### Décisions produit validées (PO, 2026-07-01)

1. **Canaux v1 : les trois, avec email réel** — Email (SMTP à câbler), PDF/impression, Lien web.
2. **Lien public : par token, SANS nom du destinataire** — page lisible par toute personne ayant le lien, **objets publiés uniquement**, expiration optionnelle, aucune PII destinataire exposée.
3. **Périmètre : statique + dynamique ensemble** dès la première livraison.

---

## 2. Terminologie & alignement modèle

| Design (mock) | Réalité Bertel |
|---|---|
| POI | `object` (établissement / lieu / entité touristique) publié |
| `code` (HEB/RES/ASC/ITI/VIS/EVT) | `object_type` / bucket Explorer |
| `note_fr`/`note_en` d'un POI | **note propre à la liste** (commentaire « coup de cœur » du conseiller pour CETTE liste) → stockée sur l'item de liste, PAS sur l'objet |
| Agent (Delphine Grondin) | l'utilisateur connecté (rôle `tourism_agent` / `super_admin`) + son ORG |
| `for_fr` (destinataire) | `recipient_label` (texte libre, PII — jamais exposé sur la page publique) |

Le module s'appelle **« Listes »** (route `/listes`), dans la lignée du naming FR maison.

---

## 3. Modèle de données

Deux tables neuves dans `public`, verrouillées en PostgREST (accès via RPCs DEFINER authorize-once — pattern CRM §61). Tokens via `gen_random_uuid()` (search_path restreint — invariant CLAUDE.md).

### 3.1 `object_list`

```
id                uuid  PK  default gen_random_uuid()
org_object_id     text  NOT NULL  references object(id)      -- ORG propriétaire (object.id est TEXT, ex. 'ORGRUN…')
created_by        uuid  NOT NULL                              -- auth.uid() de l'auteur
kind              text  NOT NULL  check (kind in ('static','dynamic'))
name              text  NOT NULL
name_en           text
recipient_label   text                                        -- « Camille & Yann » (PII, jamais public)
intro_fr          text
intro_en          text
template          text  NOT NULL default 'carnet'  check (template in ('carnet','grille','itineraire'))
accent            text  NOT NULL default 'teal'    check (accent in ('teal','green','gold','terra'))
lang              text  NOT NULL default 'fr'      check (lang in ('fr','en'))
cover_url         text                                        -- image de couverture (sinon dérivée du 1er item)
show_map          boolean NOT NULL default false
status            text  NOT NULL default 'draft'  check (status in ('draft','sent','shared'))
-- Dynamique uniquement :
filters           jsonb                                       -- payload RPC-ready (voir §5) — source de résolution
filters_url       text                                        -- URL Explorer sérialisée (re-hydratation UI + résumé lisible)
-- Partage public :
share_token       text  UNIQUE                                -- token non devinable (nullable tant que non partagé)
share_enabled     boolean NOT NULL default false
share_expires_at  timestamptz                                 -- expiration optionnelle
last_sent_at      timestamptz
created_at        timestamptz NOT NULL default now()
updated_at        timestamptz NOT NULL default now()

check (kind = 'static'  or filters is not null)               -- une liste dynamique porte des critères
```

Index : `(org_object_id)`, `(created_by)`, `unique(share_token) where share_token is not null`.

### 3.2 `object_list_item` (membres d'une liste STATIQUE)

```
id         uuid PK default gen_random_uuid()
list_id    uuid NOT NULL references object_list(id) on delete cascade
object_id  text NOT NULL references object(id)      on delete cascade   -- object.id est TEXT
position   int  NOT NULL
note_fr    text
note_en    text
unique(list_id, object_id)
```

Index : `(list_id, position)`.

**Décision de périmètre — dynamiques sans overlay en v1.** Une liste dynamique n'a **pas** d'`object_list_item` : sa composition est 100 % résolue live depuis `filters`. Conséquence assumée : pour une liste dynamique, l'UI de composition n'autorise **pas** le réordonnancement/retrait item-par-item ni les notes par item (elle affiche les lieux résolus en lecture, avec le résumé des filtres et « se met à jour automatiquement »). Un overlay dynamique (notes/pin/exclude keyés `(list_id, object_id)` sur une liste dynamique) est un **enrichissement différé** — voir §11. Cela évite de casser le sens « toujours à jour » et garde la v1 tractable (YAGNI).

---

## 4. Sécurité & RLS

Tables **RLS ON**, familles admin par-commande (pas de `FOR ALL` — invariant CLAUDE.md), **aucune** policy membership directe pour l'app : tout passe par des RPCs `SECURITY DEFINER` authorize-once (§36/§61).

- **Lecture propriétaire** (compose/manage) : membres de l'ORG `org_object_id`.
- **Écriture** : `created_by = auth.uid()` **OU** admin de l'ORG **OU** superuser. (Aligné sur `write_crm` / rôles agent.)
- **Résolution des objets** (statique et dynamique) : côté propriétaire, on lit les cartes via les RPC existants ; **jamais** de fuite de drafts d'autres ORG.
- **Page publique (anon)** : un **unique** RPC anon `api.get_public_list_by_token(p_token)` :
  - valide `share_enabled = true` ET (`share_expires_at is null OR share_expires_at > now()`) ET token exact ;
  - résout les items en **objets publiés uniquement** (jamais draft/hidden/archived), quelle que soit la nature de la liste ;
  - **n'émet aucune PII destinataire** (`recipient_label` exclu) ;
  - renvoie `[]`/`not_found` si token invalide/expiré/désactivé (pas de distinction observable → pas d'oracle).
  - `GRANT EXECUTE ... TO anon` ; c'est la **seule** fonction de la famille exposée à anon.

`filters` jsonb n'est **jamais** concaténé en SQL : il alimente uniquement les paramètres liés du moteur de filtre existant (paramétré). Le token est ≥ 128 bits (`gen_random_uuid()` ou `encode(gen_random_bytes(24),'base64url')` si `pgcrypto` dispo dans le search_path — sinon deux uuid concaténés).

---

## 5. Résolution des listes dynamiques (le cœur)

L'Explorer résout déjà tout via la RPC DB `api.list_object_resources_filtered_page(p_filters, p_types, p_search, …)` — **le moteur de filtre vit dans la base**, le frontend ne fait que mapper `ExplorerFilters` → ce payload (`buildBucketRpcFilters` + `getEffectiveBackendTypesForBucket`, per-bucket).

**Stockage (source unique de résolution).** À la création d'une liste dynamique, le frontend persiste le **payload RPC-ready déjà calculé**, par bucket sélectionné :

```jsonc
filters = {
  "buckets": [
    { "types": ["HOT","..."], "filters": { /* p_filters jsonb */ }, "search": "…" },
    …
  ],
  "search": "texte global éventuel"
}
```

`filters_url` (URL Explorer via `buildSearchParams`) est stocké **en plus**, uniquement pour re-hydrater l'Explorer (« Ouvrir dans l'explorateur ») et comme résumé lisible — **jamais** pour la résolution.

**Résolveur DB unique.** Le moteur de filtre vit déjà dans le leaf `api.get_filtered_object_ids(p_filters jsonb, p_types object_type[], p_status object_status[], p_search text) → (object_id text, label_rank, label_match, relevance)` (DEFINER ; honore `p_status`). On écrit un helper ensembliste `api.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean, p_limit int)` qui, pour chaque bucket stocké, appelle `get_filtered_object_ids` avec `p_status = ARRAY['published']` (quand `p_published_only`), UNION les `object_id`, et borne (**plafond documenté**, ex. 200 objets — `ponytail:` ceiling, upgrade = pagination). **Zéro duplication** du prédicat : une seule implémentation (`get_filtered_object_ids`) sert la préview compose, la page publique et l'email. Rendu en cartes via `api.get_object_cards_batch(text[], text[])`.

- Compose (préview propriétaire) : `p_published_only = true` (le lien partagé est published-only ; on montre au conseiller ce que verra le visiteur ; cohérent + stable).
- Page publique / email : `p_published_only = true`.

Si l'extraction du prédicat s'avère lourde, repli acceptable : le résolveur appelle en boucle bornée la RPC paginée existante avec le payload stocké. À trancher en implémentation après lecture du SQL de `list_object_resources_filtered_page`.

---

## 6. RPCs (schéma `api`, DEFINER authorize-once)

**Propriétaire (authenticated) :**

| RPC | Rôle |
|---|---|
| `list_my_lists()` | grille « Mes listes » : id, name, kind, status, item_count, répartition par type, cover, updated, lang, recipient |
| `get_list(p_list_id)` | détail compose : métadonnées + items résolus (statique = membres+notes ; dynamique = live-résolus) au format carte |
| `create_list(p_kind, p_name, p_from_object_ids uuid[], p_filters jsonb, p_filters_url text)` | crée ; statique ⇐ `from_object_ids`, dynamique ⇐ `filters` |
| `update_list(p_list_id, p_patch jsonb)` | name/intro/template/accent/lang/recipient/show_map/cover/status |
| `set_list_items(p_list_id, p_items jsonb)` | remplace les items statiques (reconcile non-destructif, pattern §40) : object_id, position, note_fr/en |
| `delete_list(p_list_id)` | suppression (cascade items) |
| `share_list(p_list_id, p_enable, p_expires_at)` | génère/rote le token, (dé)active le partage, renvoie token + URL |

**Public (anon) :** `get_public_list_by_token(p_token)` (§4).

Types TS définis manuellement dans un service (pas de codegen — convention maison, cf. `src/services/rpc.ts`).

---

## 7. Frontend

### 7.1 Routes

- `/(main)/listes` — le module (auth-gated, rôles `super_admin`, `tourism_agent`). Trois vues (comme le mock) : **Manage** (grille) → **Compose** (édition + aperçu live) → **Render** (plein écran + canal + langue + bouton d'action).
- `/l/[token]` — **page publique** hors `(main)` (layout propre, pas d'auth). SSR via `get_public_list_by_token`. Rend `OtiTemplate` (published-only, sans PII).

### 7.2 Portage du design

Composants portés dans la stack maison (tokens `--teal`/`--surface`/`--font-display`/`--ink-*`… déjà partagés — le mock les réutilise), primitives UI existantes (modales, ConfirmDialog, switch, toggles) plutôt que le CSS du mock recopié :

- `features/lists/` : `ListsManage`, `ListsCompose`, `RenderView`, `ComposeItem` (drag-reorder), palette d'ajout.
- `OtiTemplate` (carnet / grille / itinéraire) — **isomorphe** : sert l'aperçu compose, la vue render, **la page publique SSR et le HTML email**. Rendu **client** pour le Markdown (jamais de HTML serveur non-sanitizé — invariant descriptions §106) ; la prose des notes/intro reste en texte simple v1.
- Cadres de canal (`ChannelFrame` email/pdf/web) pour l'aperçu.

### 7.3 Points d'accroche Explorer

- **`SelectionBar.tsx`** : nouveau bouton **« Créer une liste »** (à partir de `selectedObjectIds`) → `create_list(kind='static', from_object_ids)` → navigue vers `/listes/{id}` (compose). Le bouton **« Envoyer »** désactivé actuel est remplacé par ce flux (envoi = via le module).
- **Filtres actifs** (`ExplorerActiveFilters` / `FiltersPanel`) : nouvelle action **« Enregistrer comme liste dynamique »** → sérialise les filtres courants (payload RPC + URL) → `create_list(kind='dynamic', filters, filters_url)` → compose.
- La sélection reste indépendante des filtres (comportement store actuel inchangé).

### 7.4 État

TanStack Query pour les lectures (`list_my_lists`, `get_list`) + mutations (create/update/items/share/delete) ; le brouillon de composition est un état local (comme l'éditeur objet), persisté par `update_list` / `set_list_items`. Pas de nouveau store global si évitable.

### 7.5 Nav

Entrée **« Listes »** dans `Sidebar.tsx` (icône `ListChecks`/`Files`), rôles `['super_admin','tourism_agent']`.

---

## 8. Canaux

- **Lien web** : `share_list` → URL `/l/{token}` copiable ; page publique SSR published-only. Révocable (`share_enabled=false`) / expirable.
- **PDF / impression** : feuille de style print + `window.print()` sur la vue render (canal PDF = format A4 du mock). Pas de transcodeur serveur (cohérent avec la limite media/vidéo). Le visiteur comme le conseiller impriment en PDF via le navigateur.
- **Email réel** : route serveur `POST /api/lists/send` (route handler Next), **autorise en tant qu'appelant** (client anon + JWT → `get_list` DEFINER — pattern média §59, jamais la service key pour l'autorisation), rend le HTML email server-side depuis `OtiTemplate`, envoie via **SMTP** (nodemailer, creds `env.server` — provider au choix de l'OTI, UE-friendly ; pas de lock-in), pose `last_sent_at` + `status='sent'`. Adresse destinataire saisie dans la modale d'envoi ; stockage minimal (RGPD). Tie-in CRM (journaliser une interaction) = différé.

---

## 9. RGPD / conformité

- Page publique : published-only, **zéro PII destinataire**, token ≥128 bits, expiration + révocation, réponse indifférenciée sur token invalide.
- `recipient_label` (PII) : stocké pour l'usage interne du conseiller, **jamais** émis par le RPC public.
- Email : autorisation serveur en tant qu'appelant, creds SMTP server-only, adresse validée, pas d'open-relay ; envoi journalisé a minima.
- `filters` jsonb paramétré, jamais interpolé en SQL.
- Cohérent avec l'audit RGPD existant (hébergement UE ; l'email transactionnel choisi doit rester UE).

---

## 10. Tests & vérification

- **SQL** (`tests/test_object_list.sql`) : CRUD ; reconcile items non-destructif ; résolution dynamique **published-only** (un draft matchant n'apparaît PAS) ; token gating (expiré / désactivé / faux → not_found) ; **no-PII** sur le RPC public ; RLS (membre hors-ORG ne lit pas) ; borne du résolveur.
- **Frontend** (Jest/RTL) : create-from-selection, create-from-filters, reducer de compose (reorder/add/remove/notes), rendu des 3 templates FR/EN, flux share, impression.
- Persona/EXPLAIN sur les RPC live ; advisor Supabase clean.
- Fresh-apply gate vert.

---

## 11. Intégrité de déploiement & différés

- **Migration** `Base de donnée DLL et API/migration_object_list.sql` (+ RPCs) — **foldée** dans `schema_unified.sql` / `rls_policies.sql` / `api_views_functions.sql` et **listée au runbook** (invariant deploy-integrity : fresh DB == live). Test CI ajouté.
- Route email `/api/lists/send` : dépendance SMTP (env). Documentée ; sans creds → l'envoi échoue proprement, le reste (lien/PDF) fonctionne.

**Différés (documentés) :**

- Overlay d'annotation/pin/exclude sur listes **dynamiques** (notes par item + ordre manuel par-dessus une résolution live).
- Tie-in CRM à l'envoi (journaliser une `crm_interaction`).
- « Ouvrir dans l'explorateur » depuis une liste dynamique (re-hydratation via `filters_url`) — nice-to-have.
- Traductions i18n des libellés du module (FR au lancement).
- Couverture image : dérivation auto de `cover_url` depuis le 1er item si non défini.
- Pagination du résolveur au-delà du plafond documenté.

---

## 12. Ordre de construction (une livraison, étapes séquencées)

1. **DB** : tables + RLS + `resolve_list_object_ids` + RPCs propriétaires + `get_public_list_by_token`. Migration + `test_object_list.sql`. Fold + runbook.
2. **Module `/listes`** : `OtiTemplate` isomorphe + Manage/Compose/Render, câblés aux RPCs.
3. **Accroches Explorer** : sélection → liste statique ; filtres → liste dynamique.
4. **Page publique** `/l/[token]` (SSR anon).
5. **Canaux** : impression/PDF + route email SMTP.
6. **Nav Sidebar + polish + vérif** (build, tsc, tests, persona/EXPLAIN, advisor).

Chaque étape = incrément vérifié et commit (règle « if it works, we commit »).
