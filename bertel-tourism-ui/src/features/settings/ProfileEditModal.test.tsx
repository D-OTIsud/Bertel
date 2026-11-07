import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileEditModal } from './ProfileEditModal';
import { useSessionStore } from '../../store/session-store';
import * as userProfile from '../../services/user-profile';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/user-profile');
const profileMock = userProfile as jest.Mocked<typeof userProfile>;

beforeEach(() => {
  jest.clearAllMocks();
  profileMock.updateCurrentUserProfile.mockResolvedValue(undefined);
  profileMock.uploadAvatar.mockResolvedValue('https://cdn.example/avatar.jpg?v=1');
  useSessionStore.setState({
    status: 'ready', demoMode: false,
    userName: 'David P.', email: 'david@otisud.re', avatarUrl: null,
  } as never);
});

describe('ProfileEditModal', () => {
  it('préremplit le nom courant et enregistre via le service + applyProfile, puis ferme', async () => {
    const onOpenChange = jest.fn();
    render(<ProfileEditModal open onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText('Nom affiché');
    expect(input).toHaveValue('David P.');
    fireEvent.change(input, { target: { value: 'David Philippe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(profileMock.updateCurrentUserProfile).toHaveBeenCalledWith({ display_name: 'David Philippe' }));
    expect(useSessionStore.getState().userName).toBe('David Philippe');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('nom vide → erreur, aucun appel service', async () => {
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: '   ' } });
    // Bouton désactivé sur brouillon vide : la garde UI suffit.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(profileMock.updateCurrentUserProfile).not.toHaveBeenCalled();
  });

  it('mode démo : le nom s’applique localement SANS service, la photo est désactivée', async () => {
    useSessionStore.setState({ demoMode: true, status: 'ready' } as never);
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    expect(screen.getByLabelText(/ajouter une photo|changer la photo/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Marie Demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(useSessionStore.getState().userName).toBe('Marie Demo'));
    expect(profileMock.updateCurrentUserProfile).not.toHaveBeenCalled();
  });

  it('upload avatar : uploadAvatar appelé, avatarUrl appliqué à la session', async () => {
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/ajouter une photo/i);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(profileMock.uploadAvatar).toHaveBeenCalledWith(file));
    expect(useSessionStore.getState().avatarUrl).toBe('https://cdn.example/avatar.jpg?v=1');
  });

  it('échec upload → toast.error, session inchangée', async () => {
    profileMock.uploadAvatar.mockRejectedValue(new Error("Format d'image non supporté (JPEG, PNG ou WebP, ≤ 5 Mo)."));
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    const file = new File(['x'], 'photo.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText(/ajouter une photo/i), { target: { files: [file] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(useSessionStore.getState().avatarUrl).toBeNull();
  });
});
