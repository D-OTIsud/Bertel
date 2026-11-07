# Fusion §06 ↔ §07 hébergement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fusionner la capacité d'accueil (§07) dans le bloc hébergement (§06) pour les types HEB, en faisant de la **capacité max** un champ éditable de plein droit, en masquant §07 pour les HEB, en corrigeant l'alignement des tableaux et en retirant les textes parasites — sans perdre la capacité des 496 fiches live.

**Architecture :** Frontend-only (aucun DDL). Le masquage de §07 se fait dans `makeSections` (miroir du gating `hasPlaces` du §16). La capacité reste persistée dans `object_capacity` via le module `capacityPolicies` (saver `save_object_commercial`, inchangé) — le champ §06 est **bound directement sur `capacityItems`** pour préserver `recordId`/`metricId` au delete-reinsert. Les métriques structurelles (`bedrooms`/`pitches`/`meeting_rooms`) sont dérivées des tables §06 quand elles existent (bonus Explorer). Les contrôles Groupes/Animaux/Environnement sont extraits en composants partagés rendus par §06 (HEB) et §07 (autres types).

**Tech Stack :** React + TypeScript, Vitest/Jest + @testing-library/react, Supabase PostgREST (lecture seule ici). Repo frontend : `bertel-tourism-ui`.

**Invariant de sécurité données (non négociable) :** `save_object_commercial` fait `DELETE object_capacity` puis réinsère le payload `capacities`. Le champ §06 « Capacité max » DOIT muter l'item existant `capacityItems[max_capacity]` en place (recordId/metricId préservés), jamais un state local. Un HEB roomless ouvert puis sauvé sans modification ne doit produire **aucun** appel `save_object_commercial` (module non dirty).

**Tests :** lancer depuis `bertel-tourism-ui/` avec `npm test -- <chemin>` (Vitest). `tsc` via `npm run typecheck` (ou `npx tsc --noEmit`).

---

## Fichiers touchés

| Fichier | Rôle | Tâche |
|---|---|---|
| `src/features/object-editor/section-config.ts` | Omettre §07 + label nav HEB | 1 |
| `src/features/object-editor/section-config.test.ts` | Tests count/label HEB | 1 |
| `src/features/object-editor/sections/section-registry.test.tsx` | Tests count/adjacence HEB | 1 |
| `src/features/object-editor/sections/blocks/BlockHEB.tsx` | Alignement + encart + disclosure + titre | 2, 5, 6 |
| `src/features/object-editor/sections/SectionCapacity.tsx` | Alignement CAP_COLS + rewire contrôles extraits | 2, 4 |
| `src/features/object-editor/sections/blocks/rooms-utils.ts` | Helpers dérivation + upsert max | 3 |
| `src/features/object-editor/sections/blocks/rooms-utils.test.ts` | Tests purs dérivation | 3 |
| `src/features/object-editor/sections/capacity-controls.tsx` (CREATE) | Composants partagés AccueilPolicies + EnvironmentChips | 4 |
| `src/features/object-editor/sections/blocks/BlockHEB.test.tsx` | Tests encart/dérivation/disclosure | 5, 6 |
| `src/features/object-editor/editor-completion.ts` | Règle §06 crédite max_capacity | 7 |
| `src/features/object-editor/ObjectEditPage.tsx` | Score global archétype-aware | 7 |
| `src/features/object-editor/editor-completion.test.ts` | Test règle §06 | 7 |
| `src/features/object-editor/editor-validation.ts` | Retirer le warn « ajoutez une chambre » | 8 |
| `src/features/object-editor/editor-validation.test.ts` (si présent) | Ajuster | 8 |
| `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` | Décision §64 | 9 |
| `.../.claude/projects/.../memory/*` + `CLAUDE.md` | Mémoire / tracker | 9 |

---

## Task 1 : Masquer §07 pour HEB dans `makeSections`

**Files:**
- Modify: `src/features/object-editor/section-config.ts:19-27` (label) et `:40-55` (items)
- Test: `src/features/object-editor/section-config.test.ts`, `src/features/object-editor/sections/section-registry.test.tsx`

- [ ] **Step 1 : Écrire les tests qui échouent (section-config)**

Remplacer le test `omits section 16 for HEB` et le test de label dans `section-config.test.ts` par :

```ts
  it('omits sections 16 and 07 for HEB (capacity absorbed by §06)', () => {
    const flat = makeSections('HEB').flatMap((g) => g.items);
    expect(flat).toHaveLength(20);
    expect(flat.some((s) => s.num === '16')).toBe(false);
    expect(flat.some((s) => s.num === '07')).toBe(false);
  });

  it('keeps section 07 for non-HEB archetypes', () => {
    const res = makeSections('RES').flatMap((g) => g.items);
    expect(res).toHaveLength(21);
    expect(res.some((s) => s.num === '07')).toBe(true);
  });

  it('labels section 06 (type block) per archetype', () => {
    const heb = makeSections('HEB').flatMap((g) => g.items).find((s) => s.num === '06');
    const res = makeSections('RES').flatMap((g) => g.items).find((s) => s.num === '06');
    expect(heb?.label).toBe('Chambres & capacité');
    expect(res?.label).toBe('Cuisine & service');
  });
```

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- section-config.test.ts`
Expected: FAIL (HEB a 21 sections, label `Chambres & séminaire`).

- [ ] **Step 3 : Implémenter le masquage + le label**

Dans `section-config.ts`, changer le label nav HEB :

```ts
const TYPE_BLOCK_LABEL: Record<ArchetypeCode, string> = {
  HEB: 'Chambres & capacité',
  RES: 'Cuisine & service',
  ASC: 'Fiche activité',
  ITI: 'Tracé & étapes',
  VIS: 'Visite & médiation',
  SRV: 'Prestations',
  FMA: 'Dates & programmation',
};
```

Dans `makeSections`, ajouter la garde HEB et rendre §07 conditionnel :

```ts
export function makeSections(archetype: ArchetypeCode): SectionGroup[] {
  const hasPlaces = archetype === 'ITI' || archetype === 'VIS';
  // §06 absorbe la capacité d'accueil pour les hébergements (audit live 2026-06-13 :
  // 0 type de chambre en base, 496 HEB ne portent que max_capacity en §07 ; un seul
  // bloc « fait foi »). §07 reste rendu pour tous les autres archétypes.
  const isHeb = archetype === 'HEB';
  return [
    {
      group: 'Identité',
      items: [
        { num: '01', label: 'Identité & taxonomie' },
        { num: '02', label: 'Localisation' },
        { num: '03', label: 'Contacts' },
      ],
    },
    {
      group: 'Caractéristiques',
      items: [
        { num: '04', label: 'Descriptions' },
        { num: '05', label: 'Médias' },
        { num: '06', label: TYPE_BLOCK_LABEL[archetype] },
        ...(isHeb ? [] : [{ num: '07', label: 'Capacité & accueil' }]),
        { num: '08', label: 'Classifications' },
        { num: '09', label: 'Tags & étiquettes' },
        { num: '10', label: 'Accessibilité' },
        { num: '11', label: 'Démarche durable' },
        { num: '12', label: 'Paiements & langues' },
      ],
    },
    {
      group: 'Tarifs & ouverture',
      items: [
        { num: '13', label: 'Tarifs & extras' },
        { num: '14', label: "Périodes d'ouverture" },
      ],
    },
    {
      group: 'Liens & territoire',
      items: [
        { num: '15', label: 'Liens vers fiches' },
        ...(hasPlaces
          ? [{ num: '16', label: archetype === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux' }]
          : []),
        { num: '17', label: 'Rattachements' },
      ],
    },
    {
      group: 'Gestion',
      items: [
        { num: '18', label: 'Fournisseur' },
        { num: '19', label: 'Suivi prestataire' },
        { num: '20', label: 'Distribution' },
        { num: '21', label: 'Publication' },
        { num: '22', label: 'Identifiants externes' },
      ],
    },
  ];
}
```

- [ ] **Step 4 : Mettre à jour le test du registre (`section-registry.test.tsx`)**

Remplacer les deux premiers `it` :

```ts
  it('returns the full ordered section list by archetype', () => {
    expect(getRegisteredSections('HEB')).toHaveLength(20);
    expect(getRegisteredSections('ITI')).toHaveLength(22);
    expect(getRegisteredSections('RES')).toHaveLength(21);
  });

  it('omits §07 for HEB (capacity merged into §06) but keeps it elsewhere', () => {
    expect(getRegisteredSections('HEB').some((s) => s.num === '07')).toBe(false);
    expect(getRegisteredSections('RES').some((s) => s.num === '07')).toBe(true);
  });

  it('orders Médias (05) before the type block (06) for HEB', () => {
    const nums = getRegisteredSections('HEB').map((section) => section.num);
    expect(nums.indexOf('05')).toBeLessThan(nums.indexOf('06'));
    expect(getRegisteredSections('HEB').find((s) => s.num === '05')?.label).toBe('Médias');
    expect(getRegisteredSections('HEB').find((s) => s.num === '06')?.label).toBe('Chambres & capacité');
  });
```

> Ne pas toucher au test `mounts the HEB registered sections with fixture data` ni à son `getByText('Chambres, équipements & séminaire')` — le titre de la carte change en Task 5, ce test sera ajusté là.

- [ ] **Step 5 : Lancer → vert**

Run: `npm test -- section-config.test.ts section-registry.test.tsx`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/object-editor/section-config.ts src/features/object-editor/section-config.test.ts src/features/object-editor/sections/section-registry.test.tsx
git commit -m "feat(editor): masquer §07 pour HEB (capacité absorbée par §06)"
```

---

## Task 2 : Corriger l'alignement des tableaux (auto→fixe + gap)

**Files:**
- Modify: `src/features/object-editor/sections/blocks/BlockHEB.tsx:14-17` (constantes), `:19-39` (repHeader), `:155` et `:267` (appels repHeader)
- Modify: `src/features/object-editor/sections/SectionCapacity.tsx:32` (CAP_COLS) et `:34-54` (repHeader)
- Test: `src/features/object-editor/sections/blocks/BlockHEB.test.tsx`

- [ ] **Step 1 : Ajouter un helper de montage partagé + le test d'alignement qui échoue**

`BlockHEB.test.tsx` monte aujourd'hui en inline (`renderHook(useObjectEditorState)` + `render`). Ajouter en haut du fichier un helper réutilisable (les tâches 5/6 s'en serviront) :

```ts
import { ReferenceSelect } from '../../primitives'; // (si besoin — sinon ignorer)

/** Monte BlockHEB (HEB/HOT) avec un fixture modifiable. `result.current` reste live après fireEvent. */
function mountHEB(apply?: (m: ReturnType<typeof fullModulesFixture>) => void) {
  const modules = fullModulesFixture();
  // metricOptions enrichi : sans bedrooms/pitches/meeting_rooms, la dérivation serait un no-op
  // silencieux (piège §54). Le fixture par défaut ne contient que max_capacity.
  modules.capacityPolicies.metricOptions = [
    { id: 'cap', code: 'max_capacity', label: 'Capacité max.' },
    { id: 'bed', code: 'bedrooms', label: 'Chambres' },
    { id: 'pit', code: 'pitches', label: 'Emplacements' },
    { id: 'mtg', code: 'meeting_rooms', label: 'Salles de réunion' },
  ];
  apply?.(modules);
  const { result } = renderHook(() => useObjectEditorState('o1', modules));
  const props = { permissions: allowAll, archetype: 'HEB' as const, typeCode: 'HOT' };
  const view = render(<BlockHEB editor={result.current} {...props} />);
  return { result, view, rerender: () => view.rerender(<BlockHEB editor={result.current} {...props} />) };
}
```

> `ReferenceSelect` n'est probablement pas nécessaire — n'ajouter que les imports réellement utilisés (`fireEvent` est déjà importé). Adapter `typeCode` à `'CAMP'` dans les tests dédiés au mapping pitches.

Puis le test d'alignement :

```ts
  it('header and room rows share identical grid tracks ending in a fixed width (no trailing auto)', () => {
    mountHEB((m) => { m.rooms.items = [{ ...m.rooms.items[0], name: 'Suite', quantity: '2' }]; });
    const header = screen.getByText('Couchages').parentElement as HTMLElement;
    const row = screen.getByText('Suite').closest('.rep-row') as HTMLElement;
    expect(header.style.gridTemplateColumns).toBe(row.style.gridTemplateColumns);
    expect(header.style.gridTemplateColumns.trim().endsWith('auto')).toBe(false);
    expect(/\d+px$/.test(header.style.gridTemplateColumns.trim())).toBe(true);
  });
```

> La table chambres est dans le disclosure (Task 6) — au moment de la Task 2 elle est encore toujours visible, donc le test passe. Si la Task 6 est déjà faite, le fixture par défaut a une chambre ⇒ disclosure ouvert ⇒ test OK.

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- BlockHEB.test.tsx -t "fixed width"`
Expected: FAIL (`gridTemplateColumns` finit par `auto`).

- [ ] **Step 3 : Corriger les constantes + le gap + la cellule d'en-tête (BlockHEB)**

Dans `BlockHEB.tsx`, remplacer les constantes :

```ts
// Dernière piste = actions, en LARGEUR FIXE (≈ badge PMR + Modifier + suppression) — un `auto`
// vaut 0px dans l'en-tête (vide) et ~90px dans les lignes, donc le `1.4fr` partagé se résout
// différemment et désaligne les colonnes. Fixe = pistes identiques en-tête vs lignes.
const ROOM_COLS = '14px 1.4fr 70px 70px 70px 80px 120px';
// Pas de handle : l'ordre des salles n'est pas persisté (object_meeting_room n'a pas de position).
const MICE_COLS = '1.4fr 70px 70px 70px 70px 96px';
```

Aligner le `gap` du `repHeader` sur celui de `.rep-row` (10px) :

```ts
function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 10,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={label || `col-${index}`}>{label}</span>
      ))}
    </div>
  );
}
```

> Le `key` passe à `label || col-${index}` car on ajoute des labels vides (cellule actions) qui collisionneraient sur `key=""`.

Ajouter la cellule d'en-tête vide pour les actions aux deux appels :

```ts
{repHeader(ROOM_COLS, ['', 'Type · vue', 'Couchages', 'Surface', 'Unités', 'Tarif', ''])}
```

```ts
{repHeader(MICE_COLS, ['Salle', 'Surface m²', 'Théâtre', 'Classe', 'Conseil', ''])}
```

- [ ] **Step 4 : Corriger aussi `SectionCapacity` (même bug, §07 non-HEB)**

Dans `SectionCapacity.tsx`, remplacer `CAP_COLS` et le `gap` + ajouter la cellule actions :

```ts
const CAP_COLS = '14px 1.3fr 100px 86px 120px 120px 44px';
```

Dans son `repHeader`, passer `gap: 8` → `gap: 10` et la `key` en `label || col-${index}` (même correctif), puis l'appel :

```ts
{repHeader(CAP_COLS, ['', 'Métrique', 'Valeur', 'Unité', 'Depuis', "Jusqu'au", ''])}
```

- [ ] **Step 5 : Lancer → vert**

Run: `npm test -- BlockHEB.test.tsx SectionCapacity.test.tsx`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockHEB.tsx src/features/object-editor/sections/SectionCapacity.tsx src/features/object-editor/sections/blocks/BlockHEB.test.tsx
git commit -m "fix(editor): alignement des tableaux chambres/MICE/capacité (auto→fixe + gap)"
```

---

## Task 3 : `rooms-utils` — upsert max_capacity + dérivation structurelle

**Files:**
- Modify: `src/features/object-editor/sections/blocks/rooms-utils.ts`
- Test: `src/features/object-editor/sections/blocks/rooms-utils.test.ts`

- [ ] **Step 1 : Écrire les tests purs qui échouent**

Ajouter à `rooms-utils.test.ts` :

```ts
import {
  upsertMaxCapacity,
  unitCountMetricCode,
  computeUnitCount,
  syncDerivedStructural,
} from './rooms-utils';

const OPTIONS = [
  { id: 'm-max', code: 'max_capacity', label: 'Capacité max.' },
  { id: 'm-bed', code: 'bedrooms', label: 'Chambres' },
  { id: 'm-pit', code: 'pitches', label: 'Emplacements' },
  { id: 'm-mtg', code: 'meeting_rooms', label: 'Salles de réunion' },
];

function mod(items: any[] = []) {
  return { metricOptions: OPTIONS, capacityItems: items };
}

describe('upsertMaxCapacity', () => {
  it('creates a max_capacity item from scratch when none exists', () => {
    const next = upsertMaxCapacity(mod([]), '8');
    expect(next.capacityItems).toHaveLength(1);
    expect(next.capacityItems[0]).toMatchObject({ recordId: null, metricId: 'm-max', metricCode: 'max_capacity', value: '8' });
  });

  it('mutates the existing max_capacity item in place (preserves recordId/metricId)', () => {
    const next = upsertMaxCapacity(
      mod([{ recordId: 'r1', metricId: 'm-max', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' }]),
      '9',
    );
    expect(next.capacityItems).toHaveLength(1);
    expect(next.capacityItems[0]).toMatchObject({ recordId: 'r1', metricId: 'm-max', value: '9' });
  });

  it('is a no-op when max_capacity is not applicable (absent from metricOptions)', () => {
    const next = upsertMaxCapacity({ metricOptions: [], capacityItems: [] }, '8');
    expect(next.capacityItems).toHaveLength(0);
  });
});

describe('unitCountMetricCode', () => {
  it('maps built lodging to bedrooms', () => {
    expect(unitCountMetricCode('HOT')).toBe('bedrooms');
    expect(unitCountMetricCode('HLO')).toBe('bedrooms');
    expect(unitCountMetricCode('RVA')).toBe('bedrooms');
  });
  it('maps open-air to pitches', () => {
    expect(unitCountMetricCode('HPA')).toBe('pitches');
    expect(unitCountMetricCode('CAMP')).toBe('pitches');
    expect(unitCountMetricCode('camp')).toBe('pitches');
  });
});

describe('computeUnitCount', () => {
  it('sums quantities, empty quantity counts as 1', () => {
    expect(computeUnitCount([{ quantity: '3' }, { quantity: '' }, { quantity: '2' }])).toBe(6);
  });
});

describe('syncDerivedStructural', () => {
  it('derives bedrooms (HOT) and meeting_rooms read-only when present', () => {
    const next = syncDerivedStructural(mod([]), [{ quantity: '3' }, { quantity: '2' }], 1, 'HOT');
    const bed = next.capacityItems.find((i) => i.metricCode === 'bedrooms');
    const mtg = next.capacityItems.find((i) => i.metricCode === 'meeting_rooms');
    expect(bed).toMatchObject({ metricId: 'm-bed', value: '5', recordId: null });
    expect(mtg).toMatchObject({ metricId: 'm-mtg', value: '1' });
  });

  it('derives pitches (CAMP), not bedrooms', () => {
    const next = syncDerivedStructural(mod([]), [{ quantity: '4' }], 0, 'CAMP');
    expect(next.capacityItems.find((i) => i.metricCode === 'pitches')?.value).toBe('4');
    expect(next.capacityItems.some((i) => i.metricCode === 'bedrooms')).toBe(false);
    expect(next.capacityItems.some((i) => i.metricCode === 'meeting_rooms')).toBe(false);
  });

  it('removes a derived row when the count drops to zero', () => {
    const seeded = mod([{ recordId: 'b1', metricId: 'm-bed', metricCode: 'bedrooms', metricLabel: 'Chambres', unit: 'chambre', value: '3', effectiveFrom: '', effectiveTo: '' }]);
    const next = syncDerivedStructural(seeded, [], 0, 'HOT');
    expect(next.capacityItems.some((i) => i.metricCode === 'bedrooms')).toBe(false);
  });

  it('never injects a metric absent from metricOptions', () => {
    const next = syncDerivedStructural({ metricOptions: [OPTIONS[0]], capacityItems: [] }, [{ quantity: '3' }], 1, 'HOT');
    expect(next.capacityItems).toHaveLength(0); // ni bedrooms ni meeting_rooms applicables
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- rooms-utils.test.ts`
Expected: FAIL (imports inexistants).

- [ ] **Step 3 : Implémenter les helpers dans `rooms-utils.ts`**

Ajouter à la fin de `rooms-utils.ts` (réutilise le type `CapacityModuleSlice` déjà défini dans le fichier) :

```ts
type RoomUnitSlice = { quantity: string };

/** Σ unités (quantity vide = 1 unité) — base de la métrique bedrooms/pitches dérivée. */
export function computeUnitCount(items: RoomUnitSlice[]): number {
  return items.reduce((sum, item) => sum + (Number.parseInt(item.quantity, 10) || 1), 0);
}

/** Métrique de comptage d'unités selon le sous-type HEB. Pas de défaut « bedrooms » :
 *  HPA/CAMP utilisent `pitches` (bedrooms n'y est pas applicable → injection gardée-out). */
export function unitCountMetricCode(typeCode: string): 'bedrooms' | 'pitches' {
  const t = (typeCode ?? '').toUpperCase();
  return t === 'HPA' || t === 'CAMP' ? 'pitches' : 'bedrooms';
}

/** Crée OU met à jour en place la ligne max_capacity (préserve recordId/metricId).
 *  No-op si max_capacity n'est pas applicable au type (absent de metricOptions). */
export function upsertMaxCapacity<M extends CapacityModuleSlice>(capacity: M, value: string): M {
  const existing = capacity.capacityItems.find((item) => item.metricCode === 'max_capacity');
  if (existing) {
    return {
      ...capacity,
      capacityItems: capacity.capacityItems.map((item) => (item === existing ? { ...item, value } : item)),
    };
  }
  const metric = capacity.metricOptions.find((option) => option.code === 'max_capacity');
  if (!metric) {
    return capacity;
  }
  return {
    ...capacity,
    capacityItems: [
      ...capacity.capacityItems,
      {
        recordId: null,
        metricId: metric.id,
        metricCode: 'max_capacity',
        metricLabel: metric.label,
        unit: 'pax',
        value,
        effectiveFrom: '',
        effectiveTo: '',
      },
    ],
  };
}

/** Upsert (count>0) ou retrait (count<=0) d'une ligne dérivée lecture seule. Gardé par metricOptions. */
function upsertDerivedRow<M extends CapacityModuleSlice>(capacity: M, code: string, count: number): M {
  if (count <= 0) {
    if (!capacity.capacityItems.some((item) => item.metricCode === code)) {
      return capacity;
    }
    return { ...capacity, capacityItems: capacity.capacityItems.filter((item) => item.metricCode !== code) };
  }
  const metric = capacity.metricOptions.find((option) => option.code === code);
  if (!metric) {
    return capacity;
  }
  const value = String(count);
  const existing = capacity.capacityItems.find((item) => item.metricCode === code);
  if (existing) {
    return {
      ...capacity,
      capacityItems: capacity.capacityItems.map((item) => (item === existing ? { ...item, value } : item)),
    };
  }
  return {
    ...capacity,
    capacityItems: [
      ...capacity.capacityItems,
      { recordId: null, metricId: metric.id, metricCode: code, metricLabel: metric.label, unit: '', value, effectiveFrom: '', effectiveTo: '' },
    ],
  };
}

/** Recalcule les métriques structurelles dérivées (bedrooms|pitches + meeting_rooms) depuis le §06.
 *  Lecture seule (pas d'override). N'agit que sur les métriques applicables au type. */
export function syncDerivedStructural<M extends CapacityModuleSlice>(
  capacity: M,
  rooms: RoomUnitSlice[],
  meetingRoomsCount: number,
  typeCode: string,
): M {
  let next = upsertDerivedRow(capacity, unitCountMetricCode(typeCode), computeUnitCount(rooms));
  next = upsertDerivedRow(next, 'meeting_rooms', meetingRoomsCount);
  return next;
}
```

- [ ] **Step 4 : Lancer → vert**

Run: `npm test -- rooms-utils.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/object-editor/sections/blocks/rooms-utils.ts src/features/object-editor/sections/blocks/rooms-utils.test.ts
git commit -m "feat(editor): rooms-utils — upsert max_capacity + dérivation bedrooms/pitches/meeting_rooms"
```

---

## Task 4 : Extraire les contrôles partagés (AccueilPolicies + EnvironmentChips)

But : rendre Groupes/Animaux/Environnement depuis §06 (HEB) ET §07 (autres types) sans dupliquer le JSX. Refactor pur — comportement de §07 inchangé.

**Files:**
- Create: `src/features/object-editor/sections/capacity-controls.tsx`
- Modify: `src/features/object-editor/sections/SectionCapacity.tsx` (remplacer les blocs Environnement + Groupes + Animaux par les composants extraits)
- Test: `src/features/object-editor/sections/SectionCapacity.test.tsx` (doit rester vert sans modif)

- [ ] **Step 1 : Créer `capacity-controls.tsx`**

```tsx
import { Chip, ChipSet, Field, Input, Select, Textarea, Toggle } from '../primitives';
import type { ObjectEditorState } from '../useObjectEditorState';
import { ModuleUnavailableNotice } from './blocks/block-notes';

type CapacityModule = ObjectEditorState['draft']['capacityPolicies'];
type CharacteristicsModule = ObjectEditorState['draft']['characteristics'];

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

/** Chips « Cadre / environnement » — rendu partagé §06 (HEB) / §07 (autres types).
 *  Source d'état unique : editor.draft.characteristics (aucune désynchro même si deux mounts). */
export function EnvironmentChips({
  characteristics,
  onChange,
}: {
  characteristics: CharacteristicsModule;
  onChange: (next: CharacteristicsModule) => void;
}) {
  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Cadre / environnement
      </div>
      {characteristics.unavailableReason ? (
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      ) : (
        <ChipSet>
          {characteristics.environmentOptions.map((option) => (
            <Chip
              key={option.code}
              label={option.label}
              on={characteristics.selectedEnvironmentCodes.includes(option.code)}
              onClick={() =>
                onChange({
                  ...characteristics,
                  selectedEnvironmentCodes: toggleCode(characteristics.selectedEnvironmentCodes, option.code),
                })
              }
            />
          ))}
        </ChipSet>
      )}
    </>
  );
}

/** Groupes + Politique d'accueil (animaux, tri-état) — rendu partagé §06 / §07. */
export function AccueilPolicies({
  capacity,
  onChange,
}: {
  capacity: CapacityModule;
  onChange: (next: CapacityModule) => void;
}) {
  return (
    <>
      <div style={{ marginTop: 16 }}>
        <Field label="Groupes">
          <div className="grid-2">
            <Input
              value={capacity.groupPolicy.minSize}
              placeholder="Min"
              mono
              onChange={(minSize) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, minSize } })}
            />
            <Input
              value={capacity.groupPolicy.maxSize}
              placeholder="Max"
              mono
              onChange={(maxSize) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, maxSize } })}
            />
          </div>
          <Toggle
            label="Groupes uniquement"
            on={capacity.groupPolicy.groupOnly}
            onChange={(groupOnly) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, groupOnly } })}
          />
          <Textarea
            value={capacity.groupPolicy.notes}
            rows={3}
            onChange={(notes) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, notes } })}
          />
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Politique d'accueil
      </div>
      <div className="grid-3">
        <div>
          <Field label="Animaux">
            <Select
              value={capacity.petPolicy.accepted === null ? '' : capacity.petPolicy.accepted ? 'accepted' : 'refused'}
              options={[
                { v: '', l: '— Non renseigné —' },
                { v: 'accepted', l: 'Acceptés' },
                { v: 'refused', l: 'Non acceptés' },
              ]}
              aria-label="Animaux"
              onChange={(next) =>
                onChange({
                  ...capacity,
                  petPolicy: { ...capacity.petPolicy, accepted: next === '' ? null : next === 'accepted' },
                })
              }
            />
          </Field>
          {capacity.petPolicy.accepted !== null && (
            <Field label="Conditions d'accueil des animaux">
              <Textarea
                aria-label="Conditions d'accueil des animaux"
                value={capacity.petPolicy.conditions}
                rows={3}
                onChange={(conditions) =>
                  onChange({ ...capacity, petPolicy: { ...capacity.petPolicy, conditions } })
                }
              />
            </Field>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2 : Rewire `SectionCapacity.tsx` pour consommer les composants extraits**

Remplacer le bloc `Cadre / environnement` (≈ l.163-186) ET les blocs `Groupes` + `Politique d'accueil` (≈ l.188-282) par :

```tsx
      <EnvironmentChips
        characteristics={characteristics}
        onChange={(next) => editor.replaceModule('characteristics', next)}
      />

      <AccueilPolicies
        capacity={capacity}
        onChange={(next) => editor.replaceModule('capacityPolicies', next)}
      />
```

Ajouter l'import en tête : `import { AccueilPolicies, EnvironmentChips } from './capacity-controls';` et retirer les imports devenus inutiles (`Chip`, `ChipSet`, `Toggle`, `Textarea` si plus référencés ailleurs dans le fichier — vérifier avant de retirer) ainsi que le helper local `toggleCode`.

- [ ] **Step 3 : Lancer → vert (comportement §07 inchangé)**

Run: `npm test -- SectionCapacity.test.tsx`
Expected: PASS (les chips/groupes/animaux se comportent identiquement).

- [ ] **Step 4 : `tsc`**

Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/object-editor/sections/capacity-controls.tsx src/features/object-editor/sections/SectionCapacity.tsx
git commit -m "refactor(editor): extraire AccueilPolicies + EnvironmentChips (partagés §06/§07)"
```

---

## Task 5 : `BlockHEB` — encart « Capacité d'accueil » + retrait textes parasites

**Files:**
- Modify: `src/features/object-editor/sections/blocks/BlockHEB.tsx`
- Test: `src/features/object-editor/sections/blocks/BlockHEB.test.tsx`

- [ ] **Step 1 : Écrire les tests qui échouent (via `mountHEB`, helper ajouté en Task 2)**

```ts
  it('renders an editable Capacité max field bound to capacityItems, even with zero rooms', () => {
    const { result } = mountHEB((m) => {
      m.rooms.items = [];
      m.capacityPolicies.capacityItems = [
        { recordId: 'r1', metricId: 'cap', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
      ];
    });
    const field = screen.getByLabelText('Capacité max.') as HTMLInputElement;
    expect(field.value).toBe('8');
    act(() => { fireEvent.change(field, { target: { value: '9' } }); });
    const item = result.current.draft.capacityPolicies.capacityItems.find((i) => i.metricCode === 'max_capacity');
    expect(item).toMatchObject({ recordId: 'r1', metricId: 'cap', value: '9' }); // recordId/metricId préservés
  });

  it('creates a max_capacity item from scratch on a capacity-less object (no write-trap)', () => {
    const { result } = mountHEB((m) => { m.rooms.items = []; m.capacityPolicies.capacityItems = []; });
    act(() => { fireEvent.change(screen.getByLabelText('Capacité max.'), { target: { value: '6' } }); });
    expect(result.current.draft.capacityPolicies.capacityItems).toEqual([
      expect.objectContaining({ recordId: null, metricCode: 'max_capacity', value: '6' }),
    ]);
  });

  it('does NOT mark capacityPolicies dirty when a roomless object is merely rendered', () => {
    const { result } = mountHEB((m) => {
      m.rooms.items = [];
      m.capacityPolicies.capacityItems = [
        { recordId: 'r1', metricId: 'cap', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
      ];
    });
    expect(result.current.dirtySections['capacity-policies']).toBeFalsy();
  });

  it('no longer shows the parasitic « … reportée … §07 » text', () => {
    mountHEB((m) => { m.capacityPolicies.capacityItems = []; });
    expect(screen.queryByText(/reportée/i)).toBeNull();
  });

  it('shows a Chambres tile (derived unit count) when rooms exist, hidden when none', () => {
    mountHEB((m) => { m.rooms.items = [{ ...m.rooms.items[0], quantity: '3' }]; });
    expect(screen.getByText('Chambres')).toBeInTheDocument(); // libellé exact ≠ « Chambres / unités locatives »

    mountHEB((m) => { m.rooms.items = []; m.meetingRooms.items = []; });
    expect(screen.queryByText('Chambres')).toBeNull();
  });
```

> `mountHEB` fournit déjà un `metricOptions` riche (max_capacity/bedrooms/pitches/meeting_rooms) — indispensable pour que `upsertMaxCapacity` ne soit pas un no-op (piège §54). Le module dirty est keyé `'capacity-policies'` (cf. `MODULE_KEY_MAP`).

- [ ] **Step 1b : RETOURNER les tests §48 (l'accueil revient en §06 pour HEB)**

`BlockHEB.test.tsx` contient deux `describe` qui encodent la décision §48 *inverse* (« BlockHEB n'héberge PAS groupes/animaux — c'est §07 ») : `BlockHEB pet policy (moved to §07 — PO 2026-06-11)` et `BlockHEB — single-owner surfaces (§48)`. Cette passe **inverse** §48 pour les HEB (puisque §07 est masqué). **Remplacer** ces deux `describe` par :

```ts
describe('BlockHEB — accueil rapatrié en §06 (§64, §07 masqué pour HEB)', () => {
  it('hosts the pet policy (Animaux) in §06', () => {
    mountHEB((m) => { m.capacityPolicies.petPolicy.accepted = true; });
    expect(screen.getByLabelText('Animaux')).toBeInTheDocument();
    expect(screen.getByText("Politique d'accueil")).toBeInTheDocument();
  });

  it('hosts the group policy (Groupes) in §06', () => {
    mountHEB();
    expect(screen.getByText('Groupes')).toBeInTheDocument();
    expect(screen.getByText('Groupes uniquement')).toBeInTheDocument();
  });

  it('hosts the environment chips (Cadre / environnement) in §06', () => {
    mountHEB();
    expect(screen.getByText('Cadre / environnement')).toBeInTheDocument();
    expect(screen.getByText('Jardin')).toBeInTheDocument(); // environmentOptions du fixture
  });
});
```

> `Field label="Groupes"` rend le texte « Groupes » ; `Toggle label="Groupes uniquement"` rend ce texte ; `Field label="Animaux"` + `Select aria-label="Animaux"` ⇒ `getByLabelText('Animaux')`. Ces libellés viennent de `capacity-controls.tsx` (Task 4).

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- BlockHEB.test.tsx -t "Capacité max"`
Expected: FAIL (champ inexistant).

- [ ] **Step 3 : Implémenter l'encart dans `BlockHEB.tsx`**

Imports en tête (ajouter) :

```ts
import { Fs, Input, Field, Repeater, SortableList, StatCard } from '../../primitives';
import { AccueilPolicies, EnvironmentChips } from '../capacity-controls';
import {
  computeUnitCount,
  nextRoomCode,
  reindexRoomPositions,
  syncCapacityWithRooms,
  syncDerivedStructural,
  unitCountMetricCode,
  upsertMaxCapacity,
} from './rooms-utils';
```

Signature : ajouter `typeCode` à la déstructuration :

```ts
export function BlockHEB({ editor, folded, typeCode }: SectionProps) {
  const rooms = editor.draft.rooms;
  const meetingRooms = editor.draft.meetingRooms;
  const capacity = editor.draft.capacityPolicies;
  const characteristics = editor.draft.characteristics;
  const type = typeCode ?? '';
```

Remplacer `setRoomItems` (garder le sync max + ajouter la dérivation structurelle) :

```ts
  function setRoomItems(nextItems: ObjectWorkspaceRoomTypeItem[]) {
    editor.replaceModule('rooms', { ...rooms, items: nextItems });
    const synced = syncCapacityWithRooms(capacity, rooms.items, nextItems) ?? capacity;
    editor.replaceModule('capacityPolicies', syncDerivedStructural(synced, nextItems, meetingRooms.items.length, type));
  }

  function setMeetingItems(nextItems: ObjectWorkspaceMeetingRoomItem[]) {
    editor.replaceModule('meetingRooms', { ...meetingRooms, items: nextItems });
    editor.replaceModule('capacityPolicies', syncDerivedStructural(capacity, rooms.items, nextItems.length, type));
  }

  function setMaxCapacity(value: string) {
    editor.replaceModule('capacityPolicies', upsertMaxCapacity(capacity, value));
  }
```

> Rebrancher les boutons de salle (add/remove) sur `setMeetingItems` au lieu des `editor.replaceModule('meetingRooms', …)` inline (3 sites : onAdd via creatingMeeting onSave, le bouton suppression, et le onSave du modal d'édition garde `updateMeetingRoom`).

Dérivés pour l'affichage (tuiles calculées DIRECTEMENT depuis les tables §06 — indépendant du recalcul du métrique persisté) :

```ts
  const maxCapValue = capacity.capacityItems.find((item) => item.metricCode === 'max_capacity')?.value ?? '';
  const unitCount = computeUnitCount(rooms.items);
  const unitLabel = unitCountMetricCode(type) === 'pitches' ? 'Emplacements' : 'Chambres';
```

Mettre à jour le titre/sous-titre de `<Fs>` :

```tsx
    <Fs
      num="06"
      title="Chambres, capacité & séminaire"
      sub="Capacité d'accueil, groupes et animaux — et inventaire détaillé des chambres et salles MICE. Alimente les filtres Explorer et la fiche publique."
      folded={folded}
      pill={pill}
    >
```

Insérer l'encart **en tête du corps** (juste après l'ouverture de `<Fs>`, avant le bloc rooms) :

```tsx
      <div className="chip-group__label" style={{ marginTop: 0 }}>Capacité d'accueil</div>
      <div className="grid-3" style={{ marginBottom: 6 }}>
        <Field label="Capacité max.">
          <Input
            value={maxCapValue}
            type="number"
            mono
            aria-label="Capacité max."
            onChange={setMaxCapacity}
          />
        </Field>
        {rooms.items.length > 0 && <StatCard label={unitLabel} value={String(unitCount)} />}
        {meetingRooms.items.length > 0 && <StatCard label="Salles de réunion" value={String(meetingRooms.items.length)} />}
      </div>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 12 }}>
        Capacité d'accueil totale. Si vous détaillez les chambres ci-dessous, elle se calcule
        automatiquement — ajustez au besoin (lit d'appoint).
      </p>

      <EnvironmentChips characteristics={characteristics} onChange={(next) => editor.replaceModule('characteristics', next)} />
      <AccueilPolicies capacity={capacity} onChange={(next) => editor.replaceModule('capacityPolicies', next)} />
```

Supprimer le texte parasite « Capacité cumulée … reportée … §07 » (le `{rooms.items.length > 0 && (<p>…reportée…</p>)}`) et **resserrer** la note PMR :

```tsx
          {accessibleRoomsCount > 0 && (
            <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              ♿ {accessibleRoomsCount} PMR — équipements en §10.
            </p>
          )}
```

> `roomsCapacitySum` / `computeRoomsCapacitySum` ne servent plus à l'affichage (le cumul est porté par le champ Capacité max). Retirer la variable `roomsCapacitySum` si elle devient inutilisée (sinon `tsc`/lint la signalera).

- [ ] **Step 4 : Ajuster le test de montage du registre (titre de carte)**

Dans `section-registry.test.tsx`, le test `mounts the HEB registered sections with fixture data` cherche `getByText('Chambres, équipements & séminaire')`. Le remplacer par le nouveau titre :

```ts
    expect(screen.getByText('Chambres, capacité & séminaire')).toBeInTheDocument();
```

- [ ] **Step 5 : Lancer → vert**

Run: `npm test -- BlockHEB.test.tsx section-registry.test.tsx`
Expected: PASS.

- [ ] **Step 6 : `tsc`**

Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 7 : Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockHEB.tsx src/features/object-editor/sections/blocks/BlockHEB.test.tsx src/features/object-editor/sections/section-registry.test.tsx
git commit -m "feat(editor): §06 encart Capacité d'accueil (max éditable + tuiles dérivées + accueil), retrait textes parasites"
```

---

## Task 6 : `BlockHEB` — disclosure repliable des tables chambres/MICE

**Files:**
- Modify: `src/features/object-editor/sections/blocks/BlockHEB.tsx`
- Test: `src/features/object-editor/sections/blocks/BlockHEB.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue (via `mountHEB`)**

```ts
  it('collapses the room/MICE detail by default when there are no rooms', () => {
    mountHEB((m) => { m.rooms.items = []; m.meetingRooms.items = []; });
    const toggle = screen.getByRole('button', { name: /Détailler les chambres/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Chambres / unités locatives')).toBeNull();
  });

  it('expands the detail by default when rooms already exist', () => {
    mountHEB(); // le fixture par défaut a une chambre
    expect(screen.getByRole('button', { name: /Détailler les chambres/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Chambres / unités locatives')).toBeInTheDocument();
  });
```

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- BlockHEB.test.tsx -t "Détailler"`
Expected: FAIL.

- [ ] **Step 3 : Implémenter le disclosure**

Ajouter l'état (init ouvert si du contenu existe) :

```ts
  const [detailOpen, setDetailOpen] = useState<boolean>(rooms.items.length > 0 || meetingRooms.items.length > 0);
```

Envelopper les DEUX blocs tables (Chambres/unités + Salles MICE) dans un disclosure. Insérer, juste avant le bloc `rooms.unavailableReason ? … : (<> … chambres … salles … </>)` un bouton, et ne rendre le contenu que si `detailOpen` :

```tsx
      <button
        type="button"
        className="rep-add"
        aria-expanded={detailOpen}
        onClick={() => setDetailOpen((open) => !open)}
        style={{ marginTop: 6 }}
      >
        {detailOpen ? '▾' : '▸'} Détailler les chambres / unités & salles
      </button>

      {detailOpen && (
        <div style={{ marginTop: 8 }}>
          {/* bloc Chambres/unités (rooms.unavailableReason ? notice : table) */}
          {/* bloc Salles séminaire & événementiel (meetingRooms.unavailableReason ? notice : table) */}
        </div>
      )}
```

> Déplacer les deux blocs existants (rooms + meetingRooms, avec leurs modals) à l'intérieur du `{detailOpen && (…)}`. Les modals (`editingRoom`, `creatingRoom`, `editingMeeting`, `creatingMeeting`) restent dans ce sous-arbre — ils ne s'ouvrent que depuis les boutons de la table, donc disponibles uniquement quand le détail est ouvert (cohérent).

- [ ] **Step 4 : Lancer → vert**

Run: `npm test -- BlockHEB.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockHEB.tsx src/features/object-editor/sections/blocks/BlockHEB.test.tsx
git commit -m "feat(editor): §06 tables chambres/MICE en disclosure repliable (repliée si vide)"
```

---

## Task 7 : Score de complétion archétype-aware + règle §06

**Files:**
- Modify: `src/features/object-editor/editor-completion.ts:86-92` (règle '06')
- Modify: `src/features/object-editor/ObjectEditPage.tsx:151` (nums filtrés)
- Test: `src/features/object-editor/editor-completion.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `editor-completion.test.ts` :

```ts
  it('§06 counts a roomless HEB as complete when max_capacity has a value', () => {
    const draft = makeDraft(); // helper existant du fichier
    draft.rooms.items = [];
    draft.rooms.unavailableReason = null;
    draft.capacityPolicies.capacityItems = [
      { recordId: 'r1', metricId: 'm', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
    ];
    expect(computeSectionCompletion('06', draft)).toBe(100);
  });
```

> Si le fichier n'a pas de `makeDraft`, utiliser le fixture existant (`fullModulesFixture()` ou équivalent) puis surcharger `rooms`/`capacityPolicies`.

- [ ] **Step 2 : Lancer → échec**

Run: `npm test -- editor-completion.test.ts -t "roomless HEB"`
Expected: FAIL (§06 = 0 sans chambre).

- [ ] **Step 3 : Étendre la règle '06'**

Dans `editor-completion.ts`, règle `'06'` :

```ts
  '06': {
    fields: [
      // §46-gated (RES menus, etc.) → complet ; sinon chambres présentes ; sinon (HEB roomless)
      // crédité par une capacité max renseignée — la capacité d'accueil vit désormais en §06 (HEB).
      (draft) =>
        Boolean(draft.rooms?.unavailableReason) ||
        (draft.rooms?.items.length ?? 0) > 0 ||
        draft.capacityPolicies.capacityItems.some((item) => item.metricCode === 'max_capacity' && hasText(item.value)),
    ],
  },
```

- [ ] **Step 4 : Rendre le score global archétype-aware (`ObjectEditPage.tsx`)**

Remplacer `:151` `const overallCompletion = useMemo(() => computeOverallCompletion(editor.draft), [editor.draft]);` par un score filtré sur les sections réellement rendues (navItems exclut déjà §07 pour HEB) :

```ts
  const scoredNums = useMemo(
    () => SCORE_SECTION_NUMS.filter((num) => navItems.some((item) => item.num === num)),
    [navItems],
  );
  const overallCompletion = useMemo(
    () => computeOverallCompletion(editor.draft, scoredNums),
    [editor.draft, scoredNums],
  );
```

Ajouter l'import : `import { computeOverallCompletion, computeSectionCompletions, SCORE_SECTION_NUMS } from './editor-completion';` (et exporter `SCORE_SECTION_NUMS` depuis `editor-completion.ts` s'il ne l'est pas : `export const SCORE_SECTION_NUMS = [...]`).

- [ ] **Step 5 : Lancer → vert + tsc**

Run: `npm test -- editor-completion.test.ts && npm run typecheck`
Expected: PASS, 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/features/object-editor/editor-completion.ts src/features/object-editor/ObjectEditPage.tsx src/features/object-editor/editor-completion.test.ts
git commit -m "feat(editor): score §06 crédite max_capacity (HEB) + score global archétype-aware"
```

---

## Task 8 : Retirer le warn de publication « ajoutez une chambre » (HEB)

Justification : chambres = détail optionnel → le warn naggait 485/485 HLO loués en entier.

**Files:**
- Modify: `src/features/object-editor/editor-validation.ts:111-116`
- Test: `src/features/object-editor/editor-validation.test.ts` (si présent)

- [ ] **Step 1 : Vérifier la couverture de test existante**

Run: `git grep -n "type de chambre ou d" src/features/object-editor`
Si un test asserte ce warn, le retirer/ajuster à l'étape 3.

- [ ] **Step 2 : Écrire/ajuster le test**

Si `editor-validation.test.ts` existe, ajouter :

```ts
  it('does not warn a roomless HEB to add a room type (rooms are optional)', () => {
    const draft = makeDraft();
    draft.rooms.items = [];
    draft.rooms.unavailableReason = null;
    const result = validateForPublication(draft, allowAll, 'HEB');
    expect([...result.blockers, ...result.warnings].some((i) => /type de chambre/i.test(i.message))).toBe(false);
  });
```

- [ ] **Step 3 : Retirer la règle**

Dans `editor-validation.ts`, supprimer le bloc :

```ts
  ({ archetype, draft }) =>
    archetype === 'HEB' && !draft.rooms.unavailableReason && draft.rooms.items.length === 0
      ? { section: '06', message: "Ajoutez au moins un type de chambre ou d'unité locative.", tone: 'warn' }
      : null,
```

> Conserver la règle PMR (§10) qui suit — elle reste valide. Si un test existant asserte ce warn, le retirer.

- [ ] **Step 4 : Lancer → vert**

Run: `npm test -- editor-validation`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/object-editor/editor-validation.ts src/features/object-editor/editor-validation.test.ts
git commit -m "fix(editor): retirer le warn 'ajoutez une chambre' (chambres optionnelles pour HEB)"
```

---

## Task 9 : Documentation (décision log + mémoire)

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
- Modify: `CLAUDE.md` (tracker write-traps), `…/memory/editor-review-2026-06.md` + `MEMORY.md`

- [ ] **Step 1 : Suite complète verte + tsc**

Run: `npm test && npm run typecheck`
Expected: toute la suite FE verte, 0 erreur tsc. Noter le nombre de suites/tests.

- [ ] **Step 2 : Ajouter la décision §64 au log**

Dans `lot1_mapping_decisions.md`, ajouter une entrée §64 résumant : audit live (0 chambre, 496 HEB = max_capacity en §07, 485/497 locatifs entiers) → §06 « Chambres, capacité & séminaire » absorbe la capacité d'accueil (capacité max éditable bound sur `capacityItems`, tuiles dérivées bedrooms/pitches/meeting_rooms via `syncDerivedStructural`, groupes/animaux/environnement extraits en `capacity-controls.tsx`), §07 masqué pour HEB, tables chambres/MICE en disclosure, alignement corrigé (auto→fixe + gap), warn « ajoutez une chambre » retiré, score §06 crédite max_capacity. Lister les commits et la garantie de non-régression (roomless save = no-op). Mettre à jour la ligne différée « Editor §07 capacity-metric filtering ».

- [ ] **Step 3 : Mettre à jour CLAUDE.md + mémoire**

- `CLAUDE.md` : ajouter au tracker « Editor — no silent write-traps » une ligne §64 (HEB : capacité d'accueil fusionnée en §06, §07 masqué pour HEB).
- `…/memory/editor-review-2026-06.md` : ajouter l'état « §06/§07 HEB fusionnés (§64) » et `MEMORY.md` le pointeur.

- [ ] **Step 4 : Commit**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md CLAUDE.md
git commit -m "docs: §64 fusion §06↔§07 hébergement (décision + tracker)"
```

> Note : `CLAUDE.md` et les briefs sont gitignored localement (cf. mémoire) — commit best-effort ; l'essentiel est le contenu à jour.

---

## Self-review (déjà effectué)

- **Couverture spec :** §4-A (Task 1) · §4-B encart + bind + create + duplication (Task 4,5) · §4-B.2 disclosure (Task 6) · §4-C retrait repeater HEB = par construction (BlockHEB n'utilise pas le repeater) · §4-D dérivation + mapping typeCode (Task 3,5) · §4-E alignement (Task 2) · §4-F textes parasites + PMR (Task 5) · §5 sécurité données (tests Task 5) · §7 tests (Tasks 1-8) · §8 completion + validation (Task 7,8) + doc (Task 9). ✓
- **Type consistency :** `upsertMaxCapacity`/`syncDerivedStructural`/`unitCountMetricCode`/`computeUnitCount` définis Task 3, consommés Task 5 — signatures identiques. `SCORE_SECTION_NUMS` exporté Task 7. `EnvironmentChips`/`AccueilPolicies` définis Task 4, consommés Task 4 (SectionCapacity) + Task 5 (BlockHEB). ✓
- **Placeholders :** aucun — code complet à chaque étape ; le helper `mountHEB` est défini en Task 2 et réutilisé (Tasks 5/6) ; `makeDraft` (Tasks 7/8) est signalé « réutiliser le fixture si absent » avec son contrat. ✓
- **Conflit de tests existants traité :** les deux `describe` §48 de `BlockHEB.test.tsx` qui affirmaient l'absence d'accueil en §06 sont explicitement **retournés** en Task 5 Step 1b (l'accueil revient en §06 puisque §07 est masqué pour HEB). ✓
- **Régression non-HEB :** §07 (`SectionCapacity`) reste monté et inchangé pour RES/ASC/ITI/VIS/SRV/FMA ; les contrôles partagés (Task 4) sont un refactor pur (mêmes libellés). ✓
```
