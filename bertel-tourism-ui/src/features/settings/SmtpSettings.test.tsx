import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SmtpSettings } from './SmtpSettings';
import { getSmtpSettings, saveSmtpSettings, testSmtpConnection, type SmtpSettings as SavedSettings } from '../../services/smtp-settings';

let mockDemoMode = false;
jest.mock('../../store/session-store', () => ({ useSessionStore: (selector: (state: { demoMode: boolean }) => unknown) => selector({ demoMode: mockDemoMode }) }));
jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } }) }));
jest.mock('../../services/smtp-settings', () => ({ getSmtpSettings: jest.fn(), saveSmtpSettings: jest.fn(), testSmtpConnection: jest.fn() }));

const SAVED: SavedSettings = {
  enabled: true, host: 'smtp.example.com', port: 587, secure: false,
  fromEmail: 'contact@example.com', fromName: 'Bertel', authMode: 'password',
  user: 'contact@example.com', hasPassword: true, source: 'database', configured: true,
  editable: true, updatedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDemoMode = false;
  jest.mocked(getSmtpSettings).mockResolvedValue({ ...SAVED });
  jest.mocked(saveSmtpSettings).mockImplementation(async (_token, input) => ({ ...SAVED, ...input, hasPassword: input.authMode === 'password' }));
  jest.mocked(testSmtpConnection).mockResolvedValue({ ok: true, detail: 'Connexion vérifiée.' });
});

it('conserve un mot de passe enregistré sans le relire et ne teste pas un formulaire modifié', async () => {
  render(<SmtpSettings />);
  await screen.findByDisplayValue('smtp.example.com');
  expect(screen.getByLabelText('Mot de passe SMTP')).toHaveValue('');
  const testButton = screen.getByRole('button', { name: 'Tester la connexion' });
  expect(testButton).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Nom de l’expéditeur'), { target: { value: 'Office de tourisme' } });
  expect(testButton).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
  await waitFor(() => expect(saveSmtpSettings).toHaveBeenCalledWith('test-session', expect.objectContaining({ fromName: 'Office de tourisme', password: undefined })));
  await waitFor(() => expect(testButton).toBeEnabled());
  fireEvent.click(testButton);
  expect(await screen.findByText('Connexion vérifiée.')).toBeInTheDocument();
  expect(testSmtpConnection).toHaveBeenCalledWith('test-session');
});

it('retire les identifiants en mode relais et efface la saisie du mot de passe après sauvegarde', async () => {
  render(<SmtpSettings />);
  await screen.findByDisplayValue('smtp.example.com');
  fireEvent.change(screen.getByLabelText('Mot de passe SMTP'), { target: { value: 'replacement-secret' } });
  fireEvent.change(screen.getByLabelText('Authentification'), { target: { value: 'relay' } });
  expect(screen.queryByLabelText('Mot de passe SMTP')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
  await waitFor(() => expect(saveSmtpSettings).toHaveBeenCalledWith('test-session', expect.objectContaining({ authMode: 'relay', user: '', password: undefined })));
});

it('affiche une erreur de chargement et bloque la sauvegarde jusqu’à une nouvelle lecture réussie', async () => {
  jest.mocked(getSmtpSettings).mockRejectedValueOnce(new Error('Configuration indisponible.'));
  render(<SmtpSettings />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Configuration indisponible.');
  expect(screen.getByRole('button', { name: 'Enregistrer les réglages' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByDisplayValue('smtp.example.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tester la connexion' })).toBeEnabled();
});

it('demande un nouveau mot de passe pour enregistrer une configuration issue de l’environnement', async () => {
  jest.mocked(getSmtpSettings).mockResolvedValue({ ...SAVED, source: 'environment' });
  render(<SmtpSettings />);
  await screen.findByDisplayValue('smtp.example.com');
  expect(screen.getByLabelText('Mot de passe SMTP')).toBeRequired();
});

it('demande un nouveau mot de passe si le serveur ou le compte change', async () => {
  render(<SmtpSettings />);
  await screen.findByDisplayValue('smtp.example.com');
  expect(screen.getByLabelText('Mot de passe SMTP')).not.toBeRequired();
  fireEvent.change(screen.getByLabelText('Serveur SMTP'), { target: { value: 'other.example.com' } });
  expect(screen.getByLabelText('Mot de passe SMTP')).toBeRequired();
  fireEvent.change(screen.getByLabelText('Serveur SMTP'), { target: { value: 'smtp.example.com' } });
  fireEvent.change(screen.getByLabelText('Identifiant SMTP'), { target: { value: 'other-account' } });
  expect(screen.getByLabelText('Mot de passe SMTP')).toBeRequired();
});

it('ne contacte pas le serveur en mode démonstration', () => {
  mockDemoMode = true;
  render(<SmtpSettings />);
  expect(screen.getByRole('status')).toHaveTextContent('Aperçu en mode démonstration');
  expect(getSmtpSettings).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Enregistrer les réglages' })).toBeDisabled();
});
