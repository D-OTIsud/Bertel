'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getObjectDocumentUrl } from '../../services/object-documents';
import { isPrivateObjectDocumentHref } from '../../lib/object-document-location';
import { useSessionStore } from '../../store/session-store';

interface Props {
  objectId: string;
  documentId: string;
  href: string;
  requiresSigning?: boolean;
  accessContext?: 'canonical' | 'legal';
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/** Same link presentation; private attachments open only after current server authorization. */
export function ObjectDocumentLink({ objectId, documentId, href, requiresSigning, accessContext = 'canonical', children, ariaLabel, className, style }: Props) {
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const identity = JSON.stringify([userId, orgId, status, role, canEditObjects, objectId, documentId, accessContext]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const generation = useRef(0);
  const pending = useRef<{ controller: AbortController; tab: Window } | null>(null);
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle');

  useEffect(() => {
    setState('idle');
    const invalidate = () => {
      generation.current += 1;
      pending.current?.controller.abort();
      pending.current?.tab.close();
      pending.current = null;
    };
    // A -> B -> A can be batched into one React render. Every intervening
    // authority transition still invalidates an in-flight signed link.
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (next.userId !== previous.userId || next.orgId !== previous.orgId
        || next.status !== previous.status || next.role !== previous.role
        || next.canEditObjects !== previous.canEditObjects) {
        invalidate();
        setState('idle');
      }
    });
    return () => {
      unsubscribe();
      invalidate();
    };
  }, [identity]);

  if (!requiresSigning && !isPrivateObjectDocumentHref(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} aria-label={ariaLabel}>{children}</a>;
  }

  async function open() {
    if (pending.current) return;
    // Open synchronously under the user's click, then sever opener access before
    // any asynchronous work. An obsolete response can only close this blank tab.
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setState('error'); return; }
    tab.opener = null;
    const controller = new AbortController();
    pending.current = { tab, controller };
    const run = ++generation.current;
    setState('opening');
    try {
      const url = await (accessContext === 'legal'
        ? getObjectDocumentUrl(objectId, documentId, controller.signal, 'legal')
        : getObjectDocumentUrl(objectId, documentId, controller.signal));
      if (controller.signal.aborted || run !== generation.current || identity !== currentIdentity.current) { tab.close(); return; }
      if (!tab.closed) tab.location.replace(url);
      setState('idle');
    } catch {
      tab.close();
      if (!controller.signal.aborted && run === generation.current && identity === currentIdentity.current) setState('error');
    } finally {
      if (run === generation.current) pending.current = null;
    }
  }

  return (
    <span className="object-document-link" style={style?.display === 'block' ? { display: 'block' } : undefined}>
      <button type="button" className={`object-document-link__button${className ? ` ${className}` : ''}`} style={style}
        aria-label={state === 'error' && ariaLabel ? `Réessayer — ${ariaLabel}` : ariaLabel} aria-busy={state === 'opening' || undefined} disabled={state === 'opening'} onClick={() => void open()}>
        {state === 'opening' ? 'Ouverture…' : state === 'error' ? 'Réessayer' : children}
      </button>
      {state === 'error' && <span className="object-document-link__error" role="alert">Impossible d’ouvrir ce document.</span>}
    </span>
  );
}
