import { useState } from 'react';
import { Fs, Input, Repeater, Select, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceMembershipItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { OrgPicker } from '../widgets/OrgPicker';
import { MembershipEditModal } from '../widgets/MembershipEditModal';
import { addOrgLink, removeOrgLink, setOrgRole, setPrimaryOrgLink, updateOrgLink } from './org-links';
import { appendCreatedOption } from './membership-edit';

/**
 * Section 17 — "Rattachements organisationnels".
 *
 * Périmètre ORGANISATIONNEL uniquement : organisations liées (publisher & partenaires, object_org_link)
 * + adhésions OTI. Les PRESTATAIRES (acteurs, actor_object_role) ont été DÉPLACÉS en §19 « Suivi
 * prestataire » (source unique d'authoring acteur) ; l'identité juridique / SIRET vit en §18 « Juridique ».
 */
export function SectionAttachments({ editor, folded, objectId = '' }: SectionProps) {
  const relationships = editor.draft.relationships;
  const memberships = editor.draft.memberships;
  const publisher = relationships.organizationLinks.find((item) => item.roleCode === 'publisher') ?? relationships.organizationLinks[0];
  const paidCount = memberships.items.filter((item) => item.status === 'paid').length;
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });

  function saveMembership(item: ObjectWorkspaceMembershipItem) {
    const next = memberDialog.index === null
      ? [...memberships.items, item]
      : memberships.items.map((existing, i) => (i === memberDialog.index ? item : existing));
    editor.replaceModule('memberships', { ...memberships, items: next });
    setMemberDialog({ open: false, index: null });
  }

  function appendMembershipOption(dim: 'campaign' | 'tier', option: WorkspaceReferenceOption) {
    editor.replaceModule('memberships', dim === 'campaign'
      ? { ...memberships, campaignOptions: appendCreatedOption(memberships.campaignOptions, option) }
      : { ...memberships, tierOptions: appendCreatedOption(memberships.tierOptions, option) });
  }

  // §48 — org_link authoring (object_org_link via the org_links arm of api.save_object_relations).
  function replaceLinks(organizationLinks: typeof relationships.organizationLinks) {
    editor.replaceModule('relationships', { ...relationships, organizationLinks });
  }

  function updateLink(index: number, patch: Partial<(typeof relationships.organizationLinks)[number]>) {
    replaceLinks(updateOrgLink(relationships.organizationLinks, index, patch));
  }

  // One primary per object (uq_object_primary_org) — setting one clears the others.
  function setPrimaryLink(index: number) {
    replaceLinks(setPrimaryOrgLink(relationships.organizationLinks, index));
  }

  return (
    <Fs
      num="17"
      title="Rattachements organisationnels"
      sub="Publisher, partenaires et adhésions OTI"
      folded={folded}
      pill={{ tone: publisher ? 'ok' : 'warn', label: publisher ? 'Publisher OK' : 'À vérifier' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="Adhésions actives" value={String(paidCount)} suffix={`/ ${memberships.items.length}`} />
        <StatCard label="Organisation éditrice" value={publisher ? '1' : '0'} suffix="publisher" />
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
            if (relationships.orgOptions.length === 0 || relationships.orgRoleOptions.length === 0) return;
            setOrgPickerOpen(true);
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
                onChange={(roleCode) => replaceLinks(setOrgRole(relationships.organizationLinks, index, roleCode, relationships.orgRoleOptions))}
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
                onClick={() => replaceLinks(removeOrgLink(relationships.organizationLinks, index))}
              >
                Supprimer
              </button>
            </>
          )}
        />
          {orgPickerOpen && (
            <OrgPicker
              open={orgPickerOpen}
              options={relationships.orgOptions}
              excludeIds={relationships.organizationLinks.map((link) => link.id)}
              onPick={(org) => {
                replaceLinks(addOrgLink(relationships.organizationLinks, org, relationships.orgRoleOptions));
                setOrgPickerOpen(false);
              }}
              onClose={() => setOrgPickerOpen(false)}
            />
          )}
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Adhésions OTI</div>
      {memberships.unavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>{memberships.unavailableReason}</p>
      ) : memberships.items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 10px' }}>
          Aucune adhésion — cet objet n’est rattaché à aucune campagne ni charte.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {memberships.items.map((item, index) => (
            <button
              key={`${item.recordId ?? 'membership'}-${index}`}
              type="button"
              className="rep-row"
              style={{ gridTemplateColumns: '1fr auto', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setMemberDialog({ open: true, index })}
            >
              <span style={{ fontSize: 12 }}>
                <strong>{item.orgLabel}</strong> · {item.campaignLabel || item.campaignCode} · {item.tierLabel || item.tierCode}
              </span>
              <span className="pill-mini">{item.status}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="rep-add"
        disabled={memberships.scopeOptions.length === 0}
        title={memberships.scopeOptions.length === 0 ? 'Rattachez d’abord une organisation.' : undefined}
        onClick={() => setMemberDialog({ open: true, index: null })}
      >
        Ajouter une adhésion
      </button>
      {memberDialog.open && (
        <MembershipEditModal
          open={memberDialog.open}
          mode={memberDialog.index === null ? 'add' : 'edit'}
          objectId={objectId}
          module={memberships}
          item={memberDialog.index === null ? null : memberships.items[memberDialog.index]}
          onSave={saveMembership}
          onClose={() => setMemberDialog({ open: false, index: null })}
          onCreateOption={appendMembershipOption}
        />
      )}
    </Fs>
  );
}
