import { useLayoutEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { CrmModal } from '../../features/crm/CrmModal';
import { EditorModal } from '../../features/object-editor/primitives/EditorModal';
import { Field } from '../../features/object-editor/primitives/Field';
import { Input } from '../../features/object-editor/primitives/Input';
import '../../features/object-editor/object-editor.css';
import '../../fonts.css';

function ApplicationFonts({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const alreadySet = document.documentElement.classList.contains('app-fonts');
    document.documentElement.classList.add('app-fonts');
    return () => { if (!alreadySet) document.documentElement.classList.remove('app-fonts'); };
  }, []);
  return children;
}

function ApplicationExample({ drawer = false }: { drawer?: boolean }) {
  const [open, setOpen] = useState(true);
  const [email, setEmail] = useState('camille@example.com');
  return (
    <main style={{ minHeight: '100vh', padding: 24 }}>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Ouvrir l’invitation</button>
      <Modal open={open} title="Inviter des membres" variant={drawer ? 'drawer' : 'modal'} onOpenChange={setOpen}
        footer={<><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Annuler</button><button type="button" className="primary-button" onClick={() => setOpen(false)}>Inviter</button></>}>
        <label className="field-block" htmlFor="preview-email"><span>Adresses e-mail</span>
          <textarea id="preview-email" className="textarea" rows={4} value={email} onChange={(event) => setEmail(event.target.value)} />
          <span className="pref__hint">Une adresse par ligne. Le même rôle est appliqué à toutes.</span>
        </label>
        <label className="field-block" htmlFor="preview-role"><span>Rôle métier</span>
          <select id="preview-role" className="select" defaultValue="editor"><option value="editor">Éditeur</option><option value="admin">Administrateur</option></select>
        </label>
      </Modal>
    </main>
  );
}

function CrmExample({ drawer = false }: { drawer?: boolean }) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('Camille Payet');
  return (
    <main className="crm-app" style={{ minHeight: '100vh', padding: 24 }}>
      <button type="button" className="crm-btn primary" onClick={() => setOpen(true)}>Ouvrir le prestataire</button>
      {open && <CrmModal title="Modifier le prestataire" variant={drawer ? 'drawer' : 'modal'} onClose={() => setOpen(false)}
        footer={<><button type="button" className="crm-btn" onClick={() => setOpen(false)}>Annuler</button><button type="button" className="crm-btn primary" onClick={() => setOpen(false)}>Enregistrer</button></>}>
        <label className="crm-field"><span>Nom affiché</span><input className="crm-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="crm-field"><span>Adresse e-mail</span><input className="crm-input" type="email" defaultValue="camille@example.com" /></label>
        <label className="crm-field"><span>Note interne</span><textarea className="crm-textarea" rows={4} defaultValue="Privilégier un échange le matin." /></label>
      </CrmModal>}
    </main>
  );
}

function EditorExample({ confirmation = false }: { confirmation?: boolean }) {
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(confirmation);
  const [name, setName] = useState('Saison principale');
  return (
    <main style={{ minHeight: '100vh', padding: 24 }}>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Ouvrir la période</button>
      <EditorModal open={open} title="Modifier la période" eyebrow="Horaires" onClose={() => setOpen(false)} onSave={() => setOpen(false)}
        aside={<div><p className="ed-record-modal__eyebrow">Aperçu</p><h3>{name}</h3><p>Du 1er novembre au 31 mars</p><p>Du mardi au dimanche<br />09:00–12:00 · 14:00–18:00</p></div>}>
        <Field label="Nom de la période"><Input value={name} onChange={setName} /></Field>
        <Field label="Début"><Input type="date" value="2026-11-01" onChange={() => undefined} /></Field>
        <Field label="Fin"><Input type="date" value="2027-03-31" onChange={() => undefined} /></Field>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>Supprimer cette période</button>
        <ConfirmDialog open={confirming} appearance="editor" title="Supprimer cette période ?"
          message="La période « Saison principale » sera retirée du brouillon. La fiche publiée reste inchangée jusqu’à son enregistrement."
          confirmLabel="Supprimer" tone="danger" onCancel={() => setConfirming(false)} onConfirm={() => setConfirming(false)} />
      </EditorModal>
    </main>
  );
}

const meta: Meta = {
  title: 'Interface/Modales',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  decorators: [(Story) => <ApplicationFonts><Story /></ApplicationFonts>],
};
export default meta;
type Story = StoryObj;

export const Application: Story = { render: () => <ApplicationExample /> };
export const ApplicationDrawer: Story = { render: () => <ApplicationExample drawer /> };
export const Crm: Story = { render: () => <CrmExample /> };
export const CrmDrawer: Story = { render: () => <CrmExample drawer /> };
export const Editor: Story = { render: () => <EditorExample /> };
export const Confirmation: Story = { render: () => <EditorExample confirmation /> };
