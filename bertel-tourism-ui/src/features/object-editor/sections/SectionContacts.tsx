import { Trash2 } from 'lucide-react';
import { Fs, SortableList, Input, ReferenceSelect } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
} from '../../../services/object-workspace-parser';
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

  function addWebItem() {
    const first = webKindOptions[0];
    replaceWebItems([
      ...webItems,
      {
        id: `draft-web-${Date.now()}`,
        kindId: first?.id ?? '',
        kindCode: first?.code ?? '',
        kindLabel: first?.label ?? 'Présence web',
        // Domain is re-resolved server-side from the kind code at save; default to social.
        kindDomain: 'social_network',
        value: '',
        isPublic: true,
        position: String(webItems.length),
      },
    ]);
  }

  function removeWebItem(id: string) {
    replaceWebItems(webItems.filter((it) => it.id !== id));
  }

  function reorderWebItems(next: ObjectWorkspaceWebChannelItem[]) {
    replaceWebItems(next.map((it, index) => ({ ...it, position: String(index) })));
  }

  return (
    <Fs num="03" title="Contacts & présence web" sub="Téléphones, e-mail · présence en ligne & réservation" folded={folded} pill={{ tone: 'ok', label: 'OK' }}>
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
        <SortableList
          items={webItems}
          getId={(it) => it.id}
          onReorder={reorderWebItems}
          columns="14px 150px 1fr auto auto"
          renderItem={(it) => {
            const platform = resolveWebPlatform(it.value);
            return (
              <>
                <ReferenceSelect
                  value={it.kindCode}
                  options={webKindOptions}
                  aria-label="Type de réseau ou canal"
                  onChange={(code, opt) =>
                    updateWebItem(it.id, {
                      kindCode: code,
                      kindId: opt?.id ?? it.kindId,
                      kindLabel: opt?.label ?? it.kindLabel,
                    })
                  }
                />
                <Input
                  value={it.value}
                  aria-label="Adresse du réseau ou canal"
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
                  onChange={(v) => updateWebItem(it.id, { value: v })}
                />
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
                <button type="button" className="del" onClick={() => removeWebItem(it.id)} aria-label="Supprimer">
                  <Trash2 size={15} aria-hidden />
                </button>
              </>
            );
          }}
        />
        <button type="button" className="rep-add" onClick={addWebItem}>
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
    </Fs>
  );
}
