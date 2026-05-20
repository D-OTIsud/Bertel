import type { ComponentType } from 'react';
import type { ArchetypeCode } from '../archetypes';
import { makeSections } from '../section-config';
import { Fs } from '../primitives';
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
  SectionLocation,
  SectionMedia,
  SectionOpenings,
  SectionPayLangs,
  SectionPlaces,
  SectionPricing,
  SectionPublication,
  SectionRelations,
  SectionSync,
} from './index';
import { TYPE_BLOCKS } from './blocks';

export const MODE_ESSENTIAL = new Set(['01', '02', '03', '04', '05', '13', '14', '21']);

function TypeBlockSection(props: SectionProps) {
  const Block = TYPE_BLOCKS[props.archetype ?? 'HEB'];
  return <Block {...props} />;
}

function deferredSection(num: string, title: string, sub: string): ComponentType<SectionProps> {
  return function DeferredSection({ folded }: SectionProps) {
    return (
      <Fs num={num} title={title} sub={sub} folded={folded} pill={{ tone: 'warn', label: 'Plan 4' }}>
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Section réservée au cutover backend: le module workspace correspondant sera branché dans le Plan 4.
        </p>
      </Fs>
    );
  };
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
  '09': deferredSection('09', 'Tags & étiquettes', 'Module tags différé'),
  '10': SectionAccessibility,
  '11': deferredSection('11', 'Démarche durable', 'Module sustainability différé'),
  '12': SectionPayLangs,
  '13': SectionPricing,
  '14': SectionOpenings,
  '15': SectionRelations,
  '16': SectionPlaces,
  '17': SectionAttachments,
  '18': deferredSection('18', 'Fournisseur / Prestataire', 'Carte fournisseur différée'),
  '19': SectionCrm,
  '20': deferredSection('20', 'Distribution & réseaux sociaux', 'Module distribution différé'),
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
