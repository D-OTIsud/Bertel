import { Fs, Repeater, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';

/** Section 04 — contact channels (design: edit-primitives repeater rows). */
export function SectionContacts({ editor, folded }: SectionProps) {
  const contacts = editor.draft.contacts;

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
    <Fs num="04" title="Contacts" sub="Téléphones, e-mail, web, dirigeants" folded={folded} pill={{ tone: 'ok', label: 'OK' }}>
      <Repeater
        items={contacts.objectItems}
        getKey={(it) => it.id}
        columns="14px 120px 1fr auto auto"
        addLabel="Ajouter un canal de contact"
        onAdd={addItem}
        renderRow={(it) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Select
              value={it.kindCode}
              options={contacts.kindOptions.map((o) => ({ v: o.code, l: o.label }))}
              onChange={(code) => {
                const opt = contacts.kindOptions.find((o) => o.code === code);
                updateItem(it.id, {
                  kindCode: code,
                  kindId: opt?.id ?? it.kindId,
                  kindLabel: opt?.label ?? it.kindLabel,
                });
              }}
            />
            <Input value={it.value} onChange={(v) => updateItem(it.id, { value: v })} mono={it.kindCode.includes('phone')} />
            <span className="pill-mini">{it.isPublic ? 'Public' : 'Interne'}</span>
            <button type="button" className="del" onClick={() => removeItem(it.id)} aria-label="Supprimer">
              ×
            </button>
          </>
        )}
      />
    </Fs>
  );
}
