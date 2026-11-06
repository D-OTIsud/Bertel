"use client";
import { useQuery } from "@tanstack/react-query";
import { getPortalPhotoReview } from "../../services/portal-photos";
import { PortalPrivatePhoto } from "./rubrics/PortalPrivatePhoto";
export function PortalPhotoReview({ changeId }: { changeId: string }) {
  const photos = useQuery({
    queryKey: ["portal-photo-review", changeId],
    queryFn: () => getPortalPhotoReview(changeId),
  });
  if (photos.isError)
    return (
      <p className="notice" role="alert">
        Les photos proposées n’ont pas pu être chargées.{" "}
        <button
          type="button"
          className="ghost-button"
          onClick={() => void photos.refetch()}
        >
          Réessayer
        </button>
      </p>
    );
  if (photos.isLoading)
    return <p role="status">Chargement des photos privées…</p>;
  if (!photos.data?.length) return null;
  return (
    <section className="portal-photo-review">
      <h4>Photos à ajouter</h4>
      <div className="portal-photo-editor__grid">
        {photos.data.map((photo) => (
          <figure className="portal-photo-editor__tile" key={photo.id}>
            <PortalPrivatePhoto documentId={photo.id} title={photo.title} />
            <figcaption>
              {photo.title}
              {photo.credit ? <p>Crédit : {photo.credit}</p> : null}
              {photo.replacement ? (
                <p>
                  Remplacement proposé · la photo actuelle restera publiée
                  jusqu’à validation.
                </p>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
