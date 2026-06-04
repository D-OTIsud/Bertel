# Post-MVP — backlog produit

**Statut :** hors périmètre MVP (voir `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24).  
**Rôle :** recenser les améliorations ciblées pour la version suivante — idées validées côté métier, pas encore spécifiées ni planifiées en implémentation.

**Mise à jour :** ajouter une entrée datée à chaque nouvelle idée ; ne pas dupliquer les décisions verrouillées (celles-ci restent dans `lot1_mapping_decisions.md`).

---

## PMV-001 — Panneau d’éligibilité et de suggestions de labels (rail éditeur)

**Demandé :** 2026-06-04 (d.philippe@otisud.com)  
**Priorité post-MVP :** haute (valeur éditoriale forte, réutilise en partie l’existant SQL)

### Problème utilisateur

Un contributeur peut renseigner en profondeur :

- **§11 Démarche durable** — actions cochées par catégorie (biodiversité, milieu naturel, énergie, climat, eau, etc.) via `object_sustainability_action`, **sans** avoir encore déclaré de label officiel (`object_classification` / distinctions) ;
- **§10 Accessibilité** — équipements par famille (moteur, auditif, visuel, mental) via `object_amenity` (`acc_*`) et/ou preuves T&H via `object_classification.subvalue_ids`, **sans** label `LBL_TOURISME_HANDICAP` accordé.

Aujourd’hui, le **rail droit** de l’éditeur (`EditorRail` → `CompletionRing`, `IssuesRail`, etc.) ne montre que la **complétude de fiche** (sections remplies), pas l’**avancement vers des labels** ni les **labels manquants mais atteignables**.

### Objectif produit

Afficher à droite de l’éditeur (et, à terme, du **créateur d’objet** `/objects/new`) un bloc complémentaire au cercle de complétude, par exemple **« Labels & certifications »**, qui propose pour chaque schéma de label pertinent :

| Indicateur | Description |
|------------|-------------|
| **Couverture** | Pourcentage d’exigences déjà couvertes par les preuves saisies (actions durables, équipements accessibilité, etc.), ventilé si utile (obligatoire / confort / points — aligné sur le vocabulaire des équivalences). |
| **Éligibilité estimée** | Labels pour lesquels l’établissement **pourrait prétendre** au vu des données saisies, **même sans** ligne `object_classification` `granted` aujourd’hui. |
| **Probabilité / maturité** | Score synthétique (0–100 %) exprimant à quel point le profil actuel approche les seuils d’obtention — **indicatif**, pas une décision d’attribution (l’attribution reste humaine / certificateur). |
| **Suggestions** | Liste ordonnée des labels **non encore déclarés** mais les plus proches du seuil, avec liens vers les sections à compléter (§10, §11, §08 distinctions). |

**Principe UX :** même emplacement et densité visuelle que `CompletionRing` (`bertel-tourism-ui/src/features/object-editor/widgets/CompletionRing.tsx`) ; libellés clairs que ce sont des **aides à la déclaration**, pas des certifications automatiques.

### Périmètre fonctionnel (deux moteurs)

#### A — Labels « développement durable » (équivalence actions ↔ schémas)

**Données saisies sans label :** `object_sustainability_action` (Panel C3, dictionnaire §5).

**Fondation déjà en base (MVP) :**

- Tables `ref_classification_equivalent_action` / `ref_classification_equivalent_group` (seeds Section A-6/A-7, schémas `LBL_ATR`, `LBL_QUALITE_TOURISME`, `LBL_CLEF_VERTE`, etc.).
- Vue **`v_object_classification_coverage`** — `coverage_pct` par `(object_id, scheme_code)` à partir des actions déclarées vs actions attendues (`migration_sustainability_v5.sql`).
- Vue **`v_object_classification_or_equivalent_scheme`** — admission explorateur rank 0 (label explicite) / rank 1 (preuve équivalente).

**Post-MVP :** exposer ces métriques dans l’UI éditeur (RPC ou enrichissement workspace), recalcul **à la sauvegarde** ou sur debounce des modules §11 / §08, et afficher :

- barre ou anneau par schéma (ex. Clé Verte, ATR, Qualité Tourisme…) ;
- détail manquant : actions `MA_*` / groupes non couverts (lien vers la catégorie §11).

**Note :** le stub « Score Bertel » côté §11 (audit éditeur 2026-06-03) n’est **pas** ce panneau — le remplacer ou le fusionner dans PMV-001.

#### B — Accessibilité (`LBL_TOURISME_HANDICAP` et familles)

**Données saisies sans label :**

- Équipements `acc_*` avec `ref_amenity.extra.disability_types` (§10) ;
- éventuellement `object_classification` + `subvalue_ids` (preuve par famille : moteur, auditif, visuel, mental).

**Spécificité modèle (décision V5, non contournée) :**

- T&H **n’a pas** de lignes `ref_classification_equivalent_*` par défaut — la certification par famille passe par **`subvalue_ids`**, pas par le même moteur que la durabilité (`docs/research/accessibility-v6-seed-design.md`).
- La découverte publique combine déjà `accessibility_labels` et `accessibility_amenity_coverage` dans les payloads adaptés.

**Post-MVP :** définir un **moteur d’éligibilité accessibilité** distinct (ou extension documentée de la vue couverture) qui :

- agrège la couverture par **famille de handicap** (équipements cochés vs catalogue `acc_*` attendu pour une sous-valeur T&H) ;
- estime un % de maturité vers `LBL_TOURISME_HANDICAP` global et/ou par sous-label ;
- suggère les familles encore faibles (« équipement auditif : 40 % des critères usuels couverts »).

**Hors scope initial :** ne pas afficher « label obtenu » tant que `object_classification.status ≠ granted` ; ne pas écrire automatiquement de classification.

### Non-objectifs (MVP et V2.0)

- Attribution automatique de labels ou changement de `status` vers `granted`.
- Remplacement du processus certificateur externe.
- Score légal contraignant — toujours **indicatif** + mention « à valider par votre organisme certificateur ».

### Emplacement technique cible

| Zone | Fichier / composant |
|------|---------------------|
| Rail droit | `EditorRail.tsx` — nouveau widget ex. `LabelEligibilityRail` sous ou à côté de `CompletionRing` |
| Création | même widget sur le parcours `/objects/new` une fois P1.1 (création objet) livré |
| Données | RPC dédiée ex. `api.get_object_label_eligibility(p_object_id)` ou extension `get_object_resource` / workspace parser |
| Référence schéma | `OBJECT_DATA_DICTIONARY.md` §5.10 (équivalence & couverture) ; seeds équivalences `seeds_data.sql` A-6/A-7 |

### Critères d’acceptation (brouillon — à affiner en spec)

1. Après avoir coché des actions §11 sans label §08, au moins un schéma durable affiche `coverage_pct > 0` et apparaît dans « Suggestions ».
2. Après avoir coché des `acc_*` §10 sans T&H `granted`, le panneau montre une progression par famille handicap.
3. Les labels déjà `granted` apparaissent en section « Obtenus » (100 % ou badge distinct), pas en suggestion.
4. Clic sur une suggestion scroll vers §10 / §11 / §08 avec surbrillance des critères manquants (phase 2 acceptable).
5. Texte d’aide : distinction explicite **preuve saisie** vs **certification officielle**.

### Dépendances / prérequis

- MVP : éditeur §10/§11 persistants (write-traps fermés — §29/§30/§32 sur `master`).
- Post-MVP : spec dédiée `docs/superpowers/specs/YYYY-MM-DD-label-eligibility-rail-design.md` + plan impl.
- Accessibilité : possible besoin de **seeds d’équivalence optionnels** ou matrice critère→équipement si le produit exige le même % que pour la durabilité (décision produit à trancher avant dev).

### Pistes techniques (à valider en spec)

- **Durabilité :** lecture directe de `v_object_classification_coverage` + liste des `action_id` manquants par schéma.
- **Accessibilité :** vue ou fonction SQL nouvelle basée sur `ref_amenity` + mapping famille ↔ `ref_classification_value` (sous-valeurs T&H) ; réutiliser les filtres `label_disability_types_any` / `accessibility_amenity_coverage` comme référence de vérité explorateur.
- **Performance :** calcul côté serveur (éviter de charger tout le catalogue équivalence dans le client).

---

## Autres entrées post-MVP

*(Ajouter ici les prochaines idées sous la forme PMV-00N.)*

| ID | Sujet | Statut |
|----|--------|--------|
| — | *(vide — PMV-001 est la première entrée)* | — |

---

## Liens

- Roadmap MVP : `lot1_mapping_decisions.md` §24  
- Tracker différé court : `.claude/WORKFLOW.md`  
- Audit éditeur (contexte rail) : `docs/superpowers/specs/2026-06-03-editor-shell-audit.md` (P4 — anneau de complétude)  
- Modèle labels / couverture : `docs/architecture/OBJECT_DATA_DICTIONARY.md` §5.10, Panel C2/C3
