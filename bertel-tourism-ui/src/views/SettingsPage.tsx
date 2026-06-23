"use client";

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { buildMarkerDataUri, defaultMarkerStyles, markerIconCatalog, markerIconChoicesByType, objectTypeOptions, sanitizeCustomMarkerSvg } from '../config/map-markers';
import { env } from '../lib/env';
import { settingsThemeSchema, type SettingsThemeFormValues } from '../lib/schemas';
import { coerceThemeSettings, defaultThemeSettings, extractThemeFromLogoDataUrl, readFileAsDataUrl } from '../lib/theme';
import { saveBrandingSettings } from '../services/branding';
import { updateCurrentUserProfile } from '../services/user-profile';
import { AiProviderSettings } from '../features/settings/AiProviderSettings';
import { SettingsRail } from './SettingsRail';
import { buildSettingsNav, resolveSettingsSection } from './settings-nav';
import { useSessionStore } from '../store/session-store';
import { useThemeStore } from '../store/theme-store';
import { useUiStore } from '../store/ui-store';
import type { ObjectTypeCode, UserRole } from '../types/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const roles: UserRole[] = ['super_admin', 'tourism_agent', 'owner'];

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
  const settingsNav = useMemo(() => buildSettingsNav(role), [role]);
  const [activeSection, setActiveSection] = useState<string>(() =>
    resolveSettingsSection(role, typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('section')),
  );
  useEffect(() => {
    setActiveSection((current) => resolveSettingsSection(role, current));
  }, [role]);
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
      const extracted = await extractThemeFromLogoDataUrl(dataUrl);
      setPendingLogoFile(file);
      setPendingLogoCleared(false);
      themeForm.setValue('logoUrl', dataUrl);
      const current = themeForm.getValues();
      const next = coerceThemeSettings({ ...current, ...extracted, logoUrl: dataUrl });
      themeForm.reset({ ...next, logoUrl: next.logoUrl ?? dataUrl });
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

  return (
    <section className="page-grid p-4">
      <article className="hero-panel">
        <span className="eyebrow">Configuration</span>
        <h2>Session, langues et branding</h2>
        <p>
          {demoMode
            ? 'Mode démo actif explicitement. Les rôles peuvent être simulés pour concevoir l’interface et tester le white-label.'
            : 'En mode normal, le rôle UI vient de la session Supabase et le branding peut être synchronisé via RPC sur la base principale.'}
        </p>
      </article>

      <div className="settings-console">
        <SettingsRail groups={settingsNav} activeSection={activeSection} onSelect={selectSection} />
        <div className="settings-panel">

      {activeSection === 'session' && (
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <h2>Rôle actif</h2>
        </div>
        {demoMode ? (
          <div className="chip-grid">
            {roles.map((item) => (
              <button key={item} type="button" className={role === item ? 'chip chip--active' : 'chip'} onClick={() => setDemoRole(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : (
          <div className="stack-list">
            <span>Rôle issu de la session : {role ?? 'non chargé'}</span>
            <span>Statut session : {status}</span>
            {errorMessage ? <span>{errorMessage}</span> : null}
          </div>
        )}
      </article>

      )}

      {activeSection === 'appearance' && (
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <div>
            <h2>White-label theme</h2>
            <p>Logo, palette et styles de marqueurs appliques globalement via variables CSS et RPC Supabase.</p>
          </div>
          <div className="inline-actions">
            <Button type="button" variant="ghost" onClick={handleThemeReset} disabled={!canManageBrandTheme || themeSaving}>
              Reinitialiser
            </Button>
            <Button type="button" onClick={() => void handleThemeSave()} disabled={!canManageBrandTheme || themeSaving}>
              {themeSaving ? 'Enregistrement...' : 'Enregistrer le branding'}
            </Button>
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
            <form onSubmit={handleThemeSave} className="space-y-4">
              <div className="field-block">
                <Label htmlFor="brandName">Nom de marque</Label>
                <Input
                  id="brandName"
                  {...themeForm.register('brandName')}
                  disabled={!canManageBrandTheme}
                />
                {themeForm.formState.errors.brandName && (
                  <p className="text-sm text-destructive">{themeForm.formState.errors.brandName.message}</p>
                )}
              </div>

              <div className="field-block">
                <span className="text-sm font-medium">Logo</span>
                {canManageBrandTheme ? (
                  <div className="inline-actions">
                    <Label className="ghost-button marker-upload-button cursor-pointer">
                      {themeBusy ? 'Extraction...' : 'Importer un logo'}
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
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPendingLogoFile(null);
                        setPendingLogoCleared(true);
                        themeForm.setValue('logoUrl', '');
                      }}
                    >
                      Enlever le logo
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Seuls les super-admins peuvent modifier le branding.</p>
                )}
              </div>

              {[
                ['primaryColor', 'Couleur primaire'],
                ['accentColor', 'Couleur accent'],
                ['textColor', 'Couleur texte'],
                ['backgroundColor', 'Couleur fond'],
                ['surfaceColor', 'Couleur surface'],
              ].map(([field, label]) => (
                <div key={field} className="field-block">
                  <Label>{label}</Label>
                  <div className="marker-settings-input-row">
                    <input
                      type="color"
                      value={themeForm.watch(field as keyof SettingsThemeFormValues) as string}
                      onChange={(e) => handleThemeColorChange(field as 'primaryColor' | 'accentColor' | 'textColor' | 'backgroundColor' | 'surfaceColor', e.target.value)}
                      className="color-input"
                      disabled={!canManageBrandTheme}
                    />
                    <Input
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
      </article>

      )}

      {activeSection === 'markers' && (
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <div>
            <h2>Markers carte</h2>
            <p>Couleur et icone SVG affiches au centre du pin pour chaque typologie. Les changements sont enregistres avec le branding.</p>
          </div>
          <button type="button" className="ghost-button" onClick={handleResetMarkers} disabled={!canManageBrandTheme || themeSaving}>
            Reinitialiser
          </button>
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
                  <span>{option.label}</span>
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
                      value={marker.color}
                      onChange={(event) => setMarkerColor(typeOption.code, event.target.value)}
                      className="color-input"
                      disabled={!canManageBrandTheme}
                    />
                    <input
                      type="text"
                      value={marker.color}
                      onChange={(event) => setMarkerColor(typeOption.code, event.target.value)}
                      placeholder="#ef7a49"
                      disabled={!canManageBrandTheme}
                    />
                  </div>
                </label>

                <div className="segmented-control">
                  <button
                    type="button"
                    className={marker.mode === 'preset' ? 'chip chip--active' : 'chip'}
                    onClick={() => setMarkerMode(typeOption.code, 'preset')}
                    disabled={!canManageBrandTheme}
                  >
                    Catalogue
                  </button>
                  <button
                    type="button"
                    className={marker.mode === 'custom' ? 'chip chip--active' : 'chip'}
                    onClick={() => setMarkerMode(typeOption.code, 'custom')}
                    disabled={!canManageBrandTheme || !marker.customSvg}
                  >
                    SVG custom
                  </button>
                </div>

                <div className="field-block">
                  <span>Icone preset</span>
                  <div className="marker-icon-grid">
                    {markerIconChoicesByType[typeOption.code].map((iconKey) => {
                      const previewStyle = { ...marker, mode: 'preset' as const, customSvg: null, icon: iconKey };
                      return (
                        <button
                          key={iconKey}
                          type="button"
                          className={marker.mode === 'preset' && marker.icon === iconKey ? 'marker-icon-option marker-icon-option--active' : 'marker-icon-option'}
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
                    <p>Seuls les super-admins peuvent charger un SVG personnalise. Les autres profils voient simplement le rendu applique.</p>
                  )}
                </details>
              </article>
              );
            })()}
          </div>
        </div>
      </article>

      )}

      {activeSection === 'preferences' && (
      <article className="panel-card">
        <div className="panel-heading">
          <h2>Langues</h2>
        </div>
        <div className="chip-grid">
          {['fr', 'en', 'de'].map((lang) => (
            <button
              key={lang}
              type="button"
              className={langPrefs.includes(lang) ? 'chip chip--active' : 'chip'}
              onClick={() => toggleLanguage(lang)}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </article>

      )}

      {/* 7.1 : carte d'état lisible « Diagnostic » à la place du dump « Runtime » de
          debug — l'URL Supabase brute n'est plus exposée (juste configurée/non). */}
      {activeSection === 'diagnostic' && (
      <article className="panel-card">
        <div className="panel-heading">
          <h2>Diagnostic</h2>
        </div>
        <div className="stack-list">
          <span>Mode démo : {demoMode ? 'actif' : 'inactif'}</span>
          <span>Base Supabase : {env.supabaseUrl ? 'configurée' : 'à renseigner'}</span>
          <span>Marque active : {theme.brandName}</span>
          <span>Source du logo : {logoSourceLabel}</span>
        </div>
      </article>

      )}

      {activeSection === 'ai' && role === 'super_admin' && (
        <article className="panel-card">
          <AiProviderSettings />
        </article>
      )}

        </div>
      </div>
    </section>
  );
}

export { SettingsPage };
