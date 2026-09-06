import { useCallback, useEffect, useRef } from 'react';
import { registerNavigationGuard } from '@/lib/navigation-guard';

/** Shown on in-app leave attempts; `beforeunload` uses the browser’s generic dialog. */
export const UNSAVED_DRAFT_LEAVE_MESSAGE =
  'Vous avez des modifications non enregistrées. Enregistrez un brouillon pour les conserver (la publication n’est pas nécessaire). Quitter cette page sans enregistrer ?';

function isLeavingEditPageLink(anchor: HTMLAnchorElement): boolean {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
    return false;
  }
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return false;
    }
    return url.pathname !== window.location.pathname || url.search !== window.location.search;
  } catch {
    return false;
  }
}

export interface UnsavedDraftGuardOptions {
  /** Overrides the default confirm-dialog wording (e.g. list composition vs. object editor). */
  message?: string;
}

/**
 * Warns before the user loses unsaved local draft edits (refresh, close tab,
 * in-app links, browser back, programmatic navigation via `confirmLeave`).
 * Also registers itself as the page's active navigation guard so callers that
 * navigate programmatically (e.g. the command palette) can consult it without
 * importing this hook or coupling to editor/view-specific state.
 */
export function useUnsavedDraftGuard(active: boolean, options?: UnsavedDraftGuardOptions) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const messageRef = useRef(options?.message ?? UNSAVED_DRAFT_LEAVE_MESSAGE);
  messageRef.current = options?.message ?? UNSAVED_DRAFT_LEAVE_MESSAGE;

  const confirmLeave = useCallback((): boolean => {
    if (!activeRef.current) {
      return true;
    }
    return window.confirm(messageRef.current);
  }, []);

  useEffect(() => registerNavigationGuard(confirmLeave), [confirmLeave]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (!activeRef.current || event.defaultPrevented) {
        return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a');
      if (!anchor || !isLeavingEditPageLink(anchor)) {
        return;
      }
      if (!window.confirm(messageRef.current)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocumentClick, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const url = window.location.href;
    window.history.pushState({ bertelUnsavedDraftGuard: true }, '', url);

    const onPopState = () => {
      if (!activeRef.current) {
        return;
      }
      if (!window.confirm(messageRef.current)) {
        window.history.pushState({ bertelUnsavedDraftGuard: true }, '', url);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [active]);

  return { confirmLeave };
}
