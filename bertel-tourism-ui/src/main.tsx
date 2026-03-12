import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { App } from './app/App';
import { queryClient } from './app/query-client';
import { ThemeBootstrap } from './components/common/ThemeBootstrap';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeBootstrap />
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
