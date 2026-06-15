import {
  addBedRow,
  applyAdults,
  applyChildren,
  applyCouchagesTotal,
  buildBedRows,
  computeRoomsCapacitySum,
  computeUnitCount,
  removeBedRow,
  roomCouchages,
  setBedType,
  syncDerivedStructural,
  unitCountMetricCode,
  updateBedQuantity,
  upsertMaxCapacity,
} from './rooms-utils';
import type { ObjectWorkspaceRoomBed } from '../../../../services/object-workspace-parser';

const bed = (code: string, q = '1'): ObjectWorkspaceRoomBed =>
  ({ bedTypeId: `id-${code}`, bedTypeCode: code, bedTypeLabel: code, quantity: q });

describe('bed-row helpers', () => {
  it('addBedRow appends a blank row with quantity 1', () => {
    expect(addBedRow([])).toEqual([{ bedTypeId: '', bedTypeCode: '', bedTypeLabel: '', quantity: '1' }]);
  });
  it('setBedType sets the bed type of one row', () => {
    expect(setBedType(addBedRow([]), 0, { id: 'id-double', code: 'double', label: 'Lit double' })).toEqual([
      { bedTypeId: 'id-double', bedTypeCode: 'double', bedTypeLabel: 'Lit double', quantity: '1' },
    ]);
  });
  it('updateBedQuantity clamps to at least 1', () => {
    expect(updateBedQuantity([bed('double')], 0, '0')[0].quantity).toBe('1');
    expect(updateBedQuantity([bed('double')], 0, '3')[0].quantity).toBe('3');
  });
  it('removeBedRow drops the row at the index', () => {
    expect(removeBedRow([bed('double'), bed('single')], 0)).toEqual([bed('single')]);
  });
  it('buildBedRows maps to DB rows, skips unknown codes, dedupes, 1-based position', () => {
    const map = new Map([['double', 'uuid-d'], ['single', 'uuid-s']]);
    expect(buildBedRows([bed('double', '2'), bed('unknown'), bed('single'), bed('double', '5')], map)).toEqual([
      { bed_type_id: 'uuid-d', quantity: 2, position: 1 },
      { bed_type_id: 'uuid-s', quantity: 1, position: 2 },
    ]);
  });
});

describe('roomCouchages / computeRoomsCapacitySum', () => {
  it('uses capacity_total when set', () => {
    expect(roomCouchages({ capacityTotal: '4', capacityAdults: '2' })).toBe(4);
  });
  it('falls back to adults + children when total is empty (the §66 « 0 couchages » bug)', () => {
    expect(roomCouchages({ capacityTotal: '', capacityAdults: '2', capacityChildren: '1' })).toBe(3);
    expect(roomCouchages({ capacityTotal: '', capacityAdults: '2' })).toBe(2);
  });
  it('sums effective couchages × unités (empty quantity = 1)', () => {
    expect(
      computeRoomsCapacitySum([
        { capacityTotal: '', capacityAdults: '2', quantity: '' }, // 2 × 1
        { capacityTotal: '3', quantity: '4' }, // 3 × 4
      ]),
    ).toBe(14);
  });
});

const OPTIONS = [
  { id: 'm-max', code: 'max_capacity', label: 'Capacité max.' },
  { id: 'm-bed', code: 'bedrooms', label: 'Chambres' },
  { id: 'm-pit', code: 'pitches', label: 'Emplacements' },
  { id: 'm-mtg', code: 'meeting_rooms', label: 'Salles de réunion' },
];

type Item = {
  recordId: string | null;
  metricId: string;
  metricCode: string;
  metricLabel: string;
  unit: string;
  value: string;
  effectiveFrom: string;
  effectiveTo: string;
};

function mod(items: Item[] = [], options = OPTIONS) {
  return { metricOptions: options, capacityItems: items };
}

describe('upsertMaxCapacity', () => {
  it('creates a max_capacity item from scratch when none exists', () => {
    const next = upsertMaxCapacity(mod([]), '8');
    expect(next.capacityItems).toHaveLength(1);
    expect(next.capacityItems[0]).toMatchObject({
      recordId: null,
      metricId: 'm-max',
      metricCode: 'max_capacity',
      value: '8',
    });
  });

  it('mutates the existing max_capacity item in place (preserves recordId/metricId)', () => {
    const next = upsertMaxCapacity(
      mod([
        { recordId: 'r1', metricId: 'm-max', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
      ]),
      '9',
    );
    expect(next.capacityItems).toHaveLength(1);
    expect(next.capacityItems[0]).toMatchObject({ recordId: 'r1', metricId: 'm-max', value: '9' });
  });

  it('is a no-op when max_capacity is not applicable (absent from metricOptions)', () => {
    const next = upsertMaxCapacity(mod([], []), '8');
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
    const seeded = mod([
      { recordId: 'b1', metricId: 'm-bed', metricCode: 'bedrooms', metricLabel: 'Chambres', unit: 'chambre', value: '3', effectiveFrom: '', effectiveTo: '' },
    ]);
    const next = syncDerivedStructural(seeded, [], 0, 'HOT');
    expect(next.capacityItems.some((i) => i.metricCode === 'bedrooms')).toBe(false);
  });

  it('never injects a metric absent from metricOptions', () => {
    const next = syncDerivedStructural(mod([], [OPTIONS[0]]), [{ quantity: '3' }], 1, 'HOT');
    expect(next.capacityItems).toHaveLength(0); // ni bedrooms ni meeting_rooms applicables
  });

  it('preserves the loaded max_capacity item untouched', () => {
    const seeded = mod([
      { recordId: 'r1', metricId: 'm-max', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '48', effectiveFrom: '', effectiveTo: '' },
    ]);
    const next = syncDerivedStructural(seeded, [{ quantity: '3' }], 0, 'HOT');
    expect(next.capacityItems.find((i) => i.metricCode === 'max_capacity')).toMatchObject({ recordId: 'r1', value: '48' });
  });
});

describe('couchages lock helpers', () => {
  it('applyCouchagesTotal pre-fills adults = total, children = 0', () => {
    expect(applyCouchagesTotal('4')).toEqual({ capacityTotal: '4', capacityAdults: '4', capacityChildren: '0' });
  });
  it('applyCouchagesTotal treats empty/invalid total as 0 adults', () => {
    expect(applyCouchagesTotal('')).toEqual({ capacityTotal: '', capacityAdults: '0', capacityChildren: '0' });
  });
  it('applyAdults rebalances children so adults + children = total', () => {
    expect(applyAdults('1', '4')).toEqual({ capacityAdults: '1', capacityChildren: '3' });
  });
  it('applyAdults clamps adults to [0, total]', () => {
    expect(applyAdults('9', '4')).toEqual({ capacityAdults: '4', capacityChildren: '0' });
    expect(applyAdults('-2', '4')).toEqual({ capacityAdults: '0', capacityChildren: '4' });
  });
  it('applyChildren rebalances adults so adults + children = total', () => {
    expect(applyChildren('1', '4')).toEqual({ capacityAdults: '3', capacityChildren: '1' });
  });
  it('applyChildren clamps children to [0, total]', () => {
    expect(applyChildren('9', '4')).toEqual({ capacityAdults: '0', capacityChildren: '4' });
  });
});
