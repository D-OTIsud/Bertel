'use client';
// Branding d'une ORG : chaque champ vide hérite du thème plateforme (placeholder = valeur
// résolue). Full-state PUT côté RPC — le formulaire recharge raw avant toute sauvegarde.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getOrgBranding, saveOrgBranding, type OrgBrandingRaw } from '@/services/branding';

const EMPTY_RAW: OrgBrandingRaw = {
  brandName: null, logoStoragePath: null, logoPublicUrl: null, logoMimeType: null,
  primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null,
};
const COLOR_FIELDS: Array<{ key: keyof OrgBrandingRaw; label: string }> = [
  { key: 'primaryColor', label: 'Couleur principale' },
  { key: 'accentColor', label: 'Couleur d’accent' },
  { key: 'textColor', label: 'Couleur du texte' },
  { key: 'backgroundColor', label: 'Fond' },
  { key: 'surfaceColor', label: 'Surfaces' },
];

export function OrgBrandingForm({ orgId, onSaved }: { orgId: string; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState<OrgBrandingRaw>(EMPTY_RAW);
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const snap = await getOrgBranding(orgId);
      setRaw(snap.raw); setResolved(snap.resolved); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  function setField(key: keyof OrgBrandingRaw, value: string) {
    setRaw((prev) => ({ ...prev, [key]: value.trim() === '' ? null : value }));
  }

  async function persist(reset: boolean) {
    setBusy(true);
    try {
      const snap = await saveOrgBranding(orgId, reset ? { raw, reset: true } : { raw, logoFile, clearLogo });
      setRaw(snap.raw); setResolved(snap.resolved); setLogoFile(null); setClearLogo(false);
      await queryClient.invalidateQueries({ queryKey: ['branding', 'authenticated'] });
      toast.success(reset ? 'Thème de l’organisation réinitialisé.' : 'Branding de l’organisation enregistré.');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally { setBusy(false); setConfirmReset(false); }
  }

  if (error) return <div className="inline-alert inline-alert--danger" role="alert">{error}</div>;

  return (
    <div className="field-block">
      <label className="field-block" htmlFor="orgb-name">
        <span>Nom de marque</span>
        <input id="orgb-name" value={raw.brandName ?? ''} placeholder={resolved.brandName ?? ''} onChange={(e) => setField('brandName', e.target.value)} disabled={busy} />
        <span className="muted">Vide = hérite du nom plateforme.</span>
      </label>

      <div className="field-block">
        <span>Logo</span>
        {raw.logoPublicUrl && !clearLogo ? (
          <div className="inline-actions">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={raw.logoPublicUrl} alt="Logo de l’organisation" style={{ maxHeight: 48 }} />
            <button type="button" className="ghost-button" onClick={() => setClearLogo(true)} disabled={busy}>Retirer</button>
          </div>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} disabled={busy} />
        )}
        <span className="muted">Sans logo propre, celui de la plateforme est utilisé.</span>
      </div>

      {COLOR_FIELDS.map(({ key, label }) => (
        <label key={key} className="field-block" htmlFor={`orgb-${key}`}>
          <span>{label}</span>
          <input id={`orgb-${key}`} value={(raw[key] as string | null) ?? ''} placeholder={resolved[key] ?? '#000000'} onChange={(e) => setField(key, e.target.value)} pattern="#[0-9A-Fa-f]{6}" disabled={busy} />
        </label>
      ))}

      <div className="inline-actions">
        <button type="button" className="ghost-button" onClick={() => setConfirmReset(true)} disabled={busy}>Revenir au thème plateforme</button>
        <button type="button" className="primary-button" onClick={() => { void persist(false); }} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Revenir au thème plateforme ?"
        message="Toutes les surcharges de branding de cette organisation seront supprimées."
        confirmLabel="Réinitialiser"
        tone="danger"
        busy={busy}
        onConfirm={() => { void persist(true); }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
