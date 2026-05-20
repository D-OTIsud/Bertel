import type { ReactNode } from 'react';

/**
 * Right-rail container. The completion ring, issues, presence and history
 * widgets are added in a later plan; for now it hosts whatever it is given.
 */
export function EditorRail({ children }: { children?: ReactNode }) {
  return <aside className="edit-side">{children}</aside>;
}
