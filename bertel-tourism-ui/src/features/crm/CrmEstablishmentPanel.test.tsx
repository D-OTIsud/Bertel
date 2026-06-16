import { render, screen, fireEvent } from '@testing-library/react';
import { CrmEstablishmentPanel } from './CrmEstablishmentPanel';

type ObjViewProps = { onOpenActor: (id: string) => void; onBack: () => void; canWrite: boolean; hideOpenEditor?: boolean };
type ActorViewProps = { onBack: () => void; onOpenObject: (id: string) => void; backLabel?: string; canWrite: boolean };

jest.mock('./CrmObjectView', () => ({
  CrmObjectView: ({ onOpenActor, onBack, canWrite, hideOpenEditor }: ObjViewProps) => (
    <div data-testid="object-view">
      <span>canWrite:{String(canWrite)}</span>
      <span>hideOpenEditor:{String(hideOpenEditor)}</span>
      <button type="button" onClick={() => onOpenActor('actor-9')}>vers acteur</button>
      <button type="button" onClick={onBack}>retour objet</button>
    </div>
  ),
}));
jest.mock('./CrmActorFiche', () => ({
  CrmActorFiche: ({ onBack, onOpenObject, backLabel, canWrite }: ActorViewProps) => (
    <div data-testid="actor-fiche">
      <span>backLabel:{backLabel}</span>
      <span>canWrite:{String(canWrite)}</span>
      <button type="button" onClick={onBack}>retour acteur</button>
      <button type="button" onClick={() => onOpenObject('obj-autre')}>vers autre objet</button>
    </div>
  ),
}));

describe('CrmEstablishmentPanel — nav objet⇄acteur ancrée', () => {
  it('rend la vue établissement par défaut (hideOpenEditor=true)', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
    expect(screen.getByText('hideOpenEditor:true')).toBeInTheDocument();
  });

  it('clic acteur → fiche acteur (backLabel établissement) ; retour → vue établissement', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'vers acteur' }));
    expect(screen.getByTestId('actor-fiche')).toBeInTheDocument();
    expect(screen.getByText("backLabel:Retour à l'établissement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retour acteur' }));
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
  });

  it('ancrage strict : depuis la fiche acteur, onOpenObject ramène à la vue établissement', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'vers acteur' }));
    fireEvent.click(screen.getByRole('button', { name: 'vers autre objet' }));
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
  });

  it('retour depuis la vue établissement ferme le tiroir (onClose)', () => {
    const onClose = jest.fn();
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'retour objet' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('propage canWrite=false aux vues', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite={false} onClose={jest.fn()} />);
    expect(screen.getByText('canWrite:false')).toBeInTheDocument();
  });
});
