import { act, render, screen } from '@testing-library/react';
import { SandboxBanner } from './SandboxBanner';
import { useSessionStore } from '../../store/session-store';

/**
 * Le bandeau existe parce que le corpus de test est DELIBEREMENT indiscernable de
 * la production a l'oeil. Les deux sens comptent donc autant :
 *  - absent en production, sinon on apprend a l'ignorer et il ne signale plus rien ;
 *  - present dans le bac a sable, sinon un testeur ne sait pas s'il vient de
 *    modifier une fiche jetable ou l'hotel d'un vrai prestataire.
 */
describe('SandboxBanner', () => {
  afterEach(() => {
    // Le store est monte par le composant rendu : une ecriture hors `act`
    // declenche un re-rendu que React signale.
    act(() => useSessionStore.setState({ isTestRealm: false, orgName: null }));
  });

  it('ne rend RIEN sur un compte de production', () => {
    useSessionStore.setState({ isTestRealm: false, orgName: 'OTI du Sud' });
    const { container } = render(<SandboxBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('signale le bac a sable et nomme l organisation', () => {
    useSessionStore.setState({ isTestRealm: true, orgName: 'Bac a sable' });
    render(<SandboxBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Bac à sable');
    expect(screen.getByRole('status')).toHaveTextContent('Bac a sable');
  });

  it('reste lisible sans nom d organisation', () => {
    useSessionStore.setState({ isTestRealm: true, orgName: null });
    render(<SandboxBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Données de test uniquement');
  });
});
