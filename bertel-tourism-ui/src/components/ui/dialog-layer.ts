// Radix owns dismissal/focus order. Match that opening order when legacy CSS uses different z-index values.
const layers = new Map<HTMLElement, HTMLElement | null>();

function surfaceZ(element: HTMLElement | null): number {
  let highest = 0;
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const value = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(value)) highest = Math.max(highest, value);
  }
  return highest;
}

export function openDialogLayer(content: HTMLElement, overlay: HTMLElement | null): void {
  const previous = [...layers].filter(([element]) => element !== content && element.isConnected && element.dataset.state === 'open');
  if (previous.length) {
    const highest = Math.max(...previous.map(([element, backdrop]) => Math.max(surfaceZ(element), surfaceZ(backdrop))));
    if (Math.max(surfaceZ(content), surfaceZ(overlay)) <= highest) {
      const next = String(highest + 1);
      content.style.zIndex = next;
      if (overlay) overlay.style.zIndex = next;
    }
  }
  layers.set(content, overlay);
}

export function removeDialogLayer(content: HTMLElement): void {
  // Slot/composed refs may detach briefly during a rerender without removing the DOM node.
  queueMicrotask(() => { if (!content.isConnected) layers.delete(content); });
}
