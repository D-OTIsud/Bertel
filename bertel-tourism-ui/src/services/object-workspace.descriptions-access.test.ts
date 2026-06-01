import { describeDescriptionsAccess } from './object-workspace';

describe('describeDescriptionsAccess', () => {
  it('publisher (canonical) can edit canonical and, if enrichment, the overlay', () => {
    const a = describeDescriptionsAccess({ directWrite: false, canonical: true, enrichment: true });
    expect(a.canEditCanonical).toBe(true);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
  it('contributor (enrichment only) cannot edit canonical', () => {
    const a = describeDescriptionsAccess({ directWrite: false, canonical: false, enrichment: true });
    expect(a.canEditCanonical).toBe(false);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
  it('direct-write bypass enables both', () => {
    const a = describeDescriptionsAccess({ directWrite: true, canonical: false, enrichment: false });
    expect(a.canEditCanonical).toBe(true);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
});
