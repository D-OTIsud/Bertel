import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionOpenings } from './SectionOpenings';
import { SectionPricing } from './SectionPricing';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { createDiscountRow } from './discount-row';

type Kind = 'period' | 'closure' | 'price' | 'discount';

function setup(kind: Kind, persisted = true) {
  const modules = fullModulesFixture();
  const firstId = persisted ? 'target' : null;
  const otherId = persisted ? 'other' : null;
  const opening = kind === 'period' || kind === 'closure';
  if (opening) {
    const base = modules.openings.periods[0];
    modules.openings.periods = [
      { ...base, recordId: firstId, label: 'Cible', isClosure: kind === 'closure' },
      { ...base, recordId: otherId, label: 'Autre', isClosure: kind === 'closure' },
    ];
  } else if (kind === 'price') {
    const base = modules.pricing.prices[0];
    modules.pricing.prices = [{ ...base, recordId: firstId, kindLabel: 'Cible' }, { ...base, recordId: otherId, kindLabel: 'Autre' }];
  } else {
    const base = createDiscountRow();
    modules.pricing.discounts = [{ ...base, recordId: firstId, conditions: 'Cible' }, { ...base, recordId: otherId, conditions: 'Autre' }];
  }
  const hook = renderHook(() => useObjectEditorState('o1', modules));
  const replace = jest.fn((...args: Parameters<typeof hook.result.current.replaceModule>) => hook.result.current.replaceModule(...args));
  const content = () => opening
    ? <SectionOpenings editor={{ ...hook.result.current, replaceModule: replace }} permissions={allowAll} />
    : <SectionPricing editor={{ ...hook.result.current, replaceModule: replace }} permissions={allowAll} />;
  const view = render(content());
  const rows = () => opening ? hook.result.current.draft.openings.periods
    : kind === 'price' ? hook.result.current.draft.pricing.prices : hook.result.current.draft.pricing.discounts;
  function changeRows(next: ReturnType<typeof rows>) {
    act(() => {
      if (opening) hook.result.current.replaceModule('openings', { ...hook.result.current.draft.openings, periods: next as typeof modules.openings.periods });
      else if (kind === 'price') hook.result.current.replaceModule('pricing', { ...hook.result.current.draft.pricing, prices: next as typeof modules.pricing.prices });
      else hook.result.current.replaceModule('pricing', { ...hook.result.current.draft.pricing, discounts: next as typeof modules.pricing.discounts });
    });
    view.rerender(content());
  }
  const request = () => fireEvent.click(screen.getByRole('button', { name: 'Supprimer Cible' }));
  return { hook, replace, rows, changeRows, request };
}

describe.each<Kind>(['period', 'closure', 'price', 'discount'])('editor confirmation: %s', (kind) => {
  it('cancel and Escape preserve the complete draft', () => {
    const fixture = setup(kind);
    const before = fixture.hook.result.current.draft;
    fixture.request();
    expect(fixture.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(fixture.hook.result.current.draft).toEqual(before);
    fixture.request();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(fixture.hook.result.current.draft).toEqual(before);
  });

  it.each([true, false])('deletes the requested row after reordering, persisted=%s', (persisted) => {
    const fixture = setup(kind, persisted);
    const [target, other] = fixture.rows();
    fixture.request();
    fixture.changeRows(persisted ? [{ ...other }, { ...target }] as ReturnType<typeof fixture.rows> : [other, target] as ReturnType<typeof fixture.rows>);
    const confirm = screen.getByRole('button', { name: 'Supprimer' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    expect(fixture.rows()).toEqual([other]);
  });

  it('does not delete a replacement row when the original target disappears', () => {
    const fixture = setup(kind);
    const other = fixture.rows()[1];
    fixture.request();
    fixture.changeRows([other] as ReturnType<typeof fixture.rows>);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(fixture.rows()).toEqual([other]);
  });
});
