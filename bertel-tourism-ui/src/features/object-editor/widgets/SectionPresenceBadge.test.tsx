import { render, screen } from '@testing-library/react';
import { SectionPresenceBadge } from './SectionPresenceBadge';
import type { EditorPeer } from '../presence/editor-presence';

const peer = (over: Partial<EditorPeer> & { userId: string }): EditorPeer => ({
  name: over.userId,
  avatar: '',
  color: '#000',
  ...over,
});

describe('SectionPresenceBadge', () => {
  it('renders nothing when no peer is on the section', () => {
    const { container } = render(<SectionPresenceBadge peers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an avatar for each peer on the section', () => {
    render(<SectionPresenceBadge peers={[peer({ userId: 'u1', name: 'Sarah Durand' })]} />);
    expect(screen.getByText('SD')).toBeInTheDocument();
  });

  it('marks a peer who holds unsaved edits as editing', () => {
    render(<SectionPresenceBadge peers={[peer({ userId: 'u1', name: 'Sarah Durand', editing: true })]} />);
    expect(screen.getByText(/édite/i)).toBeInTheDocument();
  });

  it('does not mark a merely-present peer as editing', () => {
    render(<SectionPresenceBadge peers={[peer({ userId: 'u1', name: 'Sarah Durand' })]} />);
    expect(screen.queryByText(/édite/i)).not.toBeInTheDocument();
  });
});
