# Extraction IA de carte → menu structuré (§06 restaurants) + nettoyage §06

**Date** : 2026-06-22
**Statut** : design validé (PO « oui » sur les 5 sections + `/goal implémente`)
**Périmètre** : éditeur d'objet, section §06 « Cuisine, cartes & service » (archétype RES)

---

## 1. Problème & objectifs

Sur la page d'édition des restaurants, section §06 :

1. **Bruit à retirer** — §06 affiche deux pointeurs « géré ailleurs » (capacité groupes → §07, horaires → §14) qui n'ont pas de sens dans une section dédiée à la cuisine/cartes/service. À supprimer (+ alléger le sous-titre).
2. **Nouvelle fonctionnalité** — remplacer l'ajout de fichier brut par un bouton **« Ajouter une carte »** qui ouvre une **modale** permettant :
   - d'importer des **images (JPEG/PNG/WebP) ET des PDF** ;
   - de lancer un **outil IA** qui extrait le contenu du document et **remplit automatiquement un menu structuré** (titre, sections, plats : nom/prix/description) que les conseillers en séjour pourront ensuite **filtrer** ;
   - le tout en gardant le fichier source comme **carte téléchargeable**.

Contraintes produit explicites :
- Le projet **n'est pas réservé à l'OTI du Sud** : le fournisseur IA doit être **configurable** et **multi-fournisseurs** (OpenAI, OpenRouter, Groq, vLLM, Ollama, Kimi/Moonshot, Together, providers gratuits…).
- L'utilisateur **ne doit jamais avoir accès à la clé API** : clé côté serveur uniquement.
- Avant d'analyser des **images**, prévenir l'utilisateur que la carte doit être **complète** et toutes les images importées.

---

## 2. Décisions verrouillées

| # | Décision | Choix |
|---|----------|-------|
| D1 | Moteur IA | **Multi-fournisseurs** via un adaptateur unique **OpenAI-compatible** (base URL + clé + modèle). Anthropic-natif = adaptateur optionnel ultérieur. |
| D2 | Échelle de config | **Plateforme, admin-configurable** (page super-admin). Clé en **Supabase Vault**, lue seulement par la route serveur. Pas de redéploiement pour changer de fournisseur. |
| D3 | Inférence des tags filtrables | **Régimes inférés** (marqués « suggéré IA », **décochés par défaut**) ; **allergènes 100 % humains** (jamais demandés à l'IA — risque légal/sanitaire). |
| D4 | Fichier source | **Gardé téléchargeable + menu créé** : un seul import sert l'affichage public (carte) ET le filtrage (menu structuré). |

---

## 3. Architecture & flux

### 3.1 Vue d'ensemble

Deux parties indépendantes :

- **Partie A — nettoyage §06** (frontend-only, trivial) : retirer de `BlockRES.tsx` les deux `OwnedElsewhereNote` (§07, §14) et alléger le sous-titre du `Fs`.
- **Partie B — extraction IA** (DB + route + modale).

### 3.2 Flux cible (Partie B)

```
Bloc C §06 « Cartes »  →  bouton « Ajouter une carte »  →  MODALE MenuExtractModal
  1. Dépôt PDF ou plusieurs images (JPEG/PNG/WebP)
       → chaque fichier s'upload immédiatement via /api/document/upload (role 'carte')
       → devient une carte TÉLÉCHARGEABLE (object_document) visible dans le bloc Cartes
  2. Garde-fou : « Carte complète ? Importez TOUTES les pages/images avant d'analyser »
       → case « Il s'agit de la carte complète » qui débloque le bouton Analyser
  3. Titre du menu (défaut éditable, ex. « Carte de la semaine »)
  4. « Analyser et créer un menu » → POST /api/menu/extract
       · autorise EN TANT QUE l'appelant (user_can_write_object_canonical)
       · lit la config active + déchiffre la clé (Vault, service-role)
       · résout documentIds → octets (vérifiés liés à objectId : anti-SSRF)
       · PDF → rasterisé en images côté serveur (uniforme tous fournisseurs)
       · appelle le fournisseur (vision) ; valide le JSON (Zod) ; mappe → menu
       · renvoie le menu (AUCUNE écriture en base)
  5. Aperçu éditable dans la modale : plats, prix, sections,
       régimes SUGGÉRÉS non cochés, allergènes vides
  6. « Ajouter ce menu au brouillon » → editor.replaceModule('menus', …)
       → menu (recordId null, régimes acceptés seulement) rejoint le bloc Menus
       → enregistrement via la BARRE DE SAUVEGARDE habituelle (aucun nouveau RPC menu)
```

### 3.3 Cohérence avec l'architecture existante

- **Pas d'écriture directe** : le menu extrait atterrit dans `editor.draft.menus` et passe par le **saver de menus existant** (§104) + la barre de sauvegarde → respecte « pas de write-trap silencieux » et le modèle save-bar.
- **Invariant média/document** : `/api/menu/extract` authentifie le JWT, autorise *en tant qu'appelant* (`user_can_write_object_canonical`), opérations privilégiées en service-role — identique à `/api/document/upload`.
- **IA contrainte** : le client transmet à la route les **codes régimes autorisés** (`dietaryTagOptions`) et les **sections autorisées** (`categoryOptions`) → l'IA ne renvoie que des codes connus → mapping trivial et sûr. **Allergènes jamais transmis ni acceptés.**
- **Concept « suggestion » confiné à la modale** : le mapping renvoie les régimes inférés dans un champ `suggestedDietary[]` séparé (pas dans `dietaryTagCodes`, qui démarre vide). Après revue, seuls les acceptés entrent dans `dietaryTagCodes`. Le brouillon et le saver gardent leur forme inchangée.

### 3.4 Dépendance nouvelle & dégradations

- **Rasterisation PDF→images** : librairie pure-JS Node (candidate : `pdf-to-img`, sans binaire système). Si indisponible au build, **repli honnête** : les PDF restent stockés comme cartes téléchargeables mais non analysables (seules les images sont analysables) — pas de blocage.
- **IA non configurée** (503) : message « contactez un administrateur », le fichier reste une carte téléchargeable.

### 3.5 Note DPIA

Les images de carte sont transmises au **fournisseur IA configuré** (tiers externe) — à documenter dans le registre de traitement. Une carte de restaurant ne contient normalement pas de donnée personnelle, mais le flux vers un tiers doit être tracé. Les **allergènes restent hors IA** (sécurité sanitaire).

---

## 4. Couche config & données

### 4.1 Table `app_ai_provider_config` (niveau plateforme)

Plusieurs profils fournisseur, **un seul actif** (honore « fournisseurs multiples »).

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK (`gen_random_uuid()`) | |
| `label` | text NOT NULL | ex. « OpenRouter · gpt-4o-mini » |
| `api_kind` | text NOT NULL CHECK in (`openai_compatible`,`anthropic`) | défaut `openai_compatible` |
| `base_url` | text NOT NULL | ex. `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` |
| `model` | text NOT NULL | ex. `openai/gpt-4o-mini`, `qwen2.5-vl:7b` |
| `key_secret_id` | uuid NULL | **pointeur** vers le secret Vault (NULL = fournisseur local sans clé) |
| `max_output_tokens` | int NOT NULL DEFAULT 4096 | borne de coût |
| `is_active` | boolean NOT NULL DEFAULT false | |
| `extra` | jsonb NOT NULL DEFAULT `'{}'` | échappatoire (en-têtes OpenRouter, température…) |
| `created_at` / `updated_at` | timestamptz DEFAULT now() | |

- Index unique partiel `CREATE UNIQUE INDEX uq_ai_provider_active ON app_ai_provider_config (is_active) WHERE is_active;` → au plus un actif.

### 4.2 La clé : Supabase Vault

- La clé brute **ne vit jamais dans la table** : `vault.create_secret(...)` → la table garde `key_secret_id`.
- **Écriture** : `internal.upsert_ai_provider(p_id, p_label, p_api_kind, p_base_url, p_model, p_max_output_tokens, p_is_active, p_extra, p_api_key)` — SECURITY DEFINER, **super-admin only** (`api.is_platform_superuser()`). Si `p_api_key` fourni : crée/rote le secret Vault et met à jour le pointeur ; sinon conserve le pointeur. Atomique. **Ne renvoie jamais la clé.** Bascule `is_active` proprement (désactive les autres).
- **Lecture admin** : `api.list_ai_providers()` → renvoie label/kind/base_url/model/is_active/`has_key` (bool) — **jamais la clé**. SECURITY DEFINER super-admin only.
- **Lecture serveur d'exécution** : `internal.get_active_ai_provider()` → renvoie config + **clé déchiffrée**. `REVOKE EXECUTE … FROM anon, authenticated, public` → **seul `service_role` peut l'appeler**. Verrou central : même SECURITY DEFINER, inexécutable par un utilisateur.

### 4.3 RLS

- Table `app_ai_provider_config` : RLS ON ; lecture **et** écriture **super-admin only** (`(select api.is_platform_superuser())`, forme hoistée §39). Pair maison.
- `anon`/`authenticated` : aucun accès PostgREST direct. La route lit l'actif en service-role (bypass RLS).

### 4.4 Surface réglages super-admin

Route gated superuser (route exacte fixée au plan : `/admin/ia` ou intégration à une page existante, après inspection du routeur). Champs : label · api_kind (select) · base_url · model · clé (write-only, « configurée ✓ » si posée) · max tokens · actif · bouton **« Tester la connexion »** (`POST /api/admin/ai-config/test` : mini aller-retour vision ou ping `models`, renvoie OK/erreur lisible). Enregistrement via `internal.upsert_ai_provider`.

### 4.5 Déploiement

Table + RPCs + RLS = **une migration dédiée** (`migration_ai_provider_config.sql`), foldée dans `schema_unified.sql` + listée au runbook (manifest). Test SQL : RLS super-admin-only ; `get_active_ai_provider` inexécutable par anon/authenticated ; upsert atomique + bascule `is_active`.

---

## 5. Route d'extraction `/api/menu/extract`

Runtime **Node** (rasterisation + sharp). Ossature de `/api/document/upload`.

### 5.1 Entrées (POST JSON)

`objectId` · `documentIds[]` (cartes déjà uploadées) · `menuTitle` · `allowedDietaryCodes[]` · `allowedSections[] {code,label}` · `lang` (défaut `fr`).

> **Anti-SSRF** : le client envoie des **documentIds**, jamais des URLs. La route les résout côté serveur (service-role) **et vérifie qu'ils sont liés à `objectId`** (`object_document`), puis télécharge les octets depuis Storage. Aucune URL arbitraire fournie par le client n'est fetchée.

### 5.2 Étapes

1. **Auth + autorisation EN TANT QU'APPELANT** : JWT → `getUser` ; `user_can_write_object_canonical(objectId)` (client anon + JWT). Échec → **403** (fail-closed).
2. **Config active + clé** : `internal.get_active_ai_provider()` en service-role. Aucune config active → **503**.
3. **Documents → images** : pour chaque documentId vérifié, download service-role ; **PDF → rasterisé** (cap ≤ 8 pages) ; image → redimensionnée ~1568 px (point idéal vision). Total d'images plafonné (≤ 8) — si tronqué, **signalé** dans la réponse.
4. **Adaptateur fournisseur** :
   - `openai_compatible` (cœur) : `POST {base_url}/chat/completions`, `Authorization: Bearer {clé}` (omis si pas de clé), messages = prompt système + parts `image_url` (data URLs base64), `response_format: { type: 'json_object' }` quand supporté + consigne stricte « réponds UNIQUEMENT en JSON conforme ».
   - `anthropic` (optionnel, ultérieur) : Messages API + blocs `image` + tool-use.
5. **Parse + validation Zod** ; échec → **un** retry de réparation → sinon **422**.
6. **Mapping → `ObjectWorkspaceMenu`** (fonction pure `mapExtractionToMenu`) : menu (titre, description) ; plats → `{name, description, price, unit?, sectionCode, dietaryTagCodes: [], allergenCodes: [], available: true, recordId: null}` + `suggestedDietary[]` séparé. L'IA est **contrainte** aux codes autorisés ET le mapper **re-filtre** (défense) ; code inconnu → ignoré. **Allergènes jamais demandés ni acceptés.**
7. **Retour JSON. Aucune écriture en base.**

### 5.3 Garde-fous

Limites (nb documents, pages, taille, MIME allow-list) · timeout fournisseur (AbortController, ~60 s) · **throttle par utilisateur** (MVP en mémoire ; limiteur en base = suivi) · jamais de log de la clé (log fournisseur/modèle/statut/usage tokens) · taxonomie d'erreurs (401/403/413/422/502/503).

### 5.4 Pièces pures testables

`buildExtractionPrompt(allowedSections, allowedDietary, lang)` · `extractionSchema` (Zod) · `mapExtractionToMenu(aiJson, opts)` · adaptateur `callOpenAiCompatibleVision(config, key, images, prompt)` (mockable) · `rasterizePdf(buffer, maxPages)`.

---

## 6. Front — modale, revue & injection

**`MenuExtractModal`** remplace le flux d'ajout de carte dans `MenuPdfCartes`. Le bouton **« Ajouter une carte »** ouvre la modale.

Fichiers :
- `src/features/object-editor/widgets/MenuExtractModal.tsx` — coquille + orchestration des états.
- `src/services/menu-extract.ts` — `extractMenuFromCartes(objectId, documentIds, opts)` → `/api/menu/extract` ; helpers purs.
- Réutilise `DocumentUploadField` + `/api/document/upload` (étendu aux images pour cartes), `Dialog`, `Field`, `ChipMultiSelect`.

États : `idle → uploading → prêt(confirm) → analyzing → preview → done`.

1. **Dépôt** PDF/images — upload immédiat comme carte téléchargeable.
2. **Garde-fou** : avertissement + case « Carte complète, toutes les pages/images importées » → débloque **Analyser**.
3. **Titre** du menu (défaut éditable).
4. **Analyser** → loading → route.
5. **Aperçu éditable** : plats (nom/prix/section/description), régimes **suggérés non cochés** (« suggéré · cliquer pour ajouter »), allergènes vides + note « à saisir manuellement ».
6. **Injection** : « Ajouter ce menu au brouillon » → `editor.replaceModule('menus', …)` → menu neuf normal → barre de sauvegarde.

**Dégradations** : 503 → message admin, fichier reste carte téléchargeable. Bouton gated par `permissions.menus.canDirectWrite || canPrepareProposal` (la route ré-autorise indépendamment).

---

## 7. Sécurité

- Clé : Vault + route serveur + `get_active_ai_provider` REVOKE hors `service_role`. Jamais dans le bundle client, jamais renvoyée à l'UI.
- Autorisation-en-tant-qu'appelant (canonical write) sur **extract ET upload**.
- Anti-SSRF : documentIds résolus + vérifiés serveur (jamais d'URL client).
- Limites taille/pages/MIME + throttle + timeout.
- DPIA : flux d'images → tiers IA documenté ; allergènes hors IA.
- Passage `security-reviewer` avant commit (route + RLS + Vault).

---

## 8. Tests (TDD — tests d'abord)

- **SQL** : RLS super-admin-only sur la table ; `get_active_ai_provider` inexécutable anon/authenticated ; `upsert_ai_provider` atomique + bascule `is_active` ; `list_ai_providers` ne renvoie jamais la clé.
- **Unitaires** : `buildExtractionPrompt`, `extractionSchema` (Zod), `mapExtractionToMenu` (filtre dietary/sections, `allergenCodes` toujours `[]`, `dietaryTagCodes` toujours `[]` à la sortie de l'IA, suggestions séparées), `rasterizePdf` (smoke).
- **Route** : auth/authorize fail-closed, 503 non-configuré, 502 provider, 422 illisible, **documentId étranger rejeté (anti-SSRF)**, adaptateur mocké.
- **Front** : modale (dépôt → confirm gate → analyze → preview → inject), service mocké ; suggestions décochées par défaut ; allergens vides.

---

## 9. Découpage en phases (chacune livrable indépendamment)

| Phase | Contenu | Note |
|---|---|---|
| **0 — Nettoyage §06** | retirer les 2 pointeurs §07/§14 + sous-titre | frontend-only, quick win, part en premier |
| **1 — Config IA** | migration (table + Vault RPCs + RLS + test SQL) · route admin + test-connexion · page réglages super-admin | livrable : un admin configure & teste un fournisseur |
| **2 — Backend extraction** | route `/api/menu/extract` + adaptateur openai-compatible + rasterisation + prompt/schéma/mapping + dépendance PDF validée | |
| **3 — Modale + revue** | upload images-cartes · `MenuExtractModal` + service · injection brouillon | flux complet bout-en-bout |

Chaque phase = son propre cycle TDD + review + commit gated. Le spec couvre l'ensemble ; le plan détaillera les étapes.

---

## 10. Points ouverts (tranchés au plan)

- Route exacte de la page réglages super-admin (`/admin/ia` vs intégration existante).
- Librairie de rasterisation PDF retenue (validation build de `pdf-to-img` ou alternative).
- Forme exacte du throttle (mémoire vs compteur DB) — MVP mémoire acceptable.
