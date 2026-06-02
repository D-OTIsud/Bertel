import { Trash2 } from 'lucide-react';
import { Fs, Repeater, Input, ReferenceSelect } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';
import { resolveWebPlatform } from '../../../lib/web-platform';

/** Section 03 — contact channels (design: edit-primitives repeater rows). */
export function SectionContacts({ editor, folded }: SectionProps) {
  const contacts = editor.draft.contacts;
  const kindOptionsAvailable = contacts.kindOptions.length > 0;

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

  return (
    <Fs num="03" title="Contacts" sub="Téléphones, e-mail, web, dirigeants" folded={folded} pill={{ tone: 'ok', label: 'OK' }}>
      {!kindOptionsAvailable && (
        <p className="contacts-notice" role="status">
          Les types de contact ne sont pas disponibles : le référentiel des types de contact n'a pas
          pu être chargé. Les canaux existants restent modifiables ; rechargez la page pour réessayer.
        </p>
      )}
      <Repeater
        items={contacts.objectItems}
        getKey={(it) => it.id}
        columns="14px 130px 150px 1fr auto auto"
        addLabel="Ajouter un canal de contact"
        onAdd={addItem}
        renderRow={(it) => {
          // URL-valued contacts (booking platform, website, social…) get the platform
          // favicon as a prefix; the URL stays fully visible and editable. Value-driven —
          // see lib/web-platform. onError hides the icon if the favicon fails to load.
          const platform = resolveWebPlatform(it.value);
          return (
            <>
              <span className="rep-row__handle" aria-hidden />
              <ReferenceSelect
                value={it.kindCode}
                options={contacts.kindOptions}
                aria-label="Type de contact"
                onChange={(code, opt) =>
                  updateItem(it.id, {
                    kindCode: code,
                    kindId: opt?.id ?? it.kindId,
                    kindLabel: opt?.label ?? it.kindLabel,
                  })
                }
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
              <span className="pill-mini">{it.isPublic ? 'Public' : 'Interne'}</span>
              <button type="button" className="del" onClick={() => removeItem(it.id)} aria-label="Supprimer">
                <Trash2 size={15} aria-hidden />
              </button>
            </>
          );
        }}
      />
    </Fs>
  );
}
