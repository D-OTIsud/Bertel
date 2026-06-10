import { Trash2 } from 'lucide-react';
import { Fs, SortableList, Input, ReferenceSelect } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';
import { resolveWebPlatform } from '../../../lib/web-platform';
import { reindexContactPositions } from './contacts-reorder';

/** Section 03 — contact channels (design: edit-primitives sortable rows). */
export function SectionContacts({ editor, folded }: SectionProps) {
  const contacts = editor.draft.contacts;
  const kindOptionsAvailable = contacts.kindOptions.length > 0;
  const linkedContactsCount =
    (contacts.relatedActorContactsCount ?? 0) + (contacts.relatedOrganizationContactsCount ?? 0);

  function updateItem(id: string, patch: Partial<ObjectWorkspaceContactItem>) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }

  function addItem() {
    const first = contacts.kindOptions[0];
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: [
        ...contacts.objectItems,
        {
          id: `draft-contact-${Date.now()}`,
          kindId: first?.id ?? '',
          kindCode: first?.code ?? 'phone',
          kindLabel: first?.label ?? 'Téléphone',
          roleId: '',
          roleCode: '',
          roleLabel: '',
          value: '',
          isPublic: true,
          isPrimary: contacts.objectItems.length === 0,
          position: String(contacts.objectItems.length),
        },
      ],
    });
  }

  function removeItem(id: string) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.filter((it) => it.id !== id),
    });
  }

  /** Drag reorder — persist the new order through `position` (drawer sorts on it). */
  function reorderItems(next: ObjectWorkspaceContactItem[]) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: reindexContactPositions(next),
    });
  }

  /**
   * Mark one row as the primary channel for its kind. Mirrors the saver's
   * per-kind dedupe in saveObjectWorkspaceContacts (one is_primary per kind):
   * setting a row primary clears the flag on every other row of the same kind.
   * Kind comparison is lowercased to match the saver's normalisation (Fix 4).
   */
  function setPrimary(id: string) {
    const target = contacts.objectItems.find((item) => item.id === id);
    if (!target) return;
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.map((item) =>
        item.kindCode.toLowerCase() === target.kindCode.toLowerCase()
          ? { ...item, isPrimary: item.id === id }
          : item,
      ),
    });
  }

  return (
    <Fs num="03" title="Contacts" sub="Téléphones, e-mail, web, réseaux sociaux" folded={folded} pill={{ tone: 'ok', label: 'OK' }}>
      {!kindOptionsAvailable && (
        <p className="contacts-notice" role="status">
          Les types de contact ne sont pas disponibles : le référentiel des types de contact n'a pas
          pu être chargé. Les canaux existants restent modifiables ; rechargez la page pour réessayer.
        </p>
      )}
      <SortableList
        items={contacts.objectItems}
        getId={(it) => it.id}
        onReorder={reorderItems}
        columns="14px 130px 150px 1fr auto auto auto"
        renderItem={(it) => {
          // URL-valued contacts (booking platform, website, social…) get the platform
          // favicon as a prefix; the URL stays fully visible and editable. Value-driven —
          // see lib/web-platform. onError hides the icon if the favicon fails to load.
          const platform = resolveWebPlatform(it.value);
          return (
            <>
              <ReferenceSelect
                value={it.kindCode}
                options={contacts.kindOptions}
                aria-label="Type de contact"
                onChange={(code, opt) => {
                  // §48: a primary moving to a kind that already has one would silently demote
                  // at save (per-kind dedupe in saveObjectWorkspaceContacts) — reconcile here instead.
                  const destinationHasPrimary = contacts.objectItems.some(
                    (other) => other.id !== it.id && other.kindCode.toLowerCase() === code.toLowerCase() && other.isPrimary,
                  );
                  updateItem(it.id, {
                    kindCode: code,
                    kindId: opt?.id ?? it.kindId,
                    kindLabel: opt?.label ?? it.kindLabel,
                    ...(destinationHasPrimary ? { isPrimary: false } : {}),
                  });
                }}
              />
              <ReferenceSelect
                value={it.roleCode}
                options={contacts.roleOptions}
                allowEmpty
                emptyLabel="— Aucun rôle —"
                aria-label="Rôle du contact"
                onChange={(code, opt) =>
                  updateItem(it.id, { roleCode: code, roleId: opt?.id ?? '', roleLabel: opt?.label ?? '' })
                }
              />
              <Input
                value={it.value}
                aria-label="Valeur du contact"
                mono={it.kindCode.includes('phone')}
                prefix={
                  platform ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={platform.faviconUrl}
                      alt=""
                      width={16}
                      height={16}
                      className="contact-favicon"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : undefined
                }
                onChange={(v) => updateItem(it.id, { value: v })}
              />
              {/* Fix 2: fixed aria-label so SRs announce a stable name; visible text + title flip with state;
                  aria-pressed tracks the current state so assistive technology reads "pressed/not pressed". */}
              <button
                type="button"
                className="pill-mini"
                aria-label="Visibilité publique"
                aria-pressed={it.isPublic}
                title={it.isPublic ? 'Visible publiquement — cliquer pour passer en interne' : 'Interne — cliquer pour rendre public'}
                onClick={() => updateItem(it.id, { isPublic: !it.isPublic })}
              >
                {it.isPublic ? 'Public' : 'Interne'}
              </button>
              {/* Fix 3: no aria-pressed on the ★ button (it is an action — "set as primary" — not a toggle state);
                  the action label flip + title already convey the state; pressed-state info lives in the label. */}
              <button
                type="button"
                className="pill-mini"
                aria-label={it.isPrimary ? 'Canal principal pour ce type' : 'Définir comme canal principal'}
                title={it.isPrimary ? 'Canal principal pour ce type' : 'Définir comme canal principal'}
                onClick={() => setPrimary(it.id)}
              >
                {it.isPrimary ? '★' : '☆'}
              </button>
              <button type="button" className="del" onClick={() => removeItem(it.id)} aria-label="Supprimer">
                <Trash2 size={15} aria-hidden />
              </button>
            </>
          );
        }}
      />
      <button type="button" className="rep-add" onClick={addItem}>
        + Ajouter un canal de contact
      </button>
      {linkedContactsCount > 0 && (
        <p className="contacts-notice contacts-notice--linked">
          {contacts.relatedActorContactsCount ?? 0} contact(s) d’acteurs et{' '}
          {contacts.relatedOrganizationContactsCount ?? 0} contact(s) d’organisations liés sont
          aussi publiés sur la fiche — gérés via les sections 17 (Rattachements) et 18 (Fournisseur).
        </p>
      )}
    </Fs>
  );
}
