import { resolveActiveSectionNum } from './editor-scroll-spy';

function mockSection(num: string, top: number): HTMLElement {
  return {
    getAttribute: (name: string) => (name === 'data-section' ? num : null),
    getBoundingClientRect: () => ({ top } as DOMRect),
  } as HTMLElement;
}

describe('resolveActiveSectionNum', () => {
  const rootTop = 100;
  const nodes = [
    mockSection('01', 80),
    mockSection('02', 400),
    mockSection('03', 900),
    mockSection('04', 1400),
  ];

  it('picks the last section whose top crossed the activation line', () => {
    expect(resolveActiveSectionNum(nodes, rootTop)).toBe('01');
    expect(resolveActiveSectionNum(
      [mockSection('01', 0), mockSection('02', 200), mockSection('03', 210), mockSection('04', 1500)],
      rootTop,
    )).toBe('03');
  });

  it('prefers descriptions over contacts when descriptions header is at the line', () => {
    const scrollingToDescriptions = [
      mockSection('01', 0),
      mockSection('02', -200),
      mockSection('03', 50),
      mockSection('04', 180),
    ];
    expect(resolveActiveSectionNum(scrollingToDescriptions, rootTop)).toBe('04');
  });
});
