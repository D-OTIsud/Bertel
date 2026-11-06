import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilterDropdown } from './FilterDropdown';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';

const options = [{ code: 'HOT', label: 'Hôtels', group: 'Accueil' }, { code: 'RES', label: 'Restaurants', group: 'Accueil' }];

function activeOption(owner: HTMLElement) {
  return document.getElementById(owner.getAttribute('aria-activedescendant') ?? '');
}

test.each([false, true])('keyboard opens and selects a non-pointer option, searchable=%s', (searchable) => {
  const onChange = jest.fn();
  render(<FilterDropdown options={options} selected={[]} onChange={onChange} mode="single" placeholder="Type" allLabel="Tous" searchable={searchable} />);
  const trigger = screen.getByRole('button', { name: 'Type' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const owner = searchable ? screen.getByRole('textbox') : screen.getByRole('listbox');
  expect(owner).toHaveFocus();
  expect(activeOption(owner)).toHaveTextContent('Tous');
  fireEvent.keyDown(owner, { key: 'ArrowDown' });
  expect(activeOption(owner)).toHaveTextContent('Hôtels');
  fireEvent.keyDown(owner, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith(['HOT']);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('multi selection uses Space without closing and Tous resets via keyboard', () => {
  function Fixture() {
    const [selected, setSelected] = useState<string[]>([]);
    return <FilterDropdown options={options} selected={selected} onChange={setSelected} mode="multi" placeholder="Type" allLabel="Tous" />;
  }
  render(<Fixture />);
  const trigger = screen.getByRole('button');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const listbox = screen.getByRole('listbox');
  expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
  fireEvent.keyDown(listbox, { key: 'ArrowDown' });
  fireEvent.keyDown(listbox, { key: ' ' });
  expect(screen.getByRole('option', { name: 'Hôtels' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(listbox, { key: 'ArrowDown' });
  fireEvent.keyDown(listbox, { key: ' ' });
  expect(screen.getByRole('option', { name: 'Restaurants' })).toHaveAttribute('aria-selected', 'true');
  expect(trigger).toHaveTextContent('2 sélectionnés');
  fireEvent.keyDown(listbox, { key: 'Home' });
  fireEvent.keyDown(listbox, { key: 'Enter' });
  expect(trigger).toHaveTextContent('Type');
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Escape closes only the picker and restores focus, while outside focus remains outside', () => {
  const hostKey = jest.fn();
  render(<div onKeyDown={hostKey}>
    <FilterDropdown options={options} selected={[]} onChange={jest.fn()} mode="single" placeholder="Type" searchable />
    <button>Autre contrôle</button>
  </div>);
  const trigger = screen.getByRole('button', { name: 'Type' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(hostKey).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  const outside = screen.getByRole('button', { name: 'Autre contrôle' });
  act(() => { outside.focus(); });
  fireEvent.pointerDown(outside);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(outside).toHaveFocus();
});

test.each([false, true])('filter owns focus inside a real Sheet, searchable=%s', async (searchable) => {
  const onOpenChange = jest.fn();
  render(<Sheet open onOpenChange={onOpenChange}><SheetContent aria-describedby={undefined}>
    <SheetTitle>Filtres</SheetTitle><button>Avant</button>
    <FilterDropdown options={options} selected={[]} onChange={jest.fn()} mode="single" placeholder="Type" searchable={searchable} />
    <button>Après</button>
  </SheetContent></Sheet>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avant' })).toHaveFocus());
  const trigger = screen.getByRole('button', { name: 'Type' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const owner = searchable ? screen.getByRole('textbox') : screen.getByRole('listbox');
  await waitFor(() => expect(owner).toHaveFocus());
  fireEvent.keyDown(owner, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Après' })).toHaveFocus();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const reopened = searchable ? screen.getByRole('textbox') : screen.getByRole('listbox');
  fireEvent.keyDown(reopened, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Avant' })).toHaveFocus();
  expect(onOpenChange).not.toHaveBeenCalled();
});

test('search spaces remain text and a zero-result menu has no stale active option', () => {
  const onChange = jest.fn();
  render(<FilterDropdown options={options} selected={[]} onChange={onChange} mode="single" placeholder="Type" searchable />);
  fireEvent.click(screen.getByRole('button'));
  const input = screen.getByRole('textbox');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(activeOption(input)).toHaveTextContent('Hôtels');
  fireEvent.keyDown(input, { key: ' ' });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'absent' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(activeOption(input)).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
