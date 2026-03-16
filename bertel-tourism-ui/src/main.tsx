/**
 * Vite entry (legacy). The app runs on Next.js: use `npm run dev` or `npm run build` + `npm run start`.
 */
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <p>Bertel Tourism UI runs on Next.js.</p>
        <p>Use <code>npm run dev</code> or <code>npm run build</code> then <code>npm run start</code>.</p>
      </div>
    </StrictMode>,
  );
}
