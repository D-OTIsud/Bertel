import { render, screen } from '@testing-library/react';
import { CompletionRing } from './CompletionRing';

describe('CompletionRing', () => {
  it('renders the overall percentage and one row per scored section', () => {
    render(
      <CompletionRing
        overall={78}
        sections={[
          { label: 'Identité', pct: 100, stat: 'ok' },
          { label: 'Descriptions', pct: 50, stat: 'warn' },
        ]}
      />,
    );

    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Descriptions')).toBeInTheDocument();
  });
});
