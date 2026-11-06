import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrgSmtpForm } from './OrgSmtpForm';

jest.mock('@/services/org-smtp', () => {
  const actual = jest.requireActual('@/services/org-smtp');
  return {
    ...actual, // secureForPort / SMTP_PORTS restent les VRAIS : le formulaire en dépend
    getOrgSmtp: jest.fn(),
    saveOrgSmtp: jest.fn(),
    deleteOrgSmtp: jest.fn(),
    testOrgSmtp: jest.fn(),
  };
});
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } }),
}));
const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

import { getOrgSmtp, saveOrgSmtp, deleteOrgSmtp, testOrgSmtp } from '@/services/org-smtp';

const SNAP = {
  orgObjectId: 'ORG1', configured: true, host: 'smtp.a.re', port: 587, secure: false,
  fromEmail: 'no-reply@a.re', fromName: null, username: 'userA', hasPassword: true,
  isEnabled: true, lastTestAt: null, lastTestOk: null, lastTestError: null,
  fromNameFallback: 'OTI A',
};

beforeEach(() => {
  jest.clearAllMocks();
  (getOrgSmtp as jest.Mock).mockResolvedValue(SNAP);
  (saveOrgSmtp as jest.Mock).mockResolvedValue(SNAP);
  (deleteOrgSmtp as jest.Mock).mockResolvedValue(undefined);
  (testOrgSmtp as jest.Mock).mockResolvedValue({ ok: true, detail: 'Connexion établie.' });
});

test('charge la configuration ; le mot de passe n’est JAMAIS pré-rempli', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  expect(await screen.findByDisplayValue('smtp.a.re')).toBeInTheDocument();
  const pass = screen.getByLabelText(/mot de passe/i) as HTMLInputElement;
  // Écriture seule : le secret n'est pas renvoyé par le RPC, et le champ ne doit surtout pas
  // laisser croire qu'on le relit. Seul son existence est signalée.
  expect(pass.value).toBe('');
  expect(pass.type).toBe('password');
  expect(screen.getByText(/configuré ✓/i)).toBeInTheDocument();
});

test('un mot de passe laissé vide est envoyé null ⇒ le serveur CONSERVE celui en place', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.change(screen.getByLabelText(/serveur smtp/i), { target: { value: 'smtp.b.re' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  await waitFor(() => expect(saveOrgSmtp).toHaveBeenCalledWith('ORG1', expect.objectContaining({
    host: 'smtp.b.re', password: '', clearPassword: false,
  })));
  // C'est CET invariant qui permet de changer d'hôte sans ressaisir le secret.
});

test('le chiffrement suit le port : 465 ⇒ TLS implicite, 587 ⇒ STARTTLS', async () => {
  // La base impose (port = 465) = secure ; proposer la combinaison inverse ferait échouer
  // l'enregistrement, ou pire un handshake opaque si elle passait.
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '465' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  await waitFor(() => expect(saveOrgSmtp).toHaveBeenCalledWith('ORG1', expect.objectContaining({ port: 465, secure: true })));

  (saveOrgSmtp as jest.Mock).mockClear();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '587' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  await waitFor(() => expect(saveOrgSmtp).toHaveBeenCalledWith('ORG1', expect.objectContaining({ port: 587, secure: false })));
});

test('« Retirer le mot de passe » demande confirmation avant d’effacer', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.click(screen.getByRole('button', { name: /retirer le mot de passe/i }));
  expect(saveOrgSmtp).not.toHaveBeenCalled(); // rien avant la confirmation
  fireEvent.click(await screen.findByRole('button', { name: /^retirer$/i }));
  await waitFor(() => expect(saveOrgSmtp).toHaveBeenCalledWith('ORG1', expect.objectContaining({ clearPassword: true })));
});

test('relais non activé : les invitations sont bloquées et le test attend l’activation', async () => {
  // Sans repli plateforme, une case décochée est une panne d'envoi silencieuse.
  (getOrgSmtp as jest.Mock).mockResolvedValue({ ...SNAP, isEnabled: false });
  render(<OrgSmtpForm orgId="ORG1" />);
  const alert = await screen.findByRole('status');
  expect(alert).toHaveTextContent(/ne partent pas/i);
  expect(screen.getByRole('button', { name: /tester la connexion/i })).toBeDisabled();
});

test('relais activé : aucun bandeau d’alerte', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  expect(screen.queryByText(/ne partent pas/i)).not.toBeInTheDocument();
});

test('le nom d’expéditeur vide affiche la marque de l’ORG en repère', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  const fromName = (await screen.findByLabelText(/nom d’expéditeur/i)) as HTMLInputElement;
  expect(fromName.value).toBe('');
  expect(fromName.placeholder).toBe('OTI A');
});

test('« Tester la connexion » passe par la route serveur, jamais l’hôte du formulaire', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.click(screen.getByRole('button', { name: /tester la connexion/i }));
  // L'ORG et le jeton, RIEN d'autre : la route relit l'hôte en base. Passer l'hôte saisi
  // ferait de ce bouton un moyen d'ouvrir une connexion vers une destination arbitraire.
  await waitFor(() => expect(testOrgSmtp).toHaveBeenCalledWith('ORG1', 'jwt'));
});

test('le dernier résultat de test est affiché, échec compris', async () => {
  (getOrgSmtp as jest.Mock).mockResolvedValue({
    ...SNAP, lastTestAt: '2026-09-04T10:00:00.000Z', lastTestOk: false, lastTestError: 'ECONNREFUSED',
  });
  render(<OrgSmtpForm orgId="ORG1" />);
  expect(await screen.findByText(/ECONNREFUSED/)).toBeInTheDocument();
});

test('supprimer le relais demande confirmation et dit la conséquence', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.click(screen.getByRole('button', { name: /supprimer le relais/i }));
  expect(await screen.findByText(/invitations aux partenaires ne pourront plus/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /supprimer définitivement/i }));
  await waitFor(() => expect(deleteOrgSmtp).toHaveBeenCalledWith('ORG1'));
});

test('hôte ou adresse d’expédition vide : refus local, aucun appel serveur', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.change(screen.getByLabelText(/serveur smtp/i), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  await waitFor(() => expect(toastError).toHaveBeenCalled());
  expect(saveOrgSmtp).not.toHaveBeenCalled();
});

test('une modification non enregistrée ne peut pas être perdue par le test', async () => {
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.change(screen.getByLabelText(/serveur smtp/i), { target: { value: 'smtp.b.re' } });
  expect(screen.getByRole('button', { name: /tester la connexion/i })).toBeDisabled();
  expect(screen.getByText(/enregistrez vos modifications avant de tester/i)).toBeInTheDocument();
  expect(testOrgSmtp).not.toHaveBeenCalled();
});

test('une panne réseau pendant le test donne une erreur récupérable', async () => {
  (testOrgSmtp as jest.Mock).mockRejectedValue(new Error('Connexion indisponible.'));
  render(<OrgSmtpForm orgId="ORG1" />);
  await screen.findByDisplayValue('smtp.a.re');
  fireEvent.click(screen.getByRole('button', { name: /tester la connexion/i }));
  await waitFor(() => expect(toastError).toHaveBeenCalledWith('Connexion indisponible.'));
  expect(screen.getByRole('button', { name: /tester la connexion/i })).toBeEnabled();
});
