import { render, screen, fireEvent, within } from '@testing-library/react';
import { WebChannelEditModal } from './WebChannelEditModal';
import { createWebChannelDraft } from '../sections/contacts-edit';
import type { ObjectWorkspaceWebChannelItem } from '../../../services/object-workspace-parser';

const WEB_KINDS = [
  { id: 'w1', code: 'facebook', label: 'Facebook' },
  { id: 'w2', code: 'instagram', label: 'Instagram' },
  { id: 'w3', code: 'booking', label: 'Booking.com' },
];

function renderModal(over: Partial<Parameters<typeof WebChannelEditModal>[0]> = {}) {
  const onSave = jest.fn();
  render(
    <WebChannelEditModal
      open
      mode="add"
      channel={createWebChannelDraft(WEB_KINDS)}
      kindOptions={WEB_KINDS}
      onClose={() => {}}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave };
}

describe('WebChannelEditModal', () => {
  it('populates the réseau / canal type selector from reference data', () => {
    renderModal();
    const kind = screen.getByRole('combobox', { name: 'Type de réseau ou canal' });
    expect(within(kind).getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Facebook', 'Instagram', 'Booking.com']),
    );
  });

  it('keeps the save action disabled until an address is entered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Adresse du réseau ou canal'), {
      target: { value: 'https://facebook.com/x' },
    });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('returns the chosen type and trimmed address on save, carrying the domain', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Type de réseau ou canal'), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText('Adresse du réseau ou canal'), {
      target: { value: '  https://instagram.com/x  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceWebChannelItem;
    expect(saved.kindCode).toBe('instagram');
    expect(saved.value).toBe('https://instagram.com/x');
    expect(saved.kindDomain).toBe('social_network');
  });
});
