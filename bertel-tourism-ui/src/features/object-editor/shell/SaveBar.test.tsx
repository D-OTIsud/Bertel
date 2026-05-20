import { render, screen, fireEvent } from '@testing-library/react';
import { SaveBar } from './SaveBar';

describe('SaveBar', () => {
  it('disables Enregistrer when there are no dirty sections', () => {
    render(<SaveBar dirtyCount={0} saving={false} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('enables Enregistrer and reports the dirty count when dirty', () => {
    render(<SaveBar dirtyCount={3} saving={false} onSave={() => {}} />);
    expect(screen.getByText(/3 modifications/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeEnabled();
  });

  it('fires onSave when Enregistrer is clicked', () => {
    const onSave = jest.fn();
    render(<SaveBar dirtyCount={1} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(onSave).toHaveBeenCalled();
  });
});
