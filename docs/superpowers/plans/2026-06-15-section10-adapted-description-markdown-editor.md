# §10 Adapted-Description Markdown WYSIWYG Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace §10's plain adapted-description textarea with a compact "preview + button → modal" field whose modal hosts a true WYSIWYG editor that reads/writes Markdown, and render that Markdown (sanitized) wherever the adapted description is displayed.

**Architecture:** Three isolated units behind clean string interfaces. `MarkdownContent` (shared, presentational) renders a Markdown string to React elements with no raw HTML (XSS-safe). `MarkdownEditor` (TipTap, client, lazy-loaded) edits a Markdown string via a `value`/`onChange` contract. `AdaptedDescriptionField` (object-editor widget) owns the compact-card + `EditorModal` UX and writes back to the descriptions module via the existing `editor.replaceModule`. Storage is unchanged — Markdown is just text in `description_adapted`/`_i18n`.

**Tech Stack:** React 19 + Next 16, TipTap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `tiptap-markdown`) for editing, `markdown-to-jsx` for rendering (chosen over `react-markdown` because the repo's `next/jest` setup transforms it without `transformIgnorePatterns` surgery, and it renders React elements rather than using `dangerouslySetInnerHTML`). Jest + React Testing Library.

---

## File Structure

**New**
- `bertel-tourism-ui/src/components/markdown/MarkdownContent.tsx` — Markdown → React elements, sanitized. Shared by §10 card + drawer.
- `bertel-tourism-ui/src/components/markdown/MarkdownContent.test.tsx`
- `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx` — TipTap WYSIWYG, `value`/`onChange` Markdown.
- `bertel-tourism-ui/src/components/markdown/MarkdownEditor.test.tsx`
- `bertel-tourism-ui/src/components/markdown/MarkdownEditorLazy.tsx` — `next/dynamic` wrapper (ssr:false).
- `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.tsx`
- `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.test.tsx`

**Modified**
- `bertel-tourism-ui/package.json` — add 5 deps.
- `bertel-tourism-ui/src/styles.css` — `.md-content` display rules (global; drawer + editor).
- `bertel-tourism-ui/src/features/object-editor/object-editor.css` — `.md-editor` / `.adapted-desc` rules.
- `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx` — swap the adapted Field block.
- `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.test.tsx` — rewrite the 2 textarea tests.
- `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` — `OverviewSection` renders adapted text via `MarkdownContent`.

**Unchanged (verified):** DB schema, RPCs, `buildObjectDescriptionPayload`/`buildOrgDescriptionPayload`, `descriptions-field.ts` (`readTranslatableField`/`updateTranslatableField`).

> All commands run from `bertel-tourism-ui/`. Tests: `npm run test:run -- <path>`. Types: `npm run typecheck`.

---

## Task 0: Add dependencies

**Files:**
- Modify: `bertel-tourism-ui/package.json`

- [ ] **Step 1: Install the editor + renderer libraries**

Run (from `bertel-tourism-ui/`):

```bash
npm install markdown-to-jsx@^7.7.0 @tiptap/react@^2.11.0 @tiptap/starter-kit@^2.11.0 @tiptap/extension-link@^2.11.0 tiptap-markdown@^0.8.10
```

Expected: 5 packages added to `dependencies`; lockfile updated. (`@tiptap/starter-kit` pulls in `@tiptap/core` + `@tiptap/pm` transitively — no need to list them.)

- [ ] **Step 2: Verify types resolve**

Run: `npm run typecheck`
Expected: PASS (no new errors). If `tiptap-markdown` lacks bundled types, add `// @ts-expect-error` only at its import site is NOT acceptable — instead create `bertel-tourism-ui/src/types/tiptap-markdown.d.ts` with:

```ts
declare module 'tiptap-markdown' {
  import type { Extension } from '@tiptap/core';
  export const Markdown: Extension;
}
```

(Only add this file if typecheck reports missing declarations for `tiptap-markdown`.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(editor): add tiptap + markdown-to-jsx for §10 adapted-description editor"
```

---

## Task 1: `MarkdownContent` renderer (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/components/markdown/MarkdownContent.tsx`
- Test: `bertel-tourism-ui/src/components/markdown/MarkdownContent.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `MarkdownContent.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders headings, bold, italic and lists', () => {
    render(<MarkdownContent markdown={'## Titre\n\n**gras** et *italique*\n\n- a\n- b'} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('gras').tagName).toBe('STRONG');
    expect(screen.getByText('italique').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('does not parse or execute raw HTML (XSS-safe)', () => {
    const { container } = render(
      <MarkdownContent markdown={'<img src=x onerror="alert(1)"> <script>alert(2)</script> texte'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('texte');
  });

  it('renders safe links with rel/noopener and drops unsafe schemes', () => {
    render(<MarkdownContent markdown={'[ok](https://x.fr) [bad](javascript:alert(1))'} />);
    const ok = screen.getByRole('link', { name: 'ok' });
    expect(ok).toHaveAttribute('href', 'https://x.fr');
    expect(ok).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ok).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.getByText('bad').tagName).toBe('SPAN');
  });

  it('renders nothing for empty/whitespace markdown', () => {
    const { container } = render(<MarkdownContent markdown={'   '} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/markdown/MarkdownContent.test.tsx`
Expected: FAIL with "Cannot find module './MarkdownContent'".

- [ ] **Step 3: Write the implementation**

Create `MarkdownContent.tsx`:

```tsx
import Markdown from 'markdown-to-jsx';
import type { ReactNode } from 'react';

const SAFE_URL = /^(https?:|mailto:)/i;

function SafeLink({ href, children, ...rest }: { href?: string; children?: ReactNode }) {
  const safe = href && SAFE_URL.test(href.trim()) ? href.trim() : undefined;
  if (!safe) return <span {...rest}>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

const MD_OPTIONS = {
  // Treat any embedded HTML as literal text — never parse/execute it (XSS-safe).
  disableParsingRawHTML: true,
  // Wrap loose top-level text in <p> so plain-text legacy values still render as paragraphs.
  forceBlock: true,
  overrides: {
    // The adapted subset is H2/H3 only; remap stray levels so an object's H1 (its name) is never re-emitted.
    h1: { component: 'h2' as const },
    h4: { component: 'h3' as const },
    h5: { component: 'h3' as const },
    h6: { component: 'h3' as const },
    a: { component: SafeLink },
    img: { component: () => null },
  },
} as const;

interface MarkdownContentProps {
  markdown: string;
  className?: string;
}

/** Renders the constrained Markdown subset (H2/H3, bold, italic, lists, blockquote, links) to
 *  React elements. Raw HTML is never parsed (disableParsingRawHTML) and we never use
 *  dangerouslySetInnerHTML → XSS-safe. Links are scheme-validated + rel="noopener noreferrer".
 *  Single source of truth for how an adapted description renders (editor card + drawer). */
export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  if (!markdown.trim()) return null;
  return (
    <div className={className ? `md-content ${className}` : 'md-content'}>
      <Markdown options={MD_OPTIONS}>{markdown}</Markdown>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/markdown/MarkdownContent.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/markdown/MarkdownContent.tsx src/components/markdown/MarkdownContent.test.tsx
git commit -m "feat(markdown): sanitized MarkdownContent renderer (no raw HTML, safe links)"
```

---

## Task 2: Display + editor CSS

**Files:**
- Modify: `bertel-tourism-ui/src/styles.css` (append)
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (append)

- [ ] **Step 1: Append `.md-content` display rules to `src/styles.css`**

```css
/* ── Markdown content (adapted description) — shared editor card + drawer ───────── */
.md-content { line-height: 1.6; }
.md-content > :first-child { margin-top: 0; }
.md-content > :last-child { margin-bottom: 0; }
.md-content h2 { font-size: 1.15rem; font-weight: 600; margin: 1rem 0 0.4rem; }
.md-content h3 { font-size: 1rem; font-weight: 600; margin: 0.8rem 0 0.3rem; }
.md-content p { margin: 0.4rem 0; }
.md-content ul, .md-content ol { margin: 0.4rem 0; padding-left: 1.4rem; }
.md-content li { margin: 0.15rem 0; }
.md-content blockquote {
  margin: 0.6rem 0; padding: 0.2rem 0 0.2rem 0.9rem;
  border-left: 3px solid var(--line, #e3e3e3); color: var(--ink-2, #555);
}
.md-content a { color: var(--accent, #1d6fb8); text-decoration: underline; }
```

- [ ] **Step 2: Append `.md-editor` / `.adapted-desc` rules to `object-editor.css`**

```css
/* ── Adapted-description compact card (§10) ─────────────────────────────────────── */
.adapted-desc__card,
.adapted-desc__empty {
  border: 1px solid var(--line, #e3e3e3); border-radius: 10px;
  padding: 12px 14px; background: var(--surface, #fff);
}
.adapted-desc__empty { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.adapted-desc__preview { max-height: 180px; overflow: hidden; }
.adapted-desc__foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
.adapted-desc__langs { display: inline-flex; gap: 4px; }

/* ── Markdown WYSIWYG (modal) ───────────────────────────────────────────────────── */
.md-editor { border: 1px solid var(--line, #e3e3e3); border-radius: 8px; overflow: hidden; }
.md-editor--loading { min-height: 180px; }
.md-editor__toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  padding: 6px 8px; border-bottom: 1px solid var(--line, #e3e3e3);
  background: var(--surface-2, #f7f7f5);
}
.md-editor__sep { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--line, #e3e3e3); }
.md-editor__btn {
  display: inline-grid; place-items: center; min-width: 30px; height: 30px; padding: 0 6px;
  border: 1px solid transparent; border-radius: 6px; background: transparent;
  color: var(--ink-2, #555); cursor: pointer; font-size: 13px;
}
.md-editor__btn:hover:not(:disabled) { background: var(--surface, #fff); }
.md-editor__btn.is-on { background: var(--surface, #fff); color: var(--ink, #222); border-color: var(--line, #e3e3e3); }
.md-editor__btn:disabled { opacity: 0.4; cursor: default; }
.md-editor__content { min-height: 160px; padding: 12px 14px; outline: none; }
.md-editor__content:focus { outline: none; }
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/features/object-editor/object-editor.css
git commit -m "style(markdown): display + WYSIWYG toolbar styles for adapted description"
```

---

## Task 3: `MarkdownEditor` (TipTap) + lazy wrapper

**Files:**
- Create: `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx`
- Create: `bertel-tourism-ui/src/components/markdown/MarkdownEditorLazy.tsx`
- Test: `bertel-tourism-ui/src/components/markdown/MarkdownEditor.test.tsx`

- [ ] **Step 1: Write the implementation (`MarkdownEditor.tsx`)**

```tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import {
  Heading2, Heading3, Bold as BoldIcon, Italic as ItalicIcon,
  List, ListOrdered, Quote, Link as LinkIcon, Undo2, Redo2,
} from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}

function ToolBtn({
  label, active, disabled, onClick, children,
}: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`md-editor__btn${active ? ' is-on' : ''}`}
      aria-label={label}
      aria-pressed={active ?? false}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor): void {
  const prev = editor.getAttributes('link').href as string | undefined;
  const url = window.prompt('Adresse du lien (https://…)', prev ?? 'https://');
  if (url === null) return;
  if (url.trim() === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  if (!/^(https?:|mailto:)/i.test(url.trim())) {
    window.alert('Adresse non valide. Utilisez http(s):// ou mailto:.');
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="md-editor__toolbar" role="toolbar" aria-label="Mise en forme">
      <ToolBtn label="Titre" active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Sous-titre" active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={16} aria-hidden />
      </ToolBtn>
      <span className="md-editor__sep" aria-hidden />
      <ToolBtn label="Gras" active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Italique" active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon size={16} aria-hidden />
      </ToolBtn>
      <span className="md-editor__sep" aria-hidden />
      <ToolBtn label="Liste à puces" active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Liste numérotée" active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Citation" active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Lien" active={editor.isActive('link')} onClick={() => setLink(editor)}>
        <LinkIcon size={16} aria-hidden />
      </ToolBtn>
      <span className="md-editor__sep" aria-hidden />
      <ToolBtn label="Annuler" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Rétablir" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={16} aria-hidden />
      </ToolBtn>
    </div>
  );
}

/** TipTap WYSIWYG bound to a Markdown string. Constrained to the §10 subset:
 *  H2/H3, bold, italic, bullet/ordered lists, blockquote, links. No raw HTML in or out
 *  (Markdown.configure({ html: false })). value/onChange are Markdown — the canonical store. */
export function MarkdownEditor({ value, onChange, disabled, ariaLabel }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Markdown.configure({ html: false, linkify: false, transformPastedText: true }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': ariaLabel, class: 'md-editor__content' } },
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
  });

  // External value change (e.g. switching language tab) → reset content WITHOUT firing onUpdate.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.storage.markdown.getMarkdown()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  return (
    <div className="md-editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2: Write the lazy wrapper (`MarkdownEditorLazy.tsx`)**

```tsx
'use client';

import dynamic from 'next/dynamic';

/** Lazy wrapper: TipTap/ProseMirror loads only when the editor first mounts (inside the
 *  modal), keeping it off the editor page's initial bundle. */
export const MarkdownEditorLazy = dynamic(
  () => import('./MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="md-editor md-editor--loading" aria-hidden /> },
);
```

- [ ] **Step 3: Write the render-smoke test (`MarkdownEditor.test.tsx`)**

```tsx
import { render, screen } from '@testing-library/react';
import { MarkdownEditor } from './MarkdownEditor';

// jsdom render-smoke only: assert the toolbar + editable region mount with the right
// accessible names. Real editing / Markdown round-trip is verified in the browser preview
// (Task 7) — ProseMirror content editing is unreliable under jsdom.
describe('MarkdownEditor (render smoke)', () => {
  it('mounts the toolbar controls and an editable region with an accessible name', async () => {
    render(<MarkdownEditor value={'## Titre\n\nTexte'} ariaLabel="Description adaptée — FR" onChange={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Gras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste à puces' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description adaptée — FR')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm run test:run -- src/components/markdown/MarkdownEditor.test.tsx`
Expected: PASS. If TipTap fails to construct an `EditorView` under jsdom (rare; surfaces as a thrown error in the effect), delete this test file and rely on the Task 7 preview verification — note the removal in the commit message. Do NOT mock TipTap internals to force it green.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/components/markdown/MarkdownEditor.tsx src/components/markdown/MarkdownEditorLazy.tsx src/components/markdown/MarkdownEditor.test.tsx
git commit -m "feat(markdown): TipTap WYSIWYG editor (Markdown in/out) + lazy wrapper"
```

---

## Task 4: `AdaptedDescriptionField` widget (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `AdaptedDescriptionField.test.tsx`. The TipTap editor is mocked with a plain textarea so the test exercises the widget's own behavior (card states, modal, save/cancel, gating, language tabs) deterministically:

```tsx
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { fullModulesFixture } from '../sections/section-fixture.test-utils';
import { AdaptedDescriptionField } from './AdaptedDescriptionField';

jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({
    value, onChange, ariaLabel,
  }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function setup(canEdit = true) {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const descriptions = result.current.draft.descriptions;
  const view = render(
    <AdaptedDescriptionField
      editor={result.current}
      descriptions={descriptions}
      objectScope={descriptions.object}
      canEdit={canEdit}
    />,
  );
  return { result, view };
}

describe('AdaptedDescriptionField', () => {
  it('shows the rendered preview + Modifier when content exists and canEdit', () => {
    setup(true); // fixture adaptedDescription = "Adaptée"
    expect(screen.getByText('Adaptée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modifier/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une description adaptée/i })).toBeNull();
  });

  it('shows the Ajouter button when empty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const descriptions = result.current.draft.descriptions;
    const emptyScope = {
      ...descriptions.object,
      adaptedDescription: { baseValue: '', values: {} },
    };
    render(
      <AdaptedDescriptionField editor={result.current} descriptions={descriptions} objectScope={emptyScope} canEdit />,
    );
    expect(screen.getByRole('button', { name: /Ajouter une description adaptée/i })).toBeInTheDocument();
  });

  it('hides the edit button and shows a read-only notice without canEdit', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: /Modifier/i })).toBeNull();
    expect(screen.getByText(/droits ne permettent pas/i)).toBeInTheDocument();
    expect(screen.getByText('Adaptée')).toBeInTheDocument();
  });

  it('opens the modal and commits edited Markdown to the descriptions module on save', () => {
    const { result } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    const editorBox = screen.getByLabelText(/Description adaptée — FR/i);
    fireEvent.change(editorBox, { target: { value: '## Accès\n\n**PMR** ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe('## Accès\n\n**PMR** ok');
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  it('discards edits on cancel (Annuler)', () => {
    const { result } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    fireEvent.change(screen.getByLabelText(/Description adaptée — FR/i), { target: { value: 'jeté' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe('Adaptée');
    expect(result.current.dirtySections.descriptions).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/object-editor/widgets/AdaptedDescriptionField.test.tsx`
Expected: FAIL with "Cannot find module './AdaptedDescriptionField'".

- [ ] **Step 3: Write the implementation**

Create `AdaptedDescriptionField.tsx`:

```tsx
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { EditorModal, LangTabs } from '../primitives';
import { MarkdownContent } from '../../../components/markdown/MarkdownContent';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import { readTranslatableField, updateTranslatableField } from '../sections/descriptions-field';
import type { ObjectEditorState } from '../useObjectEditorState';
import type {
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceDescriptionScope,
  WorkspaceTranslatableField,
} from '../../../services/object-workspace-parser';

const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

interface AdaptedDescriptionFieldProps {
  editor: ObjectEditorState;
  descriptions: ObjectWorkspaceDescriptionsModule;
  objectScope: ObjectWorkspaceDescriptionScope;
  canEdit: boolean;
}

function hasAnyContent(field: WorkspaceTranslatableField): boolean {
  return field.baseValue.trim() !== '' || Object.values(field.values).some((v) => v.trim() !== '');
}

/** Compact "preview + button → modal" surface for the canonical adapted description.
 *  The modal hosts a Markdown WYSIWYG per language; "Enregistrer" commits the draft into the
 *  descriptions module (the page's global save bar persists it). Single owner since §04 hand-off. */
export function AdaptedDescriptionField({ editor, descriptions, objectScope, canEdit }: AdaptedDescriptionFieldProps) {
  const local = descriptions.localLanguage;
  const field = objectScope.adaptedDescription;
  const filled = hasAnyContent(field);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkspaceTranslatableField>(field);
  const [activeLang, setActiveLang] = useState(descriptions.activeLanguage || local);

  function openModal() {
    setDraft(field);
    setActiveLang(descriptions.activeLanguage || local);
    setOpen(true);
  }

  function save() {
    editor.replaceModule('descriptions', {
      ...descriptions,
      object: { ...objectScope, adaptedDescription: draft },
    });
    setOpen(false);
  }

  const previewMarkdown = readTranslatableField(field, local, local);
  const filledLangs = descriptions.availableLanguages.filter(
    (code) => readTranslatableField(field, code, local).trim() !== '',
  );
  const langTabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code.toUpperCase(),
    filled: readTranslatableField(draft, code, local).trim() !== '',
  }));

  return (
    <div className="adapted-desc">
      {filled ? (
        <div className="adapted-desc__card">
          <MarkdownContent markdown={previewMarkdown} className="adapted-desc__preview" />
          <div className="adapted-desc__foot">
            <span className="adapted-desc__langs">
              {filledLangs.map((code) => (
                <span key={code} className="pill-mini">{LANG_LABELS[code] ?? code.toUpperCase()}</span>
              ))}
            </span>
            {canEdit && (
              <button type="button" className="btn" onClick={openModal}>
                <Pencil size={14} aria-hidden /> Modifier
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="adapted-desc__empty">
          <span className="muted">Aucune description adaptée</span>
          {canEdit && (
            <button type="button" className="btn" onClick={openModal}>
              <Plus size={14} aria-hidden /> Ajouter une description adaptée
            </button>
          )}
        </div>
      )}

      {!canEdit && (
        <p className="muted" style={{ marginTop: 6 }}>
          Lecture seule : vos droits ne permettent pas d&apos;éditer la version par défaut (canonique).
        </p>
      )}

      {open && (
        <EditorModal open={open} title="Description adaptée" onClose={() => setOpen(false)} onSave={save}>
          <LangTabs tabs={langTabs} active={activeLang} onSelect={setActiveLang} />
          <MarkdownEditorLazy
            value={readTranslatableField(draft, activeLang, local)}
            ariaLabel={`Description adaptée — ${LANG_LABELS[activeLang] ?? activeLang.toUpperCase()}`}
            onChange={(md) => setDraft((d) => updateTranslatableField(d, activeLang, local, md))}
          />
        </EditorModal>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/object-editor/widgets/AdaptedDescriptionField.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/features/object-editor/widgets/AdaptedDescriptionField.tsx src/features/object-editor/widgets/AdaptedDescriptionField.test.tsx
git commit -m "feat(editor): AdaptedDescriptionField — compact card + Markdown modal (§10)"
```

---

## Task 5: Wire `AdaptedDescriptionField` into §10

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.test.tsx`

- [ ] **Step 1: Update the §10 imports**

In `SectionAccessibility.tsx`, change line 2 (drop `LangTabs`, `Textarea`; the section no longer uses them directly):

```tsx
import { ChipMultiSelect, Fs, Select, StatCard, Toggle } from '../primitives';
```

Change line 5 (drop the descriptions-field helpers — they move into the widget):

```tsx
import { AdaptedDescriptionField } from '../widgets/AdaptedDescriptionField';
```

(Remove the old `import { readTranslatableField, updateTranslatableField } from './descriptions-field';` line entirely.)

- [ ] **Step 2: Remove the now-unused `active` local and `langTabs` computation**

Delete the `const active = descriptions.activeLanguage;` line (was line 26) and the whole `langTabs` block (was lines 89-93):

```tsx
  const langTabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code.toUpperCase(),
    filled: Boolean(readTranslatableField(objectScope.adaptedDescription, code, descriptions.localLanguage).trim()),
  }));
```

`LANG_LABELS` (line 20) is now unused in the section — delete it too.

- [ ] **Step 3: Replace the adapted-description `Field` block**

Replace the entire block (was lines 116-153, the `<Field label="Description adaptée (description_adapted)" …>` through its closing `</Field>`) with:

```tsx
      <AdaptedDescriptionField
        editor={editor}
        descriptions={descriptions}
        objectScope={objectScope}
        canEdit={canEditAdapted}
      />
```

- [ ] **Step 4: Rewrite the 2 textarea tests in `SectionAccessibility.test.tsx`**

Replace the first `describe('SectionAccessibility — description adaptée …')` block (lines 7-25) with:

```tsx
describe('SectionAccessibility — description adaptée (single owner since the §04 hand-off)', () => {
  it('shows a read-only notice and no edit button without canonical rights', () => {
    const noCanonical = {
      descriptions: { canEditCanonical: false, canDirectWrite: false, canEditOrgEnrichment: true },
    } as unknown as ObjectWorkspacePermissions;
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={noCanonical} />);

    expect(screen.queryByRole('button', { name: /Modifier/i })).toBeNull();
    expect(screen.getByText(/droits ne permettent pas/i)).toBeInTheDocument();
  });

  it('exposes the edit button (Modifier) with canonical rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(screen.getByRole('button', { name: /Modifier/i })).toBeInTheDocument();
  });
});
```

Add the editor mock at the top of the file (after the imports), so the §10 section test does not pull TipTap:

```tsx
jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));
```

- [ ] **Step 5: Run the §10 tests**

Run: `npm run test:run -- src/features/object-editor/sections/SectionAccessibility.test.tsx`
Expected: PASS (all tests; the T&H-label and equipment-panel tests are unchanged and still pass).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS (no unused-import errors in `SectionAccessibility.tsx`).

```bash
git add src/features/object-editor/sections/SectionAccessibility.tsx src/features/object-editor/sections/SectionAccessibility.test.tsx
git commit -m "feat(editor): §10 uses AdaptedDescriptionField (compact card + Markdown modal)"
```

---

## Task 6: Render Markdown in the drawer (`OverviewSection`)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx`

- [ ] **Step 1: Import `MarkdownContent`**

Add near the top imports of `ObjectDetailView.tsx`:

```tsx
import { MarkdownContent } from '../../components/markdown/MarkdownContent';
```

- [ ] **Step 2: Render the adapted-text slots via `MarkdownContent`**

Inside `OverviewSection`, add a provenance-aware copy renderer just before the `return`:

```tsx
  const adaptedText = preview.adaptedDescription;
  const renderCopy = (text: string, className: string) =>
    text && text === adaptedText
      ? <MarkdownContent markdown={text} className={className} />
      : <p className={className}>{text}</p>;
```

Then update the three copy slots in the returned JSX:

- Replace `<p className={`detail-overview__lead${…}`}>{summary}</p>` with
  `renderCopy(summary, `detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`)`.
- Replace `<p className="detail-overview__body">{fullText}</p>` with `renderCopy(fullText, 'detail-overview__body')`.
- Replace `{expanded && alternateText && <p className="detail-overview__support">{alternateText}</p>}` with
  `{expanded && alternateText && <MarkdownContent markdown={alternateText} className="detail-overview__support" />}`.

The full updated copy block:

```tsx
        <div className="detail-overview__copy">
          {summary && renderCopy(
            summary,
            `detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`,
          )}
          {showExtendedText && (
            <>
              <span className="detail-overview__separator" aria-hidden="true" />
              {renderCopy(fullText, 'detail-overview__body')}
            </>
          )}
          {expanded && alternateText && (
            <MarkdownContent markdown={alternateText} className="detail-overview__support" />
          )}
        </div>
```

> Note: when the adapted text bubbles up into `summary` (objects with neither chapo nor description), it renders as a Markdown block and the `--clamped` line-clamp won't apply to the block — acceptable edge case; the common case (chapo/description present) is plain text and clamps as before.

- [ ] **Step 3: Update the existing drawer test if it asserts the adapted `<p>`**

Run: `npm run test:run -- src/features/object-drawer`
Expected: PASS. If a test asserts the adapted text via a `<p>`-specific query that now fails because it's wrapped in a `.md-content` div, update that single assertion to `screen.getByText(<text>)` (role-agnostic). Do not weaken unrelated assertions.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/features/object-drawer/ObjectDetailView.tsx
git commit -m "feat(drawer): render adapted description as sanitized Markdown"
```

---

## Task 7: Full verification (suite + browser preview)

**Files:** none (verification only)

- [ ] **Step 1: Full type + test suite**

Run: `npm run typecheck && npm run test:run`
Expected: typecheck clean; full Jest suite green (the new tests plus all existing suites). Fix any regressions before proceeding.

- [ ] **Step 2: Start the dev server and verify in the browser**

Use the preview tools (not Bash):
1. `preview_start` (Next dev server), with demo mode enabled if needed for editor access.
2. Navigate to an object editor: `/objects/<id>/edit`, scroll to §10 Accessibilité.
3. Confirm the compact card (rendered preview + "Modifier") or the empty "Ajouter une description adaptée" button shows per data.
4. Open the modal; verify the toolbar (Titre/Sous-titre/Gras/Italique/listes/Citation/Lien) and that typing renders **visually** (heading larger, bold bold) with **no Markdown syntax** shown.
5. Apply a heading + a bold word + a bullet list; click "Enregistrer"; reopen the modal and confirm the content round-trips (still a heading + bold + list).
6. `preview_console_logs` / `preview_network` — confirm no errors and the save payload carries Markdown in `description_adapted` / `description_adapted_i18n`.
7. Open the same object's drawer (Explorer) → Description section → confirm the adapted text renders **formatted** (heading/bold/list), not raw `## …`.
8. `preview_screenshot` of the modal and the drawer rendering as proof.

- [ ] **Step 3: Commit any preview-driven fixes**

```bash
git add -A
git commit -m "fix(editor): §10 adapted-description editor — preview-verification fixes"
```

(Skip this commit if the preview verification surfaced no issues.)

---

## Task 8: Decision log + memory

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] **Step 1: Append a decision-log section**

Add a new `§NN` entry to `lot1_mapping_decisions.md` recording: §10 adapted description is now Markdown (compact card + TipTap WYSIWYG modal); storage unchanged (`description_adapted`/`_i18n` text); `MarkdownContent` (markdown-to-jsx, no raw HTML) renders it in the drawer; format subset = H2/H3, bold, italic, lists, blockquote, links; libraries added; deferred items below. Cross-reference the spec (`docs/superpowers/specs/2026-06-15-section10-adapted-description-markdown-editor-design.md`).

- [ ] **Step 2: Record the deferred items in the tracker**

Add to the deferred tracker (with reasons): (a) apply `MarkdownEditor` to §04 main descriptions; (b) Markdown rendering on any public site outside this repo; (c) the `summary`-fallback line-clamp edge case in the drawer.

- [ ] **Step 3: Commit**

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs(decisions): §10 adapted-description Markdown editor + deferred items"
```

---

## Self-Review notes (author)

- **Spec coverage:** compact card+button (Task 4), modal WYSIWYG (Tasks 3-4), Markdown storage no schema change (Task 4 — writes the existing translatable field; `buildObjectDescriptionPayload` untouched), format subset H2/H3+bold/italic/lists/blockquote/links (Tasks 1, 3), drawer render (Task 6), multilingual + gating (Task 4), security/no-raw-HTML (Task 1), a11y toolbar labels (Task 3), tests (Tasks 1, 3, 4), deferred items (Task 8). All spec sections map to a task.
- **Renderer library:** spec said `react-markdown + remark-gfm`; plan uses `markdown-to-jsx` for the same XSS-safe/no-raw-HTML intent, because `next/jest` transforms it cleanly (react-markdown's ESM-only chain needs `transformIgnorePatterns` surgery). Behavior contract is identical. (Reconciled in the spec's library row.)
- **Type consistency:** `MarkdownEditor`/`MarkdownEditorLazy` share `{ value, onChange, disabled?, ariaLabel }`; `AdaptedDescriptionField` props `{ editor, descriptions, objectScope, canEdit }` match `SectionProps`/`ObjectEditorState`; `WorkspaceTranslatableField` = `{ baseValue, values }` used consistently; `editor.replaceModule('descriptions', …)` matches `useObjectEditorState`.
