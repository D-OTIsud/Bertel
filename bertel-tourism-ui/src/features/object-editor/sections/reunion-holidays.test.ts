import { reunionHolidays } from './reunion-holidays';

test('La Réunion includes 20 December and the 2026 movable holidays', () => {
  const dates = reunionHolidays(2026);
  expect(dates).toHaveLength(12);
  expect(dates).toEqual(expect.arrayContaining([
    { date: '2026-04-06', label: 'Lundi de Pâques' },
    { date: '2026-05-14', label: 'Ascension' },
    { date: '2026-05-25', label: 'Lundi de Pentecôte' },
    { date: '2026-12-20', label: 'Abolition de l’esclavage' },
  ]));
});

test('movable holidays are recalculated for the following year', () => {
  expect(reunionHolidays(2027)).toEqual(expect.arrayContaining([
    { date: '2027-03-29', label: 'Lundi de Pâques' },
    { date: '2027-05-06', label: 'Ascension' },
    { date: '2027-05-17', label: 'Lundi de Pentecôte' },
  ]));
});
