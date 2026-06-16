import { fireEvent, render, screen } from '@testing-library/react';
import { OpeningPeriodEditModal } from './OpeningPeriodEditModal';
import { createPeriodDraft } from '../sections/opening-period-edit';
import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
} from '../../../services/object-workspace-parser';

const TYPE_OPTIONS: ObjectWorkspaceOpeningPeriodTypeOption[] = [
  { code: 'high_season', label: 'Haute saison', color: '#176b6a', allYear: false },
  { code: 'mid_season', label: 'Mi-saison', color: '#c08a3e', allYear: false },
  { code: 'off_season', label: 'Hors saison', color: '#8a8f99', allYear: false },
  { code: 'year_round', label: 'Annuelle', color: '#2f8f6b', allYear: true },
];

function period(patch: Partial<ObjectWorkspaceOpeningPeriod> = {}): ObjectWorkspaceOpeningPeriod {
  return { ...createPeriodDraft(0), ...patch };
}

function renderModal(patch: Partial<ObjectWorkspaceOpeningPeriod> = {}, onSave = jest.fn(), mode: 'add' | 'edit' = 'add') {
  render(
    <OpeningPeriodEditModal
      open
      mode={mode}
      draft={period(patch)}
      periodTypeOptions={TYPE_OPTIONS}
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('OpeningPeriodEditModal', () => {
  it('titles the modal by mode and shows the schedule editor', () => {
    renderModal();
    expect(screen.getByText('Ajouter une période')).toBeInTheDocument();
    expect(screen.getByText('Plage 1')).toBeInTheDocument();
  });

  it('uses the edit title in edit mode', () => {
    renderModal({ seasonTypeCode: 'high_season' }, jest.fn(), 'edit');
    expect(screen.getByText('Modifier la période')).toBeInTheDocument();
  });

  it('lists the admin-managed period types', () => {
    renderModal();
    const select = screen.getByLabelText('Type de période');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mi-saison' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Annuelle' })).toBeInTheDocument();
  });

  it('disables save until a period type is selected', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type de période'), { target: { value: 'year_round' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('reveals dates for a seasonal type and hides them for an all-year type', () => {
    renderModal();
    // no type yet → no dates
    expect(screen.queryByLabelText('Date de début')).not.toBeInTheDocument();
    // seasonal type → dates appear
    fireEvent.change(screen.getByLabelText('Type de période'), { target: { value: 'high_season' } });
    expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
    // all-year type → dates hidden again
    fireEvent.change(screen.getByLabelText('Type de période'), { target: { value: 'year_round' } });
    expect(screen.queryByLabelText('Date de début')).not.toBeInTheDocument();
  });

  it('saves the selected type and derives all-year from it', () => {
    const onSave = renderModal();
    fireEvent.change(screen.getByLabelText('Type de période'), { target: { value: 'year_round' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ seasonTypeCode: 'year_round', allYears: true }));
  });

  it('marks a seasonal type as not all-year', () => {
    const onSave = renderModal();
    fireEvent.change(screen.getByLabelText('Type de période'), { target: { value: 'high_season' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ seasonTypeCode: 'high_season', allYears: false }));
  });

  it('preserves recordId and order on save', () => {
    const onSave = renderModal({ recordId: 'op-123', order: '2', seasonTypeCode: 'high_season' }, jest.fn(), 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'op-123', order: '2' }));
  });

  it('adds an exceptional closure DATE as a removable chip', () => {
    const onSave = renderModal({ seasonTypeCode: 'year_round' });
    fireEvent.change(screen.getByLabelText('Date de fermeture'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('button', { name: 'Retirer 25/12/2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ closedDays: ['2026-12-25'] }));
  });

  it('has no weekday closed-day control (weekday closure is expressed by leaving hours empty)', () => {
    renderModal({ seasonTypeCode: 'year_round' });
    expect(screen.queryByLabelText('Ajouter un jour fermé')).not.toBeInTheDocument();
  });

  it('shows an inline error and blocks save when the end date precedes the start date', () => {
    renderModal({ seasonTypeCode: 'high_season', allYears: false, startDate: '2026-09-01', endDate: '2026-06-01' });
    expect(screen.getByRole('alert')).toHaveTextContent(/postérieure/i);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});
