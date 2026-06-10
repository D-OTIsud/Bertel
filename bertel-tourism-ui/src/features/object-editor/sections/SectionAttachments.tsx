import { useState } from 'react';
import { Chip, ChipSet, Fs, Input, Repeater, Select, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceLegalRecord, ObjectWorkspaceMembershipItem } from '../../../services/object-workspace-parser';
import {
  findEstablishmentSiretFromLegalRecords,
  findRaisonSocialeFromLegalRecords,
} from '../../../services/object-workspace-parser';
import { SiretCard, type SiretCardProps } from '../widgets/SiretCard';
import { ActorPicker } from '../widgets/ActorPicker';

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

  // §48 — org_link authoring (object_org_link via the org_links arm of api.save_object_relations).
  function replaceLinks(organizationLinks: typeof relationships.organizationLinks) {
    editor.replaceModule('relationships', { ...relationships, organizationLinks });
  }

  function updateLink(index: number, patch: Partial<(typeof relationships.organizationLinks)[number]>) {
    replaceLinks(relationships.organizationLinks.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  // One primary per object (uq_object_primary_org) — setting one clears the others.
  function setPrimaryLink(index: number) {
    replaceLinks(relationships.organizationLinks.map((item, i) => ({ ...item, isPrimary: i === index })));
  }

  // §48 Task 7 — actor-role authoring (actor_object_role via the actors arm of api.save_object_relations).
  const [actorPickerOpen, setActorPickerOpen] = useState(false);

  function replaceActors(actors: typeof relationships.actors) {
    editor.replaceModule('relationships', { ...relationships, actors });
  }

  function updateActor(index: number, patch: Partial<(typeof relationships.actors)[number]>) {
    replaceActors(relationships.actors.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  // ≤1 primary per (object, role) (uq_actor_object_role_primary) — setting one clears the SAME role only.
  function setPrimaryActor(index: number) {
    const role = relationships.actors[index]?.roleCode;
    replaceActors(relationships.actors.map((item, i) => (
      item.roleCode === role ? { ...item, isPrimary: i === index } : item
    )));
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

      <div className="chip-group__label">Organisations liées — publisher & partenaires</div>
      {relationships.organizationLinkWriteUnavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {relationships.organizationLinkWriteUnavailableReason}
        </p>
      ) : (
        <>
          {(relationships.orgOptions.length === 0 || relationships.orgRoleOptions.length === 0) && (
            <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>
              Catalogue des organisations ou des rôles indisponible — l&apos;ajout est désactivé.
            </p>
          )}
        <Repeater
          items={relationships.organizationLinks}
          getKey={(item, index) => `${item.id}-${item.roleCode}-${index}`}
          columns="14px 1.6fr 160px 90px 1fr auto"
          addLabel="Rattacher une organisation"
          onAdd={() => {
            const org = relationships.orgOptions[0];
            const role =
              relationships.orgRoleOptions.find((option) => option.code === 'publisher')
              ?? relationships.orgRoleOptions[0];
            if (!org || !role) return;
            replaceLinks([
              ...relationships.organizationLinks,
              {
                id: org.id, source: 'org_link', type: 'ORG', name: org.name, status: '',
                roleId: role.id, roleCode: role.code, roleLabel: role.label,
                isPrimary: relationships.organizationLinks.length === 0, note: '', contacts: [],
              },
            ]);
          }}
          renderRow={(item, index) => (
            <>
              <span className="rep-row__handle" aria-hidden />
              <Select
                value={item.id}
                options={[
                  ...(relationships.orgOptions.some((option) => option.id === item.id)
                    ? []
                    : [{ v: item.id, l: item.name }]), // §48: preserved link outside the ORG catalog — keep it identifiable
                  ...relationships.orgOptions.map((option) => ({ v: option.id, l: option.name })),
                ]}
                onChange={(orgId) => {
                  const org = relationships.orgOptions.find((option) => option.id === orgId);
                  updateLink(index, { id: orgId, name: org?.name ?? item.name });
                }}
              />
              <Select
                value={item.roleCode}
                options={relationships.orgRoleOptions.map((option) => ({ v: option.code, l: option.label }))}
                onChange={(roleCode) => {
                  const role = relationships.orgRoleOptions.find((option) => option.code === roleCode);
                  updateLink(index, { roleCode, roleId: role?.id ?? '', roleLabel: role?.label ?? roleCode });
                }}
              />
              <button
                type="button"
                className="pill-mini"
                aria-pressed={item.isPrimary}
                aria-label={item.isPrimary ? 'Organisation principale' : 'Définir comme organisation principale'}
                title={item.isPrimary ? 'Organisation principale' : 'Définir comme principale'}
                onClick={() => setPrimaryLink(index)}
              >
                {item.isPrimary ? 'Principale' : '—'}
              </button>
              <Input value={item.note} placeholder="Note" onChange={(note) => updateLink(index, { note })} />
              <button
                type="button"
                className="del"
                onClick={() => replaceLinks(relationships.organizationLinks.filter((_, i) => i !== index))}
              >
                Supprimer
              </button>
            </>
          )}
        />
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Acteurs liés — opérateurs & encadrants</div>
      {relationships.actorWriteUnavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {relationships.actorWriteUnavailableReason}
        </p>
      ) : (
        <>
          {relationships.actorRoleOptions.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>
              Catalogue des rôles acteur indisponible — l&apos;ajout est désactivé.
            </p>
          )}
          <Repeater
            items={relationships.actors}
            getKey={(item, index) => `${item.id}-${item.roleCode}-${index}`}
            columns="14px 1.4fr 150px 110px 90px 1fr auto"
            addLabel="Lier un acteur…"
            onAdd={() => {
              if (relationships.actorRoleOptions.length === 0) return; // catalog unavailable — adding is disabled
              setActorPickerOpen(true);
            }}
            renderRow={(item, index) => (
              <>
                <span className="rep-row__handle" aria-hidden />
                <Input value={item.displayName} readOnly onChange={() => undefined} />
                <Select
                  value={item.roleCode}
                  options={[
                    ...(relationships.actorRoleOptions.some((option) => option.code === item.roleCode)
                      ? []
                      : [{ v: item.roleCode, l: item.roleLabel || item.roleCode }]), // §48: preserved role outside the catalog — keep it identifiable
                    ...relationships.actorRoleOptions.map((option) => ({ v: option.code, l: option.label })),
                  ]}
                  onChange={(roleCode) => {
                    const role = relationships.actorRoleOptions.find((option) => option.code === roleCode);
                    updateActor(index, { roleCode, roleId: role?.id ?? '', roleLabel: role?.label ?? roleCode });
                  }}
                />
                <Select
                  value={item.visibility || 'public'}
                  options={[{ v: 'public', l: 'Public' }, { v: 'private', l: 'Interne' }, { v: 'partners', l: 'Partenaires' }]}
                  onChange={(visibility) => updateActor(index, { visibility })}
                />
                <button
                  type="button"
                  className="pill-mini"
                  aria-pressed={item.isPrimary}
                  aria-label={item.isPrimary ? 'Acteur principal pour ce rôle' : 'Définir comme acteur principal pour ce rôle'}
                  title={item.isPrimary ? 'Acteur principal pour ce rôle' : 'Définir comme principal'}
                  onClick={() => setPrimaryActor(index)}
                >
                  {item.isPrimary ? 'Principal' : '—'}
                </button>
                <Input value={item.note} placeholder="Note" onChange={(note) => updateActor(index, { note })} />
                <button
                  type="button"
                  className="del"
                  aria-label={`Supprimer l'acteur ${item.displayName}`}
                  onClick={() => replaceActors(relationships.actors.filter((_, i) => i !== index))}
                >
                  Supprimer
                </button>
              </>
            )}
          />
          {actorPickerOpen && (
            <ActorPicker
              onPick={(actor) => {
                const role =
                  relationships.actorRoleOptions.find((option) => option.code === 'operator')
                  ?? relationships.actorRoleOptions[0];
                if (!role) return; // catalog unavailable — never fabricate a role row
                replaceActors([
                  ...relationships.actors,
                  {
                    id: actor.id, displayName: actor.displayName, firstName: actor.firstName, lastName: actor.lastName,
                    gender: '', roleId: role.id, roleCode: role.code, roleLabel: role.label,
                    visibility: 'public',
                    // ≤1 primary per (object, role): primary only when this role has none yet.
                    isPrimary: !relationships.actors.some((a) => a.roleCode === role.code && a.isPrimary),
                    validFrom: '', validTo: '', note: '', contacts: [],
                  },
                ]);
                setActorPickerOpen(false);
              }}
            />
          )}
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Campagnes disponibles</div>
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
