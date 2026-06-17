import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Fs, SortableList } from '../primitives';
import { ContactChannelEditModal } from '../widgets/ContactChannelEditModal';
import { WebChannelEditModal } from '../widgets/WebChannelEditModal';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
} from '../../../services/object-workspace-parser';
import { resolveWebPlatform } from '../../../lib/web-platform';
import { reindexContactPositions } from './contacts-reorder';
import { createContactDraft, createWebChannelDraft, reconcileContactPrimary } from './contacts-edit';

// Display-row column templates (the leading 14px is the SortableList drag handle).
const CONTACT_COLS = '14px 132px minmax(0, 1fr) 116px auto auto auto auto';
const WEB_COLS = '14px 150px minmax(0, 1fr) auto auto auto';

/** Read-only value cell: the platform favicon (URL-valued channels) + the value text.
 *  onError hides the icon if the favicon fails to load. Value-driven — see lib/web-platform. */
function ChannelValue({ value }: { value: string }) {
  const platform = resolveWebPlatform(value);
  return (
    <span className="contact-cell contact-cell--value">
      {platform && (
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
      )}
      <span className="contact-cell__text">{value || '—'}</span>
    </span>
  );
}

/** Section 03 — contact channels + §90 web presence. Rows are compact read-only
 *  displays; add/edit happens in a focused modal (mirrors §08 and the rest of the
 *  editor). The inline Public / ★ pills stay as one-click shortcuts. */
export function SectionContacts({ editor, folded }: SectionProps) {
  const contacts = editor.draft.contacts;
  const kindOptionsAvailable = contacts.kindOptions.length > 0;
  const linkedContactsCount =
    (contacts.relatedActorContactsCount ?? 0) + (contacts.relatedOrganizationContactsCount ?? 0);

  // null = closed; 'add' = add modal; number = editing that row index.
  const [contactModal, setContactModal] = useState<'add' | number | null>(null);
  const [webModal, setWebModal] = useState<'add' | number | null>(null);

  function updateItem(id: string, patch: Partial<ObjectWorkspaceContactItem>) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }

  /** Insert (index === null) or replace one contact row, then re-enforce one
   *  is_primary per kind (mirrors the saver's per-kind dedupe). */
  function commitContact(item: ObjectWorkspaceContactItem, index: number | null) {
    const next =
      index === null
        ? [...contacts.objectItems, { ...item, position: String(contacts.objectItems.length) }]
        : contacts.objectItems.map((it, i) => (i === index ? item : it));
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: reconcileContactPrimary(next, item.id),
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
   * Mark one row as the primary channel for its kind (inline ★ shortcut). Mirrors the
   * saver's per-kind dedupe: setting a row primary clears the flag on every other row
   * of the same kind. Kind comparison is lowercased to match the saver normalisation.
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

  // §90 — web channels group (réseaux sociaux + distribution OTA), backed by object_web_channel.
  const webItems = contacts.webItems ?? [];
  const webKindOptions = contacts.webKindOptions ?? [];
  const webKindAvailable = webKindOptions.length > 0;

  function replaceWebItems(next: ObjectWorkspaceWebChannelItem[]) {
    editor.replaceModule('contacts', { ...contacts, webItems: next });
  }

  function updateWebItem(id: string, patch: Partial<ObjectWorkspaceWebChannelItem>) {
    replaceWebItems(webItems.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function commitWeb(item: ObjectWorkspaceWebChannelItem, index: number | null) {
    replaceWebItems(
      index === null
        ? [...webItems, { ...item, position: String(webItems.length) }]
        : webItems.map((it, i) => (i === index ? item : it)),
    );
  }

  function removeWebItem(id: string) {
    replaceWebItems(webItems.filter((it) => it.id !== id));
  }

  function reorderWebItems(next: ObjectWorkspaceWebChannelItem[]) {
    replaceWebItems(next.map((it, index) => ({ ...it, position: String(index) })));
  }

  return (
    <Fs
      num="03"
      title="Contacts & présence web"
      sub="Téléphones, e-mail · présence en ligne & réservation"
      folded={folded}
      pill={{ tone: 'ok', label: 'OK' }}
    >
      <div className="contacts-layout">
        {!kindOptionsAvailable && (
          <p className="contacts-notice" role="status">
            Les types de contact ne sont pas disponibles : le référentiel des types de contact n'a pas
            pu être chargé. Les canaux existants restent modifiables ; rechargez la page pour réessayer.
          </p>
        )}

        <div className="contacts-group">
          <h4 className="contacts-group__title">Coordonnées</h4>
          {contacts.objectItems.length === 0 ? (
            <p className="muted contacts-empty">Aucun canal de contact pour l'instant.</p>
          ) : (
            <SortableList
              items={contacts.objectItems}
              getId={(it) => it.id}
              onReorder={reorderItems}
              columns={CONTACT_COLS}
              renderItem={(it, index) => (
                <>
                  <span className="contact-cell contact-cell--type">{it.kindLabel}</span>
                  <ChannelValue value={it.value} />
                  <span className="contact-cell contact-cell--role">{it.roleLabel || '—'}</span>
                  {/* Inline Public / ★ shortcuts — fixed aria-labels, state in the visible text + title. */}
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
                  <button
                    type="button"
                    className="pill-mini"
                    aria-label={it.isPrimary ? 'Canal principal pour ce type' : 'Définir comme canal principal'}
                    title={it.isPrimary ? 'Canal principal pour ce type' : 'Définir comme canal principal'}
                    onClick={() => setPrimary(it.id)}
                  >
                    <span aria-hidden>{it.isPrimary ? '★' : '☆'}</span>
                  </button>
                  <button
                    type="button"
                    className="rep-edit"
                    aria-label={`Modifier ${it.kindLabel}`}
                    onClick={() => setContactModal(index)}
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button type="button" className="del" onClick={() => removeItem(it.id)} aria-label={`Supprimer ${it.kindLabel}`}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </>
              )}
            />
          )}
          <button type="button" className="rep-add" onClick={() => setContactModal('add')}>
            + Ajouter un canal de contact
          </button>
        </div>

        {/* §90 — réseaux sociaux + distribution (object_web_channel). Object-scoped public web
            identity (facebook/instagram/tripadvisor… + booking/airbnb/abritel…), surfaced on the
            public card. Replaces the retired §20, which projected the operator's (always-empty) channels. */}
        <div className="contacts-group contacts-group--web">
          <h4 className="contacts-group__title">Réseaux sociaux &amp; distribution</h4>
          {!webKindAvailable && (
            <p className="contacts-notice" role="status">
              Les réseaux et canaux de distribution ne sont pas disponibles : le référentiel n'a pas pu
              être chargé. Les entrées existantes restent modifiables ; rechargez la page pour réessayer.
            </p>
          )}
          {webItems.length === 0 ? (
            <p className="muted contacts-empty">Aucun réseau social ou canal de distribution pour l'instant.</p>
          ) : (
            <SortableList
              items={webItems}
              getId={(it) => it.id}
              onReorder={reorderWebItems}
              columns={WEB_COLS}
              renderItem={(it, index) => (
                <>
                  <span className="contact-cell contact-cell--type">{it.kindLabel}</span>
                  <ChannelValue value={it.value} />
                  <button
                    type="button"
                    className="pill-mini"
                    aria-label="Visibilité publique"
                    aria-pressed={it.isPublic}
                    title={it.isPublic ? 'Visible publiquement — cliquer pour passer en interne' : 'Interne — cliquer pour rendre public'}
                    onClick={() => updateWebItem(it.id, { isPublic: !it.isPublic })}
                  >
                    {it.isPublic ? 'Public' : 'Interne'}
                  </button>
                  <button
                    type="button"
                    className="rep-edit"
                    aria-label={`Modifier ${it.kindLabel}`}
                    onClick={() => setWebModal(index)}
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button type="button" className="del" onClick={() => removeWebItem(it.id)} aria-label={`Supprimer ${it.kindLabel}`}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </>
              )}
            />
          )}
          <button type="button" className="rep-add" onClick={() => setWebModal('add')}>
            + Ajouter un réseau ou canal
          </button>
        </div>

        {linkedContactsCount > 0 && (
          <p className="contacts-notice contacts-notice--linked">
            {contacts.relatedActorContactsCount ?? 0} contact(s) d’acteurs et{' '}
            {contacts.relatedOrganizationContactsCount ?? 0} contact(s) d’organisations liés sont
            aussi publiés sur la fiche — gérés via les sections 17 (Rattachements) et 18 (Fournisseur).
          </p>
        )}
      </div>

      {contactModal !== null && (contactModal === 'add' || contacts.objectItems[contactModal]) && (
        <ContactChannelEditModal
          open
          mode={contactModal === 'add' ? 'add' : 'edit'}
          contact={
            contactModal === 'add'
              ? createContactDraft(contacts.kindOptions, contacts.objectItems.length === 0)
              : contacts.objectItems[contactModal]
          }
          kindOptions={contacts.kindOptions}
          roleOptions={contacts.roleOptions}
          onClose={() => setContactModal(null)}
          onSave={(item) => {
            commitContact(item, contactModal === 'add' ? null : contactModal);
            setContactModal(null);
          }}
        />
      )}

      {webModal !== null && (webModal === 'add' || webItems[webModal]) && (
        <WebChannelEditModal
          open
          mode={webModal === 'add' ? 'add' : 'edit'}
          channel={webModal === 'add' ? createWebChannelDraft(webKindOptions) : webItems[webModal]}
          kindOptions={webKindOptions}
          onClose={() => setWebModal(null)}
          onSave={(item) => {
            commitWeb(item, webModal === 'add' ? null : webModal);
            setWebModal(null);
          }}
        />
      )}
    </Fs>
  );
}
