import type { ComponentType } from 'react';
import type { ArchetypeCode } from '../../archetypes';
import type { SectionProps } from '../section-types';
import { BlockASC } from './BlockASC';
import { BlockFMA } from './BlockFMA';
import { BlockHEB } from './BlockHEB';
import { BlockITI } from './BlockITI';
import { BlockRES } from './BlockRES';
import { BlockSRV } from './BlockSRV';
import { BlockVIS } from './BlockVIS';

export const TYPE_BLOCKS: Record<ArchetypeCode, ComponentType<SectionProps>> = {
  HEB: BlockHEB,
  RES: BlockRES,
  ASC: BlockASC,
  ITI: BlockITI,
  VIS: BlockVIS,
  SRV: BlockSRV,
  FMA: BlockFMA,
};

export { BlockASC, BlockFMA, BlockHEB, BlockITI, BlockRES, BlockSRV, BlockVIS };
