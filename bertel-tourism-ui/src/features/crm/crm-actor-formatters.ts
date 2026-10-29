import type { GeocodeHit } from '../object-editor/widgets/geocode-address';

export interface StructuredActorAddress {
  address1: string;
  postcode: string;
  city: string;
}

function compactAddressPart(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function formatActorAddressFromHit(hit: GeocodeHit): string {
  return composeActorAddressValue({ address1: hit.name, postcode: hit.postcode, city: hit.city });
}

export function parseActorAddressValue(value: string): StructuredActorAddress {
  const compact = compactAddressPart(value);
  if (!compact) {
    return { address1: '', postcode: '', city: '' };
  }
  const match = compact.match(/^(.*?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  if (!match) {
    return { address1: compact, postcode: '', city: '' };
  }
  return {
    address1: compactAddressPart(match[1].replace(/,$/, '')),
    postcode: match[2],
    city: compactAddressPart(match[3]),
  };
}

export function composeActorAddressValue(address: StructuredActorAddress): string {
  const address1 = compactAddressPart(address.address1);
  const cityLine = compactAddressPart([address.postcode, address.city].filter(Boolean).join(' '));
  return [address1, cityLine].filter(Boolean).join(', ');
}

export function composeDisplayName(gender: string, firstName: string, lastName: string): string {
  return [gender.trim(), firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}
