import type { SectionCompletion } from '../editor-completion';
import type { Issue } from '../editor-validation';
import { CompletionRing } from '../widgets/CompletionRing';
import { HistoryRail, type HistoryRailItem } from '../widgets/HistoryRail';
import { IssuesRail } from '../widgets/IssuesRail';
import { PresenceRail } from '../widgets/PresenceRail';

interface EditorRailProps {
  objectId: string;
  overallCompletion: number;
  sections: SectionCompletion[];
  issues: Issue[];
  historyItems: HistoryRailItem[];
  onGoToSection: (num: string) => void;
}

export function EditorRail({
  objectId,
  overallCompletion,
  sections,
  issues,
  historyItems,
  onGoToSection,
}: EditorRailProps) {
  return (
    <aside className="edit-side">
      <CompletionRing overall={overallCompletion} sections={sections.slice(0, 8)} />
      <IssuesRail items={issues} onGoToSection={onGoToSection} />
      <PresenceRail objectId={objectId} />
      <HistoryRail items={historyItems} />
    </aside>
  );
}
