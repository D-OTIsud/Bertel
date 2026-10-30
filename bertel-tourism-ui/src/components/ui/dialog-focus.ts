import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],details > summary,[contenteditable]';

export function dialogFocusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.matches(':disabled,[tabindex="-1"],[contenteditable="false"]')) return false;
    if (element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const details = element.closest('details:not([open])');
    if (details && !(element.tagName === 'SUMMARY' && element.parentElement === details)) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/** The dialog engine handles ordinary Tab navigation; recover an escaped focus as well. */
export function recoverEscapedDialogFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.defaultPrevented || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const root = event.currentTarget;
  if (root.contains(document.activeElement)) return;
  const elements = dialogFocusables(root);
  const target = event.shiftKey ? elements.at(-1) : elements[0];
  if (target) { event.preventDefault(); target.focus(); }
}

export function focusDialogControl(event: Event, root: HTMLElement | null, closeClass: string): void {
  if (!root) return;
  const elements = dialogFocusables(root);
  const target = elements.find((element) => !element.classList.contains(closeClass)) ?? elements[0];
  if (target) { event.preventDefault(); target.focus(); }
}

/** Closing one surface must not take focus back from another surface opened in the meantime. */
export function restoreDialogOpener(event: Event, opener: HTMLElement | null): void {
  event.preventDefault();
  const active = document.activeElement;
  // A resumed parent scope may recover focus to its own dialog before this close callback runs.
  const parentRecovered = active instanceof HTMLElement && active.matches('[role="dialog"]') && opener && active.contains(opener);
  if (active && active !== document.body && !parentRecovered) return;
  if (opener?.isConnected) opener.focus();
}
