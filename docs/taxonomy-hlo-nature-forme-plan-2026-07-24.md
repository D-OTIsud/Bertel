# Plan d'exécution — Refonte nature/forme de la taxonomie hébergement HLO (§190, v4)

**Statut : DÉPLOYÉ SUR LA BASE CLOUD le 2026-07-24 entre 16 h 33 et 16 h 43 (La Réunion). T1–T10 et T11-bis sont verts ; surveillance 24 h en cours. Restent la validation visuelle V-app et l'envoi par le PO de la confirmation partenaires.**
**Compagnon de** : `docs/taxonomy-hlo-nature-forme-2026-07-24.md` (le rapport d'audit §190 — listes nominatives des 40 arbitrages, arbre justifié, garde SQL). Ce plan est autonome : un interne peut l'exécuter sans l'historique de conversation.
**Historique** : v1 2026-07-24 (plan initial) → v2 (9 corrections PO : atomicité, repo-first, population complète, manifeste déterministe) → v3 (7 corrections PO : idempotence tri-état, garde de dérive, ceinture closure, rollback des nœuds neufs, FK crosswalk, fiches du pool nominatives, checklist en fichier) → **v4 (2 corrections bloquantes PO : détection de mode fresh/live/RAISE dans la garde de dérive ; ordre du rollback — réactiver les anciens nœuds AVANT de restaurer les affectations, le trigger d'assignation refusant les nœuds non assignables ; + dry-run aller-retour migration+rollback, CHECK de complétude sur le crosswalk, 476 chemins impactés).**

---

## 1. Résumé exécutif

Les 476 hébergements HLO publiés sont classés dans un arbre (`taxonomy_hlo`) qui mélange la **nature réglementaire** (chambre d'hôtes, meublé de tourisme, hébergement collectif) et la **forme du logement** (villa, appartement, bulle). L'import de mai 2026 (`old_data_enrichment_20260512`) a mappé chaque fiche sur la forme seule ; quand nature et forme divergeaient, la forme a silencieusement changé la nature — 12 fiches vérifiées, dont 6 chambres d'hôtes devenues « meublés ».

Cible : un arbre où **la nature précède la forme** (deux branches racine « Hébergement locatif » / « Hébergement collectif »), **199 fiches recodées automatiquement** depuis un manifeste gelé et déterministe, **40 fiches arbitrées nominativement par le PO**, un badge frontend unifié « Gîtes, meublés & chambres d'hôtes », une garde permanente anti-récidive, et un export DATAtourisme précis (Guesthouse / SelfCateringAccommodation / GroupLodging).

Stratégie : **aucune refonte de modèle**. **Une migration atomique unique** (arbre + recodage + désactivations + bump + refresh + garde, un seul BEGIN/COMMIT — aucun état intermédiaire jamais visible), écrite, testée en CI et committée **avant** toute écriture cloud ; un patch frontend indépendant livrable immédiatement ; une migration crosswalk séparée ; une communication partenaires encadrant la fenêtre. Tout est idempotent (rejouable), gardé fail-closed, réversible par un script de rollback généré et relu **avant** le déploiement.

---

## 2. État confirmé (vérifié live le 2026-07-24, lecture seule)

### 2a. Chiffres

| Fait | Valeur |
|---|---|
| HLO publiés | **476** |
| Porteurs `gite_villa` / `bungalow_chalet` | 178 / 52 |
| Arbitrages nature (dont 3 insolites ; Zévi sur Mer exclu — déjà arbitré §189) | **14** |
| Arbitrages `gite_villa` (sur 176 = 178 − 2 fiches du lot nature) | **16** |
| Arbitrages split (sur 49 = 52 − 3 fiches du lot nature, Trésor d'Ange compris) | **10** |
| **Total arbitrages nominatifs** | **40** |
| **Recodages automatiques publiés** | **199** = 150 maison + 2 appartement + 5 nœud-de-nature + 3 transferts→bungalow + 22 chalet + 17 bungalow |
| Porteur legacy archivé technique | **1** (`HLORUN00000000PX`, doublon archivé §189, `gite_villa`→`location_saisonniere`) |
| Questions de structure | 3 (`gite_rural`, `cottage`, `rez_de_chaussee_d_une_maison`) |
| `taxonomy_rva` | déjà conforme (3 nœuds assignables, 0 fiche publiée) → zéro travail |
| Signal de nature Berta (`object.extra.source_category`) | 469/476 |

Cohérence : 176 gite_villa = 150+2+5+3+16 ✓ ; 49 bungalow_chalet = 22+17+10 ✓.

**Les 3 fiches « transfert pool split » (résolues, nominatives)** — classées automatiquement par le test bungalow/chalet, à survoler en session PO :

| id | Fiche | Cible | Signal |
|---|---|---|---|
| HLORUN000000012T | Gîte du Malmany | `bungalow` | description mentionne « bungalow » (nom sans signal chalet) |
| HLORUN00000000T3 | Cap Vanisa | `bungalow` | description mentionne « bungalow » |
| HLORUN0000000125 | Manapany Lodge | `bungalow` | description mentionne « bungalow » — **nom porte « Lodge » : à confirmer d'un coup d'œil en séance** |

### 2b. Composants concernés

- **DB** : `ref_code` (partitionnée LIST(domain) ; colonnes `is_active`, `is_assignable` ; CHECK `code = immutable_unaccent(lower(code))` → nouveaux codes minuscules non accentués) ; `object_taxonomy` (UNIQUE (object_id, domain) ; trigger d'affectation exige `is_assignable=TRUE`, **ne teste pas `is_active`**) ; `ref_code_taxonomy_closure` (rebuild par domaine via trigger AFTER sur `ref_code` — ce trigger balaye AUSSI `cached_taxonomy_codes` de tout le domaine, mais **pas** `search_document`) ; `api.refresh_object_filter_caches(p_object_id)` (recompute 6 caches + `search_document`) ; MV `internal.mv_filtered_objects` (cron CONCURRENTLY toutes les 5 min) et `internal.mv_ref_data_json` (pas de cron ; aucune taxonomie — refresh = convention maison).
- **API (4 canaux taxonomie)** : `api.get_object_taxonomy_compact` (`{domain, code, name, path:[{code,name}]}`) ; le CTE taxonomy de `get_object_cards_batch` (⚠ **deux copies** : `api_views_functions.sql` + la copie DEFINER live de `migration_cards_batch_authorize_definer.sql` — ce chantier n'en modifie aucune) ; `get_object_resource` (`taxonomy.domains[]` + `render.taxonomy_lines`) ; filtre `p_filters->'taxonomy_any'` = `[{domain, code}]` matché sur `cached_taxonomy_codes` (**déjà closure-aware** : filtrer par un ancêtre matche les feuilles). Passerelle : `GET /api/public/objects[?view=full]`, `/{id}`, `/catalog` (arbre `{code, name, icon_url, parent_code, domain}`, filtré `is_active` — n'émet pas `is_assignable`).
- **Frontend** : `TYPE_LABEL` (`bertel-tourism-ui/src/features/object-editor/archetypes.ts:40`) est la **source unique** depuis §153, résolue via `resolveTypeLabel` (`src/utils/labels.ts:35`). Verdict prouvé : affichage pur, jamais identifiant (0 usage en clé ; un seul test épinglé `CompletenessTable.test.tsx:43`). Trois overrides divergents : `CREATE_TYPE_LABELS` (« Hébergement loisir »), `DRAWER_TYPE_LABELS` (drawer), `LABEL_BY_TYPE` (Listes « Location »/« Rental », vocabulaire visiteur). **Le picker éditeur §01 et les chips de filtres Explorer lisent `ref_code` en live → l'arbre cible apparaît automatiquement, zéro code front.**
- **Importeur** : le script fautif est `Base de donnée DLL et API/old_data_enrichment_20260512/01_enrich_imported_old_data.sql` (**local-only, gitignoré**). Triple défaut : code de feuille = slug de la sous-catégorie seule (l.275) ; collapse des homonymes avec parent arbitraire (l.342) ; affectation par code seul sans la catégorie (l.386). La sync Berta vivante (`_berta_*.py`) n'écrit **ni** taxonomie **ni** `extra.source_category`. `pending_change` ne peut pas porter d'arbitrage taxonomie (aucun RPC writer whitelisté ; l'éditeur écrit en PostgREST direct, `source='workspace_taxonomy'`).

### 2c. Corrections au rapport §190 (à reporter en clôture)

1. Le trigger de closure balaye `cached_taxonomy_codes` du domaine automatiquement ; la boucle `refresh_object_filter_caches` reste obligatoire **pour `search_document`** (noms d'ancêtres, poids B de la recherche).
2. `mv_ref_data_json` ne contient aucune taxonomie (refresh = ceinture de convention).
3. **Piège partenaire** : un recodage pur ne bump pas `object.updated_at` (table enfant + exclusion du garde business) → sans bump explicite, les changements sont invisibles à la synchro incrémentale. Le plan bumpe **les 476 publiés** (le chemin de quasi tous change avec les nouvelles branches).
4. Ordre impératif : nœuds → recodage → désactivations (les RPC fiches ne filtrent pas `is_active` ; `/catalog` oui).
5. Dérive doc préexistante : `openapi.json:928` documente `path` en `string[]` ; le RPC émet `[{code,name}]` — à corriger en phase F.
6. À acter : l'éditeur écrase `source` par `'workspace_taxonomy'` → une fiche arbitrée puis rééditée réapparaît dans la garde (= re-audit, comportement voulu, le PO doit le savoir).

---

## 3. Décisions encore nécessaires

### 3a. Décisions métier / PO (bloquantes pour la migration)

| # | Décision | Fiche de décision |
|---|---|---|
| PO-1 | **14 fiches du lot nature** (listes §2 du rapport) | Recommandation : 6 CdH→branche Chambre d'hôtes (`cdh_maison`/`cdh_bungalow`), 4 collectif→branche Hébergement collectif, Entr'Deux Gones sur fonctionnement réel, 3 insolites confirmées CdH (défaut). Conséquence d'un mauvais choix : nature réglementaire fausse publiée. Décideur : PO avec l'OTI. |
| PO-2 | **16 `gite_villa` sans signal** | Défaut recommandé : rester sur « Meublé de tourisme / gîte » (nature connue, forme inconnue). |
| PO-3 | **10 `bungalow_chalet` sans signal** | bungalow / chalet / mobil-home par fiche connue ; défaut : rester sur nature. |
| PO-4 | **3 questions de structure** | `gite_rural` (5 fiches) : garder comme feuille-appellation [recommandé] ou fondre dans « Maison / villa » ; `cottage` (1) : fondre [recommandé] ; `rez_de_chaussee_d_une_maison` (2) : fondre dans « Appartement » [recommandé]. |
| PO-5 | **Libellé « Location » du module Listes** (`LABEL_BY_TYPE`, vocabulaire visiteur bilingue court) | Garder [recommandé] ou aligner. Ne peut pas déléguer à TYPE_LABEL (FR-only, long). |
| PO-6 | **Classes DATAtourisme** | Valider : `chambre_d_hotes`→Guesthouse, `location_saisonniere`→SelfCateringAccommodation, `hebergement_collectif`→GroupLodging, `gite_de_randonnee`→StopOverOrGroupLodge ; non mappé→Accommodation (fallback). RVA différé (0 publié). |
| PO-7 | **Communication partenaires** | Valider : pré-annonce de fenêtre + bump `updated_at` (l'incrémental rattrape tout) + confirmation post-livraison avec re-pull `/catalog`. |
| PO-8 | **Intégrité du crosswalk** (v3) | Recommandation : **FK composite** — colonnes `taxonomy_domain TEXT` + `taxonomy_code TEXT`, `FOREIGN KEY (taxonomy_domain, taxonomy_code) REFERENCES ref_code(domain, code)` (l'UNIQUE `uq_ref_code_domain_code` existe ; les FK vers table partitionnée sont déjà pratiquées — `object_taxonomy` en porte une), **plus `CHECK ((taxonomy_domain IS NULL) = (taxonomy_code IS NULL))`** (v4 — interdit une ligne à moitié renseignée). Avantages : seeds par code lisibles et portables (pas d'UUID par environnement), zéro orphelin possible, réutilisable pour d'autres domaines. Alternatives : (b) `taxonomy_ref_code_id UUID + domain` FK `(id, domain)` — sûr mais seeds par UUID impossible en fresh-apply ; (c) texte sans FK — orphelins possibles, exigerait un test dédié. |

### 3b. Décisions techniques (proposées, entérinées avec ce plan)

- **Une migration atomique** `migration_taxonomy_nature_forme.sql` (arbre + recodage + désactivations + bump + refresh + garde ; un `apply_migration` MCP = une transaction). Crosswalk séparé (`migration_interop_crosswalk_leafaware.sql`). Garde versionnée `tests/test_taxonomy_nature_forme_guard.sql` (audit rejouable, pas une migration).
- **Repo-first** : la production n'est jamais la source du snapshot. `migration_taxonomy_trees_seed.sql` est édité à la main vers l'arbre cible ; la CI fresh-apply prouve que migration et snapshot convergent au même arbre ; on applique **la version committée exacte**.
- **Manifeste déterministe** : l'heuristique ne tourne jamais en production. Elle produit au gel un manifeste `object_id | expected_old_code | target_code | source | motif` (199 + ≤40 lignes), encodé en VALUES dans la migration.
- **Idempotence tri-état par ligne** (v3) : `current = expected_old_code` → appliquer ; `current = target_code` → déjà appliqué, no-op ; `current = autre` → RAISE ; fiche absente → no-op (fresh-apply). **Gardes de comptage bi-état** : corpus legacy complet (150/2/5/3/22/17 + N PO) **ou** corpus legacy = 0 (déjà migré) ; tout état intermédiaire ⇒ RAISE.
- **Garde de dérive au déploiement** (v3) : en tête de transaction — total HLO publiés == valeur du gel (476) ; tous les `object_id` du manifeste existent ; **aucun porteur de `gite_villa`/`bungalow_chalet` hors manifeste** ; toute dérive ⇒ RAISE ⇒ re-gel (C1) puis nouvelle fenêtre.
- **Ceinture closure placée immédiatement après les re-parentages** (v3), avant recodage, refresh, assertions et garde finale.
- **Pas de `pending_change`** pour l'arbitrage : rapport + session PO (patron §186→§189).

### 3c. Questions résolues pendant l'analyse (aucune action)

Les deux MV et leurs modes de refresh ; TYPE_LABEL = affichage pur ; picker §01 et chips Explorer lisent le référentiel en live (zéro code front pour l'arbre) ; `taxonomy_any` déjà closure-aware ; cause racine d'import (triple défaut, script local-only) ; anti-cycle/même-domaine = triggers existants ; formats snapshot/manifest/runbook ; audit_log = `before_data` complet sur UPDATE/DELETE (INSERT tracés par `source`).

---

## 4. Arbre cible `taxonomy_hlo` — code par code

**7 créations, 4 re-parentages, 5 relibellés, 2 désactivations (+ jusqu'à 3 selon PO-4).** Tous les nœuds vivants `is_active=TRUE, is_assignable=TRUE`. Impact API : **C** = `/catalog` ; **P** = chemins des fiches descendantes ; **F** = nouvelle feuille possible.

| Code | Libellé cible | État actuel | Opération | Assignable | Fiches (après) | API |
|---|---|---|---|---|---|---|
| `hebergement_locatif` | Hébergement locatif | n'existe pas | **CRÉER** (parent : root) | ✅ | 0 directe | C, P (456 live) |
| `chambre_d_hotes` | Chambre d'hôtes | racine, 71 | **re-parenter** → hebergement_locatif | ✅ | 71 + arbitrages | C, P |
| `cdh_maison` | Maison d'hôtes | n'existe pas | **CRÉER** (parent : chambre_d_hotes) | ✅ | ~5 (PO-1) | C, F |
| `cdh_bungalow` | Bungalow | n'existe pas | **CRÉER** (parent : chambre_d_hotes) | ✅ | ~1 (PO-1) | C, F |
| `bulle` | Bulle | sous chambre_d_hotes, 1 | conserver | ✅ | 1 | — |
| `lodges` | Lodge | sous chambre_d_hotes, 1 | **relibeller** | ✅ | 1 | C |
| `hebergement_insolite` | Autre hébergement insolite | sous chambre_d_hotes, 1 | **relibeller** | ✅ | 1 | C |
| `location_saisonniere` | Meublé de tourisme / gîte | racine, 15 directes | **re-parenter** + **relibeller** | ✅ | 15+16+5 directes | C, P |
| `appartement` | Appartement | 47 | conserver | ✅ | 49 (+2, +2 si PO-4 fond rez-de-chaussée) | — |
| `maison` | Maison / villa | 80 | **relibeller** (absorbe gite_villa) | ✅ | ~230 (80+150, +1 si PO-4 fond cottage) | C, F |
| `studio` | Studio | 5 | conserver | ✅ | 5 | — |
| `bungalow` | Bungalow / mobil-home | n'existe pas | **CRÉER** (parent : location_saisonniere) | ✅ | ~20 (17 split + 3 pool) | C, F |
| `chalet` | Chalet | n'existe pas | **CRÉER** (parent : location_saisonniere) | ✅ | ~22 | C, F |
| `gite_rural` | Gîte rural | 5 (−1 si PO-1 déplace Escale du point de vue) | conserver ou fondre (**PO-4**) | ✅/❌ | 4-5 ou 0 | C si fondu |
| `cottage` | — | 1 | fondre → maison (**PO-4** recommandé) puis désactiver | ❌ | 0 | C |
| `rez_de_chaussee_d_une_maison` | — | 2 | fondre → appartement (**PO-4** recommandé) puis désactiver | ❌ | 0 | C |
| `roulotte` | Roulotte | 1 | conserver | ✅ | 1 | — |
| `gite_villa` | (désactivé) | 178 | **DÉSACTIVER après ventilation** (garde 0-porteur) | ❌ | 0 | C (disparaît) |
| `bungalow_chalet` | (désactivé) | 52 | **DÉSACTIVER après split** (garde 0-porteur) | ❌ | 0 | C (disparaît) |
| `hebergement_collectif` | Hébergement collectif | n'existe pas | **CRÉER** (parent : root) | ✅ | 0 directe | C, P |
| `gite_de_groupe` | Gîte de groupe | sous nœud mort, 3 | **re-parenter** → hebergement_collectif | ✅ | 3 + arbitrages | C, P |
| `gite_de_randonnee` | Refuge et gîte d'étape | sous nœud mort, 13 | **re-parenter** + **relibeller** | ✅ | 13 | C, P |
| `auberge_collective` | Auberge collective | n'existe pas | **CRÉER** (0 porteur, prospectif) | ✅ | 0 | C |
| `gite_d_etape_et_de_randonnee`, `auberge`, `chambre` | (morts §187/§189) | désactivés | **ne PAS réactiver** ; perdent leurs enfants | ❌ | 0 | — |

`taxonomy_rva` : `tourism_residence` / `holiday_village` / `aparthotel` déjà en place — aucune opération.

Contraintes : codes neufs minuscules non accentués (CHECK en base) ; les re-parentages passent les triggers anti-cycle/même-domaine ; les 4 re-parentages + 5 relibellés déclenchent le rebuild closure + balayage `cached_taxonomy_codes` automatiques.

---

## 5. Plan d'action détaillé (repo-first)

Responsables : **Dev** (développeur interne), **PO** (D. Philippe), **OTI** (métier via PO). Risque 🟢/🟡/🔴.

| # | Étape | Action | Resp. | Dép. | Risque |
|---|---|---|---|---|---|
| 1 | Contrôles | Rejouer les comptages cloud (476 / 14 / 16 / 10 / 199) ; écart ⇒ régénérer les listes du rapport | Dev | plan validé | 🟢 |
| 2 | Frontend | Patch badge + aide (détail §5bis) ; jest + tsc ; commit ; **indépendant, livrable immédiatement** | Dev | plan validé | 🟢 |
| 3 | Session PO | Support (tableaux 14/16/10 + fiches PO-1→PO-8 + les 3 fiches du pool) ; tenue ; consignation en séance | PO+Dev | 1 | 🟢 |
| 4 | Gel | Générer (lecture seule) : **manifeste de recodage** (199 + ≤40 lignes) + `before_state.csv` + `rollback.sql` (contrat §7c) ; relecture des trois | Dev | 3 | 🟡 |
| 5 | Écriture | `migration_taxonomy_nature_forme.sql` (structure §7b) ; snapshot trees_seed édité à la main vers l'arbre cible ; `tests/test_taxonomy_nature_forme_guard.sql` ; manifest `ci_fresh_apply.sql` (étape 13k, bloc 13*, avant l'étape `taxo` ; test en fin) ; entrée runbook | Dev | 4 | 🔴 |
| 6 | Dry-run | Sur cloud : `BEGIN → migration → afficher comptes → ROLLBACK` ; comptes conformes | Dev | 5 | 🟡 |
| 7 | CI + revue | Gate fresh-apply verte (migration + snapshot convergent) ; relecture ; **commit versionné de l'ensemble** (migration, snapshot, test, manifest, runbook, manifeste de recodage, artefacts rollback) | Dev | 6 | 🟡 |
| 8 | Pré-annonce | E-mail partenaires : fenêtre prévue, nature du changement, action attendue | PO | 7 | 🟢 |
| 9 | Captures | Panier « avant » : 8 échantillons (§8-T8) × card + full + 3 formats interop | Dev | 7 | 🟢 |
| 10 | **Fenêtre** | Apply de la version committée exacte (MCP) → hors txn : `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;` puis `…mv_ref_data_json;` | Dev | 8, 9 | 🔴 |
| 11 | Assertions | T1–T9 + T11-bis (§8) ; captures « après » ; diffs conformes ; preuves collées au doc chantier | Dev | 10 | 🟡 |
| 12 | Confirmation | E-mail partenaires : livraison effective, re-pull `/catalog` | PO | 11 | 🟢 |
| 13 | Crosswalk | Baseline **post-taxo** (octet) → migration crosswalk (PO-8 : FK composite ; résolution `ORDER BY cl.depth ASC` ; seeds datatourisme seuls, PO-6) → dry-run → CI → commit → apply → T10 → OpenAPI/Postman (+ correction dérive `path`) | Dev | 11, PO-6, PO-8 | 🟡 |
| 14 | Docs | Rapport §190 mis à jour (totaux 199, corrections §2c, décisions, preuves) ; decision log ; règle d'import au runbook/README ; proposition CLAUDE.md | Dev | 11 | 🟢 |
| 15 | Surveillance | 24 h : cron MV en succès, logs sans 23514, garde = 0, temps Explorer stables | Dev | 10 | 🟢 |

### 5bis. Détail du patch frontend (étape 2)

1. `archetypes.ts:40` → `HLO: 'Gîtes, meublés & chambres d'hôtes'` ; l.63 family HEB (« Hébergement loisir » → nouveau vocabulaire) ; l.35-36 commentaire mis à jour.
2. `create-object-options.ts` : supprimer l'override `HLO: 'Hébergement loisir'` (fallback TYPE_LABEL) ; **corriger le commentaire périmé l.13-15** (« unaccented stable codes » — faux depuis §153).
3. `ObjectDrawerShell.tsx:17-37` : supprimer `DRAWER_TYPE_LABELS`, remplacer par `resolveTypeLabel`.
4. `CompletenessTable.test.tsx:43` : nouvelle chaîne attendue.
5. Aide : `creer-objet.ts` entrée `creer-hlo` (« C'est quoi » = logement entier OU chambre chez l'habitant ; keywords + `chambre d'hôtes`, `maison d'hôtes` ; libellés) ; `choisir-type.ts` `choisir-hlo-rva` (bras chambre d'hôtes vs hôtel).
6. `type-meta.ts` : selon PO-5 (défaut : ne rien changer).
Validation : jest + tsc verts ; grep « Gîte & meublé » / « Hébergement loisir » = 0 hors docs historiques. Hors périmètre (noté) : libellés de bucket « Hébergements » (`facets.ts:16`, `MapLegend.tsx:24`, `RelationPicker.tsx:9`, `map-markers.ts:41`) — niveau famille, pas HLO.

---

## 6. Plan de session PO

Format §189 (séries en séance, consignation immédiate) :

1. **Série 1 — Nature (14)** : fiche par fiche (nom + catégorie Berta + feuille actuelle). Question type : « La Belle du Sud : chambre d'hôtes chez Berta, rangée “Maison” côté meublé — chez l'habitant avec petit-déjeuner, ou logement autonome ? » → `cdh_maison` / rester. Les 3 insolites : défaut = rester CdH.
2. **Série 2 — Structure et produits (PO-4→PO-8)** : 5 décisions cadrées par les fiches §3a.
3. **Série 3 — 16 gite_villa sans signal** : défaut « rester sur nature » en bloc ; le PO ne détaille que ce qu'il connaît.
4. **Série 4 — 10 bungalow_chalet** : idem (bungalow/chalet/mobil-home) + coup d'œil aux 3 fiches du pool (Manapany Lodge notamment).
5. **Consignation** : colonne « Décision » remplie en séance ; le support complété est annexé au rapport §190 ; chaque décision devient une ligne du manifeste (`source='taxonomy_nature_forme_arbitrage_20260724'`, motif « décision PO série N »).

Durée estimée : 45–60 min.

---

## 7. Plan de migration cloud

### 7a. Artefacts gelés AVANT toute écriture (étape 4)

1. **Manifeste de recodage** (committé avec la migration) : `object_id | expected_old_code | target_code | source | motif` — 199 lignes auto publiées + 1 archive technique (`taxonomy_nature_forme_20260724`) + 40 lignes PO nominatives + 3 fusions PO-4 (`taxonomy_nature_forme_arbitrage_20260724`) = **243 objets uniques**. L'heuristique ne tourne **jamais** en production.
2. **`rollback/taxonomy_nature_forme_before_state.csv`** : pour chaque fiche du manifeste — `object_id, domain, old_ref_code_id, old_code, old_source, old_note, target_code`.
3. **`rollback/taxonomy_nature_forme_rollback.sql`** : script inverse généré et **relu avant le déploiement** (contrat §7c).

### 7b. Structure interne de la migration atomique (une transaction)

1. **Détection de mode + garde de dérive** (v4) — trois états, tout le reste ⇒ RAISE :
   - **Mode fresh-apply** : `0 HLO publié ET 0 porteur legacy` → créer l'arbre, exécuter les relibellés/re-parentages ; toutes les vérifications de DONNÉES (ids du manifeste, comptes, porteurs) sont ignorées — les lignes du manifeste no-opent naturellement (fiches absentes).
   - **Mode live** : `total HLO publiés == valeur du gel (476)` → contrôles complets : tous les `object_id` du manifeste existent ; **0 porteur de `gite_villa`/`bungalow_chalet` hors manifeste** ; comptes conformes. Une **ré-exécution post-migration reste en mode live** : le corpus legacy vaut 0 (état autorisé par la garde bi-état) et chaque ligne du manifeste no-ope en tri-état (`current = target`).
   - **Toute autre situation** (total ≠ 476 et ≠ 0, porteur legacy inattendu, id manquant) → **RAISE, re-gel obligatoire** (reprendre en C1).
2. **Gardes de comptage bi-état** (v3) : corpus legacy complet **ou** corpus legacy = 0 (ré-exécution / fresh) ; état partiel ⇒ RAISE.
3. Création des **7 nœuds** (`ON CONFLICT (domain,code) DO UPDATE`, metadata source, codes minuscules non accentués).
4. **Re-parentages (4)** : `chambre_d_hotes`, `location_saisonniere` → `hebergement_locatif` ; `gite_de_groupe`, `gite_de_randonnee` → `hebergement_collectif`.
5. **Ceinture closure ICI** (v3) : `SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hlo')` — immédiatement après les re-parentages, avant tout ce qui lit les chemins.
6. **Relibellés (5)** : `name` + `name_i18n.fr` (`lodges`, `hebergement_insolite`, `location_saisonniere`, `maison`, `gite_de_randonnee`).
7. **Recodage depuis le manifeste** (VALUES → TEMP TABLE) avec l'**idempotence tri-état par ligne** (v3) : `current = expected_old` → UPDATE (source/note/updated_at) ; `current = target` → no-op ; `current = autre` → RAISE ; absente → no-op fresh.
8. **Fusions PO-4** éventuelles (`cottage`→maison, `rez_de_chaussee`→appartement, `gite_rural` selon décision) — mêmes gardes tri-état.
9. **Désactivations** gardées **0-porteur fail-closed** : `gite_villa`, `bungalow_chalet` (+ nœuds fondus PO-4). Jamais de DELETE.
10. **Bump** `object.updated_at = now()` des **476 HLO publiés** (le chemin de quasi tous change ; un SET explicite survit au garde business).
11. **Boucle** `PERFORM api.refresh_object_filter_caches(id)` sur **tous les porteurs d'une affectation `taxonomy_hlo`** (publiés + brouillons) — recompute `search_document`, que le balayage automatique du domaine ne couvre pas.
12. **Garde nature/forme finale** (DO-block ; requête §9 du rapport avec `COALESCE(ot.source,'')` ; exemptions par sources d'arbitrage) : > 0 écart ⇒ RAISE ⇒ **tout est annulé**.

COMMIT. Puis **hors transaction** : `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;` puis `internal.mv_ref_data_json;`. Fenêtre estimée : quelques minutes (≈16 écritures `ref_code` × rebuild closure + ~480 refresh caches) — heures calmes ; le cron MV 5 min repasse derrière.

### 7c. Contrat du script de rollback (v3 — complet)

Le rollback est un **apply**, pas une reconstruction sous stress. **Ordre impératif** (v4) : le trigger `validate_object_taxonomy_assignment` ([schema_unified.sql:1942](../Base%20de%20donn%C3%A9e%20DLL%20et%20API/schema_unified.sql)) **refuse toute affectation vers un nœud `is_assignable=false`** — la réactivation des anciens nœuds doit donc précéder la restauration des affectations. `rollback.sql` doit, dans l'ordre :

1. **Réactiver les anciens nœuds** désactivés par la migration (`gite_villa`, `bungalow_chalet`, + PO-4) : `is_active=TRUE, is_assignable=TRUE`.
2. Restaurer les affectations depuis `before_state.csv` (`ref_code_id`, `source`, `note` d'origine) — gardes tri-état symétriques.
3. Restaurer les anciens `parent_id` (les 4 re-parentages inversés) et les 5 anciens libellés.
4. Ceinture closure (`refresh_ref_code_taxonomy_closure('taxonomy_hlo')`).
5. **Désactiver et rendre non assignables les 7 nœuds créés** (doctrine : jamais de DELETE), gardé **0-porteur après restauration** (fail-closed).
6. Boucle `refresh_object_filter_caches` sur tous les porteurs `taxonomy_hlo`.
7. **Re-bump `updated_at` = now()` des 476 HLO publiés** (jamais restaurer l'ancien timestamp : les partenaires doivent voir l'annulation aussi — le rebump couvre tous les HLO dont le chemin est restauré, pas seulement les lignes du manifeste).
8. Hors transaction : re-refresh des 2 MV.
9. Vérifications : T1 en mode « arbre initial », T2, `/catalog` conforme à l'état d'avant, échantillon API.
10. Prévenir les partenaires ; consigner l'incident au journal.

**Dry-run du rollback lui-même** (v4, exigé avant déploiement) : dans une transaction unique sur le cloud — `BEGIN → migration → assertions cible (T1/T2/T3 en requêtes) → logique de rollback (étapes 1-7) → assertions état initial → ROLLBACK`. Le script de rollback est ainsi PROUVÉ exécutable avant qu'on en ait besoin, sans jamais rien écrire.

---

## 8. Plan de tests et critères d'acceptation

| # | Critère | Mesure |
|---|---|---|
| T1 | Arbre conforme | Requête (code, parent, label, flags) == tableau §4, `is_assignable=TRUE` sur tous les nœuds vivants |
| T2 | Zéro fiche publiée sous un nœud désactivé | requête = **0** |
| T3 | Garde nature/forme | requête §9 du rapport (`COALESCE`) = **0 ligne** hors sources d'arbitrage |
| T4 | Chemins complets | 476/476 avec `hebergement_locatif` OU `hebergement_collectif` en ancêtre assignable ; aucun chemin traversant un nœud désactivé |
| T5 | Caches | `cached_taxonomy_codes` de chaque HLO contient un code de branche ; 0 code désactivé dans les caches |
| T6 | Filtres sous-arbre | `taxonomy_any=[{taxonomy_hlo, hebergement_locatif}]` = corpus attendu ; chip Explorer idem |
| T7 | Recherche | « chambre d'hôtes » remonte les maisons d'hôtes recodées (`search_document` poids B) |
| T8 | API fiches — panier de 8 | Échantillons : CdH directe · future `cdh_maison` · meublé maison · appartement · fiche sur nœud de nature · collectif (gîte de randonnée) · **fiche non recodée dont seul le chemin change** · **témoin non-HLO (RES) strictement intact**. Diff avant/après : seuls `taxonomy`/`path`/`taxonomy_lines`/`updated_at` bougent ; les non-recodées ont AUSSI chemin neuf + `updated_at` bumpé |
| T9 | Catalogue | `/catalog?domains=taxonomy_hlo` : nouveaux nœuds avec bons `parent_code` ; `gite_villa`/`bungalow_chalet` absents |
| T10 | Interop (phase F) | `?format=datatourisme` : CdH → `['PointOfInterest','Guesthouse']` ; **apidae + tourinsoft + jsonld identiques à l'octet à la baseline POST-TAXO** (capturée juste avant la migration crosswalk — la capture pré-chantier ne peut pas servir de référence octet) |
| T11 | Gate CI | fresh-apply verte avec migration + snapshot + garde au manifest |
| T11-bis | **Pagination post-bump** | Parcourir TOUTES les pages de `GET /api/public/objects?types=HLO` (curseur `(updated_at, id)`, timestamps partagés) = **476 ids uniques, 0 doublon, 0 trou** |
| T12 | Non-régression front | jest + tsc verts ; grep libellés legacy = 0 hors docs |

---

## 9. Impacts partenaires et communication

**Change** : valeurs `taxonomy[].code/name/path` des ~239 fiches recodées ; chemins enrichis d'un niveau pour **les 476 HLO publiés** (les **456 locatifs et 20 collectifs** changent tous de chemin avec les nouvelles branches) ; `updated_at` des 476 publiés (voulu — c'est le signal de resynchronisation) ; l'arbre `/catalog` ; le `@type` DATAtourisme (phase F). **Ne change pas** : ids, `object_type`, clés/formes JSON (contrat additif respecté — ce sont des valeurs), blocs non-taxonomie, pagination, pivots apidae/tourinsoft/jsonld (jusqu'à la phase F, puis seuls les seeds datatourisme changent), tombstones (aucune suppression). **Actions partenaires** : re-pull `/catalog` (pas d'etag — le re-fetch est la seule détection) ; la synchro incrémentale `updated_at` rattrape les fiches automatiquement. **Quand** : pré-annonce de la fenêtre (étape 8) ; confirmation après T1–T9 verts (étape 12) ; jamais d'annonce avant vérification.

## 10. Calendrier et chemin critique

- **J0** : validation de ce plan (PO) → patch frontend (étape 2, indépendant) + contrôles (1) + support de session (3-prep).
- **J1** : **session PO** (chemin critique — bloque le gel) → gel des artefacts (4) → écriture migration + snapshot + test + manifest + runbook (5).
- **J2** : dry-run (6) → CI + revue + commit (7) → pré-annonce partenaires (8) → captures (9) → **fenêtre cloud** (10) → assertions (11) → confirmation partenaires (12).
- **J3** : crosswalk (13) → docs (14) → surveillance 24 h (15).

Interventions PO indispensables : validation du plan (J0), session d'arbitrage (J1), décisions PO-1→PO-8, e-mails partenaires (8 et 12).

---

## 11. Checklist d'exécution (ligne par ligne)

> Interdits absolus : `DELETE` (jamais) ; heuristique exécutée en production (jamais) ; apply cloud d'un fichier non committé (jamais) ; réactiver `auberge` / `chambre` / `gite_d_etape_et_de_randonnee` (jamais) ; Docker ou base locale (jamais — cloud uniquement).

### Phase A — Préparation (aucune écriture)
- [x] A1. Rejouer les comptages cloud : 476 HLO publiés ; 14 nature ; 16 gite_villa ; 10 split ; 199 auto publiés ; 1 porteur `gite_villa` archivé technique. Écart ⇒ régénérer les listes du rapport, STOP → PO.
- [x] A2. Patch frontend (§5bis, 6 points) ; jest + tsc verts ; grep libellés legacy = 0 ; commit.
- [x] A3. Préparer le support de session : tableaux 14/16/10 nominatifs + fiches PO-1→PO-8 + les 3 fiches du pool (Gîte du Malmany, Cap Vanisa, Manapany Lodge → `bungalow` ; survoler Manapany Lodge).

### Phase B — Décisions
- [x] B1. Tenir la session PO (4 séries, §6) ; consigner chaque décision dans le support en séance.
- [x] B2. Annexer le support complété au rapport §190.

### Phase C — Gel et écriture (repo-first, zéro écriture cloud)
- [x] C1. Générer le **manifeste de recodage** (lecture seule) : `object_id | expected_old_code | target_code | source | motif` — 199 auto publiés + 1 archive technique + 40 PO nominatives + 3 fusions PO-4 = 243 lignes.
- [x] C2. Générer `rollback/taxonomy_nature_forme_before_state.csv` + `rollback/taxonomy_nature_forme_rollback.sql` (contrat §7c, **ordre v4** : réactiver les anciens nœuds D'ABORD [le trigger refuse une affectation vers un nœud non assignable] → restaurer affectations → parents + libellés → closure → désactiver les 7 nœuds créés [garde 0-porteur] → caches → **re-bump 476** → MV, vérifs). Relire les trois artefacts.
- [x] C3. Écrire `migration_taxonomy_nature_forme.sql` (12 étapes internes §7b : **détection de mode fresh/live/RAISE** + garde de dérive → comptages bi-état → 7 nœuds → 4 re-parentages → **ceinture closure** → 5 relibellés → recodage tri-état → fusions PO-4 → désactivations 0-porteur → bump 476 → boucle refresh porteurs → garde finale).
- [x] C4. Éditer à la main `migration_taxonomy_trees_seed.sql` vers l'arbre cible (7 créations, 4 re-parentages, 5 relibellés, flips is_active/is_assignable). **Jamais régénéré depuis la prod.**
- [x] C5. Écrire `tests/test_taxonomy_nature_forme_guard.sql` (DO-block, exemptions par source, `COALESCE(ot.source,'')`).
- [x] C6. Manifest `ci_fresh_apply.sql` : étape 13k (bloc 13*, avant l'étape `taxo`) + test en fin ; entrée runbook au format maison.
- [x] C7. Dry-run cloud **aller-retour** (v4) : `BEGIN → migration → assertions cible (T1/T2/T3 en requêtes) → logique de rollback (étapes 1-7 du §7c) → assertions état initial → ROLLBACK`. Prouve la migration ET le rollback sans rien écrire. Comptes conformes au gel.
- [x] C8. Gate fresh-apply CI final vert (run GitHub Actions `30094714885`, SHA `69d0b9e`, garde rejouable incluse ; toutes les suites SQL vertes).
- [x] C9. Relecture (PO ou pair) → **commit versionné de l'ensemble**. Migrations appliquées depuis `0a263df` (taxonomie) et `d2a48ec` (crosswalk), sur le HEAD validé `132d57a`.

### Phase D — Fenêtre cloud
- [x] D1. Pré-annonce partenaires confirmée envoyée par le PO avant l'ouverture de la fenêtre.
- [x] D2. Panier « avant » capturé : 8 échantillons (§8-T8) × card + full + 4 formats interop, empreintes versionnées.
- [x] D3. Apply de la version committée sur la base cloud, sans Docker ni base locale : transaction taxonomie COMMIT, 243 recodages, gardes vertes.
- [x] D4. Hors transaction : refresh des deux MV exécuté par le wrapper ; le cron `refresh-mv-filtered-objects` a ensuite réussi à 12:35 et 12:40 UTC.

### Phase E — Preuves
- [x] E1. T1 : arbre == tableau §4 (codes, parents, libellés, flags).
- [x] E2. T2 : 0 fiche publiée sous un nœud `is_active=false`.
- [x] E3. T3 : garde nature/forme = 0 ligne hors sources d'arbitrage.
- [x] E4. T4/T5 : 476/476 avec ancêtre de nature ; caches sans code désactivé.
- [x] E5. T6/T7 : filtres sous-arbre conformes (456 locatifs + 20 collectifs) ; recherche « chambre d'hôtes » remonte toutes les maisons d'hôtes recodées.
- [x] E6. T8 : diff des 8 échantillons conforme ; seuls taxonomie/chemins/rendu taxonomique/`updated_at` changent ; témoin non-HLO intact.
- [x] E7. T9 : `/catalog?domains=taxonomy_hlo` — nouveaux nœuds, bons `parent_code`, désactivés absents.
- [x] E8. T11-bis : pagination complète `types=HLO` = 476 ids uniques, 0 doublon, 0 trou (7 pages de 73/dernière partielle).
- [ ] E9. V-app : Explorer (chips + fil d'Ariane 3 niveaux), recherche, éditeur §01 (arbre cible visible, désactivés absents).
- [x] E10. Preuves consolidées dans `docs/taxonomy-hlo-deployment-evidence-2026-07-24.md`.
- [ ] E11. Confirmation partenaires : livraison effective.

### Phase F — Crosswalk DATAtourisme (fenêtre séparée)
- [x] F1. Baseline **POST-TAXO** capturée et validée à l'octet sur les 8 échantillons avant le crosswalk.
- [x] F2. Écrire `migration_interop_crosswalk_leafaware.sql` selon PO-8 (recommandé : colonnes `taxonomy_domain`+`taxonomy_code`, **FK composite → ref_code(domain, code)** + **`CHECK ((taxonomy_domain IS NULL) = (taxonomy_code IS NULL))`**) : DDL + 2 index uniques partiels (défaut `WHERE taxonomy_code IS NULL` = sémantique de l'ancien PK ; leaf sinon) ; re-cibler les `ON CONFLICT` des seeds jsonld/interop existants ; résolution ancêtre-mappé-le-plus-proche (`ORDER BY cl.depth ASC LIMIT 1`, jointure par domaine) + fallback type-level ; seeds feuille **datatourisme uniquement** (PO-6).
- [x] F3. Dry-run + CI + relecture + commit ; apply cloud effectué (SHA-256 migration `49bbf88c3a886b95c6b7db7b9c6c9968595b61f457c6db0782193e11c319647a`).
- [x] F4. T10 : DATAtourisme affine les quatre classes prévues ; apidae/tourinsoft/jsonld identiques à l'octet à la baseline F1.
- [x] F5. OpenAPI + Postman : @type affiné + correction de la dérive `path` (`string[]` → `[{code,name}]`).

### Phase G — Clôture
- [x] G1. Rapport §190 complété avec le bilan de déploiement et le lien vers les preuves.
- [x] G2. Règle d'import gravée au runbook + README SQL (catégorie→branche ; sous-catégorie→feuille SOUS la branche ; inconnu→nature ; contradiction→arbitrage) + note « la sync Berta n'écrit pas de taxonomie ».
- [ ] G3. Decision log + mémoire + proposition CLAUDE.md (invariant nature-avant-forme + règle d'import).
- [ ] G4. Surveillance 24 h **EN COURS depuis 16 h 43 RUN** : premier point vert (cron MV réussi, garde = 0, aucun 5xx partenaire depuis l'ouverture).
- [ ] G5. Clôturer le chantier au journal.

### Rollback (à tout moment après D3)
- [ ] R1. Appliquer `rollback/taxonomy_nature_forme_rollback.sql` (la version committée en C9) — contrat §7c intégral, y compris désactivation des 7 nœuds créés et **re-bump des 476**.
- [ ] R2. Re-refresh des 2 MV ; rejouer E1–E8 en mode « état initial » ; vérifier `/catalog`.
- [ ] R3. Prévenir les partenaires (le re-bump leur pousse l'annulation) ; consigner l'incident au journal.
