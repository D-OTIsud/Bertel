"use client";

// Modals d'authoring acteur (§61 rectifs PO points 4+5).
// - CrmActorEditModal : identité (display/first/last) + canaux de contact (kind select
//   sur le vocabulaire contact_kind, valeur, principal, suppression, ajout de ligne).
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
import { Plus, Trash2 } from 'lucide-react';
import {
  deleteActorChannel,
  listContactKinds,
  saveActorChannel,
  saveCrmActor,
  type ActorCrmChannel,
} from '../../services/crm';
import { CrmModal } from './CrmModal';

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

export function CrmActorEditModal({
  actor,
  channels,
  onClose,
  onSaved,
}: {
  actor: { id: string; displayName: string; firstName: string | null; lastName: string | null };
  channels: ActorCrmChannel[];
  onClose: () => void;
  /** Appelé APRÈS écriture confirmée — la vue invalide fiche + annuaire. */
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(actor.displayName);
  const [firstName, setFirstName] = useState(actor.firstName ?? '');
  const [lastName, setLastName] = useState(actor.lastName ?? '');
  const [rows, setRows] = useState<ChannelRow[]>(() => rowsFromChannels(channels));

  // Idempotence du retry (identité) : après un saveCrmActor réussi, la baseline de
  // comparaison devient l'état SAUVÉ (les props `actor` ne sont rafraîchies qu'à la
  // fermeture) — un re-submit après échec partiel sur les canaux ne re-soumet pas l'UPDATE.
  const savedIdentityRef = useRef<{ displayName: string; firstName: string | null; lastName: string | null } | null>(null);

  const kindsQuery = useQuery({ queryKey: ['crm-contact-kinds'], queryFn: listContactKinds });
  const kinds = kindsQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Identité (un seul UPDATE, seulement si modifiée depuis la dernière baseline confirmée).
      const baseline = savedIdentityRef.current ?? {
        displayName: actor.displayName,
        firstName: actor.firstName,
        lastName: actor.lastName,
      };
      const identity = {
        displayName: displayName.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      };
      const identityChanged =
        identity.displayName !== baseline.displayName ||
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
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  function patchRow(index: number, patch: Partial<ChannelRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Options du select kind : vocabulaire + le code courant de la ligne s'il n'y est pas
  // (catalogue en échec fail-soft → la ligne reste éditable sans perdre son kind).
  function kindOptionsFor(row: ChannelRow) {
    if (row.kindCode && !kinds.some((kind) => kind.code === row.kindCode)) {
      return [{ code: row.kindCode, name: row.kindCode }, ...kinds];
    }
    return kinds;
  }

  const canSubmit = displayName.trim().length > 0 && !saveMutation.isPending;

  return (
    <CrmModal
      title="Modifier l'acteur"
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
      <label className="crm-field">
        Nom affiché
        <input aria-label="Nom affiché" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <div className="crm-row2">
        <label className="crm-field">
          Prénom
          <input aria-label="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label className="crm-field">
          Nom
          <input aria-label="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>

      <div className="crm-field">
        Canaux de contact
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
                placeholder="valeur (adresse, numéro…)"
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
          ),
        )}
        <button
          type="button"
          className="crm-btn sm"
          disabled={kinds.length === 0}
          title={kinds.length === 0 ? 'Vocabulaire des canaux indisponible' : undefined}
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: `new-${newChannelRowSeq++}`, id: null, kindCode: kinds[0]?.code ?? '', value: '', isPrimary: false, deleted: false },
            ])
          }
        >
          <Plus size={12} aria-hidden /> Ajouter un canal
        </button>
      </div>

      {saveMutation.isError && (
        <div className="inline-alert" role="alert">
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
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [objectName, setObjectName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Idempotence du retry : si l'acteur est créé mais qu'un canal échoue, re-soumettre ne
  // recrée ni l'acteur ni les canaux déjà posés.
  const createdActorRef = useRef<string | null>(null);
  const sentEmailRef = useRef(false);
  const sentPhoneRef = useRef(false);

  const resolvedObject =
    objectOptions.find((object) => object.objectName.trim().toLowerCase() === objectName.trim().toLowerCase()) ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedObject) throw new Error('Établissement non résolu');
      const actorId =
        createdActorRef.current ??
        (await saveCrmActor({
          displayName: displayName.trim(),
          ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
          ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
          objectId: resolvedObject.objectId,
        }));
      createdActorRef.current = actorId;
      if (email.trim() && !sentEmailRef.current) {
        await saveActorChannel({ actorId, kindCode: 'email', value: email.trim(), isPrimary: true });
        sentEmailRef.current = true;
      }
      if (phone.trim() && !sentPhoneRef.current) {
        await saveActorChannel({ actorId, kindCode: 'phone', value: phone.trim(), isPrimary: !email.trim() });
        sentPhoneRef.current = true;
      }
      return actorId;
    },
    onSuccess: (actorId) => {
      onCreated(actorId);
    },
  });

  const canSubmit = displayName.trim().length > 0 && Boolean(resolvedObject) && !createMutation.isPending;

  return (
    <CrmModal
      title="Nouvel acteur"
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
      <label className="crm-field">
        Nom affiché (requis)
        <input
          aria-label="Nom affiché"
          placeholder="Mme/M. Prénom Nom ou raison sociale"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <div className="crm-row2">
        <label className="crm-field">
          Prénom
          <input aria-label="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label className="crm-field">
          Nom
          <input aria-label="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
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

      <div className="crm-row2">
        <label className="crm-field">
          E-mail (optionnel)
          <input aria-label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="crm-field">
          Téléphone (optionnel)
          <input aria-label="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
      </div>

      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la création : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
