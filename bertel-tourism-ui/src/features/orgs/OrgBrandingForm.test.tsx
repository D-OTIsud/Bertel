import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrgBrandingForm } from './OrgBrandingForm';

jest.mock('@/services/branding', () => ({ getOrgBranding: jest.fn(), saveOrgBranding: jest.fn() }));
const invalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: invalidate }) }));
import { getOrgBranding, saveOrgBranding } from '@/services/branding';

const SNAP = { orgObjectId: 'ORG1', raw: { brandName: 'OTI A', logoStoragePath: null, logoPublicUrl: null, logoMimeType: null, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null }, resolved: { brandName: 'OTI A', primaryColor: '#0F6885' } };

beforeEach(() => {
  invalidate.mockClear();
  (getOrgBranding as jest.Mock).mockResolvedValue(SNAP);
  (saveOrgBranding as jest.Mock).mockResolvedValue(SNAP);
});

test('charge et pré-remplit le nom de marque, placeholder = résolu pour les champs hérités', async () => {
  render(<OrgBrandingForm orgId="ORG1" />);
  expect(await screen.findByDisplayValue('OTI A')).toBeInTheDocument();
  const primary = screen.getByLabelText(/couleur principale/i) as HTMLInputElement;
  expect(primary.value).toBe(''); // hérité
  expect(primary.placeholder).toBe('#0F6885'); // résolu
});

test('enregistrer envoie saveOrgBranding et invalide la query branding', async () => {
  const onSaved = jest.fn();
  render(<OrgBrandingForm orgId="ORG1" onSaved={onSaved} />);
  await screen.findByDisplayValue('OTI A');
  fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
  await waitFor(() => expect(saveOrgBranding).toHaveBeenCalledWith('ORG1', expect.objectContaining({ raw: expect.any(Object) })));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branding', 'authenticated'] }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test('« Revenir au thème plateforme » demande confirmation puis reset', async () => {
  render(<OrgBrandingForm orgId="ORG1" />);
  await screen.findByDisplayValue('OTI A');
  fireEvent.click(screen.getByRole('button', { name: /revenir au thème plateforme/i }));
  fireEvent.click(await screen.findByRole('button', { name: /réinitialiser/i }));
  await waitFor(() => expect(saveOrgBranding).toHaveBeenCalledWith('ORG1', expect.objectContaining({ reset: true })));
});
