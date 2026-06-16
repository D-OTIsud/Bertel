# §12 redistribution + descriptif requis par langue parlée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dissoudre §12 (paiement → §13, langues parlées → §04 avec niveau exposé), coupler langue parlée → onglet de description auto + avertissement non-bloquant accroche+descriptif.

**Architecture:** Frontend-only. Deux contrôles présentationnels extraits (`PaymentChips`, `SpokenLanguagesField`) mirroir de `EnvironmentChips` ([capacity-controls.tsx](../../../bertel-tourism-ui/src/features/object-editor/sections/capacity-controls.tsx)), écrivant le module `characteristics` via `editor.replaceModule`. Un helper pur `spoken-languages.ts` gère l'alias de code (`rcf`↔`cre`), l'union des onglets et les libellés. Une règle de validation `warn` dans `editor-validation.ts`. Aucune migration SQL — le round-trip `object_language.level_id` + `object_payment_method` est déjà câblé.

**Tech Stack:** React 18 + TypeScript, Jest + React Testing Library, primitives éditeur (`ChipMultiSelect`, `Select`, `ModuleUnavailableNotice`).

**Spec:** [docs/superpowers/specs/2026-06-16-paylangs-redistribution-design.md](../specs/2026-06-16-paylangs-redistribution-design.md)

---

## File structure

| Fichier | Rôle |
|---|---|
| `sections/spoken-languages.ts` (créer) | Helpers purs : `spokenCodeToDescKey`, `descLanguageTabs`, `resolveLanguageLabel` |
| `sections/spoken-languages.test.ts` (créer) | Tests des helpers purs |
| `sections/commercial-controls.tsx` (créer) | `PaymentChips` + `SpokenLanguagesField` (présentationnels, module `characteristics`) |
| `sections/commercial-controls.test.tsx` (créer) | Tests des deux contrôles en isolation |
| `sections/SectionPricing.tsx` (modifier) | + bloc paiement |
| `sections/SectionDescriptions.tsx` (modifier) | + bloc langues parlées, onglets union, libellés via helper |
| `editor-validation.ts` (modifier) | + règle warn « langue parlée sans traduction » |
| `editor-validation.test.ts` (modifier) | + tests de la règle |
| `section-config.ts` (modifier) | Retrait §12, renommage §04 + §13 |
| `sections/section-registry.tsx` (modifier) | Retrait clé '12' + import |
| `sections/index.ts` (modifier) | Retrait export `SectionPayLangs` |
| `sections/SectionPayLangs.tsx` + `.test.tsx` (supprimer) | Logique migrée |
| `section-config.test.ts`, `section-registry.test.tsx` (modifier) | Comptes + libellé §04 |
| `sections/SectionPricing.test.tsx`, `sections/SectionDescriptions.test.tsx` (modifier) | Couverture nouvelle UI |

---

## Task 1: Pure helpers `spoken-languages.ts`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/spoken-languages.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/spoken-languages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// spoken-languages.test.ts
import { spokenCodeToDescKey, descLanguageTabs, resolveLanguageLabel } from './spoken-languages';
import type { ObjectWorkspaceLanguageItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

const lang = (code: string): ObjectWorkspaceLanguageItem => ({
  languageId: code, code, label: code, levelId: '', levelCode: '', levelLabel: '',
});

describe('spoken-languages helpers', () => {
  it('maps the reunion creole spoken code rcf to the description key cre', () => {
    expect(spokenCodeToDescKey('rcf')).toBe('cre');
    expect(spokenCodeToDescKey('de')).toBe('de');
  });

  it('unions content languages with spoken languages (mapped, de-duped, order preserved)', () => {
    expect(descLanguageTabs(['fr', 'en'], [lang('de'), lang('fr'), lang('rcf')]))
      .toEqual(['fr', 'en', 'de', 'cre']);
  });

  it('falls back to fr when both inputs are empty', () => {
    expect(descLanguageTabs([], [])).toEqual([]);
  });

  it('resolves a static label, then ref_language option, then the raw code', () => {
    const options: WorkspaceReferenceOption[] = [{ id: 'it', code: 'it', label: 'Italien' }];
    expect(resolveLanguageLabel('en', [])).toBe('English');
    expect(resolveLanguageLabel('cre', [])).toBe('Créole');
    expect(resolveLanguageLabel('it', options)).toBe('Italien');
    expect(resolveLanguageLabel('xx', [])).toBe('xx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --silent -- spoken-languages.test.ts` (cwd `bertel-tourism-ui`)
Expected: FAIL — `Cannot find module './spoken-languages'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// spoken-languages.ts
import type {
  ObjectWorkspaceLanguageItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/**
 * ref_language codes that differ from the description i18n value-key space.
 * Verified live 2026-06-16: only Créole differs — ref_language.code = 'rcf'
 * (Créole réunionnais) vs the description value key 'cre'. fr/en/de/es align.
 */
const SPOKEN_TO_DESC_KEY: Record<string, string> = { rcf: 'cre' };

/** Map a spoken-language (ref_language) code to the description i18n value key. */
export function spokenCodeToDescKey(code: string): string {
  return SPOKEN_TO_DESC_KEY[code] ?? code;
}

/**
 * Description tabs to show in §04 = content languages ∪ spoken languages
 * (each mapped into the description key space), de-duplicated, order preserved
 * (content languages first, then any newly-introduced spoken language).
 */
export function descLanguageTabs(
  available: string[],
  spoken: ObjectWorkspaceLanguageItem[],
): string[] {
  const ordered = [...available, ...spoken.map((item) => spokenCodeToDescKey(item.code))];
  return Array.from(new Set(ordered.filter(Boolean)));
}

const STATIC_LANG_LABELS: Record<string, string> = {
  fr: 'Français', en: 'English', cre: 'Créole', de: 'Deutsch', es: 'Español',
};

/** Tab label: static label first, then the ref_language option name, then the raw code. */
export function resolveLanguageLabel(code: string, options: WorkspaceReferenceOption[]): string {
  return STATIC_LANG_LABELS[code] ?? options.find((option) => option.code === code)?.label ?? code;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --silent -- spoken-languages.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/spoken-languages.ts bertel-tourism-ui/src/features/object-editor/sections/spoken-languages.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): pure helpers for spoken-language ↔ description coupling"
```

---

## Task 2: Extracted controls `commercial-controls.tsx`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/commercial-controls.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/commercial-controls.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// commercial-controls.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { PaymentChips, SpokenLanguagesField } from './commercial-controls';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';

function characteristics(over: Partial<ObjectWorkspaceCharacteristicsModule> = {}): ObjectWorkspaceCharacteristicsModule {
  return {
    languageOptions: [
      { id: 'fr', code: 'fr', label: 'Français' },
      { id: 'de', code: 'de', label: 'Allemand' },
    ],
    languageLevelOptions: [
      { id: 'l-basic', code: 'basic', label: 'Débutant' },
      { id: 'l-fluent', code: 'fluent', label: 'Courant' },
    ],
    selectedLanguages: [
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: 'l-basic', levelCode: 'basic', levelLabel: 'Débutant' },
    ],
    paymentOptions: [
      { id: 'card', code: 'card', label: 'CB' },
      { id: 'cash', code: 'cash', label: 'Espèces' },
    ],
    selectedPaymentCodes: ['card'],
    environmentOptions: [],
    selectedEnvironmentCodes: [],
    amenityGroups: [],
    selectedAmenityCodes: [],
    unavailableReason: null,
    ...over,
  };
}

describe('PaymentChips', () => {
  it('shows the unavailable notice when the module failed to load', () => {
    render(<PaymentChips characteristics={characteristics({ unavailableReason: 'KO' })} onChange={() => undefined} />);
    expect(screen.getByText('KO')).toBeInTheDocument();
  });

  it('renders the selected payment chip and a modal trigger', () => {
    render(<PaymentChips characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.getByText('Modes de paiement acceptés')).toBeInTheDocument();
    expect(screen.getByText('CB')).toBeInTheDocument();
  });
});

describe('SpokenLanguagesField', () => {
  it('shows the unavailable notice when the module failed to load', () => {
    render(<SpokenLanguagesField characteristics={characteristics({ unavailableReason: 'KO' })} onChange={() => undefined} />);
    expect(screen.getByText('KO')).toBeInTheDocument();
  });

  it('renders a level select per selected language and writes the chosen level', () => {
    let next: ObjectWorkspaceCharacteristicsModule | null = null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    const levelSelect = screen.getByLabelText('Niveau Allemand');
    fireEvent.change(levelSelect, { target: { value: 'l-fluent' } });

    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: 'l-fluent', levelCode: 'fluent', levelLabel: 'Courant' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --silent -- commercial-controls.test.tsx`
Expected: FAIL — `Cannot find module './commercial-controls'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// commercial-controls.tsx
import { ChipMultiSelect, Select } from '../primitives';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

interface ControlProps {
  characteristics: ObjectWorkspaceCharacteristicsModule;
  onChange: (next: ObjectWorkspaceCharacteristicsModule) => void;
}

/** §13 — modes de paiement acceptés (object_payment_method). Source d'état : characteristics. */
export function PaymentChips({ characteristics, onChange }: ControlProps) {
  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Modes de paiement acceptés
      </div>
      {characteristics.unavailableReason ? (
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      ) : (
        <ChipMultiSelect
          options={characteristics.paymentOptions}
          selected={characteristics.selectedPaymentCodes}
          modalTitle="Choisir les modes de paiement"
          searchPlaceholder="Rechercher un mode de paiement…"
          onChange={(codes) => onChange({ ...characteristics, selectedPaymentCodes: codes })}
        />
      )}
    </>
  );
}

/** §04 — langues parlées (object_language) + niveau de maîtrise par langue. Ajout via modal. */
export function SpokenLanguagesField({ characteristics, onChange }: ControlProps) {
  /** Reconcile from a flat code list (modal) : keep the existing row (and its level)
   *  for codes still present, seed the first level for new ones. */
  function setLanguages(codes: string[]) {
    const level = characteristics.languageLevelOptions[0];
    onChange({
      ...characteristics,
      selectedLanguages: codes.map((code) => {
        const existing = characteristics.selectedLanguages.find((item) => item.code === code);
        if (existing) return existing;
        const option = characteristics.languageOptions.find((item) => item.code === code);
        return {
          languageId: option?.id ?? '',
          code,
          label: option?.label ?? code,
          levelId: level?.id ?? '',
          levelCode: level?.code ?? '',
          levelLabel: level?.label ?? '',
        };
      }),
    });
  }

  function setLevel(code: string, levelId: string) {
    const option = characteristics.languageLevelOptions.find((item) => item.id === levelId);
    onChange({
      ...characteristics,
      selectedLanguages: characteristics.selectedLanguages.map((item) =>
        item.code === code
          ? { ...item, levelId, levelCode: option?.code ?? '', levelLabel: option?.label ?? '' }
          : item),
    });
  }

  if (characteristics.unavailableReason) {
    return (
      <>
        <div className="chip-group__label" style={{ marginTop: 0 }}>Langues parlées</div>
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      </>
    );
  }

  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Langues parlées</div>
      <ChipMultiSelect
        options={characteristics.languageOptions}
        selected={characteristics.selectedLanguages.map((item) => item.code)}
        modalTitle="Choisir les langues parlées"
        searchPlaceholder="Rechercher une langue…"
        onChange={setLanguages}
      />
      {characteristics.selectedLanguages.length > 0 && (
        <div className="lang-levels">
          {characteristics.selectedLanguages.map((item) => (
            <div className="lang-levels__row" key={item.code}>
              <span className="lang-levels__name">{item.label}</span>
              <Select
                value={item.levelId}
                aria-label={`Niveau ${item.label}`}
                options={[
                  { v: '', l: 'Niveau…' },
                  ...characteristics.languageLevelOptions.map((option) => ({ v: option.id, l: option.label })),
                ]}
                onChange={(levelId) => setLevel(item.code, levelId)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --silent -- commercial-controls.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/commercial-controls.tsx bertel-tourism-ui/src/features/object-editor/sections/commercial-controls.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): extract PaymentChips + SpokenLanguagesField controls"
```

---

## Task 3: Wire PaymentChips into §13

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionPricing.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionPricing.test.tsx`

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```tsx
  it('renders the payment block and marks characteristics dirty on change', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Modes de paiement acceptés')).toBeInTheDocument();
    // The selected payment ('CB') is shown as a removable chip; removing it writes characteristics.
    act(() => { fireEvent.click(screen.getByTitle('Retirer')); });

    expect(result.current.draft.characteristics.selectedPaymentCodes).toEqual([]);
    expect(result.current.dirtySections.characteristics).toBe(true);
  });
```

> NOTE: add `act` to the import on line 1 if not already present: `import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --silent -- SectionPricing.test.tsx`
Expected: FAIL — `Modes de paiement acceptés` not found.

- [ ] **Step 3: Write minimal implementation**

In `SectionPricing.tsx`, add the import at the top:

```tsx
import { PaymentChips } from './commercial-controls';
```

Then insert the payment block immediately after the « Politique & règles » `grid-3` div closes (after the `</div>` that ends the TVA `Field`'s grid, before the « Remises & réductions » label). Insert:

```tsx
      <PaymentChips
        characteristics={editor.draft.characteristics}
        onChange={(next) => editor.replaceModule('characteristics', next)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --silent -- SectionPricing.test.tsx`
Expected: PASS (4 tests, incl. the pre-existing 3).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/SectionPricing.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionPricing.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): §13 hosts the payment-modes picker"
```

---

## Task 4: Wire SpokenLanguagesField + union tabs into §04

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx`

- [ ] **Step 1: Update the test fixture + write failing tests**

In `SectionDescriptions.test.tsx`, the local `modules()` helper builds a partial module set WITHOUT `characteristics`; the section now reads it. Replace the `modules()` function so it includes a minimal `characteristics`:

```tsx
function modules(orgOverlay: unknown = null): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    descriptions: {
      localLanguage: 'fr', activeLanguage: 'fr', availableLanguages: ['fr', 'en'],
      object: scope({ description: { baseValue: '', values: { fr: 'Un descriptif' } } }),
      orgOverlay,
      places: [],
    },
    characteristics: {
      languageOptions: [
        { id: 'fr', code: 'fr', label: 'Français' },
        { id: 'de', code: 'de', label: 'Allemand' },
      ],
      languageLevelOptions: [{ id: 'l1', code: 'fluent', label: 'Courant' }],
      selectedLanguages: [],
      paymentOptions: [],
      selectedPaymentCodes: [],
      environmentOptions: [],
      selectedEnvironmentCodes: [],
      amenityGroups: [],
      selectedAmenityCodes: [],
      unavailableReason: null,
    },
  } as unknown as ObjectWorkspaceModules;
}
```

Then append these tests inside the `describe('SectionDescriptions', …)` block:

```tsx
  it('renders the spoken-languages block', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.getByText('Langues parlées')).toBeInTheDocument();
  });

  it('surfaces a description tab for a spoken language that has no translation yet', () => {
    const base = modules();
    (base as unknown as { characteristics: { selectedLanguages: unknown[] } }).characteristics.selectedLanguages = [
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: 'l1', levelCode: 'fluent', levelLabel: 'Courant' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', base));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    // fr + en come from availableLanguages; Deutsch is added by the spoken language.
    expect(screen.getByRole('button', { name: 'Deutsch' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --silent -- SectionDescriptions.test.tsx`
Expected: FAIL — `Langues parlées` not found.

- [ ] **Step 3: Write minimal implementation**

In `SectionDescriptions.tsx`:

1. Replace the local `LANG_LABELS` constant + its uses with the shared helpers. Add imports:

```tsx
import { SpokenLanguagesField } from './commercial-controls';
import { descLanguageTabs, resolveLanguageLabel } from './spoken-languages';
```

2. Delete the local `const LANG_LABELS = { … };` block (lines 7-9).

3. Inside the component, after `const descriptions = editor.draft.descriptions;`, add:

```tsx
  const characteristics = editor.draft.characteristics;
```

4. Replace the `tabs` computation so the tab list is the union and labels resolve via the helper:

```tsx
  const tabCodes = descLanguageTabs(descriptions.availableLanguages, characteristics.selectedLanguages);
  const tabs = tabCodes.map((code) => ({
    code,
    label: resolveLanguageLabel(code, characteristics.languageOptions),
    filled: Boolean(
      readTranslatableField(activeScopeData.description, code, descriptions.localLanguage).trim()
      || readTranslatableField(activeScopeData.chapo, code, descriptions.localLanguage).trim(),
    ),
  }));
```

5. Render the spoken-languages block at the top of the card body, immediately after the opening `<Fs …>` tag and before `<div className="desc-selectors">`:

```tsx
      <SpokenLanguagesField
        characteristics={characteristics}
        onChange={(next) => editor.replaceModule('characteristics', next)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --silent -- SectionDescriptions.test.tsx`
Expected: PASS (all pre-existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): §04 hosts spoken languages + auto description tabs"
```

---

## Task 5: Validation warning — spoken language without complete translation

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/editor-validation.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/editor-validation.test.ts`

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe`)

```ts
  it('warns when a spoken language has no complete translation (accroche + descriptif)', () => {
    const draft = fullModulesFixture();
    draft.characteristics.selectedLanguages = [
      { languageId: 'fr', code: 'fr', label: 'Français', levelId: '', levelCode: '', levelLabel: '' },
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: '', levelCode: '', levelLabel: '' },
    ];
    // fr is complete in the fixture; de has neither chapo nor description.
    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings).toContainEqual({
      section: '04',
      message: expect.stringContaining('Allemand'),
      tone: 'warn',
    });
    expect(result.warnings.some((w) => w.section === '04' && /Allemand/.test(w.message) && w.tone === 'warn')).toBe(true);
  });

  it('does not warn when every spoken language is fully translated', () => {
    const draft = fullModulesFixture();
    draft.characteristics.selectedLanguages = [
      { languageId: 'fr', code: 'fr', label: 'Français', levelId: '', levelCode: '', levelLabel: '' },
    ];
    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings.some((w) => /traduction complète/.test(w.message))).toBe(false);
  });

  it('does not warn about spoken languages when the characteristics module is degraded', () => {
    const draft = fullModulesFixture();
    draft.characteristics.unavailableReason = 'Module dégradé';
    draft.characteristics.selectedLanguages = [
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: '', levelCode: '', levelLabel: '' },
    ];
    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings.some((w) => /traduction complète/.test(w.message))).toBe(false);
  });

  it('maps the reunion creole spoken code rcf to the cre description key', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo = { baseValue: '', values: { fr: 'Chapo', cre: 'Chapo kreol' } };
    draft.descriptions.object.description = { baseValue: '', values: { fr: 'Desc', cre: 'Desc kreol' } };
    draft.characteristics.selectedLanguages = [
      { languageId: 'rcf', code: 'rcf', label: 'Créole réunionnais', levelId: '', levelCode: '', levelLabel: '' },
    ];
    const result = validateForPublication(draft, allowAll, 'HEB');

    // The creole translation exists under key 'cre' → no warning despite the spoken code being 'rcf'.
    expect(result.warnings.some((w) => /traduction complète/.test(w.message))).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --silent -- editor-validation.test.ts`
Expected: FAIL — the new warning is not produced.

- [ ] **Step 3: Write minimal implementation**

In `editor-validation.ts`:

1. Add imports at the top (after the existing imports):

```ts
import { readTranslatableField } from './sections/descriptions-field';
import { spokenCodeToDescKey } from './sections/spoken-languages';
```

2. Add a new rule to the `VALIDATION_RULES` array (place it right after the existing §04 accroche blocker rule, before the ITI rule):

```ts
  ({ draft }) => {
    // Each spoken language should have a complete translation (accroche + descriptif).
    // Non-blocking — content translation is deferred post-MVP (FR fallback at launch).
    const characteristics = draft.characteristics;
    if (characteristics.unavailableReason) {
      return null;
    }
    const object = draft.descriptions.object;
    const local = draft.descriptions.localLanguage;
    const missing = characteristics.selectedLanguages
      .filter((lang) => {
        const key = spokenCodeToDescKey(lang.code);
        const hasChapo = hasText(readTranslatableField(object.chapo, key, local));
        const hasDescription = hasText(readTranslatableField(object.description, key, local));
        return !hasChapo || !hasDescription;
      })
      .map((lang) => lang.label);
    return missing.length === 0
      ? null
      : {
          section: '04',
          message: `Langues parlées sans traduction complète : ${missing.join(', ')} (accroche + descriptif attendus).`,
          tone: 'warn',
        };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --silent -- editor-validation.test.ts`
Expected: PASS (all pre-existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/editor-validation.ts bertel-tourism-ui/src/features/object-editor/editor-validation.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): warn on spoken language without complete translation"
```

---

## Task 6: Dissolve §12 (config, registry, barrel, delete files, update tests)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/section-config.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/section-registry.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/index.ts`
- Delete: `bertel-tourism-ui/src/features/object-editor/sections/SectionPayLangs.tsx`
- Delete: `bertel-tourism-ui/src/features/object-editor/sections/SectionPayLangs.test.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/section-config.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/section-registry.test.tsx`

- [ ] **Step 1: Update the failing tests first (counts + label)**

In `section-config.test.ts`:
- line 6: `expect(flat).toHaveLength(22);` → `21`
- line 12: `expect(flat).toHaveLength(20);` → `19`
- line 19: `expect(res).toHaveLength(21);` → `20`
- line 45: `expect(groups[1].items[0]).toEqual({ num: '04', label: 'Descriptions' });` → `{ num: '04', label: 'Descriptions & langues parlées' }`

In `section-registry.test.tsx`:
- line 11: `toHaveLength(20)` → `19`
- line 12: `toHaveLength(22)` → `21`
- line 13: `toHaveLength(21)` → `20`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --silent -- section-config.test.ts section-registry.test.tsx`
Expected: FAIL — current code still returns the old counts / old §04 label.

- [ ] **Step 3: Apply the dissolution**

In `section-config.ts`, remove the §12 item (line 59):

```tsx
        { num: '12', label: 'Paiements & langues' },
```

Rename §04 (line 47) and §13 (line 65):

```tsx
        { num: '04', label: 'Descriptions & langues parlées' },
```
```tsx
        { num: '13', label: 'Tarifs, paiement & extras' },
```

In `section-registry.tsx`:
- Remove `SectionPayLangs,` from the import block from `'./index'`.
- Remove the registry entry `'12': SectionPayLangs,` (line 54).

In `sections/index.ts`, remove the `SectionPayLangs` re-export line (search for `SectionPayLangs`).

Delete the two files:

```bash
git -C "C:/Users/dphil/Bertel3.0" rm bertel-tourism-ui/src/features/object-editor/sections/SectionPayLangs.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionPayLangs.test.tsx
```

> If `git rm` is permission-blocked in this environment, delete via the Edit/Write toolchain is not possible for deletion — instead empty the files is NOT acceptable. Use `git rm`; if blocked, leave a note for the PO and stage the rest. (Memory: rm may be permission-denied — fall back to asking the PO to delete, but the registry/barrel no longer reference them so the build stays green.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --silent -- section-config.test.ts section-registry.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/section-config.ts bertel-tourism-ui/src/features/object-editor/section-config.test.ts bertel-tourism-ui/src/features/object-editor/sections/section-registry.tsx bertel-tourism-ui/src/features/object-editor/sections/section-registry.test.tsx bertel-tourism-ui/src/features/object-editor/sections/index.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "refactor(editor): dissolve §12 (payment→§13, langues→§04)"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the full Jest suite**

Run: `npm test --silent` (cwd `bertel-tourism-ui`)
Expected: all suites green (baseline 1138 + new tests; 0 failures).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (cwd `bertel-tourism-ui`)
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build` (cwd `bertel-tourism-ui`)
Expected: EXIT 0.

- [ ] **Step 4: Optional CSS for the level rows**

If the `.lang-levels` / `.lang-levels__row` / `.lang-levels__name` classes need styling (compact 2-col row), add minimal rules to `object-editor.css`. Keep it house-style (no cream/teal). This is cosmetic — the feature works without it.

- [ ] **Step 5: Update decision log + memory**

- Add a §-entry to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` summarizing: §12 dissolved, payment→§13, langues parlées→§04 with level exposed + modal add, spoken-language→description coupling (warn-only, accroche+descriptif), `rcf`↔`cre` alias, frontend-only.
- Update memory index per the project memory workflow.

---

## Self-Review (completed during planning)

- **Spec coverage:** A (Task 3) · B (Tasks 2,4) · C (Tasks 1,4,5) · D (Task 6) · risk/alias (Tasks 1,5) · tests (every task) · round-trip (no-op, verified) — all covered.
- **Placeholder scan:** none — every code step shows the full code.
- **Type consistency:** `spokenCodeToDescKey` / `descLanguageTabs` / `resolveLanguageLabel` signatures match across Tasks 1, 4, 5; `PaymentChips` / `SpokenLanguagesField` props (`{ characteristics, onChange }`) match across Tasks 2, 3, 4; `ObjectWorkspaceCharacteristicsModule` / `ObjectWorkspaceLanguageItem` / `WorkspaceReferenceOption` are the real exported types.
