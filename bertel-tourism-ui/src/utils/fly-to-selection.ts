const SELECTION_COUNT_ANCHOR_SELECTOR = '[data-selection-count-anchor]';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateSelectionAnchor(target: HTMLElement): void {
  if (typeof target.animate !== 'function') return;
  target.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16)' },
      { transform: 'scale(1)' },
    ],
    { duration: 260, easing: 'ease-out' },
  );
}

function createFlyingStar(origin: DOMRect): HTMLDivElement {
  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.position = 'fixed';
  ghost.style.left = `${origin.left + origin.width / 2 - 8}px`;
  ghost.style.top = `${origin.top + origin.height / 2 - 8}px`;
  ghost.style.width = '16px';
  ghost.style.height = '16px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '80';
  ghost.style.color = '#f59f3a';
  ghost.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11.999 2l2.911 5.898 6.511.946-4.711 4.592 1.112 6.484L11.999 16.86l-5.823 3.06 1.112-6.484L2.577 8.844l6.511-.946L11.999 2z"/></svg>';
  return ghost;
}

export function flyStarToSelection(originElement: HTMLElement): void {
  if (typeof document === 'undefined') return;
  if (prefersReducedMotion()) return;

  const targetElement = document.querySelector<HTMLElement>(SELECTION_COUNT_ANCHOR_SELECTOR);
  if (!targetElement) return;

  const originRect = originElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const ghost = createFlyingStar(originRect);
  document.body.appendChild(ghost);

  const originCenterX = originRect.left + originRect.width / 2;
  const originCenterY = originRect.top + originRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  const flight = ghost.animate(
    [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${targetCenterX - originCenterX}px, ${targetCenterY - originCenterY}px, 0) scale(0.45)`, opacity: 0.15 },
    ],
    {
      duration: 460,
      easing: 'cubic-bezier(.5,.1,.4,1)',
      fill: 'forwards',
    },
  );

  flight.addEventListener('finish', () => {
    ghost.remove();
    animateSelectionAnchor(targetElement);
  });
  flight.addEventListener('cancel', () => {
    ghost.remove();
  });
}
