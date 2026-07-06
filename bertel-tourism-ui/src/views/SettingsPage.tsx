"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveUserRoleLabel, resolveUserRoleTone } from '../utils/user-role-label';
import { buildMarkerDataUri, defaultMarkerStyles, markerIconCatalog, markerIconChoicesByType, objectTypeOptions, sanitizeCustomMarkerSvg } from '../config/map-markers';
import { env } from '../lib/env';
import { settingsThemeSchema, type SettingsThemeFormValues } from '../lib/schemas';
import { coerceThemeSettings, defaultThemeSettings, readFileAsDataUrl } from '../lib/theme';
import { saveBrandingSettings } from '../services/branding';
import { updateCurrentUserProfile } from '../services/user-profile';
import { AiProviderSettings } from '../features/settings/AiProviderSettings';
import { PartnerKeysSettings } from '../features/settings/PartnerKeysSettings';
import { OrgsPanel } from '../features/orgs/OrgsPanel';
import { OrgBrandingForm } from '../features/orgs/OrgBrandingForm';
import { ProfileEditModal } from '../features/settings/ProfileEditModal';
import { SettingsRail } from './SettingsRail';
import { buildSettingsNav, resolveSettingsSection } from './settings-nav';
import TeamAdminPage from './TeamAdminPage';
import { RefCodeEditor } from './RefCodeEditor';
import { canAdministerTeam } from '@/store/session-selectors';
import { useSessionStore } from '../store/session-store';
import { useThemeStore } from '../store/theme-store';
import { useUiStore } from '../store/ui-store';
import type { ObjectTypeCode, UserRole } from '../types/domain';

const roles: UserRole[] = ['super_admin', 'tourism_agent', 'owner'];

// 7.1 — libellés complets des langues d'interface (fidélité maquette : « Français » plutôt
// que « FR »). L'ordre suit l'ordre d'affichage des chips.
const LANGUAGE_LABELS: Record<string, string> = { fr: 'Français', en: 'English', de: 'Deutsch' };

function buildDrafts(markerStyles: ReturnType<typeof useUiStore.getState>['markerStyles']): Record<ObjectTypeCode, string> {
  return objectTypeOptions.reduce((acc, item) => {
    acc[item.code] = markerStyles[item.code]?.customSvg ?? '';
    return acc;
  }, {} as Record<ObjectTypeCode, string>);
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const role = useSessionStore((state) => state.role);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const demoMode = useSessionStore((state) => state.demoMode);
  const status = useSessionStore((state) => state.status);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const orgName = useSessionStore((state) => state.orgName);
  const userName = useSessionStore((state) => state.userName);
  const email = useSessionStore((state) => state.email);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const setDemoRole = useSessionStore((state) => state.setDemoRole);
  const setLangPrefs = useSessionStore((state) => state.setLangPrefs);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const markerStyles = useUiStore((state) => state.markerStyles);
  const setMarkerStyles = useUiStore((state) => state.setMarkerStyles);
  const setMarkerColor = useUiStore((state) => state.setMarkerColor);
  const setMarkerIcon = useUiStore((state) => state.setMarkerIcon);
  const setMarkerMode = useUiStore((state) => state.setMarkerMode);
  const setCustomMarkerSvg = useUiStore((state) => state.setCustomMarkerSvg);
  const clearCustomMarkerSvg = useUiStore((state) => state.clearCustomMarkerSvg);
  const resetMarkerStyles = useUiStore((state) => state.resetMarkerStyles);

  const canManageBrandTheme = role === 'super_admin';
  const canManageCustomIcons = role === 'super_admin';

  // 7.1 — console à rail : un seul panneau visible à la fois, section active synchronisée à
  // l'URL (?section=). Le rail est gated par rôle (buildSettingsNav). Si le rôle change (switch
  // démo) et rend la section courante inaccessible, on retombe sur le défaut.
  const adminRank = useSessionStore((state) => state.adminRank);
  const orgId = useSessionStore((state) => state.orgId);
  const canManageTeam = canAdministerTeam({ role, adminRank });
  // Task 11 — branding par ORG : réservé à l'admin d'ORG de rang ≥ 30 (au-delà du seuil ≥ 10
  // qui donne juste accès à l'équipe), et seulement si l'utilisateur est bien rattaché à une ORG.
  const canManageOrgBranding = (adminRank ?? 0) >= 30 && !!orgId;
  const settingsNavOptions = useMemo(() => ({ canManageTeam, canManageOrgBranding }), [canManageTeam, canManageOrgBranding]);
  const settingsNav = useMemo(() => buildSettingsNav(role, settingsNavOptions), [role, settingsNavOptions]);
  const [activeSection, setActiveSection] = useState<string>(() =>
    resolveSettingsSection(role, typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('section'), settingsNavOptions),
  );
  useEffect(() => {
    setActiveSection((current) => resolveSettingsSection(role, current, settingsNavOptions));
  }, [role, settingsNavOptions]);
  function selectSection(id: string) {
    setActiveSection(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('section', id);
      window.history.replaceState(null, '', url.toString());
    }
  }
  const customSvgSignature = useMemo(
    () => objectTypeOptions.map(({ code }) => `${code}:${markerStyles[code].mode}:${markerStyles[code].customSvg ?? ''}`).join('|'),
    [markerStyles],
  );
  const [customSvgDrafts, setCustomSvgDrafts] = useState<Record<ObjectTypeCode, string>>(() => buildDrafts(markerStyles));
  const [customSvgErrors, setCustomSvgErrors] = useState<Partial<Record<ObjectTypeCode, string>>>({});
  // 7.2 — marqueurs en maître/détail : un seul type édité à la fois (fin du mur de 7 cartes).
  const [selectedMarkerType, setSelectedMarkerType] = useState<ObjectTypeCode>(() => objectTypeOptions[0].code);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoCleared, setPendingLogoCleared] = useState(false);

  // « Mon compte » → Profil : l'édition (nom + photo) vit dans ProfileEditModal — surface
  // unique partagée avec le hub personnel (ProfileDrawer). Ici : affichage + bouton.
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // L'avatar affiché ne doit jamais être l'e-mail : si aucun nom réel n'est enregistré,
  // le display_name retombe sur l'e-mail — on n'en tire pas d'initiales trompeuses.
  const hasRealName = userName.trim() !== '' && userName.trim() !== email.trim();
  const avatarInitials = hasRealName
    ? userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    : '?';

  const toggleLanguage = (lang: string) => {
    const nextLangPrefs = langPrefs.includes(lang) ? langPrefs.filter((item) => item !== lang) : [...langPrefs, lang];
    if (nextLangPrefs.length === 0) {
      toast.error('Gardez au moins une langue active.');
      return;
    }

    const previousLangPrefs = langPrefs;
    setLangPrefs(nextLangPrefs);

    if (!demoMode && status === 'ready') {
      void updateCurrentUserProfile({ lang_prefs: nextLangPrefs }).then(() => {
        toast.success('Preferences de langue enregistrees.');
      }).catch((error: unknown) => {
        setLangPrefs(previousLangPrefs);
        toast.error((error as Error).message);
      });
    }
  };

  const themeForm = useForm<SettingsThemeFormValues>({
    resolver: zodResolver(settingsThemeSchema),
    defaultValues: {
      brandName: theme.brandName,
      logoUrl: theme.logoUrl ?? '',
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      textColor: theme.textColor,
      backgroundColor: theme.backgroundColor,
      surfaceColor: theme.surfaceColor,
    },
  });

  useEffect(() => {
    themeForm.reset({
      brandName: theme.brandName,
      logoUrl: theme.logoUrl ?? '',
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      textColor: theme.textColor,
      backgroundColor: theme.backgroundColor,
      surfaceColor: theme.surfaceColor,
    });
  }, [theme.brandName, theme.logoUrl, theme.primaryColor, theme.accentColor, theme.textColor, theme.backgroundColor, theme.surfaceColor]);

  useEffect(() => {
    setCustomSvgDrafts(buildDrafts(markerStyles));
  }, [customSvgSignature, markerStyles]);

  const applyCustomSvg = (type: ObjectTypeCode) => {
    const draft = customSvgDrafts[type] ?? '';
    const sanitized = sanitizeCustomMarkerSvg(draft);

    if (!sanitized) {
      setCustomSvgErrors((current) => ({
        ...current,
        [type]: 'SVG invalide ou non securise. Utilisez un SVG simple sans script ni contenu externe.',
      }));
      return;
    }

    setCustomMarkerSvg(type, sanitized);
    setCustomSvgDrafts((current) => ({ ...current, [type]: sanitized }));
    setCustomSvgErrors((current) => ({ ...current, [type]: undefined }));
  };

  const handleCustomSvgUpload = async (type: ObjectTypeCode, file: File | null) => {
    if (!file) {
      return;
    }

    const svgText = await file.text();
    setCustomSvgDrafts((current) => ({ ...current, [type]: svgText }));
    const sanitized = sanitizeCustomMarkerSvg(svgText);

    if (!sanitized) {
      setCustomSvgErrors((current) => ({
        ...current,
        [type]: 'Le fichier SVG fourni contient des elements non autorises ou un format invalide.',
      }));
      return;
    }

    setCustomMarkerSvg(type, sanitized);
    setCustomSvgDrafts((current) => ({ ...current, [type]: sanitized }));
    setCustomSvgErrors((current) => ({ ...current, [type]: undefined }));
  };

  const handleResetMarkers = () => {
    resetMarkerStyles();
    setCustomSvgDrafts(buildDrafts(defaultMarkerStyles));
    setCustomSvgErrors({});
  };

  const handleClearCustomSvg = (type: ObjectTypeCode) => {
    clearCustomMarkerSvg(type);
    setCustomSvgDrafts((current) => ({ ...current, [type]: '' }));
    setCustomSvgErrors((current) => ({ ...current, [type]: undefined }));
  };

  const handleThemeColorChange = (field: 'primaryColor' | 'accentColor' | 'textColor' | 'backgroundColor' | 'surfaceColor', value: string) => {
    themeForm.setValue(field, value, { shouldDirty: true });
  };

  const handleThemeReset = () => {
    themeForm.reset({ ...defaultThemeSettings, logoUrl: defaultThemeSettings.logoUrl ?? '' });
    resetMarkerStyles();
    setCustomSvgDrafts(buildDrafts(defaultMarkerStyles));
    setCustomSvgErrors({});
    setPendingLogoFile(null);
    setPendingLogoCleared(true);
  };

  const handleThemeSave = themeForm.handleSubmit(async (values) => {
    if (!canManageBrandTheme) return;

    setThemeSaving(true);
    try {
      const snapshot = await saveBrandingSettings({
        theme: coerceThemeSettings(values),
        markerStyles,
        logoFile: pendingLogoFile,
        clearLogo: pendingLogoCleared,
      });

      setTheme(snapshot.theme);
      setMarkerStyles(snapshot.markerStyles);
      themeForm.reset({ ...snapshot.theme, logoUrl: snapshot.theme.logoUrl ?? '' });
      setPendingLogoFile(null);
      setPendingLogoCleared(false);
      toast.success(demoMode ? 'Theme applique localement en mode demo.' : 'Branding enregistre.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branding', 'public'] }),
        queryClient.invalidateQueries({ queryKey: ['branding', 'authenticated'] }),
      ]);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setThemeSaving(false);
    }
  });

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;

    setThemeBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingLogoFile(file);
      setPendingLogoCleared(false);
      themeForm.setValue('logoUrl', dataUrl, { shouldDirty: true });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setThemeBusy(false);
    }
  };

  const themeDraft = themeForm.watch();
  const logoSourceLabel = !theme.logoUrl
    ? 'aucun logo'
    : theme.logoUrl.startsWith('data:image/')
      ? 'preview locale'
      : 'storage / URL publique';

  const roleLabel = resolveUserRoleLabel(role, adminRank);
  const roleTone = resolveUserRoleTone(role);
  const sessionActive = demoMode || status === 'ready';

  return (
    <section className="page-grid p-4">
      <div className="settings-console">
        <SettingsRail groups={settingsNav} activeSection={activeSection} onSelect={selectSection} />
        <div className="settings-panel">

      {activeSection === 'session' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Session &amp; rôle</h2>
            <p>Votre identité de connexion, votre organisation et l’état de la session.</p>
          </div>
        </div>

        <div className="state-card">
          <div className="state-row">
            <span className="state-row__k">Rôle</span>
            <span className="state-row__v"><span className={`badge badge--${roleTone}`}>{roleLabel}</span></span>
          </div>
          <div className="state-row">
            <span className="state-row__k">Organisation</span>
            <span className="state-row__v">{orgName ?? 'Non rattaché'}</span>
          </div>
          <div className="state-row">
            <span className="state-row__k">Session</span>
            <span className="state-row__v">
              <span className={sessionActive ? 'dot dot--ok' : 'dot dot--off'} aria-hidden />
              {sessionActive ? 'Active' : status}
            </span>
          </div>
          <div className="state-row">
            <span className="state-row__k">Marque active</span>
            <span className="state-row__v">{theme.brandName}</span>
          </div>
        </div>

        {errorMessage ? <div className="inline-alert inline-alert--danger" role="alert">{errorMessage}</div> : null}

        {demoMode && (
          <div className="settings-pane__demo">
            <div className="pref__label">Simuler un rôle (mode démo)</div>
            <div className="chip-grid">
              {roles.map((item) => (
                <button key={item} type="button" className={role === item ? 'chip chip--active' : 'chip'} onClick={() => setDemoRole(item)}>
                  {resolveUserRoleLabel(item)}
                </button>
              ))}
            </div>
            <p className="pref__hint">Le mode démo permet de prévisualiser l’interface sous chaque rôle. En production, le rôle vient de la session Supabase.</p>
          </div>
        )}

        <details className="diag">
          <summary><ChevronDown size={16} aria-hidden /> Diagnostic technique</summary>
          <div className="diag__body">
            <div className="diag__line"><span className="muted">Environnement Supabase</span><span className="mono">{env.supabaseUrl ? 'configuré' : 'non configuré'}</span></div>
            <div className="diag__line"><span className="muted">Source du logo</span><span className="mono">{logoSourceLabel}</span></div>
            <div className="diag__line"><span className="muted">Mode démonstration</span><span className="mono">{demoMode ? 'oui' : 'non'}</span></div>
          </div>
        </details>
      </section>

      )}

      {activeSection === 'appearance' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Apparence (marque blanche)</h2>
            <p>Logo, palette et styles de marqueurs appliqués globalement via variables CSS et RPC Supabase.</p>
          </div>
          <div className="settings-pane__actions">
            <span className="badge badge--info badge--xs">Super-admin</span>
            <button type="button" className="ghost-button" onClick={handleThemeReset} disabled={!canManageBrandTheme || themeSaving}>
              Réinitialiser
            </button>
            <button type="button" className="primary-button" onClick={() => void handleThemeSave()} disabled={!canManageBrandTheme || themeSaving}>
              {themeSaving ? 'Enregistrement…' : 'Enregistrer le branding'}
            </button>
          </div>
        </div>

        <div className="theme-settings-grid">
          <article className="panel-card panel-card--nested theme-preview-card">
            <span className="eyebrow">Preview</span>
            <div className="theme-preview-card__hero" style={{ background: `linear-gradient(135deg, ${themeDraft.primaryColor}, ${themeDraft.accentColor})` }}>
              {themeDraft.logoUrl ? <img src={themeDraft.logoUrl} alt={themeDraft.brandName} className="theme-preview-card__logo" /> : <div className="theme-preview-card__logo theme-preview-card__logo--fallback">{themeDraft.brandName.slice(0, 1)}</div>}
              <div>
                <strong>{themeDraft.brandName}</strong>
                <span>{canManageBrandTheme ? 'Edition admin active' : 'Consultation seule'}</span>
              </div>
            </div>
            <div className="theme-preview-swatches">
              {[
                ['Primaire', themeDraft.primaryColor],
                ['Accent', themeDraft.accentColor],
                ['Texte', themeDraft.textColor],
                ['Fond', themeDraft.backgroundColor],
                ['Surface', themeDraft.surfaceColor],
              ].map(([label, color]) => (
                <div key={label} className="theme-preview-swatch">
                  <span>{label}</span>
                  <div className="theme-preview-swatch__chip" style={{ backgroundColor: color }} />
                  <code>{color}</code>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card panel-card--nested theme-form-card">
            <form onSubmit={handleThemeSave} className="theme-form">
              <div className="field-block">
                <label htmlFor="brandName">Nom de marque</label>
                <input
                  id="brandName"
                  {...themeForm.register('brandName')}
                  disabled={!canManageBrandTheme}
                />
                {themeForm.formState.errors.brandName && (
                  <p className="field-error">{themeForm.formState.errors.brandName.message}</p>
                )}
              </div>

              <div className="field-block">
                <span className="pref__label">Logo</span>
                {canManageBrandTheme ? (
                  <div className="inline-actions">
                    <label className="ghost-button marker-upload-button cursor-pointer">
                      {themeBusy ? 'Import…' : 'Importer un logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          void handleLogoUpload(file);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setPendingLogoFile(null);
                        setPendingLogoCleared(true);
                        themeForm.setValue('logoUrl', '');
                      }}
                    >
                      Enlever le logo
                    </button>
                  </div>
                ) : (
                  <p className="muted">Seuls les super-admins peuvent modifier le branding.</p>
                )}
                <p className="pref__hint">PNG, JPG, WebP ou SVG. Fond transparent recommandé.</p>
              </div>

              {[
                ['primaryColor', 'Couleur primaire'],
                ['accentColor', 'Couleur accent'],
                ['textColor', 'Couleur texte'],
                ['backgroundColor', 'Couleur fond'],
                ['surfaceColor', 'Couleur surface'],
              ].map(([field, label]) => (
                <div key={field} className="field-block">
                  <label>{label}</label>
                  <div className="marker-settings-input-row">
                    <input
                      type="color"
                      aria-label={`${label} (sélecteur de couleur)`}
                      value={themeForm.watch(field as keyof SettingsThemeFormValues) as string}
                      onChange={(e) => handleThemeColorChange(field as 'primaryColor' | 'accentColor' | 'textColor' | 'backgroundColor' | 'surfaceColor', e.target.value)}
                      className="color-input"
                      disabled={!canManageBrandTheme}
                    />
                    <input
                      aria-label={`${label} (valeur hexadécimale)`}
                      value={themeForm.watch(field as keyof SettingsThemeFormValues) as string}
                      onChange={(e) => handleThemeColorChange(field as 'primaryColor' | 'accentColor' | 'textColor' | 'backgroundColor' | 'surfaceColor', e.target.value)}
                      disabled={!canManageBrandTheme}
                    />
                  </div>
                </div>
              ))}
            </form>
          </article>
        </div>
      </section>

      )}

      {activeSection === 'markers' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Marqueurs</h2>
            <p>Couleur et icône (SVG) affichées au centre du pin pour chaque typologie. Enregistrées avec le branding.</p>
          </div>
          <div className="settings-pane__actions">
            <span className="badge badge--info badge--xs">Super-admin</span>
            <button type="button" className="ghost-button" onClick={handleResetMarkers} disabled={!canManageBrandTheme || themeSaving}>
              Réinitialiser
            </button>
            <button type="button" className="primary-button" onClick={() => void handleThemeSave()} disabled={!canManageBrandTheme || themeSaving}>
              {themeSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
        <div className="marker-master-detail">
          <div className="marker-master" role="tablist" aria-label="Types de marqueur">
            {objectTypeOptions.map((option) => {
              const optionMarker = markerStyles[option.code] ?? defaultMarkerStyles[option.code];
              const isSelected = option.code === selectedMarkerType;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={isSelected ? 'marker-master__item is-active' : 'marker-master__item'}
                  onClick={() => setSelectedMarkerType(option.code)}
                >
                  <img src={buildMarkerDataUri(optionMarker)} alt="" aria-hidden className="marker-master__preview" />
                  <span className="marker-master__text">
                    <span className="marker-master__name">{option.label}</span>
                    <span className="marker-master__codes">{option.backendTypes.join(', ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="marker-detail">
            {(() => {
              const typeOption = objectTypeOptions.find((option) => option.code === selectedMarkerType) ?? objectTypeOptions[0];
              const marker = markerStyles[typeOption.code] ?? defaultMarkerStyles[typeOption.code];
              return (
              <article className="panel-card panel-card--nested marker-settings-card">
                <div className="marker-settings-card__header">
                  <div>
                    <strong>{typeOption.label}</strong>
                    <p>{typeOption.backendTypes.join(' · ')}</p>
                  </div>
                  <img
                    src={buildMarkerDataUri(marker)}
                    alt={`Marker ${typeOption.label}`}
                    className="marker-preview-image"
                  />
                </div>

                <label className="field-block">
                  <span>Couleur</span>
                  <div className="marker-settings-input-row">
                    <input
                      type="color"
                      aria-label={`Couleur du marqueur ${typeOption.label} (sélecteur)`}
                      value={marker.color}
                      onChange={(event) => setMarkerColor(typeOption.code, event.target.value)}
                      className="color-input"
                      disabled={!canManageBrandTheme}
                    />
                    <input
                      type="text"
                      aria-label={`Couleur du marqueur ${typeOption.label} (valeur hexadécimale)`}
                      value={marker.color}
                      onChange={(event) => setMarkerColor(typeOption.code, event.target.value)}
                      placeholder="#ef7a49"
                      disabled={!canManageBrandTheme}
                    />
                  </div>
                </label>

                <div className="field-block">
                  <span>Icône</span>
                  <div className="marker-icon-grid">
                    {markerIconChoicesByType[typeOption.code].map((iconKey) => {
                      const previewStyle = { ...marker, mode: 'preset' as const, customSvg: null, icon: iconKey };
                      const iconActive = marker.mode === 'preset' && marker.icon === iconKey;
                      return (
                        <button
                          key={iconKey}
                          type="button"
                          aria-pressed={iconActive}
                          className={iconActive ? 'marker-icon-option marker-icon-option--active' : 'marker-icon-option'}
                          onClick={() => {
                            setMarkerIcon(typeOption.code, iconKey);
                            setMarkerMode(typeOption.code, 'preset');
                          }}
                          disabled={!canManageBrandTheme}
                        >
                          <img src={buildMarkerDataUri(previewStyle)} alt={markerIconCatalog[iconKey].label} className="marker-icon-option__image" />
                          <span>{markerIconCatalog[iconKey].label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <details className="marker-advanced">
                  <summary>Avancé — SVG personnalisé</summary>
                  <p className="marker-advanced__note">
                    Le SVG est nettoyé (sanitisé) avant application : balises et attributs dangereux retirés.
                  </p>
                  {canManageCustomIcons ? (
                    <>
                      <textarea
                        value={customSvgDrafts[typeOption.code] ?? ''}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setCustomSvgDrafts((current) => ({ ...current, [typeOption.code]: nextValue }));
                          setCustomSvgErrors((current) => ({ ...current, [typeOption.code]: undefined }));
                        }}
                        rows={7}
                        placeholder="Collez ici un SVG simple avec une balise <svg>..."
                      />
                      <div className="inline-actions">
                        <label className="ghost-button marker-upload-button">
                          Importer un SVG
                          <input
                            type="file"
                            accept=".svg,image/svg+xml"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void handleCustomSvgUpload(typeOption.code, file);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                        <button type="button" className="ghost-button" onClick={() => applyCustomSvg(typeOption.code)}>
                          Appliquer
                        </button>
                        <button type="button" className="ghost-button" onClick={() => handleClearCustomSvg(typeOption.code)}>
                          Effacer
                        </button>
                      </div>
                      {customSvgErrors[typeOption.code] ? <div className="inline-alert inline-alert--danger">{customSvgErrors[typeOption.code]}</div> : null}
                    </>
                  ) : (
                    <p className="muted">Seuls les super-admins peuvent charger un SVG personnalisé. Les autres profils voient simplement le rendu appliqué.</p>
                  )}
                </details>
              </article>
              );
            })()}
          </div>
        </div>
      </section>

      )}

      {activeSection === 'profile' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Profil</h2>
            <p>Votre nom et votre photo — visibles dans l’app et dans le « mot du conseiller » de vos sélections.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => setProfileModalOpen(true)}>
            Modifier
          </button>
        </div>

        <div className="settings-pane__demo">
          <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase, pas d'optimisation next/image requise
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
            <div>
              <strong>{userName || '—'}</strong>
              <p className="pref__hint">{email || 'Aucune adresse e-mail (mode démo)'}</p>
            </div>
          </div>
        </div>
        <ProfileEditModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
      </section>
      )}

      {activeSection === 'preferences' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Préférences</h2>
            <p>Vos réglages personnels d’interface.</p>
          </div>
        </div>
        <div className="settings-pane__demo">
          <div className="pref__label">Langue de l’interface</div>
          <div className="chip-grid">
            {['fr', 'en', 'de'].map((lang) => (
              <button
                key={lang}
                type="button"
                className={langPrefs.includes(lang) ? 'chip chip--active' : 'chip'}
                aria-pressed={langPrefs.includes(lang)}
                onClick={() => toggleLanguage(lang)}
              >
                {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="pref__hint">Au moins une langue reste active. Enregistré sur votre profil.</p>
        </div>
      </section>

      )}

      {/* « Mentions légales » : foyer découvrable des pages légales publiques (servies en clair
          depuis /legal/*.html). Non gated (tous rôles). Le module interne /rgpd (traitement des
          demandes d'effacement) est owner/super-admin only ⇒ lien réservé à ces rôles (pas de
          lien mort pour un agent). Voir décision log « pages légales » Partie B. */}
      {activeSection === 'legal' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Mentions légales</h2>
            <p>Documents de référence : confidentialité, conditions d’utilisation et analyse d’impact (RGPD).</p>
          </div>
        </div>
        <div className="settings-pane__demo">
          <ul className="legal-links">
            <li>
              <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>
              <span className="pref__hint">Traitement des données personnelles, base légale et durées de conservation (RGPD).</span>
            </li>
            <li>
              <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">Conditions générales d’utilisation</a>
              <span className="pref__hint">Règles d’accès et d’usage de la plateforme.</span>
            </li>
            <li>
              <a href="/legal/dpia.html" target="_blank" rel="noopener noreferrer">Analyse d’impact (AIPD)</a>
              <span className="pref__hint">Évaluation des risques du traitement sur la vie privée.</span>
            </li>
          </ul>
          <p className="pref__hint">
            Pour exercer vos droits (accès, rectification, effacement), consultez la{' '}
            <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">politique de confidentialité</a>{' '}
            ou contactez le responsable de traitement. En cas de désaccord persistant, vous pouvez saisir la{' '}
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">CNIL</a>.
          </p>
          {(role === 'owner' || role === 'super_admin') && (
            <p className="pref__hint">
              Administration : le module{' '}
              <Link href="/rgpd">RGPD &amp; droits des personnes</Link>{' '}
              permet de traiter les demandes d’effacement.
            </p>
          )}
        </div>
      </section>

      )}

      {/* 7.1 : diagnostic plateforme en libellé clair — l'URL Supabase brute n'est jamais
          exposée (juste configuré/non). Un diagnostic replié figure aussi dans « Session & rôle ». */}
      {activeSection === 'diagnostic' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Diagnostic</h2>
            <p>État technique de l’environnement (lecture seule).</p>
          </div>
        </div>
        <div className="diag__body" style={{ maxWidth: 640 }}>
          <div className="diag__line"><span className="muted">Environnement Supabase</span><span className="mono">{env.supabaseUrl ? 'configuré' : 'à renseigner'}</span></div>
          <div className="diag__line"><span className="muted">Mode démonstration</span><span className="mono">{demoMode ? 'oui' : 'non'}</span></div>
          <div className="diag__line"><span className="muted">Marque active</span><span className="mono">{theme.brandName}</span></div>
          <div className="diag__line"><span className="muted">Source du logo</span><span className="mono">{logoSourceLabel}</span></div>
        </div>
      </section>

      )}

      {/* 7.5 — Listes & référentiels (ref_code) : éditeur maître/détail super-admin. */}
      {activeSection === 'referentiels' && role === 'super_admin' && (
        <article className="panel-card panel-card--wide">
          <div className="panel-heading">
            <div>
              <h2>Listes & référentiels</h2>
              <p>Vocabulaires plats (ref_code) : libellé, ordre et activation. Les taxonomies et listes structurelles restent en lecture seule.</p>
            </div>
          </div>
          <RefCodeEditor />
        </article>
      )}

      {activeSection === 'ai' && role === 'super_admin' && (
        <article className="panel-card">
          <AiProviderSettings />
        </article>
      )}

      {activeSection === 'partner-keys' && role === 'super_admin' && (
        <article className="panel-card">
          <PartnerKeysSettings />
        </article>
      )}

      {activeSection === 'organisations' && role === 'super_admin' && (
        <article className="panel-card">
          <OrgsPanel />
        </article>
      )}

      {/* 7.4 — Équipe (Mon organisation) : Team emménage ici depuis /team (retiré du sidebar).
          TeamAdminPage porte son propre gating + chargement + contrôles serveur (vraie frontière). */}
      {activeSection === 'team' && canManageTeam && <TeamAdminPage />}

      {/* Task 11 — Apparence de l'organisation (Mon organisation) : formulaire de branding
          partagé avec l'action « Branding » du module Organisations (superadmin). */}
      {activeSection === 'org-branding' && canManageOrgBranding && orgId && (
        <article className="panel-card">
          <section className="settings-pane">
            <div className="settings-pane__head">
              <div>
                <h2>Apparence de l’organisation</h2>
                <p className="muted">Personnalisez l’identité visuelle vue par les membres de votre organisation. Les champs vides héritent du thème plateforme.</p>
              </div>
            </div>
            <OrgBrandingForm orgId={orgId} />
          </section>
        </article>
      )}

        </div>
      </div>
    </section>
  );
}

export { SettingsPage };
