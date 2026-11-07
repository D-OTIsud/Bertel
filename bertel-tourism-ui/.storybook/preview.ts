import type { Preview } from '@storybook/nextjs';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'todo',
    },
    controls: {
      expanded: true,
    },
  },
};

export default preview;
