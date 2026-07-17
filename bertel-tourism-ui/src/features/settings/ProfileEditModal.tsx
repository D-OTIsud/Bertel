'use client';

// Modale d'édition du profil — SURFACE UNIQUE d'édition nom + photo (spec hub personnel
// 2026-07-03), consommée par le ProfileDrawer et par Réglages → Mon compte → Profil.
// Reprend la mécanique §149 : updateCurrentUserProfile / uploadAvatar (route serveur,
// EXIF strippé) + applyProfile (session mise à jour sans re-bootstrap).

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { updateCurrentUserProfile, uploadAvatar } from '../../services/user-profile';
import { useSessionStore } from '../../store/session-store';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditModal({ open, onOpenChange }: ProfileEditModalProps) {
  const userName = useSessionStore((state) => state.userName);
  const email = useSessionStore((state) => state.email);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const demoMode = useSessionStore((state) => state.demoMode);
  const status = useSessionStore((state) => state.status);
  const applyProfile = useSessionStore((state) => state.applyProfile);

  const [nameDraft, setNameDraft] = useState<string>(userName);
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarJustUploaded, setAvatarJustUploaded] = useState(false);
  // Timer for the avatar success flash — cleared on unmount so a setState never fires after
  // the modal has closed (same pattern as ObjectEditPage's flashSuccess/feedbackTimerRef).
  const avatarFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resynchronise le brouillon à chaque ouverture (le nom peut avoir changé entre deux passages).
  useEffect(() => {
    if (open) setNameDraft(userName);
  }, [open, userName]);

  useEffect(() => {
    return () => {
      if (avatarFlashTimerRef.current !== null) clearTimeout(avatarFlashTimerRef.current);
    };
  }, []);

  /** Flash the avatar label to "just uploaded" for 1.2s, then back to idle. Clears any prior
   *  pending timer so rapid re-upload doesn't strand the label on success. */
  function flashAvatarUploaded() {
    setAvatarJustUploaded(true);
    if (avatarFlashTimerRef.current !== null) clearTimeout(avatarFlashTimerRef.current);
    avatarFlashTimerRef.current = setTimeout(() => setAvatarJustUploaded(false), 1200);
  }

  // L'avatar affiché ne doit jamais être l'e-mail : si aucun nom réel n'est enregistré,
  // le display_name retombe sur l'e-mail — on n'en tire pas d'initiales trompeuses (§149).
  const hasRealName = userName.trim() !== '' && userName.trim() !== email.trim();
  const avatarInitials = hasRealName
    ? userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
    : '?';

  const handleSaveName = async () => {
    const next = nameDraft.trim();
    if (next === '') {
      toast.error('Le nom ne peut pas être vide.');
      return;
    }
    if (next === userName) {
      onOpenChange(false);
      return;
    }
    setNameSaving(true);
    try {
      if (!demoMode && status === 'ready') {
        await updateCurrentUserProfile({ display_name: next });
      }
      applyProfile({ userName: next });
      toast.success('Nom enregistré.');
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error((error as Error).message);
    } finally {
      setNameSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file) return;
    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(file);
      applyProfile({ avatarUrl: url });
      toast.success('Photo de profil mise à jour.');
      flashAvatarUploaded();
    } catch (error: unknown) {
      toast.error((error as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mon profil</DialogTitle>
          <DialogDescription>
            Votre nom et votre photo — visibles dans l’app et dans le « mot du conseiller » de vos sélections.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
            <img
              src={avatarUrl}
              alt="Votre photo de profil"
              width={64}
              height={64}
              style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover', flex: 'none' }}
            />
          ) : (
            <span
              aria-hidden
              style={{ width: 64, height: 64, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent, #1f7a6d)', color: '#fff', fontWeight: 700, fontSize: 22 }}
            >
              {avatarInitials}
            </span>
          )}
          <label className="ghost-button marker-upload-button cursor-pointer">
            {avatarBusy ? (
              'Envoi…'
            ) : avatarJustUploaded ? (
              <>
                <Check size={14} className="motion-success" aria-hidden /> Photo mise à jour
              </>
            ) : avatarUrl ? (
              'Changer la photo'
            ) : (
              'Ajouter une photo'
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={avatarBusy || demoMode}
              onChange={(event) => void handleAvatarChange(event)}
            />
          </label>
        </div>
        {demoMode ? <p className="pref__hint">Photo indisponible en mode démo (aucune session réelle).</p> : null}
        <p className="pref__hint">JPEG, PNG ou WebP — ≤ 5 Mo. Redimensionnée et nettoyée (métadonnées EXIF/GPS supprimées) automatiquement.</p>

        <div className="field-block">
          <label htmlFor="profileEditName">Nom affiché</label>
          <input
            id="profileEditName"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Prénom (ou prénom + nom)"
            autoComplete="name"
          />
          <p className="pref__hint">Ex. « David » ou « David Philippe ». C’est ce nom qui signe le « mot du conseiller ».</p>
        </div>
        <div className="settings-pane__actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveName()}
            disabled={nameSaving || nameDraft.trim() === ''}
          >
            {nameSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
