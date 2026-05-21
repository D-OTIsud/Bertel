import { Chip, ChipSet, Fs, Input, Repeater, Select, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLegalRecord, ObjectWorkspaceMembershipItem } from '../../../services/object-workspace-parser';
import {
  findEstablishmentSiretFromLegalRecords,
  findRaisonSocialeFromLegalRecords,
} from '../../../services/object-workspace-parser';
import { SiretCard, type SiretCardProps } from '../widgets/SiretCard';

const STATUSES = ['prospect', 'invoiced', 'paid', 'canceled', 'lapsed'];

function readRecordValue(record: ObjectWorkspaceLegalRecord): string {
  const raw = record.valueJson.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string' || typeof parsed === 'number') {
      return String(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const map = parsed as Record<string, unknown>;
      return String(map.value ?? map.label ?? map.name ?? '').trim();
    }
  } catch {
    return raw;
  }

  return raw;
}

function findLegalValue(records: ObjectWorkspaceLegalRecord[], patterns: string[]): string {
  const record = records.find((item) => {
    const haystack = `${item.typeCode} ${item.typeLabel}`.toLowerCase();
    return patterns.some((pattern) => haystack.includes(pattern));
  });
  return record ? readRecordValue(record) : '';
}

function buildSiretCard(records: ObjectWorkspaceLegalRecord[], fallbackCompany: string): SiretCardProps | null {
  const siret = findEstablishmentSiretFromLegalRecords(records);
  if (!siret) {
    return null;
  }

  return {
    siret,
    company: findRaisonSocialeFromLegalRecords(records) || fallbackCompany,
    naf: findLegalValue(records, ['naf', 'ape']),
    legalForm: findLegalValue(records, ['forme', 'juridique', 'legal form']),
    capital: findLegalValue(records, ['capital']),
    workforce: findLegalValue(records, ['effectif']),
    registeredAt: findLegalValue(records, ['inscription', 'creation', 'création']),
  };
}

function createMembership(value: SectionProps['editor']['draft']['memberships']): ObjectWorkspaceMembershipItem | null {
  const scope = value.scopeOptions[0];
  const campaign = value.campaignOptions[0];
  const tier = value.tierOptions[0];
  if (!scope || !campaign || !tier) {
    return null;
  }
  return {
    recordId: null,
    scope: 'object',
    orgObjectId: scope.orgObjectId,
    orgLabel: scope.label,
    campaignId: campaign.id,
    campaignCode: campaign.code,
    campaignLabel: campaign.label,
    tierId: tier.id,
    tierCode: tier.code,
    tierLabel: tier.label,
    status: 'prospect',
    startsAt: '',
    endsAt: '',
    paymentDate: '',
    metadataJson: '',
    visibilityImpact: 'Suivi commercial interne',
  };
}

export function SectionAttachments({ editor, folded }: SectionProps) {
  const relationships = editor.draft.relationships;
  const memberships = editor.draft.memberships;
  const publisher = relationships.organizationLinks.find((item) => item.roleCode === 'publisher') ?? relationships.organizationLinks[0];
  const siretCard = buildSiretCard(editor.draft.legal.records, publisher?.name ?? editor.draft.generalInfo.name);
  const paidCount = memberships.items.filter((item) => item.status === 'paid').length;

  function replace(items: ObjectWorkspaceMembershipItem[]) {
    editor.replaceModule('memberships', { ...memberships, items });
  }

  function update(index: number, patch: Partial<ObjectWorkspaceMembershipItem>) {
    replace(
      memberships.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const campaign = patch.campaignCode ? memberships.campaignOptions.find((option) => option.code === patch.campaignCode) : null;
        const tier = patch.tierCode ? memberships.tierOptions.find((option) => option.code === patch.tierCode) : null;
        return {
          ...item,
          ...patch,
          campaignId: campaign?.id ?? item.campaignId,
          campaignLabel: campaign?.label ?? item.campaignLabel,
          tierId: tier?.id ?? item.tierId,
          tierLabel: tier?.label ?? item.tierLabel,
        };
      }),
    );
  }

  return (
    <Fs
      num="17"
      title="Rattachements organisationnels"
      sub="Publisher, partenaires, acteurs et adhésions OTI"
      folded={folded}
      pill={{ tone: publisher ? 'ok' : 'warn', label: publisher ? 'Publisher OK' : 'À vérifier' }}
    >
      {siretCard && <SiretCard {...siretCard} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="Adhésions actives" value={String(paidCount)} suffix={`/ ${memberships.items.length}`} />
        <StatCard label="Organisation éditrice" value={publisher ? '1' : '0'} suffix="publisher" />
        <StatCard label="Acteurs liés" value={String(relationships.actors.length)} suffix="rôles" />
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="kv">
          <span className="k">Organisation éditrice</span>
          <span className="v">{publisher?.name ?? 'Non renseignée'}</span>
        </div>
        <div className="kv">
          <span className="k">Acteurs liés</span>
          <span className="v">{relationships.actors.map((actor) => actor.displayName).join(', ') || 'Aucun'}</span>
        </div>
      </div>

      <div className="chip-group__label">Campagnes disponibles</div>
      <ChipSet>
        {memberships.campaignOptions.map((campaign) => (
          <Chip key={campaign.code} label={campaign.label} on={memberships.items.some((item) => item.campaignCode === campaign.code)} />
        ))}
      </ChipSet>

      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Adhésions & campagnes
      </div>
      <Repeater
        items={memberships.items}
        getKey={(item, index) => `${item.recordId ?? 'membership'}-${index}`}
        columns="14px 1fr 120px 120px 120px 120px auto"
        addLabel="Ajouter une adhésion"
        onAdd={() => {
          const next = createMembership(memberships);
          if (next) replace([...memberships.items, next]);
        }}
        renderRow={(item, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Input value={item.orgLabel} readOnly onChange={() => undefined} />
            <Select
              value={item.campaignCode}
              options={memberships.campaignOptions.map((option) => ({ v: option.code, l: option.label }))}
              onChange={(campaignCode) => update(index, { campaignCode })}
            />
            <Select
              value={item.tierCode}
              options={memberships.tierOptions.map((option) => ({ v: option.code, l: option.label }))}
              onChange={(tierCode) => update(index, { tierCode })}
            />
            <Select value={item.status} options={STATUSES} onChange={(status) => update(index, { status })} />
            <Input type="date" value={item.startsAt} onChange={(startsAt) => update(index, { startsAt })} />
            <button type="button" className="del" onClick={() => replace(memberships.items.filter((_, itemIndex) => itemIndex !== index))}>
              Supprimer
            </button>
          </>
        )}
      />
    </Fs>
  );
}
