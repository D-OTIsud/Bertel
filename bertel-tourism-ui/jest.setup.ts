import '@testing-library/jest-dom';
import { randomUUID } from 'node:crypto';

// Guard browser-only setup so tests with `/** @jest-environment node */` (e.g. server-only
// modules under src/lib) can load this setup file without ReferenceError. The DOM stubs
// below are only meaningful in jsdom; in a node environment there is nothing to patch.
if (typeof window !== 'undefined') {
  (window as unknown as { __APP_CONFIG__?: Record<string, string> }).__APP_CONFIG__ = {
    NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
  };

  // jsdom does not implement IntersectionObserver (used by the drawer detail tabs scroll-spy).
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub;

  // jsdom's `crypto` implements getRandomValues but not randomUUID (added later to the Web
  // Crypto spec) — needed to generate the client-side export_run_id of the actor-contacts
  // export (§208/T16, export-actor-contacts.ts: `crypto.randomUUID()`).
  if (typeof window.crypto?.randomUUID !== 'function') {
    Object.defineProperty(window.crypto, 'randomUUID', { value: randomUUID, configurable: true });
  }

  // jsdom does not implement matchMedia (used by useMediaQuery, e.g. for prefers-reduced-motion).
  // Stub it globally so usePresence and other motion consumers resolve correctly in tests.
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}
