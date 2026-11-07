import { fireEvent, render, screen } from '@testing-library/react';
import { StayPolicyButton } from './capacity-controls';
import type { ObjectWorkspaceCapacityPoliciesModule } from '../../../services/object-workspace-parser';

function cap(stayPatch: Partial<ObjectWorkspaceCapacityPoliciesModule['stayPolicy']> = {}): ObjectWorkspaceCapacityPoliciesModule {
  return {
    metricOptions: [],
    capacityItems: [],
    groupPolicy: { minSize: '', maxSize: '', groupOnly: false, notes: '' },
    petPolicy: { accepted: null, conditions: '' },
    stayPolicy: { checkInFrom: '', checkInUntil: '', checkOutUntil: '', conditions: '', ...stayPatch },
    unavailableReason: null,
  };
}

describe('StayPolicyButton', () => {
  it('shows the add button when no arrival/departure is set', () => {
    render(<StayPolicyButton capacity={cap()} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Définir l'arrivée/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('opens the modal with constrained time inputs and saves arrival/departure', () => {
    const onChange = jest.fn();
    render(<StayPolicyButton capacity={cap()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Définir l'arrivée/i }));
    const arr = screen.getByLabelText('Arrivée à partir de');
    expect(arr.getAttribute('type')).toBe('time');
    fireEvent.change(arr, { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText('Départ avant'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ stayPolicy: expect.objectContaining({ checkInFrom: '16:00', checkOutUntil: '11:00' }) }),
    );
  });

  it('renders a summary + Modifier when set', () => {
    render(<StayPolicyButton capacity={cap({ checkInFrom: '16:00', checkOutUntil: '11:00' })} onChange={() => {}} />);
    expect(screen.getByText(/arrivée 16:00/i)).toBeInTheDocument();
    expect(screen.getByText(/départ avant 11:00/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });
});
