import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchSelect } from './SearchSelect';
import { SearchMultiSelect } from './SearchMultiSelect';
import { Sheet, SheetContent, SheetTitle } from '../sheet';

const options = [{ code: 'one', label: 'Premier' }, { code: 'two', label: 'Deuxième' }];
function picker(multi: boolean) {
  return multi ? <SearchMultiSelect values={[]} options={options} onChange={jest.fn()} aria-label="Cible" />
    : <SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />;
}

test.each([false, true])('active option is announced and Escape returns focus, multi=%s', (multi) => {
  render(picker(multi));
  const trigger = screen.getByRole('combobox', { name: 'Cible' });
  fireEvent.click(trigger);
  const search = screen.getByLabelText('Rechercher');
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  const active = document.getElementById(search.getAttribute('aria-activedescendant') ?? '');
  expect(active).toHaveAttribute('role', 'option');
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('single selection restores its trigger but an outside click keeps the chosen control focused', () => {
  render(<>{picker(false)}<button>Suivant</button></>);
  const trigger = screen.getByRole('combobox', { name: 'Cible' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: 'Premier' }));
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  const outside = screen.getByRole('button', { name: 'Suivant' });
  act(() => { outside.focus(); });
  fireEvent.mouseDown(outside);
  expect(outside).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('a pointer selection in multi returns focus to search for the next keyboard choice', () => {
  const onChange = jest.fn();
  render(<SearchMultiSelect values={[]} options={options} onChange={onChange} aria-label="Cible" />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
  const option = screen.getByRole('option', { name: 'Premier' });
  option.focus();
  fireEvent.click(option);
  const search = screen.getByRole('combobox', { name: 'Rechercher' });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith(['two']);
});

test.each([false, true])('an asynchronous catalog shrink keeps one reachable active option, multi=%s', (multi) => {
  const expanded = Array.from({ length: 6 }, (_, i) => ({ code: String(i), label: `Choix ${i}` }));
  const element = (catalog: typeof expanded) => multi
    ? <SearchMultiSelect values={[]} options={catalog} onChange={jest.fn()} aria-label="Cible" />
    : <SearchSelect value="" options={catalog} onChange={jest.fn()} aria-label="Cible" />;
  const { rerender } = render(element(expanded));
  fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
  const search = screen.getByRole('combobox', { name: 'Rechercher' });
  for (let i = 0; i < 5; i++) fireEvent.keyDown(search, { key: 'ArrowDown' });
  rerender(element(expanded.slice(0, 2)));
  expect(search).toHaveFocus();
  expect(document.getElementById(search.getAttribute('aria-activedescendant') ?? '')).toHaveTextContent('Choix 1');
});

test.each([false, true])('picker focus and Escape coexist with a real Sheet, multi=%s', async (multi) => {
  const onOpenChange = jest.fn();
  render(<Sheet open onOpenChange={onOpenChange}><SheetContent aria-describedby={undefined}>
    <SheetTitle>Contexte</SheetTitle>{picker(multi)}<button>Suivant</button>
  </SheetContent></Sheet>);
  const trigger = screen.getByRole('combobox', { name: 'Cible' });
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  const search = screen.getByLabelText('Rechercher');
  await waitFor(() => expect(search).toHaveFocus());
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(screen.getByRole('dialog', { name: 'Contexte' })).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});

test.each([false, true])('Tab leaves the last popup control at the next host control, multi=%s', async (multi) => {
  render(<Sheet open><SheetContent aria-describedby={undefined}>
    <SheetTitle>Contexte</SheetTitle><button>Avant</button>{picker(multi)}<button>Après</button>
  </SheetContent></Sheet>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avant' })).toHaveFocus());
  const trigger = screen.getByRole('combobox', { name: 'Cible' });
  fireEvent.click(trigger);
  const last = screen.getAllByRole('option').at(-1)!;
  act(() => { last.focus(); });
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Après' })).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByLabelText('Rechercher'), { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Avant' })).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test.each([false, true])('Tab explicitly visits popup options without relying on native button tabbing, multi=%s', (multi) => {
  render(picker(multi));
  fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
  const search = screen.getByRole('combobox', { name: 'Rechercher' });
  const first = screen.getAllByRole('option')[0];
  expect(fireEvent.keyDown(search, { key: 'Tab' })).toBe(false);
  expect(first).toHaveFocus();
  expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
  expect(search).toHaveFocus();
});
