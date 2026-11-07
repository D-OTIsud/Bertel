type Point = { x: number; y: number };
type MouseMove = Point & { type: 'mouseMoved'; buttons: 0 };

/** Narrow subset of the pinned CDPSession/Input types, without a supplied
 * timestamp. These commands go through Chromium's native input pipeline. */
export interface NativeMouseSession {
  send(method: 'Input.dispatchMouseEvent', params: MouseMove): Promise<unknown>;
}

export async function dispatchNativeMousePair(session: NativeMouseSession, inside: Point, outside: Point): Promise<void> {
  // Submit both before observing either acknowledgement. Awaiting the first
  // move here would let driver/ACK latency become part of the hover duration.
  const entering = session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...inside, buttons: 0 });
  const leaving = session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...outside, buttons: 0 });
  await Promise.all([entering, leaving]);
}
