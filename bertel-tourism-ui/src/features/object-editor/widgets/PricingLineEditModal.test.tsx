import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PricingLineEditModal } from './PricingLineEditModal';
import { createPricingDraft } from '../sections/pricing-row';
import { fullModulesFixture } from '../sections/section-fixture.test-utils';

const pricing = () => fullModulesFixture().pricing;
const renderModal = (props: Partial<Parameters<typeof PricingLineEditModal>[0]> = {}) => {
  const onSave = jest.fn();
  const p = pricing();
  render(
    <PricingLineEditModal
      open
      mode="add"
      pricing={p}
      draft={createPricingDraft(p)}
      onClose={jest.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
};
const click = (el: HTMLElement) => act(() => { fireEvent.click(el); });
const change = (el: HTMLElement, value: string) => act(() => { fireEvent.change(el, { target: { value } }); });

describe('PricingLineEditModal (C · Aperçu)', () => {
  it('surfaces the public, the type, the price mode and the unit', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Ajouter un tarif' })).toBeInTheDocument();
    expect(screen.getByLabelText('Public / bénéficiaire')).toBeInTheDocument();
    expect(screen.getByLabelText('Type de tarif')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Forme du prix' })).toBeInTheDocument();
    expect(screen.getByLabelText('Unité')).toBeInTheDocument();
    // No raw « Montant max. » field until the range mode is chosen.
    expect(screen.queryByLabelText('Montant maximum')).toBeNull();
  });

  it('refuses to save without an amount and says why, then saves once filled', () => {
    const { onSave } = renderModal();
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Indiquez un montant.')).toBeInTheDocument();
    expect(screen.getByText(/1 point à corriger/)).toBeInTheDocument();

    change(screen.getByLabelText('Montant'), '25');
    change(screen.getByLabelText('Type de tarif'), 'option');
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: '25', amountMax: '', indicationCode: 'option' }));
  });

  it('blocks save until a public is chosen', () => {
    const p = pricing();
    const { onSave } = renderModal({ draft: { ...createPricingDraft(p), kindCode: '', kindId: '', kindLabel: '', amount: '10' } });
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/public|qui/i);
  });

  it('opens an existing min–max line in « Fourchette » and flags an inverted range', () => {
    const p = pricing();
    renderModal({ mode: 'edit', editIndex: 0, draft: { ...p.prices[0], amount: '20', amountMax: '12' } });
    expect(screen.getByRole('radio', { name: 'Fourchette' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/supérieur au prix le plus bas/)).toBeInTheDocument();
  });

  it('saves a free line as amount 0 with no maximum', () => {
    const { onSave } = renderModal();
    click(screen.getByRole('radio', { name: 'Gratuit' }));
    expect(screen.queryByLabelText('Montant')).toBeNull();
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: '0', amountMax: '' }));
  });

  it.each(['adult', 'enfant'])('keeps the %s public when the price becomes free', (kindCode) => {
    const p = pricing();
    const kind = p.priceKindOptions.find((option) => option.code === kindCode)!;
    const { onSave } = renderModal({ draft: {
      ...createPricingDraft(p), amount: '12', amountMax: '20',
      kindCode: kind.code, kindId: kind.id, kindLabel: kind.label,
    } });
    click(screen.getByRole('radio', { name: 'Gratuit' }));
    expect(screen.getByLabelText('Public / bénéficiaire')).toHaveValue(kind.code);
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      kindCode: kind.code, kindId: kind.id, kindLabel: kind.label, amount: '0', amountMax: '',
    }));
  });

  it('opens a legacy gratuit public as free and preserves it until another public is chosen', () => {
    const p = pricing();
    p.priceKindOptions.push({ id: 'legacy-free', code: 'gratuit', label: 'Gratuit' });
    const { onSave } = renderModal({ pricing: p, mode: 'edit', draft: {
      ...createPricingDraft(p), kindCode: 'gratuit', kindId: 'legacy-free', kindLabel: 'Gratuit', amount: '',
    } });
    expect(screen.getByRole('radio', { name: 'Gratuit' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Prix fixe' })).toBeDisabled();
    click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kindCode: 'gratuit', kindId: 'legacy-free', amount: '0' }));
    change(screen.getByLabelText('Public / bénéficiaire'), 'adult');
    expect(screen.getByRole('radio', { name: 'Prix fixe' })).toBeEnabled();
  });

  it('shows age fields only for a child public', () => {
    renderModal();
    expect(screen.queryByLabelText('Âge enfant minimum')).toBeNull();
    change(screen.getByLabelText('Public / bénéficiaire'), 'enfant');
    expect(screen.getByLabelText('Âge enfant minimum')).toBeInTheDocument();
  });

  it('keeps only the chosen validity axis on save', () => {
    const p = pricing();
    const { onSave } = renderModal({ draft: { ...createPricingDraft(p), amount: '10', validFrom: '2026-07-01', validTo: '2026-08-31' } });
    expect(screen.getByRole('radio', { name: 'Dates précises' })).toHaveAttribute('aria-checked', 'true');
    click(screen.getByRole('radio', { name: 'Une saison' }));
    click(screen.getByRole('button', { name: 'Haute saison' }));
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ seasonCode: 'high_season', validFrom: '', validTo: '' }));
  });

  it('offers archetype shortcuts that pre-fill public, type and unit', () => {
    const p = pricing();
    p.priceUnitOptions = [...p.priceUnitOptions, { id: 'u-nuit', code: 'par_nuit', label: 'Par nuit' }];
    const { onSave } = renderModal({ pricing: p, draft: createPricingDraft(p), archetype: 'HEB', typeCode: 'HOT' });
    expect(screen.getByText('Hôtel')).toBeInTheDocument();
    click(screen.getByRole('button', { name: 'Nuitée' }));
    expect(screen.getByLabelText('Unité')).toHaveValue('par_nuit');
    change(screen.getByLabelText('Montant'), '165');
    click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kindCode: 'adult', indicationCode: 'principal', unitCode: 'par_nuit', unitId: 'u-nuit', amount: '165' }));
  });

  it('previews the line in the tariff grid next to the existing ones', () => {
    renderModal();
    const preview = screen.getByRole('complementary', { name: 'Aperçu' });
    change(screen.getByLabelText('Montant'), '30');
    expect(within(preview).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    expect(within(preview).getByText('30 €')).toBeInTheDocument();
  });
});
