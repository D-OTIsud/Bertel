import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Maximize2, X } from 'lucide-react';
import { MarkdownContent } from '../../components/markdown/MarkdownContent';
import { DetailMediaLightbox, type DetailGalleryMedia } from './DetailMediaLightbox';
import type { ItineraryStageRow } from './itinerary-stages';

interface ItineraryStageCardProps {
  stage: ItineraryStageRow;
  cardRef: RefObject<HTMLElement | null>;
  onSizeChange: () => void;
  onClose: () => void;
}

export function ItineraryStageCard({ stage, cardRef, onSizeChange, onClose }: ItineraryStageCardProps) {
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set());
  const photos = useMemo(() => stage.photos.filter((photo) => !failedPhotos.has(photo.id)), [stage.photos, failedPhotos]);
  const firstPhoto = photos[0];
  const galleryMedia = useMemo<DetailGalleryMedia[]>(() => photos.map((photo) => ({
    ...photo, typeCode: 'photo', description: photo.description || '', credit: photo.credit || '',
  })), [photos]);
  const description = stage.descriptionMd
    ? <MarkdownContent markdown={stage.descriptionMd} />
    : stage.description ? <p>{stage.description}</p> : null;

  useLayoutEffect(() => {
    const measure = () => {
      const element = descriptionRef.current;
      if (!expanded) setOverflows(Boolean(element && element.scrollHeight > element.clientHeight + 1));
      onSizeChange();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (descriptionRef.current) observer.observe(descriptionRef.current);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [stage.description, stage.descriptionMd, expanded, cardRef, onSizeChange]);

  return (
    <>
      <article ref={cardRef} className={`detail-itinerary-stage-card${!firstPhoto ? ' detail-itinerary-stage-card--without-photo' : ''}${expanded ? ' is-expanded' : ''}`}
        aria-label="Détail de l’étape sélectionnée">
        {firstPhoto ? (
          <button type="button" className="detail-itinerary-stage-card__photo" aria-label="Agrandir les photos de cette étape"
            onClick={() => { setPhotoIndex(0); setGalleryOpen(true); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={firstPhoto.url} alt={firstPhoto.description || firstPhoto.title || stage.name || stage.positionLabel}
              onError={() => setFailedPhotos((current) => new Set([...current, firstPhoto.id]))} />
            <span className="detail-itinerary-stage-card__photo-count">{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
            <span className="detail-itinerary-stage-card__enlarge" aria-hidden><Maximize2 size={13} /></span>
          </button>
        ) : null}
        <div className="detail-itinerary-stage-card__copy">
          <span className="detail-itinerary-stage-card__position">
            {stage.positionLabel}{stage.kindLabel && stage.kindLabel.toLocaleLowerCase('fr') !== 'étape' ? ` · ${stage.kindLabel}` : ''}
          </span>
          {stage.name ? <h3 className="detail-itinerary-stage-card__name">{stage.name}</h3> : null}
          {description ? (
            <div ref={descriptionRef} id={descriptionId} className="detail-itinerary-stage-card__description"
              tabIndex={expanded ? 0 : undefined} aria-label="Description de l’étape"
              onFocusCapture={() => { if (overflows) setExpanded(true); }}>
              {description}
            </div>
          ) : null}
          {overflows || expanded ? (
            <button type="button" className="detail-itinerary-stage-card__expand" aria-expanded={expanded} aria-controls={descriptionId}
              onClick={() => setExpanded((value) => !value)}>{expanded ? 'Réduire' : 'Lire la suite'}</button>
          ) : null}
        </div>
        <button type="button" className="detail-itinerary-stage-card__close" aria-label="Fermer la carte de l’étape" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </article>
      <DetailMediaLightbox name={stage.name || stage.positionLabel} media={galleryMedia} activeIndex={photoIndex}
        open={galleryOpen} onOpenChange={setGalleryOpen} onChange={setPhotoIndex} description={description} />
    </>
  );
}
