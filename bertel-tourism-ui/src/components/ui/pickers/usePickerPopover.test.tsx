// Garde de la découpe du popover (2026-08-28).
//
// DÉFAUT GARDÉ, mesuré en navigateur avant correctif : dans le modal « Nouvelle tâche »,
// `.picker__panel` était `position: absolute` et se faisait découper par
// `.crm-modal__body { overflow-y: auto }` — panneau de 163 px dont 44 visibles, et ZÉRO
// option atteignable sans scroller le modal.
//
// jsdom ne fait pas de mise en page : on ne peut pas mesurer la découpe. Ce qu'on PEUT
// asserter, et qui est la cause exacte, c'est la STRUCTURE : le panneau ne doit pas être
// un descendant du conteneur scrollable. Neutraliser le portail (rendre le panneau en
// place) fait rougir chacun des deux pickers ici — vérifié par sabotage.

import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSelect } from './SearchSelect';
import { SearchMultiSelect } from './SearchMultiSelect';
import { pickerListbox } from './pickers.test-utils';

const options = [
  { code: 'o1', label: 'Hôtel A' },
  { code: 'o2', label: 'Restaurant B' },
];

/** Reproduit la forme qui découpait : un corps de modal scrollable autour du picker. */
function ScrollableHost({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="scroll-host" style={{ overflowY: 'auto', maxHeight: 200 }}>
      {children}
    </div>
  );
}

describe('popover des pickers — échappe au conteneur scrollable (portail)', () => {
  it('SearchSelect : le panneau est hors du conteneur scrollable, sous <body>', () => {
    render(
      <ScrollableHost>
        <SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />
      </ScrollableHost>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Cible' });
    fireEvent.click(trigger);

    const host = screen.getByTestId('scroll-host');
    const panel = document.querySelector('.picker__panel') as HTMLElement;
    expect(panel).not.toBeNull();
    // Le déclencheur, lui, RESTE dans l'hôte — sinon le test passerait pour la mauvaise raison
    // (un picker entièrement absent satisferait la seule assertion « panneau dehors »).
    expect(host.contains(trigger)).toBe(true);
    expect(host.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
  });

  it('SearchMultiSelect : idem, et une option reste cliquable depuis le panneau portalisé', () => {
    const onChange = jest.fn();
    render(
      <ScrollableHost>
        <SearchMultiSelect values={[]} options={options} onChange={onChange} aria-label="Personnes" />
      </ScrollableHost>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Personnes' });
    fireEvent.click(trigger);

    const host = screen.getByTestId('scroll-host');
    const panel = document.querySelector('.picker__panel') as HTMLElement;
    expect(host.contains(panel)).toBe(false);

    // Le clic doit toujours ATTEINDRE le handler : la fermeture au clic-extérieur consulte
    // désormais le panneau ET le déclencheur. Ne tester que la position du panneau
    // laisserait passer une régression où le `mousedown` ferme le popover avant le `click`.
    fireEvent.mouseDown(panel);
    fireEvent.click(pickerListbox(trigger).getByRole('option', { name: 'Restaurant B' }));
    expect(onChange).toHaveBeenCalledWith(['o2']);
  });

  it('un clic réellement extérieur ferme le popover', () => {
    render(
      <ScrollableHost>
        <SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />
      </ScrollableHost>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Cible' });
    fireEvent.click(trigger);
    expect(document.querySelector('.picker__panel')).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.picker__panel')).toBeNull();
  });
});
