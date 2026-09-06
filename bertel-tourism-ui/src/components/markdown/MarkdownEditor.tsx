'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';

// tiptap-markdown exposes its storage type but does not augment Tiptap 3's registry.
declare module '@tiptap/core' {
  interface Storage {
    markdown: MarkdownStorage;
  }
}
import {
  Heading2, Heading3, Bold as BoldIcon, Italic as ItalicIcon,
  List, ListOrdered, Quote, Link as LinkIcon, Undo2, Redo2,
} from 'lucide-react';

const ALLOWED_LINK_PROTOCOL = /^(https?:|mailto:)/i;

type MarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** 'block' (default): full subset incl. headings/lists/quote. 'inline': bold/italic/link only (teasers). */
  variant?: 'block' | 'inline';
};

type ToolBtnProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolBtn({ label, active, disabled, onClick, children }: ToolBtnProps) {
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
  if (!ALLOWED_LINK_PROTOCOL.test(url.trim())) {
    window.alert('Adresse non valide. Utilisez http(s):// ou mailto:.');
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}

type ToolbarState = {
  isHeading2: boolean;
  isHeading3: boolean;
  isBold: boolean;
  isItalic: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isLink: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

// `shouldRerenderOnTransaction` defaults to false in TipTap 3 (perf), so toolbar isActive/can()
// state is read via useEditorState — it subscribes to transactions independently of the editor's
// own render gate.
function useToolbarState(editor: Editor): ToolbarState {
  return useEditorState({
    editor,
    selector: ({ editor }) => {
      return {
        isHeading2: editor.isActive('heading', { level: 2 }),
        isHeading3: editor.isActive('heading', { level: 3 }),
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isBulletList: editor.isActive('bulletList'),
        isOrderedList: editor.isActive('orderedList'),
        isBlockquote: editor.isActive('blockquote'),
        isLink: editor.isActive('link'),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      };
    },
  });
}

function Toolbar({ editor, variant }: { editor: Editor; variant: 'block' | 'inline' }) {
  const state = useToolbarState(editor);
  const block = variant !== 'inline';
  return (
    <div className="md-editor__toolbar" role="toolbar" aria-label="Mise en forme">
      {block && (
        <>
          <ToolBtn label="Titre" active={state.isHeading2}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={16} aria-hidden />
          </ToolBtn>
          <ToolBtn label="Sous-titre" active={state.isHeading3}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 size={16} aria-hidden />
          </ToolBtn>
          <span className="md-editor__sep" aria-hidden />
        </>
      )}
      <ToolBtn label="Gras" active={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Italique" active={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon size={16} aria-hidden />
      </ToolBtn>
      <span className="md-editor__sep" aria-hidden />
      {block && (
        <>
          <ToolBtn label="Liste à puces" active={state.isBulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={16} aria-hidden />
          </ToolBtn>
          <ToolBtn label="Liste numérotée" active={state.isOrderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={16} aria-hidden />
          </ToolBtn>
          <ToolBtn label="Citation" active={state.isBlockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={16} aria-hidden />
          </ToolBtn>
        </>
      )}
      <ToolBtn label="Lien" active={state.isLink} onClick={() => setLink(editor)}>
        <LinkIcon size={16} aria-hidden />
      </ToolBtn>
      <span className="md-editor__sep" aria-hidden />
      <ToolBtn label="Annuler" disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={16} aria-hidden />
      </ToolBtn>
      <ToolBtn label="Rétablir" disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={16} aria-hidden />
      </ToolBtn>
    </div>
  );
}

/** TipTap WYSIWYG bound to a Markdown string. Constrained to the §10 subset:
 *  H2/H3, bold, italic, bullet/ordered lists, blockquote, links. No raw HTML in or out
 *  (Markdown.configure({ html: false })). value/onChange are Markdown — the canonical store. */
export function MarkdownEditor({ value, onChange, disabled, ariaLabel, variant = 'block' }: MarkdownEditorProps) {
  // Keep onChange in a ref so the once-bound onUpdate callback never calls a stale closure
  // (the parent passes a fresh arrow each render — e.g. one closing over the active language).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: variant === 'inline' ? false : { levels: [2, 3] },
        bulletList: variant === 'inline' ? false : undefined,
        orderedList: variant === 'inline' ? false : undefined,
        blockquote: variant === 'inline' ? false : undefined,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        // StarterKit 3 bundles link/underline/trailingNode. Link is configured separately below;
        // underline has no place in the §10 subset and would otherwise be reachable via Ctrl+U.
        link: false,
        underline: false,
        trailingNode: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['mailto'],
        // `protocols` is additive to Link v3's built-in allow-list (which also includes
        // ftp/tel/callto/sms/cid/xmpp) — it cannot narrow it. `isAllowedUri` is the real gate: it
        // is checked on setLink/toggleLink/paste/parseHTML and must NOT fall back to
        // `ctx.defaultValidate`. `shouldAutoLink` mirrors the same allow-list for autolink-while-typing.
        isAllowedUri: (url) => ALLOWED_LINK_PROTOCOL.test(url),
        shouldAutoLink: (url) => ALLOWED_LINK_PROTOCOL.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Markdown.configure({ html: false, linkify: false, transformPastedText: true }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    // `md-content` makes block transforms (H2/H3, lists, blockquote, links) VISIBLE while editing —
    // Tailwind preflight strips their default styling, so the editable needs the same display rules.
    editorProps: { attributes: { 'aria-label': ariaLabel, class: 'md-editor__content md-content' } },
    onUpdate: ({ editor }) => onChangeRef.current(editor.storage.markdown.getMarkdown()),
  });

  // External value change (e.g. switching language tab) → reset content WITHOUT firing onUpdate.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.storage.markdown.getMarkdown()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  if (!editor) return <div className="md-editor md-editor--loading" aria-hidden />;

  return (
    <div className="md-editor">
      <Toolbar editor={editor} variant={variant} />
      <EditorContent editor={editor} />
    </div>
  );
}
