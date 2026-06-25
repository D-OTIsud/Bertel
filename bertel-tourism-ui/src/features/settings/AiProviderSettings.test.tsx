import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AiProviderSettings } from './AiProviderSettings';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => null }));
jest.mock('../../services/ai-provider', () => ({
  listAiProviders: jest.fn(),
  upsertAiProvider: jest.fn(async () => 'id'),
  setActiveAiProvider: jest.fn(async () => undefined),
  deleteAiProvider: jest.fn(async () => undefined),
  testAiConnection: jest.fn(async () => ({ ok: true, detail: 'ok' })),
}));

import { listAiProviders, upsertAiProvider, setActiveAiProvider, deleteAiProvider } from '../../services/ai-provider';
import { toast } from 'sonner';

const PROVIDERS = [
  { id: 'p1', label: 'OpenRouter', apiKind: 'openai_compatible', baseUrl: 'https://or/v1', model: 'gpt-4o-mini', maxOutputTokens: 4096, isActive: true, extra: {}, hasKey: true },
  { id: 'p2', label: 'Ollama local', apiKind: 'openai_compatible', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-vl', maxOutputTokens: 2048, isActive: false, extra: {}, hasKey: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  (listAiProviders as jest.Mock).mockResolvedValue(PROVIDERS);
});

describe('AiProviderSettings', () => {
  it('lists configured providers with their active state and key badge', async () => {
    render(<AiProviderSettings />);
    expect(await screen.findByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('Ollama local')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
    expect(screen.getByText('Clé configurée')).toBeInTheDocument();
  });

  it('activates an inactive provider only after confirming in the dialog', async () => {
    render(<AiProviderSettings />);
    await screen.findByText('Ollama local');
    fireEvent.click(screen.getByRole('button', { name: 'Activer' })); // row button (only the inactive one has it)
    // ConfirmDialog must gate the activation (it changes the live platform-wide provider).
    const dialog = await screen.findByRole('dialog', { name: /Activer ce fournisseur/ });
    expect(setActiveAiProvider).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activer' }));
    await waitFor(() => expect(setActiveAiProvider).toHaveBeenCalledWith('p2'));
  });

  it('deletes a provider only after confirming (danger dialog)', async () => {
    render(<AiProviderSettings />);
    await screen.findByText('OpenRouter');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer OpenRouter' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer ce fournisseur/ });
    expect(deleteAiProvider).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }));
    await waitFor(() => expect(deleteAiProvider).toHaveBeenCalledWith('p1'));
  });

  it('creates a new provider with a null id and the key, on valid submit', async () => {
    render(<AiProviderSettings />);
    await screen.findByText('OpenRouter');
    fireEvent.change(screen.getByLabelText(/Libellé/), { target: { value: 'Groq' } });
    fireEvent.change(screen.getByLabelText(/Base URL/), { target: { value: 'https://api.groq.com/openai/v1' } });
    fireEvent.change(screen.getByLabelText(/Modèle/), { target: { value: 'llama-3.2-vision' } });
    fireEvent.change(screen.getByLabelText(/Clé API/), { target: { value: 'sk-groq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(upsertAiProvider).toHaveBeenCalledTimes(1));
    expect((upsertAiProvider as jest.Mock).mock.calls[0][0]).toMatchObject({
      id: undefined, label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.2-vision', apiKey: 'sk-groq',
    });
  });

  it('refuses to save when required fields are missing', async () => {
    render(<AiProviderSettings />);
    await screen.findByText('OpenRouter');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(upsertAiProvider).not.toHaveBeenCalled();
  });

  it('loads a provider into the form for editing (key stays blank)', async () => {
    render(<AiProviderSettings />);
    await screen.findByText('OpenRouter');
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    expect((screen.getByLabelText(/Libellé/) as HTMLInputElement).value).toBe('OpenRouter');
    expect((screen.getByLabelText(/Clé API/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/laisser vide pour conserver/)).toBeInTheDocument();
  });
});
