'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { formatPresenceDuration, initials, networkStatusLabel } from '../../lib/presence';

const TICK_MS = 30_000;

export function LivePresenceIndicator() {
  const liveMembers = useUiStore((state) => state.liveMembers);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const selfId = useSessionStore((state) => state.userId);

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const net = networkStatusLabel(networkStatus);
  const count = liveMembers.length;
  const isAlone = count === 1 && liveMembers[0]?.userId === selfId;

  // Keep the "en ligne depuis" labels fresh while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [open]);

  // Close on Escape or outside click while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [open]);

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      setOpen(next);
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      className="live-presence"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      {networkStatus !== 'connected' ? (
        <span className={`status-pill status-pill--${net.tone}`} title={net.description}>
          <span className="status-pill__dot" aria-hidden="true" />
          {net.label}
        </span>
      ) : null}

      <button
        type="button"
        className={`status-pill status-pill--${net.tone} live-presence__trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="live-presence-panel"
        onClick={togglePin}
        onFocus={() => setOpen(true)}
      >
        <span className="status-pill__dot" aria-hidden="true" />
        {count} live
      </button>

      {open ? (
        <div
          id="live-presence-panel"
          role="dialog"
          aria-label="Personnes en ligne"
          className="live-presence__panel"
        >
          <div className="live-presence__header">
            <strong>
              {count} {count > 1 ? 'personnes' : 'personne'} en ligne
            </strong>
            <span className={`live-presence__net live-presence__net--${net.tone}`} title={net.description}>
              <span className="status-pill__dot" aria-hidden="true" />
              {net.label}
            </span>
          </div>

          {count === 0 ? (
            <p className="live-presence__empty">Présence indisponible (hors ligne).</p>
          ) : (
            <ul className="live-presence__list">
              {liveMembers.map((member) => {
                const isSelf = member.userId === selfId;
                const duration = formatPresenceDuration(member.onlineSince, now);
                return (
                  <li key={member.userId} className="live-presence__row">
                    <span
                      className="avatar-chip"
                      style={{ backgroundColor: member.color || 'var(--theme-primary)' }}
                    >
                      {member.avatar || initials(member.name) || '?'}
                    </span>
                    <span className="live-presence__person">
                      <strong>
                        {member.name}
                        {isSelf ? ' · Vous' : ''}
                      </strong>
                      {duration ? <small>{duration}</small> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {isAlone ? <p className="live-presence__alone">Vous êtes seul·e en ligne.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
