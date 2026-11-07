import type { ComponentType } from 'react';
import type { ArchetypeCode } from '../archetypes';
import { makeSections } from '../section-config';
import type { SectionProps } from './section-types';
import {
  SectionAccessibility,
  SectionAttachments,
  SectionCapacity,
  SectionClassification,
  SectionContacts,
  SectionCrm,
  SectionDescriptions,
  SectionIdentity,
  SectionLegal,
  SectionLocation,
  SectionMedia,
  SectionOpenings,
  SectionPlaces,
  SectionPricing,
  SectionPublication,
  SectionRelations,
  SectionSustainability,
  SectionSync,
  SectionTags,
} from './index';
import { TYPE_BLOCKS } from './blocks';

// '06' = the type block (renumbered 2026-06-11; Médias took '05' and stays non-essential).
export const MODE_ESSENTIAL = new Set(['01', '02', '03', '04', '06', '13', '14', '21']);

function TypeBlockSection(props: SectionProps) {
  // §46: archetype is guaranteed by the ObjectEditPage guard; render nothing rather than
  // silently impersonating the HEB block if a future caller omits it.
  if (!props.archetype) return null;
  const Block = TYPE_BLOCKS[props.archetype];
  return <Block {...props} />;
}

export const SECTION_COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  '01': SectionIdentity,
  '02': SectionLocation,
  '03': SectionContacts,
  '04': SectionDescriptions,
  '05': SectionMedia,
  '06': TypeBlockSection,
  '07': SectionCapacity,
  '08': SectionClassification,
  // Renumbered 2026-06-15 (user): Accessibilité 09, Démarche durable 10, Tags 11.
  '09': SectionAccessibility,
  '10': SectionSustainability,
  '11': SectionTags,
  '13': SectionPricing,
  '14': SectionOpenings,
  '15': SectionRelations,
  '16': SectionPlaces,
  '17': SectionAttachments,
  '18': SectionLegal,
  '19': SectionCrm,
  // §90 — §20 « Distribution & réseaux sociaux » retired: it projected the OPERATOR actor's
  // actor_channel (which cannot hold social/distribution kinds ⇒ always empty). Réseaux sociaux
  // + distribution now live on the OBJECT in §03 (object_web_channel). SectionDistribution.tsx
  // removed in D5 (revue UX).
  '21': SectionPublication,
  '22': SectionSync,
};

export interface RegisteredSection {
  num: string;
  label: string;
  Component: ComponentType<SectionProps>;
}

export function getRegisteredSections(archetype: ArchetypeCode): RegisteredSection[] {
  return makeSections(archetype).flatMap((group) => (
    group.items.map((item) => ({
      ...item,
      Component: SECTION_COMPONENTS[item.num],
    })).filter((item): item is RegisteredSection => Boolean(item.Component))
  ));
}
