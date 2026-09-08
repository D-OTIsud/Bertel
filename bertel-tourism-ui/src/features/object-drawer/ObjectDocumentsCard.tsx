'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { getActiveObjectDocuments, type ObjectDocument } from '../../services/object-documents';
import { useSessionStore } from '../../store/session-store';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const CATEGORY_LABEL = {
  legal: 'Documents légaux',
  classification: 'Classements et labels',
} satisfies Record<ObjectDocument['category'], string>;

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function typeLabel(document: ObjectDocument): string {
  const labels: Record<string, string> = {
    juridique: 'Document juridique',
    certificat: 'Certificat',
    label_justificatif: 'Justificatif de label',
  };
  return labels[document.typeCode] ?? (document.typeCode.replaceAll('_', ' ') || 'Justificatif');
}

export function ObjectDocumentsCard({ objectId }: { objectId: string }) {
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const [authorized, setAuthorized] = useState(false);
  const [documents, setDocuments] = useState<ObjectDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const requestEpoch = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const epoch = ++requestEpoch.current;
    setState('loading');
    try {
      const result = await getActiveObjectDocuments(objectId, { signal });
      if (signal?.aborted || epoch !== requestEpoch.current) return;
      setAuthorized(result.authorized);
      setDocuments(result.documents);
      setState('ready');
      if (!result.authorized) setOpen(false);
    } catch {
      if (!signal?.aborted && epoch === requestEpoch.current) setState('error');
    }
  }, [objectId, orgId, userId]);

  useEffect(() => {
    setAuthorized(false);
    setDocuments([]);
    setOpen(false);
    setState('idle');
    if (!canEditObjects) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      requestEpoch.current += 1;
      controller.abort();
    };
  }, [canEditObjects, load]);

  if (!canEditObjects || !authorized) return null;

  const grouped = documents.reduce<Record<ObjectDocument['category'], ObjectDocument[]>>(
    (groups, document) => {
      groups[document.category].push(document);
      return groups;
    },
    { legal: [], classification: [] },
  );

  return (
    <>
      <article className="detail-section detail-section--aside detail-documents-card">
        <div className="detail-section__header">
          <div className="detail-section__heading">
            <span className="detail-section__eyebrow">Accès éditeur</span>
            <h3 className="detail-section__title">Documents</h3>
          </div>
          <FileText size={18} aria-hidden />
        </div>
        <div className="detail-section__body">
          <p>Consultez les justificatifs actifs liés à cette fiche.</p>
          <button
            type="button"
            className="secondary-button detail-documents-card__button"
            onClick={() => {
              setOpen(true);
              void load();
            }}
          >
            Consulter les documents
          </button>
        </div>
      </article>

      <Modal open={open} title="Documents" onOpenChange={setOpen} className="object-documents-modal">
        {state === 'loading' ? (
          <div className="object-documents-modal__state" role="status">
            <Loader2 className="spin" size={20} aria-hidden />
            Chargement des documents…
          </div>
        ) : state === 'error' ? (
          <div className="object-documents-modal__state object-documents-modal__state--error" role="alert">
            <AlertTriangle size={20} aria-hidden />
            <div>
              <strong>Impossible de charger les documents.</strong>
              <button type="button" className="link-button" onClick={() => void load()}>Réessayer</button>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="object-documents-modal__state">
            <FileText size={22} aria-hidden />
            <p>Aucun document actif pour cette fiche.</p>
          </div>
        ) : (
          <div className="object-documents-modal__groups">
            {(['legal', 'classification'] as const).map((category) => grouped[category].length > 0 && (
              <section key={category} className="object-documents-modal__group">
                <h4>{CATEGORY_LABEL[category]}</h4>
                <ul className="object-documents-modal__list">
                  {grouped[category].map((document) => {
                    const from = formatDate(document.validFrom);
                    const to = formatDate(document.validTo);
                    return (
                      <li key={document.id} className="object-documents-modal__item">
                        <div>
                          <strong>{document.title}</strong>
                          <span>{[typeLabel(document), document.issuer].filter(Boolean).join(' · ')}</span>
                          {(from || to) && <span>{from && `Du ${from}`}{from && to && ' '}{to && `au ${to}`}</span>}
                        </div>
                        <a href={document.url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${document.title}`}>
                          Ouvrir <ExternalLink size={14} aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
