import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('does not use transition-all and lists explicit transition properties', () => {
    render(<Button>Go</Button>);
    const className = screen.getByRole('button', { name: 'Go' }).className;
    expect(className).not.toMatch(/\btransition-all\b/);
    expect(className).toMatch(/transition-\[transform,background-color,color,border-color,box-shadow,opacity\]/);
  });

  it('scales down on active press without affecting layout', () => {
    render(<Button>Go</Button>);
    const className = screen.getByRole('button', { name: 'Go' }).className;
    expect(className).toMatch(/active:scale-\[0\.98\]/);
  });
});
