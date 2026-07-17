"use client";

// Modals d'authoring acteur (§61 rectifs PO points 4+5 ; §66 civilité + nom composé + e-mail requis).
// IDENTITÉ (§66) : le « Nom affiché » n'est PLUS éditable — il est COMPOSÉ depuis civilité +
//   prénom + nom (« Mme » + « Jocelyne » + « Lebon » → « Mme Jocelyne Lebon ») et rendu en LECTURE
//   SEULE (aperçu). On édite donc : civilité (select), prénom, nom/raison sociale. L'e-mail est
//   OBLIGATOIRE dans les DEUX modals (au moins une ligne canal `email` non vide).
// - CrmActorEditModal : identité (civilité/prénom/nom → nom affiché composé) + canaux de contact
//   (kind select sur le vocabulaire contact_kind, valeur, principal, suppression, ajout de ligne).
//   KISS assumé : les opérations canal sont appliquées UNE PAR UNE au submit
//   (saveActorChannel / deleteActorChannel), arrêt et erreur inline au premier échec —
//   le modal reste ouvert, rien n'est silencieux. Deux garanties de la revue :
//   1. retry idempotent — chaque op réussie est committée dans l'état local immédiatement
//      (delete → ligne retirée, insert → id posé, update → snapshot initial rafraîchi,
//      identité → baseline rafraîchie), un re-submit ne rejoue que les ops restantes ;
//   2. ordre des ops — celles qui POSENT un principal partent APRÈS celles qui le libèrent
//      (l'index unique partiel « un principal par kind » rejetterait sinon le déplacement
//      du badge vers une ligne plus haute dans la liste, 23505 brut).
// - CrmActorNewModal : création (display_name + établissement de rattachement REQUIS —
//   l'acteur entre dans le périmètre CRM par ce lien actor_object_role ; rôle serveur
//   par défaut 'operator', pas de sélecteur en v1) + canaux email/téléphone optionnels.
//   En cas d'échec d'un canal après création de l'acteur, le retry ne recrée PAS
//   l'acteur (réfs idempotentes).

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, MapPinCheck, Plus, Trash2, UserRound } from 'lucide-react';
import {
  deleteActorChannel,
  listContactKinds,
  listObjectContactSuggestions,
  saveActorChannel,
  saveCrmActor,
  uploadActorPhoto,
  type ActorCrmChannel,
  type ObjectAddressSuggestion,
} from '../../services/crm';
import { AddressBanCombobox } from '../object-editor/widgets/AddressBanCombobox';
import { geocodeAddress, type GeocodeHit } from '../object-editor/widgets/geocode-address';
import { CrmModal } from './CrmModal';

/** kind_code des canaux qui sont des ADRESSES POSTALES (édités dans le bloc « Adresses », pas les canaux). */
const ADDRESS_KIND = 'address';
const BAN_CONFIDENT_SCORE = 0.6;

/** Normalise une valeur de canal pour la déduplication (suggestions ⇄ lignes saisies). */
function normChannelValue(value: string): string {
  return value.trim().toLowerCase();
}

interface StructuredActorAddress {
  address1: string;
  postcode: string;
  city: string;
}

function compactAddressPart(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function formatActorAddressFromHit(hit: GeocodeHit): string {
  return composeActorAddressValue({ address1: hit.name, postcode: hit.postcode, city: hit.city });
}

export function parseActorAddressValue(value: string): StructuredActorAddress {
  const compact = compactAddressPart(value);
  if (!compact) {
    return { address1: '', postcode: '', city: '' };
  }
  const match = compact.match(/^(.*?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  if (!match) {
    return { address1: compact, postcode: '', city: '' };
  }
  return {
    address1: compactAddressPart(match[1].replace(/,$/, '')),
    postcode: match[2],
    city: compactAddressPart(match[3]),
  };
}

export function composeActorAddressValue(address: StructuredActorAddress): string {
  const address1 = compactAddressPart(address.address1);
  const cityLine = compactAddressPart([address.postcode, address.city].filter(Boolean).join(' '));
  return [address1, cityLine].filter(Boolean).join(', ');
}

function isStructuredActorAddressValue(value: string): boolean {
  const address = parseActorAddressValue(value);
  return Boolean(address.address1 && /^\d{5}$/.test(address.postcode) && address.city);
}

function isAddressRowDirty(row: ChannelRow): boolean {
  if (!row.value.trim()) {
    return false;
  }
  if (!row.id || !row.initial) {
    return true;
  }
  return row.value.trim() !== row.initial.value || row.kindCode !== row.initial.kindCode || row.isPrimary !== row.initial.isPrimary;
}

/**
 * Options de civilité (§66) — '' = aucune (organisation / raison sociale). Pas un ref_code :
 * `gender` est un champ texte libre côté acteur ; on borne l'UI à ces trois choix.
 */
const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '— (aucun / organisation)' },
  { value: 'Mme', label: 'Mme' },
  { value: 'M.', label: 'M.' },
];

/**
 * Nom affiché COMPOSÉ (§66) — civilité + prénom + nom, parties vides ignorées, jointes par un
 * espace. « Mme » + « Jocelyne » + « Lebon » → « Mme Jocelyne Lebon » ; une organisation sans
 * civilité ni prénom → sa seule raison sociale. C'est l'unique source du display_name envoyé :
 * le champ n'est PAS éditable directement (rendu en lecture seule comme aperçu).
 */
export function composeDisplayName(gender: string, firstName: string, lastName: string): string {
  return [gender.trim(), firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

/**
 * Aperçu local d'un fichier image — object URL si l'API est dispo (navigateur), sinon null
 * (jsdom/SSR n'implémente pas createObjectURL : l'aperçu est purement cosmétique, son absence
 * ne bloque rien). Révoque l'URL précédente pour ne pas fuiter de blob.
 */
function makePhotoPreview(file: File | null, previous: string | null): string | null {
  if (previous && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(previous);
  }
  if (!file) return null;
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

interface ChannelRow {
  /** Identité CLIENT stable (id serveur ou `new-N`) — clé React + cible des commits per-op. */
  key: string;
  /** null = nouvelle ligne (INSERT au submit si valeur non vide). */
  id: string | null;
  kindCode: string;
  value: string;
  isPrimary: boolean;
  deleted: boolean;
  /** État initial des lignes existantes — un UPDATE n'est envoyé que si modifié. */
  initial?: { kindCode: string; value: string; isPrimary: boolean };
}

/** Séquence des clés client des nouvelles lignes (unicité intra-modal suffisante). */
let newChannelRowSeq = 0;

function rowsFromChannels(channels: ActorCrmChannel[]): ChannelRow[] {
  return channels.map((channel) => ({
    key: channel.id,
    id: channel.id,
    kindCode: channel.kindCode,
    value: channel.value,
    isPrimary: channel.isPrimary,
    deleted: false,
    initial: { kindCode: channel.kindCode, value: channel.value, isPrimary: channel.isPrimary },
  }));
}

function ActorAddressRow({
  row,
  position,
  onChange,
  onDelete,
}: {
  row: ChannelRow;
  position: number;
  onChange: (value: string) => void;
  onDelete: () => void;
}) {
  const [geocoding, setGeocoding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const address = parseActorAddressValue(row.value);
  const isStructured = !row.value.trim() || isStructuredActorAddressValue(row.value);

  function applyHit(hit: GeocodeHit) {
    onChange(formatActorAddressFromHit(hit));
    setMessage(`Adresse standardisée : ${hit.label}`);
  }

  async function standardizeAddress() {
    setGeocoding(true);
    setMessage(null);
    try {
      const hit = await geocodeAddress({
        address1: address.address1,
        postcode: address.postcode,
        city: address.city,
      });
      if (!hit) {
        setMessage('Adresse introuvable.');
        return;
      }
      if (hit.score < BAN_CONFIDENT_SCORE) {
        setMessage(`Correspondance incertaine : ${hit.label}`);
        return;
      }
      applyHit(hit);
    } catch {
      setMessage('API adresse indisponible.');
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <div className="actor-address-row">
      <label className="crm-field actor-address-row__street">
        Adresse
        <AddressBanCombobox
          value={address.address1}
          onChange={(next) => onChange(composeActorAddressValue({ ...address, address1: next }))}
          onSelect={applyHit}
          placeholder="Rue, voie, lieu..."
          aria-label={`Adresse ${position + 1}`}
        />
      </label>
      <label className="crm-field">
        Code postal
        <input aria-label={`Code postal adresse ${position + 1}`} value={address.postcode} readOnly placeholder="974.." />
      </label>
      <label className="crm-field">
        Commune
        <input aria-label={`Commune adresse ${position + 1}`} value={address.city} readOnly placeholder="Commune" />
      </label>
      <button
        type="button"
        className="crm-btn sm actor-address-row__action"
        aria-label={`Standardiser l'adresse ${position + 1}`}
        disabled={!address.address1.trim() || geocoding}
        title="Standardiser via la Base Adresse Nationale"
        onClick={() => void standardizeAddress()}
      >
        <MapPinCheck size={12} aria-hidden /> {geocoding ? 'API...' : 'API'}
      </button>
      <button
        type="button"
        className="crm-btn sm actor-address-row__action"
        aria-label={`Supprimer l'adresse ${position + 1}`}
        onClick={onDelete}
      >
        <Trash2 size={12} aria-hidden />
      </button>
      {(message || !isStructured) && (
        <p className={isStructured ? 'actor-address-row__message' : 'actor-address-row__message is-warn'} role="status">
          {message ?? "Adresse à standardiser via l'API adresse."}
        </p>
      )}
    </div>
  );
}

export function CrmActorEditModal({
  actor,
  channels,
  addressSuggestions = [],
  onClose,
  onSaved,
}: {
  actor: {
    id: string;
    displayName: string;
    gender: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
  };
  channels: ActorCrmChannel[];
  /** Adresses des établissements rattachés — proposées en un clic dans le bloc « Adresses ». */
  addressSuggestions?: ObjectAddressSuggestion[];
  onClose: () => void;
  /** Appelé APRÈS écriture confirmée — la vue invalide fiche + annuaire. */
  onSaved: () => void;
}) {
  // §66 — identité éditée : civilité + prénom + nom ; le nom affiché en découle (lecture seule).
  const [gender, setGender] = useState(actor.gender ?? '');
  const [firstName, setFirstName] = useState(actor.firstName ?? '');
  const [lastName, setLastName] = useState(actor.lastName ?? '');
  const displayName = composeDisplayName(gender, firstName, lastName);
  const [rows, setRows] = useState<ChannelRow[]>(() => rowsFromChannels(channels));
  // Portrait (PO point 4) : nouveau fichier (uploadé au submit) OU retrait explicite.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  // Idempotence du retry : ne pas ré-uploader/re-effacer la photo si une op canal échoue ensuite.
  const sentPhotoRef = useRef(false);

  // Idempotence du retry (identité) : après un saveCrmActor réussi, la baseline de
  // comparaison devient l'état SAUVÉ (les props `actor` ne sont rafraîchies qu'à la
  // fermeture) — un re-submit après échec partiel sur les canaux ne re-soumet pas l'UPDATE.
  const savedIdentityRef = useRef<{
    displayName: string;
    gender: string;
    firstName: string | null;
    lastName: string | null;
  } | null>(null);

  const kindsQuery = useQuery({ queryKey: ['crm-contact-kinds'], queryFn: listContactKinds });
  const kinds = kindsQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Identité (un seul UPDATE, seulement si modifiée depuis la dernière baseline confirmée).
      //    §66 — civilité incluse ; le display_name est COMPOSÉ (civilité + prénom + nom).
      const baseline = savedIdentityRef.current ?? {
        displayName: actor.displayName,
        gender: actor.gender ?? '',
        firstName: actor.firstName,
        lastName: actor.lastName,
      };
      const identity = {
        displayName,
        gender,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      };
      const identityChanged =
        identity.displayName !== baseline.displayName ||
        identity.gender !== baseline.gender ||
        identity.firstName !== baseline.firstName ||
        identity.lastName !== baseline.lastName;
      if (identityChanged) {
        await saveCrmActor({ id: actor.id, ...identity });
        savedIdentityRef.current = identity;
      }

      // 2. Canaux, un par un (suppression / update si modifié / insert si nouvelle ligne).
      //    Chaque op réussie est committée dans l'état local IMMÉDIATEMENT (visuellement
      //    inerte : la ligne supprimée était déjà masquée, l'id/initial posés ne changent
      //    pas le rendu) — un retry après échec partiel ne rejoue que les ops restantes
      //    (sinon re-delete → P0002, ré-insert → doublon 23505 : retry impossible).
      interface ChannelOp {
        /** TRUE quand l'op POSE un principal (nouveau, gagné, ou déplacé vers un autre kind). */
        acquiresPrimary: boolean;
        run: () => Promise<void>;
      }
      const ops: ChannelOp[] = [];
      for (const row of rows) {
        if (row.id && row.deleted) {
          const channelId = row.id;
          ops.push({
            acquiresPrimary: false,
            run: async () => {
              await deleteActorChannel(channelId);
              setRows((current) => current.filter((r) => r.key !== row.key));
            },
          });
        } else if (
          row.id &&
          row.initial &&
          (row.value.trim() !== row.initial.value || row.kindCode !== row.initial.kindCode || row.isPrimary !== row.initial.isPrimary)
        ) {
          const channelId = row.id;
          const initial = row.initial;
          const saved = { kindCode: row.kindCode, value: row.value.trim(), isPrimary: row.isPrimary };
          ops.push({
            acquiresPrimary: saved.isPrimary && (!initial.isPrimary || initial.kindCode !== saved.kindCode),
            run: async () => {
              await saveActorChannel({ id: channelId, ...saved });
              setRows((current) => current.map((r) => (r.key === row.key ? { ...r, initial: saved } : r)));
            },
          });
        } else if (!row.id && !row.deleted && row.value.trim()) {
          const saved = { kindCode: row.kindCode, value: row.value.trim(), isPrimary: row.isPrimary };
          ops.push({
            acquiresPrimary: saved.isPrimary,
            run: async () => {
              const newId = await saveActorChannel({ actorId: actor.id, ...saved });
              setRows((current) => current.map((r) => (r.key === row.key ? { ...r, id: newId, initial: saved } : r)));
            },
          });
        }
      }
      // Ordre : les ops qui POSENT un principal partent APRÈS celles qui le libèrent
      // (delete / unset / update neutre) — sinon déplacer le badge vers une ligne plus
      // haute violerait l'index unique partiel « un principal par kind » (23505 brut).
      const ordered = [...ops.filter((op) => !op.acquiresPrimary), ...ops.filter((op) => op.acquiresPrimary)];
      for (const op of ordered) {
        await op.run();
      }

      // 3. Portrait (PO point 4) — ref-guarded : nouveau fichier ⇒ upload (pose photo_url) ;
      //    retrait explicite ⇒ saveCrmActor({photoUrl:''}). Un retry après échec partiel ne
      //    rejoue pas la photo déjà traitée.
      if (!sentPhotoRef.current) {
        if (photoFile) {
          await uploadActorPhoto(actor.id, photoFile);
          sentPhotoRef.current = true;
        } else if (photoCleared && actor.photoUrl) {
          await saveCrmActor({ id: actor.id, photoUrl: '' });
          sentPhotoRef.current = true;
        }
      }
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoCleared(false);
    setPhotoFile(file);
    setPhotoPreview((previous) => makePhotoPreview(file, previous));
  }

  // Aperçu affiché : nouvelle photo > photo existante (sauf retrait) > rien.
  const shownPhoto = photoPreview ?? (photoCleared ? null : actor.photoUrl);

  function patchRow(index: number, patch: Partial<ChannelRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Les ADRESSES (kind 'address') vivent dans un bloc dédié ; les canaux de COMMUNICATION
  // (téléphone, e-mail, web…) excluent ce kind. Tous restent des lignes `rows` (mêmes save/delete).
  const commKinds = kinds.filter((kind) => kind.code !== ADDRESS_KIND);
  const addressKindAvailable = kinds.some((kind) => kind.code === ADDRESS_KIND);
  const commEntries = rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => !entry.row.deleted && entry.row.kindCode !== ADDRESS_KIND);
  const addressEntries = rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => !entry.row.deleted && entry.row.kindCode === ADDRESS_KIND);
  const invalidAddressEntries = addressEntries.filter(
    ({ row }) => isAddressRowDirty(row) && !isStructuredActorAddressValue(row.value),
  );

  // Options du select kind (canaux de COMMUNICATION) : vocabulaire hors 'address' + le code
  // courant s'il n'y est pas (catalogue fail-soft → la ligne reste éditable sans perdre son kind).
  function commKindOptionsFor(row: ChannelRow) {
    if (row.kindCode && !commKinds.some((kind) => kind.code === row.kindCode)) {
      return [{ code: row.kindCode, name: row.kindCode }, ...commKinds];
    }
    return commKinds;
  }

  function addAddress(value = '') {
    setRows((current) => [
      ...current,
      { key: `new-${newChannelRowSeq++}`, id: null, kindCode: ADDRESS_KIND, value, isPrimary: false, deleted: false },
    ]);
  }

  // Suggestion d'adresse (établissement rattaché) : ajoute une ligne adresse pré-remplie, sauf doublon.
  function applyAddressSuggestion(value: string) {
    const exists = addressEntries.some((entry) => normChannelValue(entry.row.value) === normChannelValue(value));
    if (exists) return;
    addAddress(value);
  }

  // §66 — e-mail OBLIGATOIRE aussi à l'édition : l'acteur ne doit pas finir sans canal e-mail.
  const liveRows = rows.filter((row) => !row.deleted);
  const hasEmail = liveRows.some((row) => row.kindCode === 'email' && row.value.trim() !== '');
  // Nom affiché composé non vide (au moins un prénom OU un nom) + e-mail présent.
  const canSubmit = displayName.length > 0 && hasEmail && invalidAddressEntries.length === 0 && !saveMutation.isPending;

  return (
    <CrmModal
      title="Modifier l'acteur"
      variant="drawer"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="crm-btn primary" disabled={!canSubmit} onClick={() => saveMutation.mutate()}>
            Enregistrer
          </button>
        </>
      }
    >
      {/* §66 — civilité (select) ; le « Nom affiché » est COMPOSÉ et rendu en LECTURE SEULE. */}
      <label className="crm-field">
        Civilité
        <select
          className="crm-select"
          aria-label="Civilité"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
        >
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="crm-row2">
        <label className="crm-field">
          Prénom
          <input aria-label="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label className="crm-field">
          Nom / Raison sociale
          <input aria-label="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>
      {/* §66 — nom affiché COMPOSÉ, en LECTURE SEULE (pas de champ éditable). */}
      <p className="crm-field crm-display-name-preview">
        Nom affiché : {displayName ? <strong>{displayName}</strong> : <em>(renseignez prénom/nom)</em>}
      </p>

      {/* Portrait (PO point 4) : aperçu + choisir/changer + retirer (saveCrmActor photoUrl:''). */}
      <div className="crm-field">
        Portrait
        <div className="crm-photo-pick">
          <span className="crm-photo-pick__thumb" aria-hidden>
            {shownPhoto ? <img src={shownPhoto} alt="" /> : <UserRound size={20} />}
          </span>
          <label className="crm-btn sm crm-photo-pick__btn">
            <ImagePlus size={13} aria-hidden /> {shownPhoto ? 'Changer la photo' : 'Choisir une photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Portrait de l'acteur"
              onChange={onPickPhoto}
            />
          </label>
          {shownPhoto && (
            <button
              type="button"
              className="crm-btn sm"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview((previous) => makePhotoPreview(null, previous));
                setPhotoCleared(true);
              }}
            >
              Retirer la photo
            </button>
          )}
        </div>
      </div>

      <div className="crm-field">
        Canaux de contact
        {commEntries.map(({ row, index }) => (
          <div key={row.key} className="chan-row">
            <select
              className="crm-select"
              aria-label={`Type du canal ${index + 1}`}
              value={row.kindCode}
              onChange={(event) => patchRow(index, { kindCode: event.target.value })}
            >
              {commKindOptionsFor(row).map((kind) => (
                <option key={kind.code} value={kind.code}>
                  {kind.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Valeur du canal ${index + 1}`}
              placeholder="valeur (numéro, e-mail…)"
              value={row.value}
              onChange={(event) => patchRow(index, { value: event.target.value })}
            />
            <label className="chan-row__primary">
              <input
                type="checkbox"
                aria-label={`Canal ${index + 1} principal`}
                checked={row.isPrimary}
                onChange={(event) => patchRow(index, { isPrimary: event.target.checked })}
              />
              principal
            </label>
            <button
              type="button"
              className="crm-btn sm"
              aria-label={`Supprimer le canal ${index + 1}`}
              onClick={() => {
                // Nouvelle ligne : retrait immédiat ; ligne existante : marquée pour
                // suppression au submit (deleteActorChannel).
                if (row.id) patchRow(index, { deleted: true });
                else setRows((current) => current.filter((_, i) => i !== index));
              }}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="crm-btn sm"
          disabled={commKinds.length === 0}
          title={commKinds.length === 0 ? 'Vocabulaire des canaux indisponible' : undefined}
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: `new-${newChannelRowSeq++}`, id: null, kindCode: commKinds[0]?.code ?? '', value: '', isPrimary: false, deleted: false },
            ])
          }
        >
          <Plus size={12} aria-hidden /> Ajouter un canal
        </button>
        {/* §66 — e-mail OBLIGATOIRE : un acteur ne peut pas rester sans canal e-mail. */}
        {!hasEmail && (
          <p className="crm-field__hint" role="status">
            Un e-mail est obligatoire.
          </p>
        )}
      </div>

      {/* §19 — Adresses postales du prestataire (actor_channel kind 'address'). Plusieurs possibles :
          suggestions des établissements rattachés + saisie standardisée via la BAN. */}
      <div className="crm-field">
        Adresses
        {addressSuggestions.length > 0 && (
          <div className="chip-row crm-contact-suggestions">
            {addressSuggestions.map((suggestion) => {
              const already = addressEntries.some(
                (entry) => normChannelValue(entry.row.value) === normChannelValue(suggestion.address),
              );
              return (
                <button
                  key={`${suggestion.objectId}:${suggestion.address}`}
                  type="button"
                  className="crm-chip crm-suggestion-chip"
                  disabled={already}
                  title={already ? 'Déjà ajoutée' : `Ajouter l'adresse de ${suggestion.objectName}`}
                  onClick={() => applyAddressSuggestion(suggestion.address)}
                >
                  <Plus size={11} aria-hidden /> {suggestion.objectName} — {suggestion.address}
                </button>
              );
            })}
          </div>
        )}
        {addressEntries.map(({ row, index }, position) => (
          <ActorAddressRow
            key={row.key}
            row={row}
            position={position}
            onChange={(value) => patchRow(index, { value })}
            onDelete={() => {
              if (row.id) patchRow(index, { deleted: true });
              else setRows((current) => current.filter((_, i) => i !== index));
            }}
          />
        ))}
        {invalidAddressEntries.length > 0 && (
          <p className="crm-field__hint motion-status-enter" role="status">
            Standardisez chaque adresse modifiée avec la Base Adresse Nationale avant d&apos;enregistrer.
          </p>
        )}
        <button
          type="button"
          className="crm-btn sm"
          disabled={!addressKindAvailable}
          title={addressKindAvailable ? undefined : "Vocabulaire d'adresse indisponible"}
          onClick={() => addAddress()}
        >
          <Plus size={12} aria-hidden /> Ajouter une adresse
        </button>
      </div>

      {saveMutation.isError && (
        <div className="inline-alert motion-status-enter" role="alert">
          Échec de l&apos;enregistrement : {(saveMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}

export function CrmActorNewModal({
  objectOptions,
  onClose,
  onCreated,
}: {
  /** Datalist de rattachement — objets du périmètre (annuaire non filtré). */
  objectOptions: Array<{ objectId: string; objectName: string }>;
  onClose: () => void;
  /** Appelé APRÈS création confirmée avec l'id du nouvel acteur (refresh + ouverture fiche). */
  onCreated: (actorId: string) => void;
}) {
  // §66 — identité : civilité + prénom + nom ; le nom affiché en découle (non éditable).
  const [gender, setGender] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const displayName = composeDisplayName(gender, firstName, lastName);
  const [objectName, setObjectName] = useState('');
  // Repeater de canaux (PO point 3) : 1re ligne par défaut = e-mail (PO point 1 : requis).
  const [rows, setRows] = useState<ChannelRow[]>(() => [
    { key: `new-${newChannelRowSeq++}`, id: null, kindCode: 'email', value: '', isPrimary: true, deleted: false },
  ]);
  // Portrait (PO point 4) — fichier optionnel uploadé APRÈS la création de l'acteur.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Idempotence du retry : si l'acteur est créé mais qu'un canal/la photo échoue, re-soumettre
  // ne recrée ni l'acteur, ni les canaux déjà posés, ni la photo déjà uploadée.
  const createdActorRef = useRef<string | null>(null);
  const sentChannelKeysRef = useRef<Set<string>>(new Set());
  const sentPhotoRef = useRef(false);

  const kindsQuery = useQuery({ queryKey: ['crm-contact-kinds'], queryFn: listContactKinds });
  const kinds = kindsQuery.data ?? [];

  const resolvedObject =
    objectOptions.find((object) => object.objectName.trim().toLowerCase() === objectName.trim().toLowerCase()) ?? null;

  // Suggestions de contacts (PO point 2) : dès que l'établissement résout, on propose ses
  // contacts connus. Clé par objectId ; 42501/vide → [] (le bloc se masque, pas d'erreur).
  const suggestionsQuery = useQuery({
    queryKey: ['crm-contact-suggestions', resolvedObject?.objectId],
    queryFn: () => listObjectContactSuggestions(resolvedObject!.objectId),
    enabled: Boolean(resolvedObject),
  });
  const suggestions = suggestionsQuery.data ?? [];

  function patchRow(index: number, patch: Partial<ChannelRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow(kindCode: string, value = '') {
    setRows((current) => [
      ...current,
      { key: `new-${newChannelRowSeq++}`, id: null, kindCode, value, isPrimary: false, deleted: false },
    ]);
  }

  // Clic sur une suggestion : ajoute une ligne pré-remplie SAUF si (kind, valeur) déjà présent.
  function applySuggestion(kindCode: string, value: string) {
    const exists = rows.some(
      (row) => !row.deleted && row.kindCode === kindCode && normChannelValue(row.value) === normChannelValue(value),
    );
    if (exists) return;
    addRow(kindCode, value);
  }

  const liveRows = rows.filter((row) => !row.deleted);
  const hasEmail = liveRows.some((row) => row.kindCode === 'email' && row.value.trim() !== '');

  function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoError(null);
    setPhotoFile(file);
    setPhotoPreview((previous) => makePhotoPreview(file, previous));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedObject) throw new Error('Établissement non résolu');
      const actorId =
        createdActorRef.current ??
        (await saveCrmActor({
          // §66 — display_name COMPOSÉ (civilité + prénom + nom) ; gender envoyé s'il est choisi.
          displayName,
          ...(gender ? { gender } : {}),
          ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
          ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
          objectId: resolvedObject.objectId,
        }));
      createdActorRef.current = actorId;

      // Canaux : chaque ligne non vide → un INSERT (idempotent via sentChannelKeysRef).
      for (const row of rows) {
        if (row.deleted || row.value.trim() === '') continue;
        if (sentChannelKeysRef.current.has(row.key)) continue;
        await saveActorChannel({
          actorId,
          kindCode: row.kindCode,
          value: row.value.trim(),
          isPrimary: row.isPrimary,
        });
        sentChannelKeysRef.current.add(row.key);
      }

      // Photo (ref-guarded) : un échec d'upload ne perd pas l'acteur/les canaux déjà créés —
      // erreur inline, mais on rouvre quand même la fiche (l'acteur existe).
      if (photoFile && !sentPhotoRef.current) {
        try {
          await uploadActorPhoto(actorId, photoFile);
          sentPhotoRef.current = true;
        } catch (err) {
          setPhotoError(err instanceof Error ? err.message : 'Échec du téléversement du portrait.');
        }
      }
      return actorId;
    },
    onSuccess: (actorId) => {
      onCreated(actorId);
    },
  });

  // PO point 1 / §66 : nom affiché composé non vide (prénom OU nom) + établissement résolu +
  // e-mail OBLIGATOIRE (au moins une ligne e-mail non vide).
  const canSubmit = displayName.length > 0 && Boolean(resolvedObject) && hasEmail && !createMutation.isPending;

  function kindOptionsFor(row: ChannelRow) {
    if (row.kindCode && !kinds.some((kind) => kind.code === row.kindCode)) {
      return [{ code: row.kindCode, name: row.kindCode }, ...kinds];
    }
    return kinds;
  }

  return (
    <CrmModal
      title="Nouvel acteur"
      variant="drawer"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="crm-btn primary" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
            Créer
          </button>
        </>
      }
    >
      {/* §66 — civilité (select) ; le « Nom affiché » est COMPOSÉ et rendu en LECTURE SEULE. */}
      <label className="crm-field">
        Civilité
        <select
          className="crm-select"
          aria-label="Civilité"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
        >
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="crm-row2">
        <label className="crm-field">
          Prénom
          <input aria-label="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label className="crm-field">
          Nom / Raison sociale
          <input aria-label="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>
      {/* §66 — nom affiché COMPOSÉ, en LECTURE SEULE (pas de champ éditable). */}
      <p className="crm-field crm-display-name-preview">
        Nom affiché : {displayName ? <strong>{displayName}</strong> : <em>(renseignez prénom/nom)</em>}
      </p>

      {/* Portrait (PO point 4) : aperçu + bouton de choix de fichier (optionnel). */}
      <div className="crm-field">
        Portrait (optionnel)
        <div className="crm-photo-pick">
          <span className="crm-photo-pick__thumb" aria-hidden>
            {photoPreview ? <img src={photoPreview} alt="" /> : <UserRound size={20} />}
          </span>
          <label className="crm-btn sm crm-photo-pick__btn">
            <ImagePlus size={13} aria-hidden /> {photoFile ? 'Changer la photo' : 'Choisir une photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Portrait de l'acteur"
              onChange={onPickPhoto}
            />
          </label>
        </div>
        <p className="crm-field__hint">
          La photo est redimensionnée et ses métadonnées EXIF supprimées avant stockage.
        </p>
      </div>

      <label className="crm-field">
        Établissement de rattachement (requis)
        <input
          aria-label="Établissement de rattachement"
          placeholder="Établissement (nom exact)"
          list="crm-actor-new-objects"
          value={objectName}
          onChange={(event) => setObjectName(event.target.value)}
        />
        <datalist id="crm-actor-new-objects">
          {objectOptions.map((object) => (
            <option key={object.objectId} value={object.objectName} />
          ))}
        </datalist>
      </label>
      {objectName.trim() !== '' && !resolvedObject && (
        <p className="crm-field__hint">Établissement introuvable dans l&apos;annuaire — choisissez un nom de la liste.</p>
      )}
      <p className="crm-field__hint">L&apos;acteur entre dans votre périmètre CRM par ce lien (rôle : exploitant).</p>

      {/* Suggestions de contacts de l'établissement (PO point 2) — ajout en un clic. */}
      {resolvedObject && suggestions.length > 0 && (
        <div className="crm-field">
          Contacts de l&apos;établissement
          <div className="chip-row crm-contact-suggestions">
            {suggestions.map((suggestion) => {
              const already = liveRows.some(
                (row) =>
                  row.kindCode === suggestion.kindCode &&
                  normChannelValue(row.value) === normChannelValue(suggestion.value),
              );
              return (
                <button
                  key={`${suggestion.kindCode}:${suggestion.value}`}
                  type="button"
                  className="crm-chip crm-suggestion-chip"
                  disabled={already}
                  title={already ? 'Déjà ajouté' : `Ajouter (${suggestion.source})`}
                  onClick={() => applySuggestion(suggestion.kindCode, suggestion.value)}
                >
                  <Plus size={11} aria-hidden /> {suggestion.kindName} {suggestion.value}
                  <small className="crm-suggestion-chip__src">{suggestion.source}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Repeater de canaux (PO points 1+3) : kind + valeur + principal + supprimer. */}
      <div className="crm-field">
        Contacts
        {rows.map((row, index) =>
          row.deleted ? null : (
            <div key={row.key} className="chan-row">
              <select
                className="crm-select"
                aria-label={`Type du canal ${index + 1}`}
                value={row.kindCode}
                onChange={(event) => patchRow(index, { kindCode: event.target.value })}
              >
                {kindOptionsFor(row).map((kind) => (
                  <option key={kind.code} value={kind.code}>
                    {kind.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Valeur du canal ${index + 1}`}
                placeholder={row.kindCode === 'email' ? 'adresse e-mail' : 'valeur (numéro, adresse…)'}
                value={row.value}
                onChange={(event) => patchRow(index, { value: event.target.value })}
              />
              <label className="chan-row__primary">
                <input
                  type="checkbox"
                  aria-label={`Canal ${index + 1} principal`}
                  checked={row.isPrimary}
                  onChange={(event) => patchRow(index, { isPrimary: event.target.checked })}
                />
                principal
              </label>
              <button
                type="button"
                className="crm-btn sm"
                aria-label={`Supprimer le canal ${index + 1}`}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          ),
        )}
        <button type="button" className="crm-btn sm" onClick={() => addRow(kinds[0]?.code ?? 'phone')}>
          <Plus size={12} aria-hidden /> Ajouter un contact
        </button>
        {!hasEmail && (
          <p className="crm-field__hint" role="status">
            Un e-mail est obligatoire.
          </p>
        )}
      </div>

      {photoError && (
        <div className="inline-alert" role="alert">
          {photoError}
        </div>
      )}
      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la création : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
