import { expect, test } from '@playwright/test';
import { dispatchNativeMousePair, type NativeMouseSession } from './helpers/native-mouse-pair';

test.describe.configure({ retries: 0 });

// Reproduce the order of magnitude of the observed 838.4ms driver delay.
// This is a real Node-side ACK delay, never a fake browser clock or timestamp.
const ACK_DELAY_MS = 838;

for (const mode of ['await-per-move', 'paired-native'] as const) {
  test(`native input timing with delayed first ACK: ${mode}`, async ({ page, browser }) => {
    await page.setContent('<div id="target" style="position:absolute;left:100px;top:100px;width:100px;height:100px">native fixture</div>');
    await page.mouse.move(1, 1);
    const target = page.locator('#target');
    await target.evaluate(element => {
      const events: { type: string; trusted: boolean; timestamp: number; handled: number }[] = [];
      for (const type of ['pointerenter', 'pointerleave'] as const) {
        element.addEventListener(type, event => {
          events.push({ type, trusted: event.isTrusted, timestamp: event.timeStamp, handled: performance.now() });
          element.setAttribute('data-native-events', JSON.stringify(events));
        }, { once: true });
      }
    });
    const cdp = await page.context().newCDPSession(page);
    let sent = 0, firstAckReturned = false, secondBeforeFirstAck = false;
    const submitted: number[] = [];
    const delayed: NativeMouseSession = {
      send: (method, params) => {
        submitted.push(performance.now());
        const index = sent++;
        if (index === 1) secondBeforeFirstAck = !firstAckReturned;
        const native = cdp.send(method, params);
        return index === 0 ? native.then(async value => {
          await new Promise(resolve => setTimeout(resolve, ACK_DELAY_MS));
          firstAckReturned = true;
          return value;
        }) : native;
      },
    };
    try {
      if (mode === 'paired-native') {
        await dispatchNativeMousePair(delayed, { x: 150, y: 150 }, { x: 220, y: 150 });
      } else {
        await delayed.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 150, buttons: 0 });
        await delayed.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 220, y: 150, buttons: 0 });
      }
    } finally {
      await cdp.detach();
    }
    const events = JSON.parse((await target.getAttribute('data-native-events')) ?? '[]') as {
      type: string; trusted: boolean; timestamp: number; handled: number;
    }[];
    expect(sent).toBe(2);
    expect(events.map(event => event.type)).toEqual(['pointerenter', 'pointerleave']);
    expect(events.every(event => event.trusted)).toBe(true);
    const dwell = events[1].timestamp - events[0].timestamp;
    const handledDwell = events[1].handled - events[0].handled;
    const driverGap = submitted[1] - submitted[0];
    expect(dwell).toBeGreaterThanOrEqual(0);
    expect(handledDwell).toBeGreaterThanOrEqual(0);
    if (mode === 'paired-native') {
      expect(secondBeforeFirstAck).toBe(true);
      expect(driverGap).toBeLessThan(250);
      expect(dwell).toBeLessThan(250);
      expect(handledDwell).toBeLessThan(250);
    } else {
      expect(secondBeforeFirstAck).toBe(false);
      expect(driverGap).toBeGreaterThanOrEqual(250);
      expect(dwell).toBeGreaterThanOrEqual(250);
    }
    console.log(JSON.stringify({ nativeInputTimingProof: {
      mode, browser: browser.version(), ackDelayMs: ACK_DELAY_MS,
      secondBeforeFirstAck, driverGap, dwell, handledDwell, trustedTransitions: events.length,
    } }));
  });
}
