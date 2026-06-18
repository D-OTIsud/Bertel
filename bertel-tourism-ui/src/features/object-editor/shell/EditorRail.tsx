import type { SectionCompletion } from '../editor-completion';
import type { Issue } from '../editor-validation';
import { CompletionRing } from '../widgets/CompletionRing';
import { HistoryRail, type HistoryRailItem } from '../widgets/HistoryRail';
import { IssuesRail } from '../widgets/IssuesRail';
import { PresenceRail } from '../widgets/PresenceRail';
import { StatusChip } from '../widgets/StatusChip';

interface EditorRailProps {
  objectId: string;
  status: string;
  overallCompletion: number;
  publishable: boolean;
  sections: SectionCompletion[];
  issues: Issue[];
  historyItems: HistoryRailItem[];
  onGoToSection: (num: string) => void;
}

export function EditorRail({
  objectId,
  status,
  overallCompletion,
  publishable,
  sections,
  issues,
  historyItems,
  onGoToSection,
}: EditorRailProps) {
  return (
    <aside className="edit-side">
      <StatusChip status={status} />
      <CompletionRing overall={overallCompletion} publishable={publishable} sections={sections.slice(0, 8)} />
      <IssuesRail items={issues} onGoToSection={onGoToSection} />
      <PresenceRail objectId={objectId} />
      <HistoryRail items={historyItems} />
    </aside>
  );
}
