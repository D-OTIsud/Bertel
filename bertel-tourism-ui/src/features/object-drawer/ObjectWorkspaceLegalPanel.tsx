import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceLegalComplianceDetail,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceLegalRecord,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceLegalPanelProps {
  value: ObjectWorkspaceLegalModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onAddRecord: () => void;
  onUpdateRecord: (recordId: string, patch: Partial<ObjectWorkspaceLegalRecord>) => void;
  onRemoveRecord: (recordId: string) => void;
  onSave: () => void;
}

function renderComplianceLabel(status: string): string {
  switch (status) {
    case 'compliant':
      return 'Conforme';
    case 'expiring':
      return 'Pieces a renouveler';
    case 'non_compliant':
      return 'Non conforme';
    default:
      return 'Etat inconnu';
  }
}

function renderComplianceDetail(item: ObjectWorkspaceLegalComplianceDetail) {
  return (
    <article key={`${item.typeCode}-${item.status}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.category || 'Juridique'}</span>
          <h3>{item.typeLabel}</h3>
        </div>
        <strong>{item.status}</strong>
      </div>
      <div className="stack-list text-sm text-muted-foreground">
        <span>{item.isRequired ? 'Document requis' : 'Document optionnel'}</span>
        <span>{item.hasRecord ? 'Enregistrement present' : 'Aucun enregistrement'}</span>
        {item.validTo && <span>Valide jusqu au {item.validTo}</span>}
        {item.daysUntilExpiry && <span>{item.daysUntilExpiry} jour(s) restants</span>}
      </div>
    </article>
  );
}

function LegalRecordCard(props: {
  item: ObjectWorkspaceLegalRecord;
  value: ObjectWorkspaceLegalModule;
  disabled: boolean;
  onChange: (patch: Partial<ObjectWorkspaceLegalRecord>) => void;
  onRemove: () => void;
}) {
  const { item, value, disabled, onChange, onRemove } = props;

  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.category || 'Juridique'}</span>
          <h3>{item.typeLabel || 'Document juridique'}</h3>
        </div>
        <div className="stack-list text-right">
          <strong>{item.status || 'active'}</strong>
          <Button type="button" variant="ghost" onClick={onRemove} disabled={disabled}>
            Retirer
          </Button>
        </div>
      </div>

      <div className="drawer-grid">
        <div className="field-block">
          <Label htmlFor={`legal-type-${item.recordId ?? item.typeCode}`}>Type</Label>
          <Select
            id={`legal-type-${item.recordId ?? item.typeCode}`}
            value={item.typeCode}
            disabled={disabled}
            onChange={(event) => onChange({ typeCode: event.target.value })}
          >
            {value.typeOptions.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-status-${item.recordId ?? item.typeCode}`}>Statut</Label>
          <Select
            id={`legal-status-${item.recordId ?? item.typeCode}`}
            value={item.status}
            disabled={disabled}
            onChange={(event) => onChange({ status: event.target.value })}
          >
            <option value="active">active</option>
            <option value="requested">requested</option>
            <option value="expired">expired</option>
            <option value="suspended">suspended</option>
            <option value="revoked">revoked</option>
          </Select>
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-validity-${item.recordId ?? item.typeCode}`}>Mode de validite</Label>
          <Select
            id={`legal-validity-${item.recordId ?? item.typeCode}`}
            value={item.validityMode || 'fixed_end_date'}
            disabled={disabled}
            onChange={(event) => onChange({ validityMode: event.target.value })}
          >
            <option value="fixed_end_date">fixed_end_date</option>
            <option value="forever">forever</option>
            <option value="tacit_renewal">tacit_renewal</option>
          </Select>
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-document-${item.recordId ?? item.typeCode}`}>Document ID</Label>
          <Input
            id={`legal-document-${item.recordId ?? item.typeCode}`}
            value={item.documentId}
            disabled={disabled}
            onChange={(event) => onChange({ documentId: event.target.value })}
          />
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-valid-from-${item.recordId ?? item.typeCode}`}>Valide depuis</Label>
          <Input
            id={`legal-valid-from-${item.recordId ?? item.typeCode}`}
            type="date"
            value={item.validFrom}
            disabled={disabled}
            onChange={(event) => onChange({ validFrom: event.target.value })}
          />
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-valid-to-${item.recordId ?? item.typeCode}`}>Valide jusqu au</Label>
          <Input
            id={`legal-valid-to-${item.recordId ?? item.typeCode}`}
            type="date"
            value={item.validTo}
            disabled={disabled || item.validityMode === 'forever'}
            onChange={(event) => onChange({ validTo: event.target.value })}
          />
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-requested-${item.recordId ?? item.typeCode}`}>Document demande le</Label>
          <Input
            id={`legal-requested-${item.recordId ?? item.typeCode}`}
            type="datetime-local"
            value={item.documentRequestedAt}
            disabled={disabled}
            onChange={(event) => onChange({ documentRequestedAt: event.target.value })}
          />
        </div>

        <div className="field-block">
          <Label htmlFor={`legal-delivered-${item.recordId ?? item.typeCode}`}>Document livre le</Label>
          <Input
            id={`legal-delivered-${item.recordId ?? item.typeCode}`}
            type="datetime-local"
            value={item.documentDeliveredAt}
            disabled={disabled}
            onChange={(event) => onChange({ documentDeliveredAt: event.target.value })}
          />
        </div>

        <article className="panel-card panel-card--nested field-block">
          <span className="facet-title">Portee</span>
          <p>{item.isPublic ? 'Potentiellement public' : 'Interne / organisation parente'}</p>
        </article>

        <article className="panel-card panel-card--nested field-block">
          <span className="facet-title">Alerte</span>
          <p>{item.daysUntilExpiry ? `${item.daysUntilExpiry} jour(s) restants` : 'Pas d echeance calculee'}</p>
        </article>

        <div className="field-block field-block--wide">
          <Label htmlFor={`legal-value-${item.recordId ?? item.typeCode}`}>Valeur</Label>
          <textarea
            id={`legal-value-${item.recordId ?? item.typeCode}`}
            className="min-h-28 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
            value={item.valueJson}
            disabled={disabled}
            onChange={(event) => onChange({ valueJson: event.target.value })}
          />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`legal-note-${item.recordId ?? item.typeCode}`}>Note interne</Label>
          <textarea
            id={`legal-note-${item.recordId ?? item.typeCode}`}
            className="min-h-24 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
            value={item.note}
            disabled={disabled}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </div>
      </div>
    </article>
  );
}

export function ObjectWorkspaceLegalPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onAddRecord,
  onUpdateRecord,
  onRemoveRecord,
  onSave,
}: ObjectWorkspaceLegalPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Documents légaux</h2>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={onAddRecord} disabled={!access.canDirectWrite || saving || value.typeOptions.length === 0}>
                Ajouter un document
              </Button>
              <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
                {saving ? 'Enregistrement...' : saveAction.label}
              </Button>
            </div>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Etat</span>
            <strong>{renderComplianceLabel(value.compliance.complianceStatus)}</strong>
            <p>{value.records.length} document(s) enregistre(s).</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Documents requis</span>
            <strong>{value.compliance.requiredCount}</strong>
            <p>{value.compliance.validCount} valide(s), {value.compliance.missingCount} manquant(s).</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Alertes</span>
            <strong>{value.compliance.expiringCount}</strong>
            <p>Pieces actives arrivant a echeance dans les 30 prochains jours.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Taux</span>
            <strong>{value.compliance.compliancePercentage}%</strong>
          </article>
        </div>
      </article>

      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="facet-title">Resume de conformite</span>
            <h3>Lecture backend</h3>
          </div>
        </div>

        <div className="stack-list">
          {value.compliance.details.length > 0 ? value.compliance.details.map(renderComplianceDetail) : (
            <article className="panel-card panel-card--nested">
              <span className="facet-title">Conformite</span>
              <p>{value.unavailableReason ?? 'Aucun detail de conformite n est actuellement remonte.'}</p>
            </article>
          )}
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.records.length > 0 ? value.records.map((item) => (
          <LegalRecordCard
            key={item.recordId ?? `${item.typeCode}-${item.validFrom}`}
            item={item}
            value={value}
            disabled={!access.canDirectWrite}
            onChange={(patch) => onUpdateRecord(item.recordId ?? `${item.typeCode}-${item.validFrom}`, patch)}
            onRemove={() => onRemoveRecord(item.recordId ?? `${item.typeCode}-${item.validFrom}`)}
          />
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Documents juridiques</span>
            <p>Aucun document juridique n est actuellement expose pour cet objet.</p>
          </article>
        )}
      </section>
    </div>
  );
}
