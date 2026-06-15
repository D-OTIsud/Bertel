import { render, screen } from '@testing-library/react';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders headings, bold, italic and lists', () => {
    render(<MarkdownContent markdown={'## Titre\n\n**gras** et *italique*\n\n- a\n- b'} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('gras').tagName).toBe('STRONG');
    expect(screen.getByText('italique').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('does not parse or execute raw HTML (XSS-safe)', () => {
    const { container } = render(
      <MarkdownContent markdown={'<img src=x onerror="alert(1)"> <script>alert(2)</script> texte'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('texte');
  });

  it('renders safe links with rel/noopener and drops unsafe schemes', () => {
    render(<MarkdownContent markdown={'[ok](https://x.fr) [bad](javascript:alert(1))'} />);
    const ok = screen.getByRole('link', { name: 'ok' });
    expect(ok).toHaveAttribute('href', 'https://x.fr');
    expect(ok).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ok).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.getByText('bad').tagName).toBe('SPAN');
  });

  it('renders nothing for empty/whitespace markdown', () => {
    const { container } = render(<MarkdownContent markdown={'   '} />);
    expect(container).toBeEmptyDOMElement();
  });
});
