import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionMedia } from './SectionMedia';
import { SectionPricing } from './SectionPricing';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { getRegisteredSections } from './section-registry';

describe('section registry', () => {
  it('returns the full ordered section list by archetype', () => {
    // §90: §20 « Distribution & réseaux sociaux » retired (réseaux/distribution moved to §03).
    expect(getRegisteredSections('HEB')).toHaveLength(18);
    expect(getRegisteredSections('ITI')).toHaveLength(20);
    expect(getRegisteredSections('RES')).toHaveLength(19);
  });

  it('omits §07 for HEB (capacity merged into §06) but keeps it elsewhere', () => {
    expect(getRegisteredSections('HEB').some((s) => s.num === '07')).toBe(false);
    expect(getRegisteredSections('RES').some((s) => s.num === '07')).toBe(true);
  });

  it('orders Médias (05) before the type block (06) for HEB', () => {
    const sections = getRegisteredSections('HEB');
    const nums = sections.map((section) => section.num);
    expect(nums.indexOf('05')).toBeLessThan(nums.indexOf('06'));
    expect(sections.find((section) => section.num === '05')?.label).toBe('Médias');
    expect(sections.find((section) => section.num === '06')?.label).toBe('Chambres & capacité');
  });

  it('mounts the HEB registered sections with fixture data', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    // SectionLocation reads location reference options via react-query, so the full
    // registry must render inside a QueryClientProvider (see ObjectDetailView.test.tsx).
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        {getRegisteredSections('HEB').map(({ num, Component }) => (
          <Component key={num} editor={result.current} permissions={allowAll} archetype="HEB" objectId="o1" />
        ))}
      </QueryClientProvider>,
    );
    expect(screen.getByText('Chambres, capacité & séminaire')).toBeInTheDocument();
    expect(screen.getByText('Identifiants externes & synchronisation')).toBeInTheDocument();
  });

  it('marks media and pricing modules dirty when edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    // Open the edit modal for the existing media item, change a field, and save.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier le média/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(result.current.dirtySections.media).toBe(true);

    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);
    // §84 — the amount is edited in the modal now, not inline. Open the seeded "Adulte" line.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier Adulte/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '15' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.pricing).toBe(true);
  });
});
