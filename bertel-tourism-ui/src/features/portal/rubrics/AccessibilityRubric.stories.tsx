import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { PortalRubricScreen } from '../PortalRubricScreen';
import { buildPortalRubrics } from '../portal-rubrics';
import { useObjectEditorState } from '../../object-editor/useObjectEditorState';
import { fullModulesFixture } from '../../object-editor/sections/section-fixture.test-utils';
import '../../../fonts.css';

function ApplicationFonts({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const present = document.documentElement.classList.contains('app-fonts');
    document.documentElement.classList.add('app-fonts');
    return () => { if (!present) document.documentElement.classList.remove('app-fonts'); };
  }, []);
  return children;
}

// Local React fixtures only: no account, SQL, Storage or network write.
function AccessibilityPreview({ labelled = false, readOnly = false }: { labelled?: boolean; readOnly?: boolean }) {
  const modules = useMemo(() => {
    const value = fullModulesFixture();
    value.generalInfo.name = 'Hébergement de démonstration';
    value.characteristics.amenityGroups = [{
      familyCode: 'accessibility', familyLabel: 'Accessibilité',
      options: [
        { id: 'parking', code: 'acc_pmr_parking', label: 'Place de parking réservée', disabilityTypes: ['motor'] },
        { id: 'guide', code: 'acc_guide_dog_welcome', label: 'Chien guide accueilli', disabilityTypes: ['motor', 'visual'] },
        { id: 'bed', code: 'acc_adapted_bed_height', label: 'Lit à hauteur adaptée', disabilityTypes: ['motor'] },
        { id: 'shower', code: 'acc_shower_seat', label: 'Siège de douche', disabilityTypes: ['motor'] },
        { id: 'loop', code: 'acc_hearing_loop', label: 'Boucle magnétique disponible', disabilityTypes: ['hearing'] },
        { id: 'quiet', code: 'acc_quiet_space', label: 'Espace calme disponible', disabilityTypes: ['cognitive'] },
      ],
    }];
    value.characteristics.selectedAmenityCodes = ['wifi', 'acc_guide_dog_welcome'];
    value.distinctions.accessibilityLabels = labelled
      ? [{ schemeCode: 'LBL_TOURISME_HANDICAP', status: 'granted', validUntil: '2099-12-31' }] as typeof value.distinctions.accessibilityLabels : [];
    return value;
  }, [labelled]);
  const editor = useObjectEditorState('SYNTHETIC-ACCESSIBILITY', modules);
  const formCache = useMemo(() => new Map<string, unknown>(), []);
  const rubric = buildPortalRubrics({
    archetype: 'HEB', draft: editor.draft, dirty: editor.dirtySections,
    masked: [], floor: [], pendingModules: new Set(), rejectedModules: new Set(),
  }).find(entry => entry.id === 'accessibility')!;
  const shownRubric = readOnly ? { ...rubric, state: 'unavailable' as const, readOnlyReason: 'Cette rubrique est en lecture seule.' } : rubric;
  return <ApplicationFonts>
    <div className="portal-shell">
    <main className="portal-shell__main">
      <div className="portal-panel">
        <PortalRubricScreen rubric={shownRubric} archetype="HEB" editor={editor} sentLines={[]} sentAt={null}
          approved={false} hubHref="#" formCache={formCache} onBack={() => undefined} onDirtyChange={() => undefined} />
      </div>
    </main>
    </div>
  </ApplicationFonts>;
}

const meta = {
  title: 'Portail/Accessibilité approuvée',
  component: AccessibilityPreview,
  parameters: { layout: 'fullscreen' },
  args: { labelled: false, readOnly: false },
} satisfies Meta<typeof AccessibilityPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Approved: Story = {};
export const Labelled: Story = { args: { labelled: true } };
export const ReadOnly: Story = { args: { readOnly: true } };
