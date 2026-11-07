import Markdown from 'markdown-to-jsx';
import type { ReactNode } from 'react';

const SAFE_URL = /^(https?:|mailto:)/i;

function SafeLink({ href, children, ...rest }: { href?: string; children?: ReactNode }) {
  const safe = href && SAFE_URL.test(href.trim()) ? href.trim() : undefined;
  if (!safe) return <span {...rest}>{children}</span>;
  // Spread ...rest FIRST so the hardcoded security attributes (href/target/rel) can never be
  // overridden by props forwarded from parsed markdown or a future caller.
  return (
    <a {...rest} href={safe} target="_blank" rel="noopener noreferrer">
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

type MarkdownContentProps = {
  markdown: string;
  className?: string;
};

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
