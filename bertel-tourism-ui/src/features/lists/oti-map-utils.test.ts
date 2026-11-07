import { bboxOf, locatedPois, projectPins } from './oti-map-utils';

describe('locatedPois', () => {
  it('drops items without coordinates and keeps the original card numbering', () => {
    const pois = [
      { id: 'a', lat: -21.1, lon: 55.5 },
      { id: 'b', lat: null, lon: 55.6 },
      { id: 'c', lat: -21.3, lon: 55.7 },
    ];
    const out = locatedPois(pois);
    // 'b' has no latitude → no pin, but 'c' keeps its card number (3), like the ITI stage map
    expect(out.map((e) => e.n)).toEqual([1, 3]);
    expect(out[0]).toMatchObject({ lat: -21.1, lon: 55.5 });
    expect(out[1].poi.id).toBe('c');
  });

  it('returns [] when nothing is located', () => {
    expect(locatedPois([{ id: 'a', lat: null, lon: null }])).toEqual([]);
  });
});

describe('bboxOf', () => {
  it('returns null for an empty set', () => {
    expect(bboxOf([])).toBeNull();
  });

  it('returns [minLon, minLat, maxLon, maxLat]', () => {
    expect(
      bboxOf([
        { lat: -21.1, lon: 55.5 },
        { lat: -21.3, lon: 55.2 },
      ]),
    ).toEqual([55.2, -21.3, 55.5, -21.1]);
  });
});

describe('projectPins', () => {
  const located = [
    { n: 1, lat: -21, lon: 55 },
    { n: 2, lat: -22, lon: 56 },
  ];

  it('converts projected pixels to container percentages', () => {
    const project = ([lon]: [number, number]) => (lon === 55 ? { x: 200, y: 100 } : { x: 600, y: 300 });
    expect(projectPins(located, project, 800, 400)).toEqual([
      { n: 1, xPct: 25, yPct: 25 },
      { n: 2, xPct: 75, yPct: 75 },
    ]);
  });

  it('drops pins projected outside the container (panned out of view)', () => {
    const project = ([lon]: [number, number]) => (lon === 55 ? { x: 200, y: 100 } : { x: 900, y: 150 });
    expect(projectPins(located, project, 800, 400)).toEqual([{ n: 1, xPct: 25, yPct: 25 }]);
  });

  it('returns [] when the container has no size yet', () => {
    const project = () => ({ x: 10, y: 10 });
    expect(projectPins(located, project, 0, 0)).toEqual([]);
  });
});
