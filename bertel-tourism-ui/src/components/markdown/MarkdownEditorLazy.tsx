'use client';

import dynamic from 'next/dynamic';

/** Lazy wrapper: TipTap/ProseMirror loads only when the editor first mounts (inside the
 *  modal), keeping it off the editor page's initial bundle. */
export const MarkdownEditorLazy = dynamic(
  () => import('./MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="md-editor md-editor--loading" aria-hidden /> },
);
