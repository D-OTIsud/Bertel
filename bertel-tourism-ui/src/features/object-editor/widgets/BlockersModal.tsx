import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import type { Issue } from '../editor-validation';
import { groupIssuesBySection } from '../save-issues';

interface BlockersModalProps {
  open: boolean;
  onClose: () => void;
  /** Drives the title/intro: a blocked publish vs a failed/partial save. */
  context: 'publish' | 'save';
  /** Required-field publication blockers (section = num). */
  requiredBlockers: Issue[];
  /** Save/permission/RPC errors (section = module label). */
  saveErrors: Issue[];
  /** Non-blocking warnings (section = num). */
  warnings: Issue[];
  /** num → human section label. */
  sectionLabels: Record<string, string>;
  onGoToSection: (num: string) => void;
}

/**
 * Explains, on a blocked save/publish attempt, which information in which section
 * blocks and why — grouped by section with a jump action — and lists non-blocking
 * alerts separately. Complements the always-on IssuesRail; does not replace it.
 */
export function BlockersModal({
  open,
  onClose,
  context,
  requiredBlockers,
  saveErrors,
  warnings,
  sectionLabels,
  onGoToSection,
}: BlockersModalProps) {
  const title = context === 'publish' ? 'Publication impossible' : 'Enregistrement incomplet';
  const intro =
    context === 'publish'
      ? 'Corrigez les points suivants avant de publier la fiche.'
      : "Certaines sections n'ont pas pu être enregistrées.";
  const blockerGroups = groupIssuesBySection(requiredBlockers, sectionLabels);
  const warningGroups = groupIssuesBySection(warnings, sectionLabels);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="blockers-modal__body">
          <p className="blockers-modal__intro">{intro}</p>

          {saveErrors.length > 0 && (
            <section className="blockers-group">
              <h4 className="blockers-group__head">Erreurs d'enregistrement</h4>
              {saveErrors.map((issue) => (
                <div key={`${issue.section}-${issue.message}`} className="issue issue--static">
                  <span className="issue__dot req" />
                  <span className="issue__body">
                    <strong>{issue.section}</strong>
                    <small>{issue.message}</small>
                  </span>
                </div>
              ))}
            </section>
          )}

          {blockerGroups.map((group) => (
            <section key={group.num} className="blockers-group">
              <h4 className="blockers-group__head">
                Section {group.num}{group.label ? ` — ${group.label}` : ''}
              </h4>
              {group.issues.map((issue, idx) => (
                <button
                  type="button"
                  key={`${group.num}-${issue.message}-${idx}`}
                  className="issue"
                  onClick={() => onGoToSection(group.num)}
                >
                  <span className="issue__dot req" />
                  <span className="issue__body"><small>{issue.message}</small></span>
                  <span className="issue__go">Aller ›</span>
                </button>
              ))}
            </section>
          ))}

          {warningGroups.length > 0 && (
            <div className="blockers-modal__warn">
              <h4 className="blockers-modal__warn-head">Alertes non bloquantes</h4>
              {warningGroups.map((group) => (
                <section key={group.num} className="blockers-group">
                  <h5 className="blockers-group__head">
                    Section {group.num}{group.label ? ` — ${group.label}` : ''}
                  </h5>
                  {group.issues.map((issue, idx) => (
                    <button
                      type="button"
                      key={`${group.num}-${issue.message}-${idx}`}
                      className="issue"
                      onClick={() => onGoToSection(group.num)}
                    >
                      <span className="issue__dot warn" />
                      <span className="issue__body"><small>{issue.message}</small></span>
                      <span className="issue__go">Aller ›</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <button type="button" className="btn primary" onClick={onClose}>Fermer</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
