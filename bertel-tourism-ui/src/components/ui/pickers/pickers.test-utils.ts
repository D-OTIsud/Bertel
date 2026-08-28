// Helpers de test des pickers maison (SearchSelect / SearchMultiSelect).
//
// Depuis le correctif de découpe, le panneau est PORTALISÉ sous <body> : il n'est plus un
// descendant de la racine `.picker`, ni du `role="dialog"` du modal hôte. Les scopes
// habituels (`trigger.closest('.picker')`, `within(dialog)`) ne le trouvent donc plus.
//
// Élargir à `screen` n'est PAS la réparation : dans la barre d'outils du kanban, un
// `<select>` natif « Filtrer par personne » rend des `<option>` portant EXACTEMENT les
// mêmes noms de personnes que le popover d'assignation — `screen.getByRole('option',
// {name:'Jean P.'})` lève alors « Found multiple elements ». Il faut un scope, et le seul
// qui survive au portail est le lien `aria-controls` → `id` que les deux pickers émettent
// déjà (SearchSelect.tsx / SearchMultiSelect.tsx : `aria-controls={listId}` sur le
// déclencheur, `id={listId}` sur le `role="listbox"`).

import { within } from '@testing-library/react';

/**
 * Scope de requête des options d'un picker OUVERT, résolu par `aria-controls`.
 * Le déclencheur doit être ouvert (le listbox n'existe pas sinon).
 */
export function pickerListbox(trigger: HTMLElement) {
  const id = trigger.getAttribute('aria-controls');
  const listbox = id ? document.getElementById(id) : null;
  if (!listbox) {
    throw new Error(
      "Listbox du picker introuvable — le popover est-il ouvert ? (aria-controls=" + String(id) + ')',
    );
  }
  return within(listbox);
}
