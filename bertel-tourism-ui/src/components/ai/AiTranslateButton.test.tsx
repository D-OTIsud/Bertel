import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiTranslateButton, type AiTranslateButtonProps } from './AiTranslateButton';
import { translateWithAi } from '../../services/ai-translate';

jest.mock('../../services/ai-translate', () => ({ translateWithAi: jest.fn() }));
const translate = translateWithAi as jest.Mock;
const props: AiTranslateButtonProps = {
  objectId: 'o1', sourceLanguage: 'fr', targetLanguage: 'en',
  sourceLabel: 'Français', targetLabel: 'English',
  fields: { chapo: 'Bonjour', description: '**Un séjour** à la mer' },
  existingValues: {}, onTranslated: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

it('translates blank fields with one click and does not submit the surrounding form', async () => {
  const submit = jest.fn((event) => event.preventDefault());
  translate.mockResolvedValue({ chapo: 'Hello', description: '**A stay** by the sea' });
  render(<form onSubmit={submit}><AiTranslateButton {...props} /></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  await waitFor(() => expect(props.onTranslated).toHaveBeenCalledWith({ chapo: 'Hello', description: '**A stay** by the sea' }));
  expect(submit).not.toHaveBeenCalled();
});

it('preserves existing text by translating only missing fields', async () => {
  translate.mockResolvedValue({ description: 'By the sea' });
  render(<AiTranslateButton {...props} existingValues={{ chapo: 'My own headline' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  await waitFor(() => expect(translate).toHaveBeenCalledWith(expect.objectContaining({ fields: { description: props.fields.description } }), expect.any(AbortSignal)));
});

it('requires explicit replacement when translations are already filled', async () => {
  translate.mockResolvedValue({ chapo: 'Hello', description: 'A stay' });
  render(<AiTranslateButton {...props} existingValues={{ chapo: 'Manual headline', description: 'Manual description' }} />);
  expect(screen.getByRole('button', { name: 'Traduire avec l’IA' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Remplacer les traductions existantes'));
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  await waitFor(() => expect(translate).toHaveBeenCalledWith(expect.objectContaining({ fields: props.fields }), expect.any(AbortSignal)));
});

it.each([
  { targetLanguage: 'de' },
  { objectId: 'o2' },
  { contextKey: 'org' },
  { fields: { ...props.fields, chapo: 'Nouvelle source' } },
  { existingValues: { description: 'Typed during translation' } },
  { disabled: true },
])('discards late results after edit context changes: %p', async (patch) => {
  let finish!: (translations: Record<string, string>) => void;
  translate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<AiTranslateButton {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  const signal = translate.mock.calls[0][1] as AbortSignal;
  view.rerender(<AiTranslateButton {...props} {...patch} />);
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ chapo: 'Stale', description: 'Stale' }));
  expect(props.onTranslated).not.toHaveBeenCalled();
});

it('cancels on unmount and blocks duplicate requests while busy', async () => {
  translate.mockImplementation(() => new Promise(() => {}));
  const view = render(<AiTranslateButton {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Traduction en cours…' }));
  expect(translate).toHaveBeenCalledTimes(1);
  const signal = translate.mock.calls[0][1] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it('keeps the draft untouched on failure and allows retry', async () => {
  translate.mockRejectedValueOnce(new Error('Service indisponible')).mockResolvedValueOnce({ chapo: 'Hello', description: 'A stay' });
  render(<AiTranslateButton {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service indisponible');
  expect(props.onTranslated).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Traduire avec l’IA' }));
  await waitFor(() => expect(props.onTranslated).toHaveBeenCalledTimes(1));
});

it('explains an empty source without calling the AI', () => {
  render(<AiTranslateButton {...props} fields={{ chapo: ' ', description: '' }} />);
  expect(screen.getByRole('button', { name: 'Traduire avec l’IA' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Saisissez d’abord un texte en Français.');
});
