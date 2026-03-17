import '@testing-library/jest-dom';

(window as unknown as { __APP_CONFIG__?: Record<string, string> }).__APP_CONFIG__ = {
  NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
};
