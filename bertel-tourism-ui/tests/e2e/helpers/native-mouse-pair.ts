import { randomUUID } from 'node:crypto';
import type { CDPSession, JSHandle, Locator } from '@playwright/test';

type Point = { x: number; y: number };
type MouseMove = Point & { type: 'mouseMoved'; buttons: 0 };
export type NativeMouseDispatch = (params: MouseMove) => Promise<unknown>;

// A trusted entry, reported by Chromium's Runtime binding notification, is the
// causal barrier before the native exit. No first mouse ACK is awaited before
// exit. No DOM event, supplied timestamp, or browser timer is manufactured.
export async function dispatchNativeHoverAfterEntry(
  session: CDPSession,
  target: Locator,
  inside: Point,
  outside: Point,
  dispatch: NativeMouseDispatch = params => session.send('Input.dispatchMouseEvent', params),
): Promise<{ entryNotifications: number; bindingName: string }> {
  const bindingName = `__nativeHover_${randomUUID().replaceAll('-', '')}`;
  const payload = randomUUID();
  let observer: JSHandle<() => void> | undefined;
  let installed = false;
  let expired = false;
  let entryNotifications = 0;
  let resolveLeaving!: () => void;
  let rejectLeaving!: (error: Error) => void;
  const leaving = new Promise<void>((resolve, reject) => {
    resolveLeaving = resolve;
    rejectLeaving = reject;
  });
  const onBinding = (event: { name: string; payload: string }) => {
    if (event.name !== bindingName || event.payload !== payload) return;
    entryNotifications += 1;
    if (entryNotifications !== 1) {
      rejectLeaving(new Error('Duplicate native entry notification'));
      return;
    }
    try {
      void dispatch({ type: 'mouseMoved', ...outside, buttons: 0 }).then(resolveLeaving, rejectLeaving);
    } catch (error) {
      rejectLeaving(error instanceof Error ? error : new Error(String(error)));
    }
  };
  // Handle setup failure before Promise.all attaches its rejection handler.
  void leaving.catch(() => undefined);
  session.on('Runtime.bindingCalled', onBinding);
  // A real Node deadline bounds the observer lifetime. It never advances the
  // browser clock or supplies the brief-hover dwell asserted by the caller.
  const deadline = setTimeout(() => {
    expired = true;
    session.off('Runtime.bindingCalled', onBinding);
    rejectLeaving(new Error('No trusted entry/exit before native input deadline'));
  }, 5_000);
  try {
    await session.send('Runtime.enable');
    await session.send('Runtime.addBinding', { name: bindingName });
    installed = true;
    observer = await target.evaluateHandle((element, config) => {
      const notify = (event: Event) => {
        if (event.isTrusted) {
          (globalThis as unknown as Record<string, (value: string) => void>)[config.bindingName](config.payload);
        }
      };
      element.addEventListener('pointerenter', notify, { once: true });
      return () => {
        element.removeEventListener('pointerenter', notify);
        delete (globalThis as unknown as Record<string, unknown>)[config.bindingName];
      };
    }, { bindingName, payload });
    if (expired) throw new Error('Native input setup exceeded observer deadline');
    await Promise.all([
      dispatch({ type: 'mouseMoved', ...inside, buttons: 0 }),
      leaving,
    ]);
    return { entryNotifications, bindingName };
  } finally {
    clearTimeout(deadline);
    session.off('Runtime.bindingCalled', onBinding);
    try {
      if (observer) await observer.evaluate(dispose => dispose());
    } finally {
      try {
        await observer?.dispose();
      } finally {
        if (installed) await session.send('Runtime.removeBinding', { name: bindingName });
      }
    }
  }
}
