import { getSectionsForType } from './object-drawer-sections';

describe('object drawer sections', () => {
  it('shows the full left-menu surface for mature hospitality objects', () => {
    expect(getSectionsForType('HOT').map((section) => section.id)).toEqual([
      'overview',
      'location',
      'contacts',
      'media',
      'distinctions',
      'offer',
      'type-details',
      'crm',
      'legal-sync',
    ]);
  });

  it('keeps institutional objects lean while preserving the left menu', () => {
    expect(getSectionsForType('ORG').map((section) => section.id)).toEqual([
      'overview',
      'location',
      'contacts',
      'media',
      'crm',
      'legal-sync',
    ]);
  });

  it('keeps reference objects minimal', () => {
    expect(getSectionsForType('VIL').map((section) => section.id)).toEqual([
      'overview',
      'location',
      'contacts',
      'media',
      'legal-sync',
    ]);
  });
});
