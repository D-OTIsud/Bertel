# §12 redistribution + descriptif requis par langue parlée — Design

- **Date** : 2026-06-16
- **Statut** : design validé (PO « oui à tout » + ajout langues via modal) — en attente revue du spec écrit
- **Périmètre** : frontend-only (éditeur d'objet `bertel-tourism-ui`) — **aucune migration SQL**
- **Sections touchées** : §04 Descriptions, §12 Paiements & langues (dissoute), §13 Tarifs

---

## 1. Contexte (état actuel vérifié)

| Concept | Où | Donnée |
|---|---|---|
| Modes de paiement | §12, `ChipMultiSelect` | `characteristics.selectedPaymentCodes` → `object_payment_method` |
| Langues parlées | §12, `ChipMultiSelect` | `characteristics.selectedLanguages` (avec `levelId/levelCode`) → `object_language` |
| Tarifs + remises | §13 | `pricing.*` |
| Descriptions par langue | §04, `LangTabs` | `descriptions.object/orgOverlay.{chapo,description,…}.values[code]` |

Constats vérifiés dans le code :

- **§12 `SectionPayLangs`** ([SectionPayLangs.tsx](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionPayLangs.tsx)) regroupe deux concepts sans rapport (paiement + langues). Le niveau de maîtrise est **fixé par défaut** (`languageLevelOptions[0]`) et **non éditable** dans l'UI.
- **§04 `SectionDescriptions`** ([SectionDescriptions.tsx](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx)) affiche déjà des onglets de contenu par langue. La liste `availableLanguages` est dérivée par `collectLanguages` ([object-workspace-parser.ts:1258](../../../bertel-tourism-ui/src/services/object-workspace-parser.ts)) des **préférences de langue + traductions déjà saisies** — **pas** des langues parlées. Aujourd'hui les deux concepts sont découplés.
- **Gate de publication** ([editor-validation.ts:86](../../../bertel-tourism-ui/src/features/object-editor/editor-validation.ts)) : accroche + descriptif obligatoires dans **≥ 1** langue (blocage dur existant).
- **Round-trip niveau de langue déjà câblé** : loader `ref_code` domaine `language_level` + `object_language.level_id` ([object-workspace.ts:603-646](../../../bertel-tourism-ui/src/services/object-workspace.ts)) ; saver `save_object_commercial` persiste `level_id`/`level_code` ([object-workspace.ts:4047](../../../bertel-tourism-ui/src/services/object-workspace.ts)). **Exposer le niveau n'est pas un write-trap** — seul le contrôle UI manque.
- **Modal d'ajout déjà disponible** : `ChipMultiSelect` en mode `modalTitle` ouvre un `EditorModal` (recherche + Sélectionnés/Disponibles, Valider staged) ([ChipMultiSelect.tsx:65](../../../bertel-tourism-ui/src/features/object-editor/primitives/ChipMultiSelect.tsx)).

---

## 2. Décisions verrouillées (réponses PO)

1. **Couplage langue parlée → descriptif = avertissement non-bloquant** (pas de blocage publication). Raison : compatible avec la politique actée « repli FR au lancement » (traduction des contenus différée post-MVP). Un blocage dur empêcherait de publier la quasi-totalité des fiches existantes.
2. **Avertissement sur accroche + descriptif** (les deux, par langue parlée).
3. **Niveau de maîtrise exposé** en §04 (sélecteur par langue parlée).
4. **Ajout des langues parlées via modal** (réutilise le modal `ChipMultiSelect`).

---

## 3. Design

### A. Modes de paiement → §13 « Tarifs, paiement & extras »

- Déplacer le `ChipMultiSelect` des modes de paiement de §12 vers `SectionPricing`, dans un bloc « Modes de paiement acceptés » placé **après** le bloc « Politique & règles ».
- **Aucun changement de données** : le contrôle continue d'écrire `editor.draft.characteristics.selectedPaymentCodes` via `editor.replaceModule('characteristics', …)`. Une section qui édite un module autre que le sien est déjà le cas ailleurs ; la barre de sauvegarde enregistre tous les modules « dirty ».
- **Garde no-write-trap** : si `characteristics.unavailableReason` est défini (chargement dégradé), le bloc paiement est honnêtement désactivé avec la raison (pattern `ModuleUnavailableNotice`), pas éditable en silence.
- Renommer §13 : `Tarifs & extras` → **`Tarifs, paiement & extras`** ([section-config.ts:65](../../../bertel-tourism-ui/src/features/object-editor/section-config.ts)).

### B. Langues parlées (+ niveau) → §04 « Descriptions & langues parlées »

- Déplacer les langues parlées dans `SectionDescriptions`, **en haut de section**, sous forme d'un bloc compact « Langues parlées » :
  - **Ajout/retrait via modal** : `ChipMultiSelect` mode `modalTitle="Choisir les langues parlées"` → `setLanguages(codes)` (logique de reconciliation déjà écrite, à déplacer telle quelle depuis `SectionPayLangs`).
  - **Niveau par langue** : sous la liste des langues sélectionnées, une ligne compacte par langue = `libellé · Select(niveau) · (retrait via le chip du modal)`. Le `Select` lit `characteristics.languageLevelOptions` et écrit `levelId`/`levelCode` de la ligne via `editor.replaceModule('characteristics', …)`.
  - Le bloc niveaux n'apparaît que si ≥ 1 langue sélectionnée.
- **Garde no-write-trap** : si `characteristics.unavailableReason`, désactiver les contrôles langues avec la raison.
- Renommer §04 : `Descriptions` → **`Descriptions & langues parlées`** ([section-config.ts:47](../../../bertel-tourism-ui/src/features/object-editor/section-config.ts)).

> **Note d'architecture** : §04 éditera désormais **deux** modules (`descriptions` + `characteristics`). C'est admis (les sections ne sont pas 1:1 avec les modules). La section devient plus chargée — compromis assumé du couplage ; la liste compacte + modale limite l'encombrement.

### C. Couplage langue parlée → onglet de description + avertissement

- **Onglets auto** : §04 calcule les onglets affichés comme l'**union** `availableLanguages ∪ codes-de-langues-parlées` (mappés via l'alias §5). Calcul **dans le composant** — `collectLanguages` et ses tests restent inchangés. Un onglet de langue parlée sans traduction porte une étoile « à compléter ».
- **Libellés d'onglets** : dériver le libellé depuis `characteristics.languageOptions` (noms `ref_language`) en complément de `LANG_LABELS`, pour que les langues au-delà de fr/en/cre/de/es (it, pt, nl, zh…) s'affichent avec leur nom et pas leur code brut.
- **Avertissement** (nouvelle règle dans [editor-validation.ts](../../../bertel-tourism-ui/src/features/object-editor/editor-validation.ts), `tone: 'warn'`, **non bloquant**) : pour chaque langue parlée dont l'accroche **ou** le descriptif est vide (scope `object`/canonique), un message **agrégé** sur §04 — ex. *« Langues parlées sans traduction complète : Allemand, Espagnol (accroche + descriptif attendus). »*
  - **Garde** : règle ignorée si `draft.characteristics.unavailableReason` (même pattern que la règle PMR-room qui garde sur `draft.rooms.unavailableReason`).
  - Comparaison via l'alias §5 (langue parlée `rcf` ⇒ clé descriptif `cre`).
- Le blocage dur existant (accroche + descriptif ≥ 1 langue) **reste inchangé**.

### D. Dissolution de §12

- Retirer l'item `{ num: '12', label: 'Paiements & langues' }` de `section-config` ([section-config.ts:59](../../../bertel-tourism-ui/src/features/object-editor/section-config.ts)).
- Retirer `'12': SectionPayLangs` du registre ([section-registry.tsx:54](../../../bertel-tourism-ui/src/features/object-editor/sections/section-registry.tsx)) et l'import.
- Supprimer `SectionPayLangs.tsx` + `SectionPayLangs.test.tsx` (logique migrée).
- Les autres numéros de section sont conservés (le mapping est par `num` ; un trou à 12 est sans effet). `MODE_ESSENTIAL` ne contient pas '12' — rien à changer.

---

## 4. Round-trip données (vérifié, rien à migrer)

| Donnée | Loader | Saver |
|---|---|---|
| Paiement | `object_payment_method` → `selectedPaymentCodes` | `save_object_commercial.payment_methods` |
| Langue + niveau | `object_language.{language_id,level_id}` + `ref_code` `language_level` → `selectedLanguages[]` | `save_object_commercial.languages[].{language_id,level_id,…}` |
| Descriptif par langue | `get_object_resource` → `descriptions.*.values[code]` | `rpc_write_*_description` (inchangé) |

---

## 5. Risque verrouillé : espace de codes langues (vérifié live 2026-06-16)

`ref_language` (langues parlées) vs clés des onglets de description :

- **Alignés** : `fr`, `en`, `de`, `es`.
- **Mismatch confirmé** : Créole — `ref_language.code = rcf` (« Créole réunionnais ») vs clé descriptif `cre` (cf. `LANG_LABELS`).
- `ref_language` porte **20** langues ; §04 n'en libelle que 5.

**Mitigation (verrouillée)** :

1. Fonction de normalisation `spokenCodeToDescKey(code)` : map d'alias `{ rcf: 'cre' }`, identité sinon. Utilisée pour (a) l'union des onglets, (b) la comparaison de l'avertissement.
   - **À confirmer en implémentation** : la clé réellement utilisée par les i18n descriptifs live (`cre` vs `rcf` vs autre). Si le live utilise `rcf` côté descriptif, l'alias devient l'identité — à trancher sur données réelles avant de coder l'alias.
2. Libellés d'onglets dérivés des noms `ref_language` (pas seulement `LANG_LABELS`).

---

## 6. Tests (TDD)

- **Pur** (`editor-validation.test.ts`) : langues parlées { fr, de, es } + descriptif présent uniquement en fr ⇒ 1 avertissement listant « Allemand, Espagnol » ; descriptif complet partout ⇒ 0 avertissement ; `characteristics.unavailableReason` ⇒ 0 avertissement ; alias `rcf`→`cre`.
- **Composant §04** (`SectionDescriptions.test.tsx`) : bloc langues présent ; ajout via modal ; sélecteur de niveau écrit `levelId` ; onglet auto pour une langue parlée sans traduction ; libellé d'onglet correct pour une langue hors `LANG_LABELS` (ex. `it`).
- **Composant §13** (`SectionPricing.test.tsx`) : bloc paiement présent + écrit `selectedPaymentCodes` ; désactivé si `unavailableReason`.
- **Registre/config** (`section-registry.test.tsx`, `section-config.test.ts`) : §12 absente ; §04/§13 renommées.
- Suppression `SectionPayLangs.test.tsx`.
- Régression : suite Jest complète verte + `tsc` propre + `npm run build` EXIT 0.

---

## 7. Hors périmètre (YAGNI)

- Blocage dur de publication par langue (rejeté en décision 1).
- Traduction automatique / passe de traduction des contenus (différée post-MVP).
- Toute migration SQL (round-trip déjà câblé).
- `availableLanguages` calculée côté parser (on garde le calcul d'union côté composant pour ne pas casser le contrat parser).

---

## 8. Fichiers touchés (estimation)

- `sections/SectionPricing.tsx` (+ bloc paiement)
- `sections/SectionDescriptions.tsx` (+ bloc langues parlées + niveaux + union onglets + libellés)
- `sections/descriptions-field.ts` ou nouveau helper `spoken-languages.ts` (alias code-space, pur)
- `editor-validation.ts` (+ règle warn) + `editor-validation.test.ts`
- `section-config.ts` (retrait §12, renommages §04/§13)
- `sections/section-registry.tsx` (retrait §12 + import)
- Suppression `sections/SectionPayLangs.tsx` + `.test.tsx`
- Tests : `SectionDescriptions.test.tsx`, `SectionPricing.test.tsx`, `section-config.test.ts`, `section-registry.test.tsx`
