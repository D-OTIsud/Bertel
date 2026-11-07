import { render, screen, fireEvent } from '@testing-library/react';
import { EditorCrmDrawer } from './EditorCrmDrawer';

jest.mock('../../crm/CrmEstablishmentPanel', () => ({
  CrmEstablishmentPanel: () => <div data-testid="crm-panel">panel</div>,
}));

describe('EditorCrmDrawer', () => {
  it('ne rend rien quand fermé', () => {
    render(<EditorCrmDrawer objectId="o1" canWrite open={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId('crm-panel')).not.toBeInTheDocument();
  });

  it('monte le panneau sous un ancêtre .crm-app (overlays des sous-modals)', () => {
    render(<EditorCrmDrawer objectId="o1" canWrite open onClose={jest.fn()} />);
    const panel = screen.getByTestId('crm-panel');
    expect(panel.closest('.crm-app')).not.toBeNull();
  });

  it('appelle onClose au clic sur Fermer', () => {
    const onClose = jest.fn();
    render(<EditorCrmDrawer objectId="o1" canWrite open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
