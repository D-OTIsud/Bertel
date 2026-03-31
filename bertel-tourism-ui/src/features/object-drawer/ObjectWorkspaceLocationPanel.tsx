import { useEffect, useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import type { ObjectWorkspaceLocationModule } from '../../services/object-workspace-parser';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import {
  dedupeLocationReferenceValues,
  normalizeLocationReferenceKey,
  normalizeLocationReferenceText,
  normalizeLocationReferenceValue,
  normalizePostcodeValue,
} from '../../lib/location-normalization';
import type { LocationReferenceOptions } from '../../services/location-reference';
import { useLocationReferenceOptionsQuery } from '../../hooks/useExplorerQueries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceLocationPanelProps {
  value: ObjectWorkspaceLocationModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  onChange: (patch: Partial<ObjectWorkspaceLocationModule['main']>) => void;
  onSave: () => void;
}

interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

interface StructuredAddress {
  number: string;
  suffix: string;
  street: string;
  complement: string;
}

type ReferenceFieldKind = 'postcode' | 'city' | 'lieuDit' | 'zoneTouristique';

const DEFAULT_LOCATION_CENTER: LocationCoordinates = {
  latitude: -21.130568,
  longitude: 55.536384,
};

const DEFAULT_LOCATION_ZOOM = 10.2;
const FOCUSED_LOCATION_ZOOM = 15;
const EMPTY_LOCATION_REFERENCE_OPTIONS: LocationReferenceOptions = {
  postcodes: [],
  cities: [],
  lieuDits: [],
  touristZones: [],
};
const KNOWN_ADDRESS_SUFFIXES = new Set(['bis', 'ter', 'quater', 'quinquies', 'sexies']);
const KNOWN_STREET_TOKENS = new Set([
  'allee',
  'all',
  'av',
  'avenue',
  'bd',
  'boulevard',
  'carreau',
  'chemin',
  'ch',
  'cours',
  'impasse',
  'imp',
  'lotissement',
  'montee',
  'passage',
  'place',
  'pl',
  'quartier',
  'residence',
  'route',
  'rte',
  'rue',
  'ruelle',
  'sentier',
  'square',
  'traverse',
  'vc',
  'voie',
]);

function parseCoordinate(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCoordinates(value: ObjectWorkspaceLocationModule['main']): LocationCoordinates | null {
  const latitude = parseCoordinate(value.latitude);
  const longitude = parseCoordinate(value.longitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  return { latitude, longitude };
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeAddressNumberInput(value: string): string {
  return value.replace(/[^\d/\-\s]/g, '');
}

function normalizeAddressNumber(value: string): string {
  return normalizeWhitespace(sanitizeAddressNumberInput(value))
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/^[/-]+|[/-]+$/g, '');
}

function normalizeAddressSuffix(value: string): string {
  const compact = value.replace(/\s+/g, '').trim();
  if (!compact) {
    return '';
  }

  const lower = compact.toLowerCase();
  if (KNOWN_ADDRESS_SUFFIXES.has(lower)) {
    return lower;
  }

  return compact.toUpperCase();
}

function normalizeAddressToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}

function looksLikeAddressSuffix(value: string, mode: 'compact' | 'spaced'): boolean {
  const normalized = normalizeAddressToken(value);
  if (!normalized || KNOWN_STREET_TOKENS.has(normalized)) {
    return false;
  }

  if (KNOWN_ADDRESS_SUFFIXES.has(normalized)) {
    return true;
  }

  if (mode === 'spaced') {
    return /^[a-z]$/.test(normalized) || /^[a-z]{1,2}(bis|ter)$/.test(normalized);
  }

  return /^[a-z]{1,3}$/.test(normalized)
    || /^[a-z]{1,3}(bis|ter|quater|quinquies|sexies)$/.test(normalized);
}

function coordinatesMatch(left: LocationCoordinates, right: LocationCoordinates): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.000001
    && Math.abs(left.longitude - right.longitude) < 0.000001;
}

function parseStructuredAddress(value: ObjectWorkspaceLocationModule['main']): StructuredAddress {
  if (value.address2 || value.address1Suite || value.address3) {
    return {
      number: value.address1.trim(),
      suffix: value.address1Suite.trim(),
      street: value.address2.trim(),
      complement: value.address3.trim(),
    };
  }

  const combined = value.address1.trim();
  if (!combined) {
    return {
      number: '',
      suffix: '',
      street: '',
      complement: value.address3.trim(),
    };
  }

  const compactMatch = combined.match(/^(\d+)([A-Za-z]+)\s+(.+)$/);
  if (compactMatch && looksLikeAddressSuffix(compactMatch[2] ?? '', 'compact')) {
    return {
      number: compactMatch[1] ?? '',
      suffix: (compactMatch[2] ?? '').trim(),
      street: (compactMatch[3] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  const spacedMatch = combined.match(/^(\d+)\s+([A-Za-z]+)\s+(.+)$/);
  if (spacedMatch && looksLikeAddressSuffix(spacedMatch[2] ?? '', 'spaced')) {
    return {
      number: spacedMatch[1] ?? '',
      suffix: (spacedMatch[2] ?? '').trim(),
      street: (spacedMatch[3] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  const simpleMatch = combined.match(/^(\d+)\s+(.+)$/);
  if (simpleMatch) {
    return {
      number: simpleMatch[1] ?? '',
      suffix: '',
      street: (simpleMatch[2] ?? '').trim(),
      complement: value.address3.trim(),
    };
  }

  return {
    number: '',
    suffix: value.address1Suite.trim(),
    street: combined,
    complement: value.address3.trim(),
  };
}

function buildStreetLine(address: StructuredAddress): string {
  const firstLine = [address.number, address.suffix, address.street].filter(Boolean).join(' ').trim();
  return [firstLine, address.complement].filter(Boolean).join(', ');
}

function buildAddressPreview(address: StructuredAddress, value: ObjectWorkspaceLocationModule['main']): string {
  const cityLine = [value.postcode, value.city].filter(Boolean).join(' ');
  return [buildStreetLine(address), value.lieuDit.trim(), cityLine].filter(Boolean).join(' · ');
}

function buildReferenceOptions(
  values: readonly string[],
  currentValue: string,
  kind: ReferenceFieldKind,
): string[] {
  return dedupeLocationReferenceValues(
    [...values, currentValue],
    kind === 'postcode' ? 'postcode' : 'text',
  );
}

function resolveReferenceValue(
  value: string,
  options: readonly string[],
  kind: ReferenceFieldKind,
): { normalizedValue: string; resolvedValue: string; hasExistingMatch: boolean } {
  const referenceKind = kind === 'postcode' ? 'postcode' : 'text';
  const normalizedValue = normalizeLocationReferenceValue(value, referenceKind);
  if (!normalizedValue) {
    return {
      normalizedValue: '',
      resolvedValue: '',
      hasExistingMatch: false,
    };
  }

  const normalizedKey = kind === 'postcode'
    ? normalizedValue
    : normalizeLocationReferenceKey(normalizedValue);

  const matchedOption = options.find((option) => (
    kind === 'postcode'
      ? normalizePostcodeValue(option) === normalizedKey
      : normalizeLocationReferenceKey(option) === normalizedKey
  ));

  return {
    normalizedValue,
    resolvedValue: matchedOption ?? normalizedValue,
    hasExistingMatch: Boolean(matchedOption),
  };
}

function describeReferenceHint(
  rawValue: string,
  resolvedValue: string,
  hasExistingMatch: boolean,
): string | null {
  if (!resolvedValue) {
    return null;
  }

  if (!hasExistingMatch) {
    if (rawValue === resolvedValue) {
      return 'Nouvelle valeur: elle rejoindra la liste apres enregistrement.';
    }

    return `Nouvelle valeur: elle sera normalisee en "${resolvedValue}" puis ajoutee a la liste apres enregistrement.`;
  }

  if (rawValue !== resolvedValue) {
    return `Forme retenue: "${resolvedValue}".`;
  }

  return null;
}

const CUSTOM_VALUE_SENTINEL = '__custom__';

interface LocationReferenceInputProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: readonly string[];
  kind: ReferenceFieldKind;
  onChange: (nextValue: string) => void;
}

function LocationReferenceInput({
  id,
  label,
  value,
  placeholder,
  options,
  kind,
  onChange,
}: LocationReferenceInputProps) {
  const corpusOptions = useMemo(
    () => dedupeLocationReferenceValues(
      options,
      kind === 'postcode' ? 'postcode' : 'text',
    ),
    [kind, options],
  );
  const resolvedState = useMemo(
    () => resolveReferenceValue(value, corpusOptions, kind),
    [corpusOptions, kind, value],
  );
  const trimmedValue = value.trim();
  const selectValue = trimmedValue
    ? (resolvedState.hasExistingMatch ? resolvedState.resolvedValue : trimmedValue)
    : '';
  const fieldOptions = useMemo(
    () => buildReferenceOptions(options, selectValue, kind),
    [kind, options, selectValue],
  );
  const isCustomValue = trimmedValue !== '' && !resolvedState.hasExistingMatch;
  const [manualEntryRequested, setManualEntryRequested] = useState(false);
  const customMode = manualEntryRequested || isCustomValue;

  useEffect(() => {
    if (!trimmedValue) {
      setManualEntryRequested(false);
    }
  }, [trimmedValue]);

  function handleSelectChange(nextValue: string) {
    if (nextValue === CUSTOM_VALUE_SENTINEL) {
      setManualEntryRequested(true);
      return;
    }

    setManualEntryRequested(false);
    onChange(nextValue);
  }

  function handleCustomBlur() {
    const resolved = resolvedState.resolvedValue;
    onChange(resolved);

    if (resolvedState.hasExistingMatch && resolved) {
      setManualEntryRequested(false);
    }
  }

  const helperText = customMode
    ? describeReferenceHint(trimmedValue, resolvedState.resolvedValue, resolvedState.hasExistingMatch)
    : (
      trimmedValue && resolvedState.hasExistingMatch && trimmedValue !== resolvedState.resolvedValue
        ? `Forme retenue: "${resolvedState.resolvedValue}".`
        : null
    );

  return (
    <div className="drawer-inline-field">
      <Label htmlFor={id}>{label}</Label>
      <div className="drawer-reference-field">
        {customMode ? (
          <>
            <Input
              id={id}
              autoComplete="off"
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(
                kind === 'postcode'
                  ? normalizePostcodeValue(event.target.value)
                  : event.target.value,
              )}
              onBlur={handleCustomBlur}
            />
            <button
              type="button"
              className="drawer-reference-field__toggle"
              onClick={() => {
                setManualEntryRequested(false);
                if (isCustomValue) {
                  onChange('');
                }
              }}
            >
              Revenir a la liste
            </button>
          </>
        ) : (
          <>
            <Select
              id={id}
              value={selectValue}
              onChange={(event) => handleSelectChange(event.target.value)}
            >
              <option value="">{placeholder}</option>
              {fieldOptions.filter(Boolean).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={CUSTOM_VALUE_SENTINEL}>Saisir manuellement...</option>
            </Select>
          </>
        )}
        {helperText && (
          <small className="drawer-reference-field__hint">{helperText}</small>
        )}
      </div>
    </div>
  );
}

export function ObjectWorkspaceLocationPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  onChange,
  onSave,
}: ObjectWorkspaceLocationPanelProps) {
  const locationReferencesQuery = useLocationReferenceOptionsQuery();
  const parsedCoordinates = useMemo(
    () => readCoordinates(value.main),
    [value.main.latitude, value.main.longitude],
  );
  const structuredAddress = useMemo(
    () => parseStructuredAddress(value.main),
    [value.main.address1, value.main.address1Suite, value.main.address2, value.main.address3],
  );
  const addressPreview = useMemo(
    () => buildAddressPreview(structuredAddress, value.main),
    [structuredAddress, value.main.city, value.main.lieuDit, value.main.postcode],
  );
  const coordinatesAreBlank = value.main.latitude.trim() === '' && value.main.longitude.trim() === '';
  const hasRelatedPlaces = value.places.length > 0;
  const hasZoneCards = value.zoneCodes.length > 0;
  const canMovePin = !saveAction.disabled && !saving;
  const locationReferences = locationReferencesQuery.data ?? EMPTY_LOCATION_REFERENCE_OPTIONS;
  const [mapCoordinates, setMapCoordinates] = useState<LocationCoordinates>(
    parsedCoordinates ?? DEFAULT_LOCATION_CENTER,
  );
  const [pendingCoordinates, setPendingCoordinates] = useState<LocationCoordinates | null>(null);
  const [directionDialogOpen, setDirectionDialogOpen] = useState(false);
  const [directionDraft, setDirectionDraft] = useState(value.main.direction);

  useEffect(() => {
    if (parsedCoordinates) {
      setMapCoordinates(parsedCoordinates);
      return;
    }

    if (coordinatesAreBlank) {
      setMapCoordinates(DEFAULT_LOCATION_CENTER);
    }
  }, [coordinatesAreBlank, parsedCoordinates]);

  useEffect(() => {
    if (!directionDialogOpen) {
      setDirectionDraft(value.main.direction);
    }
  }, [directionDialogOpen, value.main.direction]);

  function patchStructuredAddress(patch: Partial<StructuredAddress>) {
    const nextAddress = {
      ...structuredAddress,
      ...patch,
    };

    onChange({
      address1: nextAddress.number,
      address1Suite: nextAddress.suffix,
      address2: nextAddress.street,
      address3: nextAddress.complement,
    });
  }

  function normalizeStructuredField(field: keyof StructuredAddress) {
    if (field === 'number') {
      patchStructuredAddress({ number: normalizeAddressNumber(structuredAddress.number) });
      return;
    }

    if (field === 'suffix') {
      patchStructuredAddress({ suffix: normalizeAddressSuffix(structuredAddress.suffix) });
      return;
    }

    if (field === 'street') {
      patchStructuredAddress({ street: normalizeLocationReferenceText(structuredAddress.street) });
      return;
    }

    patchStructuredAddress({ [field]: normalizeWhitespace(structuredAddress[field]) });
  }

  function handleMarkerDragEnd(nextCoordinates: LocationCoordinates) {
    if (parsedCoordinates && coordinatesMatch(parsedCoordinates, nextCoordinates)) {
      return;
    }

    if (!parsedCoordinates && coordinatesMatch(DEFAULT_LOCATION_CENTER, nextCoordinates)) {
      return;
    }

    setPendingCoordinates(nextCoordinates);
  }

  function confirmCoordinateUpdate() {
    if (!pendingCoordinates) {
      return;
    }

    onChange({
      latitude: formatCoordinate(pendingCoordinates.latitude),
      longitude: formatCoordinate(pendingCoordinates.longitude),
    });
    setPendingCoordinates(null);
  }

  function cancelCoordinateUpdate() {
    setPendingCoordinates(null);
  }

  function openDirectionDialog() {
    setDirectionDraft(value.main.direction);
    setDirectionDialogOpen(true);
  }

  function closeDirectionDialog() {
    setDirectionDialogOpen(false);
    setDirectionDraft(value.main.direction);
  }

  function applyDirectionDialog() {
    onChange({ direction: directionDraft });
    setDirectionDialogOpen(false);
  }

  return (
    <>
      <div className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <h2>Localisation</h2>
            </div>
            <div className="stack-list text-right">
              <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
                {saving ? 'Enregistrement...' : saveAction.label}
              </Button>
              {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
              {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
            </div>
          </div>

          <div className="drawer-location-form-grid">
            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-number">Numero</Label>
              <Input
                id="workspace-location-number"
                inputMode="numeric"
                value={structuredAddress.number}
                placeholder="Ex. 12 ou 12-14"
                onChange={(event) => patchStructuredAddress({ number: sanitizeAddressNumberInput(event.target.value) })}
                onBlur={() => normalizeStructuredField('number')}
              />
            </div>

            <div className="drawer-inline-field">
              <Label htmlFor="workspace-location-number-suffix">Suffixe du numero</Label>
              <Input
                id="workspace-location-number-suffix"
                value={structuredAddress.suffix}
                placeholder="Ex. bis, ter, A"
                onChange={(event) => patchStructuredAddress({ suffix: event.target.value })}
                onBlur={() => normalizeStructuredField('suffix')}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-street">Voie</Label>
              <Input
                id="workspace-location-street"
                value={structuredAddress.street}
                placeholder="Ex. Rue Alfred Picard"
                onChange={(event) => patchStructuredAddress({ street: event.target.value })}
                onBlur={() => normalizeStructuredField('street')}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-complement">Complement d'adresse</Label>
              <Input
                id="workspace-location-complement"
                value={structuredAddress.complement}
                placeholder="Ex. Batiment A, appartement 4"
                onChange={(event) => patchStructuredAddress({ complement: event.target.value })}
                onBlur={() => normalizeStructuredField('complement')}
              />
            </div>

            {addressPreview && (
              <div className="drawer-location-preview-inline">
                <span>{addressPreview}</span>
              </div>
            )}

            <LocationReferenceInput
              id="workspace-location-postcode"
              label="Code postal"
              kind="postcode"
              value={value.main.postcode}
              placeholder="Selectionnez ou saisissez 5 chiffres"
              options={locationReferences.postcodes}
              onChange={(postcode) => onChange({ postcode })}
            />

            <LocationReferenceInput
              id="workspace-location-city"
              label="Ville"
              kind="city"
              value={value.main.city}
              placeholder="Selectionnez ou ajoutez une ville"
              options={locationReferences.cities}
              onChange={(city) => onChange({ city })}
            />

            <LocationReferenceInput
              id="workspace-location-lieudit"
              label="Quartier / lieu-dit"
              kind="lieuDit"
              value={value.main.lieuDit}
              placeholder="Selectionnez ou ajoutez un lieu-dit"
              options={locationReferences.lieuDits}
              onChange={(lieuDit) => onChange({ lieuDit })}
            />

            <LocationReferenceInput
              id="workspace-location-zone"
              label="Zone touristique"
              kind="zoneTouristique"
              value={value.main.zoneTouristique}
              placeholder="Selectionnez ou ajoutez une zone"
              options={locationReferences.touristZones}
              onChange={(zoneTouristique) => onChange({ zoneTouristique })}
            />

            {locationReferencesQuery.isError && (
              <p className="drawer-location-reference-status">
                Les listes existantes sont temporairement indisponibles. La saisie reste possible et sera normalisee au mieux.
              </p>
            )}

            <div className="drawer-inline-field drawer-inline-field--full">
              <Label htmlFor="workspace-location-direction">Indications d'acces</Label>
              <button
                type="button"
                id="workspace-location-direction"
                aria-label="Modifier les indications d'acces"
                aria-haspopup="dialog"
                className="flex h-11 w-full items-center overflow-hidden rounded-xl border border-input bg-background/80 px-4 py-2 text-left text-sm shadow-sm ring-offset-background transition-colors hover:border-[rgba(23,107,106,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={openDirectionDialog}
              >
                <span className={`block w-full truncate whitespace-nowrap ${value.main.direction.trim() ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {value.main.direction.trim() || "Ex. Depuis Saint-Pierre, au rond-point apres la station..."}
                </span>
              </button>
            </div>
          </div>
        </article>

        <article className="panel-card panel-card--nested drawer-location-map-card">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Carte</span>
            </div>
          </div>

          <div className="drawer-location-map-toolbar">
            <div className="drawer-inline-field drawer-inline-field--compact">
              <Label htmlFor="workspace-location-latitude">Latitude</Label>
              <Input
                id="workspace-location-latitude"
                value={value.main.latitude}
                placeholder="-21.203853"
                onChange={(event) => onChange({ latitude: event.target.value })}
              />
            </div>

            <div className="drawer-inline-field drawer-inline-field--compact">
              <Label htmlFor="workspace-location-longitude">Longitude</Label>
              <Input
                id="workspace-location-longitude"
                value={value.main.longitude}
                placeholder="55.578477"
                onChange={(event) => onChange({ longitude: event.target.value })}
              />
            </div>
          </div>

          <p className="drawer-location-map-note">
            Modifiez les coordonnees ou deplacez l epingle.
          </p>

          <div className="detail-map-card__canvas drawer-location-map-card__canvas">
            <Map
              key={`${mapCoordinates.latitude}:${mapCoordinates.longitude}`}
              reuseMaps
              mapStyle={DEFAULT_APP_MAP_STYLE}
              initialViewState={{
                longitude: mapCoordinates.longitude,
                latitude: mapCoordinates.latitude,
                zoom: parsedCoordinates ? FOCUSED_LOCATION_ZOOM : DEFAULT_LOCATION_ZOOM,
              }}
              attributionControl={false}
              scrollZoom
              dragPan
              dragRotate={false}
              doubleClickZoom
              touchZoomRotate
              keyboard
              style={{ width: '100%', height: '100%' }}
            >
              <Marker
                longitude={mapCoordinates.longitude}
                latitude={mapCoordinates.latitude}
                anchor="bottom"
                draggable={canMovePin}
                onDragEnd={(event) => handleMarkerDragEnd({
                  latitude: event.lngLat.lat,
                  longitude: event.lngLat.lng,
                })}
              >
                <span className="drawer-location-pin" aria-hidden="true">
                  <span className="drawer-location-pin__glyph">
                    <MapPinned size={18} />
                  </span>
                </span>
              </Marker>
              <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
            </Map>
          </div>
        </article>

        {(hasRelatedPlaces || hasZoneCards) && (
          <div className="drawer-grid">
            {hasRelatedPlaces && (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Lieux rattaches</span>
                <div className="stack-list">
                  {value.places.map((place) => (
                    <article key={place.id} className="panel-card panel-card--nested">
                      <strong>{place.label}</strong>
                      <p>{place.locationLabel || 'Aucune localisation dediee remontee.'}</p>
                      {place.isPrimary && <small>Lieu principal</small>}
                    </article>
                  ))}
                </div>
              </article>
            )}

            {hasZoneCards && (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Zones touristiques</span>
                <div className="stack-list">
                  {value.zoneCodes.map((code) => (
                    <span key={code} className="drawer-header__chip">{code}</span>
                  ))}
                </div>
              </article>
            )}
          </div>
        )}
      </div>

      <Dialog open={pendingCoordinates !== null} onOpenChange={(nextOpen) => { if (!nextOpen) cancelCoordinateUpdate(); }}>
        <DialogContent className="max-w-md" showClose={false}>
          <DialogTitle>Confirmer la nouvelle position</DialogTitle>
          <DialogDescription>
            Le deplacement de l epingle mettra a jour la latitude et la longitude de cette fiche.
          </DialogDescription>
          {pendingCoordinates && (
            <div className="drawer-grid">
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Position actuelle</span>
                <strong>
                  {parsedCoordinates
                    ? `${formatCoordinate(parsedCoordinates.latitude)}, ${formatCoordinate(parsedCoordinates.longitude)}`
                    : 'Aucune coordonnee'}
                </strong>
              </article>
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Nouvelle position</span>
                <strong>{formatCoordinate(pendingCoordinates.latitude)}, {formatCoordinate(pendingCoordinates.longitude)}</strong>
              </article>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={cancelCoordinateUpdate}>
              Annuler
            </Button>
            <Button type="button" onClick={confirmCoordinateUpdate}>
              Confirmer la position
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={directionDialogOpen} onOpenChange={(nextOpen) => { if (!nextOpen) closeDirectionDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Modifier les indications d'acces</DialogTitle>
          <DialogDescription>
            Redigez des consignes d'acces plus detaillees dans un espace plus confortable.
          </DialogDescription>
          <div className="grid gap-3">
            <Label htmlFor="workspace-location-direction-dialog">Indications d'acces</Label>
            <textarea
              id="workspace-location-direction-dialog"
              className="textarea-field min-h-[280px]"
              value={directionDraft}
              placeholder="Ex. Depuis Saint-Pierre, au rond-point apres la station..."
              onChange={(event) => setDirectionDraft(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={closeDirectionDialog}>
              Annuler
            </Button>
            <Button type="button" onClick={applyDirectionDialog}>
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
