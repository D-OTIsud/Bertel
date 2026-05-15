import '@testing-library/jest-dom';

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
