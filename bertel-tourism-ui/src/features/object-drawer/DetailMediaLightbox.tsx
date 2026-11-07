import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { MediaItem } from './utils';

export type DetailGalleryMedia = Pick<MediaItem, 'id' | 'url' | 'title' | 'description' | 'credit' | 'typeCode'>;

export interface DetailMediaLightboxProps {
  name: string;
  media: DetailGalleryMedia[];
  activeIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (index: number) => void;
  description?: ReactNode;
}

function getWrappedIndex(index: number, total: number): number {
  return total > 0 ? ((index % total) + total) % total : 0;
}

export function DetailMediaLightbox({
  name,
  media,
  activeIndex,
  open,
  onOpenChange,
  onChange,
  description,
}: DetailMediaLightboxProps) {
  const total = media.length;
  const activeMedia = total > 0 ? media[getWrappedIndex(activeIndex, total)] : null;
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  if (!total || !activeMedia) {
    return null;
  }

  const goToPrevious = () => onChange(getWrappedIndex(activeIndex - 1, total));
  const goToNext = () => onChange(getWrappedIndex(activeIndex + 1, total));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="detail-gallery-dialog"
        showClose={false}
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus({ preventScroll: true });
          }
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented || total < 2 || event.altKey || event.ctrlKey || event.metaKey) {
            return;
          }

          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToPrevious();
            return;
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToNext();
          }
        }}
      >
        <DialogTitle className="sr-only">Galerie photo de {name}</DialogTitle>
        <DialogDescription className="sr-only">
          Visionneuse plein ecran des photos disponibles pour cette fiche.
        </DialogDescription>
        <div className="detail-gallery-modal">
          <button
            type="button"
            className="detail-gallery-modal__close"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer la galerie"
          >
            <X size={20} />
          </button>
          <div
            className="detail-gallery-modal__frame"
            onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
            onTouchEnd={(event) => {
              const endX = event.changedTouches[0]?.clientX ?? null;
              if (touchStartX == null || endX == null) {
                return;
              }

              const delta = endX - touchStartX;
              setTouchStartX(null);

              if (Math.abs(delta) < 40) {
                return;
              }

              if (delta > 0) {
                goToPrevious();
                return;
              }

              goToNext();
            }}
          >
            {activeMedia.typeCode === 'video' ? (
              <video className="detail-gallery-modal__image" src={activeMedia.url} controls preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="detail-gallery-modal__image"
                src={activeMedia.url}
                alt={activeMedia.description || activeMedia.title || name}
              />
            )}
            {total > 1 && (
              <>
                <button
                  type="button"
                  className="detail-gallery-modal__nav detail-gallery-modal__nav--prev"
                  onClick={goToPrevious}
                  aria-label="Image precedente dans la galerie"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="detail-gallery-modal__nav detail-gallery-modal__nav--next"
                  onClick={goToNext}
                  aria-label="Image suivante dans la galerie"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          <div className="detail-gallery-modal__footer">
            <div className="detail-gallery-modal__meta">
              <strong>{activeMedia.title || name}</strong>
              {activeMedia.credit && <span>Photo {activeMedia.credit}</span>}
            </div>
            {media.length > 1 && (
              <div className="detail-gallery-modal__thumbs">
                {media.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`detail-gallery-modal__thumb${index === activeIndex ? ' detail-gallery-modal__thumb--active' : ''}`}
                    onClick={() => onChange(index)}
                    aria-label={`Voir la photo ${index + 1} en grand`}
                  >
                    {item.typeCode === 'video' ? (
                      <video src={item.url} preload="metadata" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.description || item.title || `Photo ${index + 1}`} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {description ? <div className="detail-gallery-modal__description" tabIndex={0} aria-label="Description de l’étape">{description}</div> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

