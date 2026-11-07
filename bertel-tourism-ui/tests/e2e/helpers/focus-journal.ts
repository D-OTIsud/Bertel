import type { Page } from '@playwright/test';

/** Passive observations of this file's synthetic demo UI; no values/hrefs/text. */
export async function startFocusJournal(page: Page) {
  const handle = await page.evaluateHandle(() => {
    const limit = 64;
    let dropped = 0;
    const describe = (value: EventTarget | null) => value instanceof Element ? {
      tag: value.tagName.toLowerCase(),
      role: value.getAttribute('role'),
      label: value.getAttribute('aria-label')?.slice(0, 140) ?? null,
      classes: typeof value.className === 'string' ? value.className.slice(0, 180) : null,
    } : null;
    type Entry = {
      kind: string; at: number; trusted: boolean | null;
      target: ReturnType<typeof describe>; active: ReturnType<typeof describe>;
      documentHasFocus: boolean;
    };
    const entries: Entry[] = [];
    const record = (kind: string, event?: Event) => {
      if (entries.length === limit) { entries.shift(); dropped += 1; }
      entries.push({ kind, at: performance.now(), trusted: event?.isTrusted ?? null,
        target: describe(event?.target ?? null), active: describe(document.activeElement),
        documentHasFocus: document.hasFocus() });
    };
    const observe = (event: Event) => record(event.type, event);
    document.addEventListener('focusin', observe, true);
    document.addEventListener('focusout', observe, true);
    record('journal-start');
    return {
      checkpoint: (stage: string) => record(stage),
      snapshot: () => ({ limit, dropped, entries: [...entries] }),
      dispose: () => {
        document.removeEventListener('focusin', observe, true);
        document.removeEventListener('focusout', observe, true);
      },
    };
  });
  return {
    checkpoint: (stage: string) => handle.evaluate((journal, value) => journal.checkpoint(value), stage),
    snapshot: () => handle.evaluate(journal => journal.snapshot()),
    dispose: async () => {
      try { await handle.evaluate(journal => journal.dispose()); }
      finally { await handle.dispose(); }
    },
  };
}
