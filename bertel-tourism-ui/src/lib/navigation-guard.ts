/**
 * Single-slot registry so programmatic navigation (command palette, future
 * callers) can consult the active page's unsaved-draft guard without coupling
 * the caller to a specific editor/view's state. Only one page is ever
 * "current" in a Next.js client app, so a single slot is enough.
 */
type NavigationGuard = () => boolean;

let activeGuard: NavigationGuard | null = null;

/** Registers the current page's guard; returns an unregister function for cleanup. */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) {
      activeGuard = null;
    }
  };
}

/** True if navigation may proceed: no guard registered, or the guard allows it. */
export function confirmNavigation(): boolean {
  return activeGuard ? activeGuard() : true;
}
