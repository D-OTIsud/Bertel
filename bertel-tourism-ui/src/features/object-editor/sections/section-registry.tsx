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
  SectionDistribution,
  SectionIdentity,
  SectionLocation,
  SectionMedia,
  SectionOpenings,
  SectionPayLangs,
  SectionPlaces,
  SectionPricing,
  SectionProvider,
  SectionPublication,
  SectionRelations,
  SectionSustainability,
  SectionSync,
  SectionTags,
} from './index';
import { TYPE_BLOCKS } from './blocks';

export const MODE_ESSENTIAL = new Set(['01', '02', '03', '04', '05', '13', '14', '21']);

function TypeBlockSection(props: SectionProps) {
  const Block = TYPE_BLOCKS[props.archetype ?? 'HEB'];
  return <Block {...props} />;
}

export const SECTION_COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  '01': SectionIdentity,
  '02': SectionDescriptions,
  '03': SectionLocation,
  '04': SectionContacts,
  '05': TypeBlockSection,
  '06': SectionMedia,
  '07': SectionCapacity,
  '08': SectionClassification,
  '09': SectionTags,
  '10': SectionAccessibility,
  '11': SectionSustainability,
  '12': SectionPayLangs,
  '13': SectionPricing,
  '14': SectionOpenings,
  '15': SectionRelations,
  '16': SectionPlaces,
  '17': SectionAttachments,
  '18': SectionProvider,
  '19': SectionCrm,
  '20': SectionDistribution,
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
