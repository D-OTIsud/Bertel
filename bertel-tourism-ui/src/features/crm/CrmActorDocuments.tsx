"use client";

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, FileText, Trash2, Upload } from 'lucide-react';
import {
  listActorSupport,
  listObjectDocumentTypes,
  type ActorSupportDocument,
} from '../../services/crm';
import {
  deleteActorDocument,
  getActorDocumentUrl,
  promoteActorDocument,
  uploadActorDocument,
} from '../../services/actor-documents';
import { useSupabaseAccessToken } from '../../hooks/useSupabaseAccessToken';
import { CRM_READ_ONLY_REASON, formatDocumentSize, formatShort } from './crm-view-utils';
import { CrmModal } from './CrmModal';

interface LinkedObjectOption {
  objectId: string;
  objectName: string;
}

interface PromotionDraft {
  document: ActorSupportDocument;
  objectId: string;
  roleCode: string;
  title: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

/** Zone d'ajout dédiée au rail droit de l'onglet Documents. */
export function CrmActorDocumentDropzone({
  actorId,
  canWrite,
}: {
  actorId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accessToken = useSupabaseAccessToken();
  const [isDragging, setIsDragging] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm-actor-support', actorId] });
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!accessToken) throw new Error('Session expirée. Reconnectez-vous pour ajouter un document.');
      return uploadActorDocument({ actorId, file, accessToken });
    },
    onSuccess: () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
      void refresh();
    },
  });

  const canUpload = canWrite && Boolean(accessToken) && !uploadMutation.isPending;
  const disabledReason = !canWrite
    ? CRM_READ_ONLY_REASON
    : !accessToken
      ? 'Session indisponible. Reconnectez-vous pour ajouter un document.'
      : undefined;

  function addFile(file: File | undefined) {
    if (file && canUpload) uploadMutation.mutate(file);
  }

  return (
    <section className="rcard crm-actor-docs-upload" aria-labelledby="crm-actor-documents-upload-title">
      <h4 id="crm-actor-documents-upload-title">Ajouter un document</h4>
      <button
        type="button"
        className={'crm-actor-docs-dropzone' + (isDragging ? ' is-dragging' : '')}
        disabled={!canUpload}
        title={disabledReason}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (canUpload) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFile(event.dataTransfer.files?.[0]);
        }}
      >
        <Upload size={22} aria-hidden />
        <strong>{uploadMutation.isPending ? 'Ajout en cours…' : 'Déposez un fichier ici'}</strong>
        <span>ou cliquez pour le sélectionner</span>
        <small>JPG, PNG, WebP · 2 000 px max<br />PDF · 5 Mo max</small>
      </button>
      <input
        ref={fileInputRef}
        className="crm-actor-docs__file-input"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        aria-label="Sélectionner un document à ajouter"
        onChange={(event) => addFile(event.target.files?.[0])}
      />
      {uploadMutation.isError && (
        <div className="inline-alert" role="alert">{errorMessage(uploadMutation.error)}</div>
      )}
    </section>
  );
}

/**
 * Bibliothèque privée d'un acteur en accompagnement. Un fichier reste indépendant de tout
 * établissement jusqu'à son transfert explicite vers object_document.
 */
export function CrmActorDocuments({
  actorId,
  canWrite,
  objects,
}: {
  actorId: string;
  canWrite: boolean;
  objects: LinkedObjectOption[];
}) {
  const queryClient = useQueryClient();
  const accessToken = useSupabaseAccessToken();
  const [promotion, setPromotion] = useState<PromotionDraft | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const supportQuery = useQuery({
    queryKey: ['crm-actor-support', actorId],
    queryFn: () => listActorSupport(actorId),
  });
  const documentTypesQuery = useQuery({
    queryKey: ['crm-object-document-types'],
    queryFn: listObjectDocumentTypes,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm-actor-support', actorId] });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      if (!accessToken) throw new Error('Session expirée.');
      await deleteActorDocument({ actorId, documentId, accessToken });
    },
    onSuccess: () => void refresh(),
  });

  const promoteMutation = useMutation({
    mutationFn: async (draft: PromotionDraft) => {
      if (!accessToken) throw new Error('Session expirée.');
      const firstTypeCode = documentTypesQuery.data?.[0]?.code ?? '';
      await promoteActorDocument({
        actorId,
        documentId: draft.document.documentId,
        objectId: draft.objectId,
        roleCode: draft.roleCode || firstTypeCode,
        title: draft.title.trim(),
        accessToken,
      });
    },
    onSuccess: () => {
      setPromotion(null);
      void refresh();
    },
  });

  async function openDocument(documentId: string) {
    if (!accessToken) {
      setOpenError('Session expirée. Reconnectez-vous pour consulter ce document.');
      return;
    }
    setOpenError(null);
    setOpeningDocumentId(documentId);
    try {
      const url = await getActorDocumentUrl({ actorId, documentId, accessToken });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setOpenError(errorMessage(error));
    } finally {
      setOpeningDocumentId(null);
    }
  }

  const documents = supportQuery.data?.documents ?? [];
  const documentTypes = documentTypesQuery.data ?? [];
  const selectedPromotionType = promotion?.roleCode || documentTypes[0]?.code || '';
  const canPromote = Boolean(
    promotion && promotion.objectId && selectedPromotionType && promotion.title.trim() && !promoteMutation.isPending,
  );
  const mutationError = deleteMutation.error ?? promoteMutation.error;

  return (
    <>
      <section className="crm-panel crm-actor-docs" aria-labelledby="crm-actor-documents-title">
        <div className="crm-panel__head">
          <FileText size={15} aria-hidden />
          <h3 id="crm-actor-documents-title">Documents d&apos;accompagnement</h3>
          <span className="crm-actor-docs__count">{documents.length}</span>
        </div>
        <div className="crm-panel__body crm-actor-docs__body">
          <p className="crm-actor-docs__intro">
            Espace privé pour réunir les pièces du projet avant la création ou le rattachement à un établissement.
          </p>
          {supportQuery.isLoading && <p className="crm-rail__empty">Chargement des documents…</p>}
          {supportQuery.isError && <div className="inline-alert">{errorMessage(supportQuery.error)}</div>}
          {!supportQuery.isLoading && !supportQuery.isError && documents.length === 0 && (
            <div className="crm-actor-docs__empty">
              <FileText size={22} aria-hidden />
              <span>Aucun document pour le moment.</span>
            </div>
          )}
          {documents.length > 0 && (
            <ul className="crm-actor-docs__list">
              {documents.map((document) => (
                <li key={document.documentId} className="crm-actor-docs__row">
                  <FileText size={17} aria-hidden className="crm-actor-docs__icon" />
                  <div className="crm-actor-docs__meta">
                    <strong>{document.title}</strong>
                    <small>
                      {[
                        document.intendedRoleName,
                        // `api.list_actor_support` émet `coalesce(size_bytes, 0)` : sur CETTE
                        // route, 0 est LA SENTINELLE d'une taille absente autant qu'un fichier
                        // réellement vide, et rien côté client ne les sépare. On OMET donc le
                        // segment plutôt que d'afficher « 0 o », qui affirmerait une taille
                        // qu'on n'a pas — le mensonge même que `formatDocumentSize` refuse de
                        // faire pour `null`. Rétablir la distinction ici suppose de faire
                        // cesser le `coalesce` côté SQL (hors périmètre).
                        document.sizeBytes === 0 ? '' : formatDocumentSize(document.sizeBytes),
                        document.createdAt ? formatShort(document.createdAt) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                  {document.status === 'promoted' && <span className="pill-mini principal">Transféré</span>}
                  <div className="crm-actor-docs__actions">
                    <button
                      type="button"
                      className="crm-btn sm"
                      disabled={openingDocumentId === document.documentId}
                      onClick={() => void openDocument(document.documentId)}
                    >
                      <ExternalLink size={11} aria-hidden /> Ouvrir
                    </button>
                    {document.status === 'active' && (
                      <>
                        <button
                          type="button"
                          className="crm-btn sm"
                          disabled={!canWrite || objects.length === 0}
                          title={objects.length === 0 ? 'Rattachez d’abord un établissement pour transférer ce document.' : undefined}
                          onClick={() => setPromotion({
                            document,
                            objectId: objects[0]?.objectId ?? '',
                            roleCode: document.intendedRoleCode ?? documentTypes[0]?.code ?? '',
                            title: document.title,
                          })}
                        >
                          <ArrowRight size={11} aria-hidden /> Transférer
                        </button>
                        <button
                          type="button"
                          className="crm-btn sm crm-btn--danger-ghost"
                          disabled={!canWrite || deleteMutation.isPending}
                          aria-label={`Supprimer ${document.title}`}
                          onClick={() => {
                            if (window.confirm(`Supprimer définitivement « ${document.title} » ?`)) {
                              deleteMutation.mutate(document.documentId);
                            }
                          }}
                        >
                          <Trash2 size={11} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(openError || mutationError) && (
            <div className="inline-alert" role="alert">{openError ?? errorMessage(mutationError)}</div>
          )}
        </div>
      </section>

      {promotion && (
        <CrmModal
          title="Transférer vers un établissement"
          onClose={() => !promoteMutation.isPending && setPromotion(null)}
          footer={
            <>
              <button type="button" className="crm-btn" disabled={promoteMutation.isPending} onClick={() => setPromotion(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="crm-btn primary"
                disabled={!canPromote}
                onClick={() => promoteMutation.mutate({ ...promotion, roleCode: selectedPromotionType })}
              >
                {promoteMutation.isPending ? 'Transfert…' : 'Transférer'}
              </button>
            </>
          }
        >
          <p className="crm-rail__note">
            Le document sera déplacé dans la bibliothèque de l&apos;établissement et restera visible dans l&apos;historique de l&apos;acteur, sans dupliquer le fichier stocké.
          </p>
          <label className="crm-field">
            Établissement
            <select
              aria-label="Établissement destinataire"
              value={promotion.objectId}
              onChange={(event) => setPromotion({ ...promotion, objectId: event.target.value })}
            >
              {objects.map((object) => <option key={object.objectId} value={object.objectId}>{object.objectName}</option>)}
            </select>
          </label>
          <label className="crm-field">
            Type de document
            <select
              className="crm-select"
              aria-label="Type du document transféré"
              value={selectedPromotionType}
              disabled={documentTypesQuery.isLoading || documentTypesQuery.isError || documentTypes.length === 0}
              onChange={(event) => setPromotion({ ...promotion, roleCode: event.target.value })}
            >
              {documentTypesQuery.isLoading && <option value="">Chargement des types…</option>}
              {documentTypesQuery.isError && <option value="">Types indisponibles</option>}
              {!documentTypesQuery.isLoading && !documentTypesQuery.isError && documentTypes.length === 0 && (
                <option value="">Aucun type disponible</option>
              )}
              {documentTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
            </select>
            {documentTypesQuery.isError && (
              <span className="crm-field__hint" role="alert">
                Impossible de charger les types de document. Fermez puis rouvrez cette fenêtre pour réessayer.
              </span>
            )}
          </label>
          <label className="crm-field">
            Titre
            <input
              aria-label="Titre du document transféré"
              value={promotion.title}
              onChange={(event) => setPromotion({ ...promotion, title: event.target.value })}
            />
          </label>
          {promoteMutation.isError && <div className="inline-alert">{errorMessage(promoteMutation.error)}</div>}
        </CrmModal>
      )}
    </>
  );
}
