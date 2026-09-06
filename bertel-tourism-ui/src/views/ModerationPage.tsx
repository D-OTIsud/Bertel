"use client";

// Modération P2.1 (§120) — file de suggestions terrain (`pending_change`) câblée aux RPCs
// api.list/approve/reject_pending_change (services/rpc → services/moderation). Vue split avant /
// après + actions Approuver / Rejeter (motif obligatoire en modale). EmptyState honnête conservé.
//
// 18a/D9 — la file porte désormais DEUX populations :
//   • les propositions internes (contributeurs §120/§122), sans `submissionId` : affichage plat ;
//   • les ENVOIS du portail partenaire, groupés sous un en-tête (acteur, message, gestes groupés).
// Et surtout : 5 des 7 rubriques ouvertes au partenaire n'ont AUCUN writer automatique. Les
// approuver n'écrit rien dans la fiche — l'office doit les recopier à la main dans l'éditeur.
// Le serveur ne peut pas vérifier ce report, seulement l'IMPUTER (attested_by/attested_at) :
// cet écran est donc la seule vraie garde. Si l'attestation se cochait par réflexe, le
// partenaire lirait « validée » sur une fiche publique qui n'a pas bougé, sans moyen de le voir.
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPendingChanges,
  approvePendingChange,
  rejectPendingChange,
  approveFicheSubmission,
  rejectFicheSubmission,
} from '../services/rpc';
import type { FicheSubmissionApproval } from '../services/moderation';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { diffWords } from '../lib/diff-words';
import type { PendingChangeItem } from '../types/domain';

/** D6 — rendu du diff : Avant = same+del (<del> rouge), Après = same+ins (<ins> vert). */
function DiffText({ before, after, side }: { before: string; after: string; side: 'before' | 'after' }) {
  const segments = diffWords(before, after);
  const visible = segments.filter((segment) => segment.type === 'same' || segment.type === (side === 'before' ? 'del' : 'ins'));
  if (visible.length === 0) return <p className="mod-diff">—</p>;
  return (
    <p className="mod-diff">
      {visible.map((segment, index) =>
        segment.type === 'same' ? (
          <span key={index}>{segment.text}</span>
        ) : segment.type === 'del' ? (
          <del key={index}>{segment.text}</del>
        ) : (
          <ins key={index}>{segment.text}</ins>
        ),
      )}
    </p>
  );
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'En attente' },
  { value: 'applied', label: 'Approuvées' },
  // 18a/D9 — SANS cette entrée, les lignes attestées deviennent INTROUVABLES. La §7 est le
  // premier producteur de `pending_change.status='approved'` (aucune autre migration ne l'écrit) :
  // une ligne attestée quitte « En attente » et n'apparaît ni sous « Approuvées » (qui interroge
  // `applied`) ni sous « Rejetées ». Et approve/reject lèvent 22023 sur toute ligne non pending :
  // l'agent ne pourrait plus relire ce qu'il a signé, ni vérifier qui l'a signé. Le libellé dit
  // « report manuel » parce que c'est ce que ce statut SIGNIFIE : validé par un humain, jamais
  // écrit par la machine.
  { value: 'approved', label: 'Approuvées (report manuel)' },
  { value: 'rejected', label: 'Rejetées' },
];

/**
 * Les statuts de `pending_change` sont des valeurs de base, en anglais. Les afficher bruts
 * (« · approved ») demande à l'agent de traduire, et surtout d'INFÉRER ce que « approved »
 * veut dire ici : validé par un humain qui a reporté à la main, jamais écrit par la machine.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  applied: 'Appliquée automatiquement',
  approved: 'Validée sur attestation (report manuel)',
  rejected: 'Refusée',
};

/** Une ligne encore ouverte : le serveur peut renvoyer des lignes résolues (filtres non-pending). */
function isPending(item: PendingChangeItem): boolean {
  return !item.status || item.status === 'pending';
}

/**
 * FAIL-CLOSED. `manualApply === false` est la SEULE valeur qui autorise l'approbation ordinaire
 * (« la machine applique »). `true` et `undefined` — fixtures démo, serveur d'avant la §7 —
 * exigent l'attestation : traiter l'inconnu comme automatique rendrait l'approbation en un clic,
 * c'est-à-dire précisément le trou que D9 ferme.
 */
function requiresAttestation(item: PendingChangeItem): boolean {
  return item.manualApply !== false;
}

interface SubmissionGroup {
  id: string;
  actorLabel: string | null;
  note: string | null;
  objectName: string;
  submittedAt: string;
  items: PendingChangeItem[];
}

/** Une entrée de la file : un envoi groupé, ou une proposition interne isolée. */
type QueueEntry =
  | { kind: 'submission'; group: SubmissionGroup }
  | { kind: 'item'; item: PendingChangeItem };

/**
 * Construit la file en PRÉSERVANT l'ordre du serveur (submitted_at DESC) — un seul flux, pas
 * deux populations empilées. Un groupe occupe la position de sa PREMIÈRE ligne ; les lignes
 * suivantes du même envoi le rejoignent sans déplacer quoi que ce soit. Rendre tous les envois
 * puis toutes les lignes isolées ferait passer une proposition interne du jour SOUS un envoi
 * partenaire plus ancien : l'ordre affiché ne serait plus celui qui a été demandé.
 */
function buildQueue(items: PendingChangeItem[]): QueueEntry[] {
  const entries: QueueEntry[] = [];
  const byId = new Map<string, SubmissionGroup>();
  for (const item of items) {
    const submissionId = item.submissionId;
    if (!submissionId) {
      entries.push({ kind: 'item', item });
      continue;
    }
    let group = byId.get(submissionId);
    if (!group) {
      group = {
        id: submissionId,
        actorLabel: item.actorLabel ?? null,
        note: item.submissionNote ?? null,
        objectName: item.objectName,
        submittedAt: item.submittedAt,
        items: [],
      };
      byId.set(submissionId, group);
      entries.push({ kind: 'submission', group });
    }
    group.items.push(item);
  }
  return entries;
}

/** Le libellé d'une rubrique, tel que l'agent le lit dans la file. */
function rubricLabel(item: PendingChangeItem): string {
  return item.field || item.targetTable || 'rubrique';
}

/**
 * Ce que le RPC groupé vient RÉELLEMENT de faire, en une phrase. Sans elle, un « Tout approuver »
 * partiel est indiscernable d'un « Tout approuver » complet : le panneau rétrécit, et rien ne dit
 * si des rubriques sont restées en attente.
 */
function describeApproval(result: FicheSubmissionApproval): string {
  const parts: string[] = [];
  if (result.appliedCount > 0) {
    parts.push(`${result.appliedCount} modification${result.appliedCount > 1 ? 's' : ''} appliquée${result.appliedCount > 1 ? 's' : ''} automatiquement`);
  }
  if (result.approvedManualCount > 0) {
    parts.push(`${result.approvedManualCount} validée${result.approvedManualCount > 1 ? 's' : ''} sur votre attestation`);
  }
  if (result.skippedManualCount > 0) {
    parts.push(`${result.skippedManualCount} laissée${result.skippedManualCount > 1 ? 's' : ''} en attente`);
  }
  if (parts.length === 0) return 'Envoi traité : aucune modification n’a changé d’état.';
  const suffix = result.skippedManualCount > 0 ? ' L’envoi reste ouvert.' : '';
  return `Envoi traité : ${parts.join(', ')}.${suffix}`;
}

/** Cible du refus : une ligne isolée, ou l'envoi entier (deux RPC, une seule modale de motif). */
type RejectTarget =
  | { kind: 'item'; id: string; label: string }
  | { kind: 'submission'; id: string; label: string };

export default function ModerationPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // 18a — Task 19 ouvre /moderation?object=<id> depuis le kanban CRM. Sans cette lecture, la
  // page afficherait toute la file de l'organisation et l'agent trancherait la ligne d'un AUTRE
  // partenaire en croyant traiter celle qu'il vient d'ouvrir.
  const objectFilter = searchParams.get('object');
  const [status, setStatus] = useState<string>('pending');
  // D6 : « Approuver » n'est plus fire-and-forget — confirmation nommant fiche + champ.
  const [approveTarget, setApproveTarget] = useState<PendingChangeItem | null>(null);
  // D9 : l'attestation du report manuel. Repart TOUJOURS décochée à chaque ouverture — une case
  // qui garderait son état d'une ligne à l'autre signerait la suivante sans qu'on y pense.
  const [attested, setAttested] = useState(false);
  const [approveGroup, setApproveGroup] = useState<SubmissionGroup | null>(null);
  const [includeManual, setIncludeManual] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Compte rendu du dernier geste groupé (compteurs du RPC). Distinct de `actionError` : ce
  // n'est pas une panne, c'est ce qui vient d'être fait — et sans lui rien ne le dit.
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const query = useQuery({
    // `objectFilter` FAIT PARTIE de la clé : la navigation Next entre ?object=A et ?object=B ne
    // remonte pas le composant, et React Query re-servirait alors le cache de l'objet précédent.
    queryKey: ['pending-changes', status, objectFilter],
    queryFn: () => listPendingChanges(status, objectFilter),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['pending-changes'] });
    // Le trigger de résolution (§8) tourne sur pending_change : la dernière ligne tranchée —
    // unitaire ou groupée — bascule la tâche CRM de l'envoi en `done`. Un kanban laissé sur son
    // cache afficherait une tâche déjà close.
    void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, appliedManually }: { id: string; appliedManually: boolean }) =>
      approvePendingChange(id, null, appliedManually),
    onSuccess: () => {
      setActionError(null);
      setActionNotice(null);
      closeApprove();
      refresh();
    },
    onError: (error) => {
      closeApprove();
      setActionError(error instanceof Error ? error.message : "Échec de l'approbation.");
    },
  });

  const approveGroupMutation = useMutation({
    mutationFn: ({ id, withManual }: { id: string; withManual: boolean }) =>
      approveFicheSubmission(id, null, withManual),
    onSuccess: (result) => {
      setActionError(null);
      // Le RPC ne traite pas forcément tout : ses trois compteurs sont le SEUL moyen pour
      // l'agent de savoir ce qui est parti et ce qui reste. Les jeter rendait le geste muet.
      setActionNotice(describeApproval(result));
      closeApproveGroup();
      refresh();
    },
    onError: (error) => {
      closeApproveGroup();
      setActionNotice(null);
      setActionError(error instanceof Error ? error.message : "Échec de l'approbation de l’envoi.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (target: RejectTarget & { note: string }) =>
      target.kind === 'submission'
        ? rejectFicheSubmission(target.id, target.note)
        : rejectPendingChange(target.id, target.note),
    onSuccess: () => {
      setActionError(null);
      setActionNotice(null);
      closeReject();
      refresh();
    },
    onError: (error) => setNoteError(error instanceof Error ? error.message : 'Échec du refus.'),
  });

  function closeApprove() {
    setApproveTarget(null);
    setAttested(false);
  }

  function closeApproveGroup() {
    setApproveGroup(null);
    setIncludeManual(false);
  }

  function closeReject() {
    setRejectTarget(null);
    setRejectNote('');
    setNoteError(null);
  }

  function submitReject() {
    if (!rejectTarget) return;
    if (rejectNote.trim().length === 0) {
      setNoteError('Un motif de refus est obligatoire.');
      return;
    }
    rejectMutation.mutate({ ...rejectTarget, note: rejectNote.trim() });
  }

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement de la modération…</section>;
  }

  if (query.isError) {
    return (
      <section className="p-4">
        <EmptyState
          mode="error"
          title="Modération indisponible"
          description={(query.error as Error).message}
          action={{ label: 'Réessayer', onClick: () => query.refetch() }}
        />
      </section>
    );
  }

  const items = query.data ?? [];
  const queue = buildQueue(items);

  /** Une ligne de la file — identique qu'elle appartienne à un envoi ou non. */
  function renderCard(item: PendingChangeItem) {
    const resolved = item.status && item.status !== 'pending';
    return (
      <article key={item.id} className="split-card">
        <div>
          <span className="facet-title">Avant</span>
          <DiffText before={item.before ?? ''} after={item.after ?? ''} side="before" />
        </div>
        <div>
          <span className="facet-title">Après</span>
          <DiffText before={item.before ?? ''} after={item.after ?? ''} side="after" />
        </div>
        <footer className="split-card__footer">
          {/* D6 : métadonnées sur deux lignes (fiche/champ puis auteur/date) au lieu
              d'une seule ligne tassée. */}
          <span className="mod-meta">
            <span className="mod-meta__subject">
              <strong>{item.objectName}</strong> · {rubricLabel(item)}
              {resolved ? ` · ${STATUS_LABELS[item.status ?? ''] ?? item.status}` : ''}
            </span>
            <span className="mod-meta__byline">
              {item.author} · {item.submittedAt}
            </span>
            {/* Le filtre « Approuvées (report manuel) » n'a de sens que si la ligne dit QUI a
                signé et QUAND : sans cela il rend les lignes relisibles, pas imputables — or
                c'est exactement l'imputabilité qui justifie son existence (D9). */}
            {resolved && item.reviewerLabel && (
              <span className="mod-meta__byline">
                {item.status === 'rejected' ? 'Refusée par' : 'Validée par'} {item.reviewerLabel}
                {item.reviewedAt ? ` le ${item.reviewedAt}` : ''}
              </span>
            )}
            {resolved && item.reviewNote && <span className="mod-meta__byline">Motif : {item.reviewNote}</span>}
            {/* D9 : le sort de la ligne est ANNONCÉ avant le clic. Sans cette mention, un
                « Approuver » sur une rubrique sans writer se lit comme les autres, et l'agent
                découvre le refus 22023 sans comprendre ce qu'on attend de lui. */}
            {!resolved && requiresAttestation(item) && (
              <span className="mod-meta__manual">
                À reporter à la main dans l’éditeur — approuver n’écrira rien dans la fiche.
              </span>
            )}
          </span>
          {!resolved && (
            <div className="inline-actions">
              <button
                type="button"
                className="primary-button"
                disabled={approveMutation.isPending}
                onClick={() => {
                  setAttested(false);
                  setApproveTarget(item);
                }}
              >
                Approuver
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setRejectTarget({ kind: 'item', id: item.id, label: item.objectName });
                  setRejectNote('');
                  setNoteError(null);
                }}
              >
                Rejeter
              </button>
            </div>
          )}
        </footer>
      </article>
    );
  }

  const approveManual = approveTarget ? requiresAttestation(approveTarget) : false;
  const groupPending = approveGroup ? approveGroup.items.filter(isPending) : [];
  const groupManual = groupPending.filter(requiresAttestation);
  const groupManualCount = groupManual.length;
  const groupAutoCount = groupPending.length - groupManualCount;

  return (
    <section className="page-grid p-4">
      <article className="hero-panel">
        <span className="eyebrow">Contrôle</span>
        <h2>Suggestions à modérer</h2>
        <p>Vue avant / après pour valider ou refuser les modifications soumises sur les fiches de votre organisation.</p>
        <div className="inline-actions" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="mod-status">Statut</label>
          <select
            id="mod-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="select-input"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {/* Une file restreinte à une fiche doit le DIRE : sinon elle se lit comme la file
            entière, et son EmptyState comme « plus rien à modérer » pour toute l'organisation. */}
        {objectFilter && (
          <p className="mod-scope">
            File restreinte à une seule fiche. <a href="/moderation">Voir toute la file</a>
          </p>
        )}
      </article>

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

      {actionNotice && (
        <p role="status" className="mod-notice">
          {actionNotice}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          mode="coming-soon"
          title="Aucune suggestion à modérer"
          description={
            objectFilter
              ? 'Rien à valider pour ce statut sur cette fiche. Les autres fiches peuvent avoir des suggestions en attente.'
              : 'Rien à valider pour ce statut. Les suggestions terrain en attente apparaîtront ici.'
          }
        />
      ) : (
        <div className="stack-list">
          {queue.map((entry) => {
            if (entry.kind === 'item') return renderCard(entry.item);
            const group = entry.group;
            const pendingCount = group.items.filter(isPending).length;
            return (
              <section key={group.id} className="panel-card mod-submission">
                <header className="mod-submission__head">
                  <span className="mod-meta">
                    <span className="mod-meta__subject">
                      <strong>{group.actorLabel ?? 'Partenaire'}</strong> · {group.objectName}
                    </span>
                    <span className="mod-meta__byline">
                      Envoi du {group.submittedAt} · {group.items.length} modification
                      {group.items.length > 1 ? 's' : ''}
                    </span>
                  </span>
                  {pendingCount > 0 && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={approveGroupMutation.isPending}
                        onClick={() => {
                          setIncludeManual(false);
                          setApproveGroup(group);
                        }}
                      >
                        Tout approuver
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setRejectTarget({
                            kind: 'submission',
                            id: group.id,
                            label: group.actorLabel ?? group.objectName,
                          });
                          setRejectNote('');
                          setNoteError(null);
                        }}
                      >
                        Tout rejeter
                      </button>
                    </div>
                  )}
                </header>
                {/* Le message du partenaire : c'est souvent lui qui explique la modification. */}
                {group.note && <p className="mod-submission__note">« {group.note} »</p>}
                <div className="stack-list">{group.items.map(renderCard)}</div>
              </section>
            );
          })}
        </div>
      )}

      {/* D6 : approbation confirmée — nomme la fiche et le champ, applique l'écriture
          structurée whitelistée (metadata.rpc) seulement après confirmation.
          D9 : sur une rubrique SANS writer, la confirmation devient une DÉCLARATION — case à
          cocher obligatoire, et bouton renommé pour que le geste ne se confonde pas avec
          l'approbation ordinaire. */}
      <ConfirmDialog
        open={approveTarget !== null}
        title="Approuver la suggestion"
        message={
          approveTarget ? (
            approveManual ? (
              <>
                <strong>{approveTarget.field || approveTarget.targetTable}</strong> sur{' '}
                <strong>{approveTarget.objectName}</strong> n’a pas de report automatique : valider
                n’écrira <strong>rien</strong> dans la fiche. Tant qu’elle n’est pas reportée dans
                l’éditeur, la fiche publique reste inchangée — pendant que le partenaire, lui, lit
                « validée ».
              </>
            ) : (
              <>
                La modification de <strong>{approveTarget.field || approveTarget.targetTable}</strong> sur{' '}
                <strong>{approveTarget.objectName}</strong> sera appliquée à la fiche.
              </>
            )
          ) : (
            ''
          )
        }
        // Le libellé de la case reprend MOT POUR MOT celui du refus 22023 côté serveur
        // (« puis cochez « j'ai reporté ces modifications » ») : un agent qui prend ce refus
        // doit retrouver à l'écran exactement ce que le message lui désigne.
        attestation={
          approveManual
            ? {
                label: 'Je certifie que j’ai reporté ces modifications dans l’éditeur.',
                checked: attested,
                onChange: setAttested,
                required: true,
                hint: 'Sans ce report, « validée » serait faux : la fiche publique ne bougerait pas et le partenaire n’aurait aucun moyen de le voir.',
              }
            : undefined
        }
        confirmLabel={approveManual ? 'Certifier et valider' : 'Approuver'}
        cancelLabel="Annuler"
        busy={approveMutation.isPending}
        onCancel={closeApprove}
        onConfirm={() => {
          if (!approveTarget) return;
          // Ceinture et bretelles : ConfirmDialog bloque déjà, mais l'attestation ne doit
          // jamais pouvoir partir à `true` sans le geste qui la signe.
          if (approveManual && !attested) return;
          approveMutation.mutate({ id: approveTarget.id, appliedManually: approveManual && attested });
        }}
      />

      {/* D9 — geste groupé, et c'est LUI le vrai danger : il certifie N rubriques d'un clic.
          Sa friction est donc alignée sur l'unitaire, pas allégée.
          • Dès qu'une rubrique manuelle est en jeu, la certification est OBLIGATOIRE — la
            version précédente ne l'exigeait que sur un envoi 100 % manuel, si bien qu'un envoi
            mixte se validait en deux clics pendant que le message POUSSAIT à cocher.
          • Les rubriques certifiées sont NOMMÉES : on ne signe pas un compteur, on signe une
            liste qu'on peut relire.
          • Le bouton devient « Certifier et valider », comme à l'unité.
          Le chemin « n'appliquer que l'automatique » reste ouvert : ligne par ligne, avec ses
          propres gardes. « Tout approuver » veut dire tout. */}
      <ConfirmDialog
        open={approveGroup !== null}
        title="Approuver l’envoi"
        message={
          approveGroup ? (
            <>
              Envoi de <strong>{approveGroup.actorLabel ?? 'ce partenaire'}</strong> sur{' '}
              <strong>{approveGroup.objectName}</strong> : {groupAutoCount} modification
              {groupAutoCount > 1 ? 's' : ''} applicable{groupAutoCount > 1 ? 's' : ''} automatiquement
              {groupManualCount > 0 ? (
                <>
                  , et {groupManualCount > 1 ? `${groupManualCount} rubriques` : '1 rubrique'} sans report
                  automatique : <strong>{groupManual.map(rubricLabel).join(', ')}</strong>. Valider
                  n’écrira <strong>rien</strong> pour {groupManualCount > 1 ? 'celles-ci' : 'celle-ci'} —
                  vous certifiez les avoir déjà reportées dans l’éditeur.
                </>
              ) : (
                '.'
              )}
            </>
          ) : (
            ''
          )
        }
        attestation={
          groupManualCount > 0
            ? {
                label: `Je certifie que j’ai reporté ces modifications dans l’éditeur : ${groupManual.map(rubricLabel).join(', ')}.`,
                checked: includeManual,
                onChange: setIncludeManual,
                // OBLIGATOIRE dès qu'une rubrique manuelle est en jeu. Décochée, cette case
                // ferait sauter ces rubriques côté RPC — un « Tout approuver » qui n'approuve
                // pas tout, et que rien à l'écran ne distinguait d'un geste complet.
                required: true,
                hint:
                  groupAutoCount === 0
                    ? 'Toutes les rubriques de cet envoi sont à reporter à la main : sans cette certification, rien ne serait validé.'
                    : 'Pour n’appliquer que les rubriques automatiques, traitez-les ligne par ligne : « Tout approuver » vaut pour tout l’envoi.',
              }
            : undefined
        }
        confirmLabel={groupManualCount > 0 ? 'Certifier et valider' : 'Approuver'}
        cancelLabel="Annuler"
        busy={approveGroupMutation.isPending}
        onCancel={closeApproveGroup}
        onConfirm={() => {
          if (!approveGroup) return;
          // Ceinture et bretelles, comme à l'unité : l'attestation groupée ne doit jamais
          // pouvoir partir à `true` sans le geste qui la signe.
          if (groupManualCount > 0 && !includeManual) return;
          approveGroupMutation.mutate({ id: approveGroup.id, withManual: includeManual });
        }}
      />

      <Modal
        title={rejectTarget?.kind === 'submission' ? 'Refuser l’envoi' : 'Refuser la suggestion'}
        open={!!rejectTarget}
        onOpenChange={(next) => { if (!next) closeReject(); }}
        footer={
          <>
            <button type="button" className="ghost-button" onClick={closeReject}>
              Annuler
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={rejectMutation.isPending}
              onClick={submitReject}
            >
              Confirmer le refus
            </button>
          </>
        }
      >
        {rejectTarget && (
          <p>
            {rejectTarget.kind === 'submission' ? (
              <>
                Refuser <strong>toutes</strong> les modifications encore en attente de l’envoi de{' '}
                <strong>{rejectTarget.label}</strong>. Le motif est communiqué et tracé.
              </>
            ) : (
              <>
                Refuser la modification soumise sur <strong>{rejectTarget.label}</strong>. Le motif est communiqué et
                tracé.
              </>
            )}
          </p>
        )}
        <label htmlFor="mod-reject-note">Motif du refus</label>
        <textarea
          id="mod-reject-note"
          value={rejectNote}
          onChange={(event) => {
            setRejectNote(event.target.value);
            if (noteError) setNoteError(null);
          }}
          rows={3}
          className="text-input"
        />
        {noteError && (
          <p role="alert" className="form-error">
            {noteError}
          </p>
        )}
      </Modal>
    </section>
  );
}

export { ModerationPage };
