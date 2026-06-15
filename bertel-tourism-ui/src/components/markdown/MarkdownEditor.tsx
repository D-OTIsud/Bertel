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
