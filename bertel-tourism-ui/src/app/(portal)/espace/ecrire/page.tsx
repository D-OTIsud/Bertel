"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PortalWriteOffice } from "@/features/portal/PortalWriteOffice";
import { listMyPortalFiches } from "@/services/portal";
import { useSessionStore } from "@/store/session-store";

function WriteOfficePage() {
  const params = useSearchParams();
  const email = useSessionStore((s) => s.email);
  const fiches = useQuery({
    queryKey: ["portal-fiches"],
    queryFn: listMyPortalFiches,
  });
  const objectId = params.get("fiche");
  if (!fiches.data)
    return (
      <p role={fiches.isError ? "alert" : "status"}>
        {fiches.isError
          ? "Vos fiches n’ont pas pu être chargées."
          : "Chargement…"}
        {fiches.isError ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => void fiches.refetch()}
          >
            Réessayer
          </button>
        ) : null}
      </p>
    );
  const fiche = objectId
    ? fiches.data.find((f) => f.id === objectId)
    : fiches.data.length === 1
      ? fiches.data[0]
      : null;
  if (!fiche)
    return (
      <section className="portal-card">
        <h1 className="portal-h1">Écrire à l’office</h1>
        <p>Quelle fiche concerne votre message ?</p>
        {fiches.data.map((f) => (
          <p key={f.id}>
            <Link
              className="ghost-button"
              href={`/espace/ecrire?fiche=${encodeURIComponent(f.id)}`}
            >
              {f.name}
            </Link>
          </p>
        ))}
        <Link href="/espace" className="ghost-button">
          Vos fiches
        </Link>
      </section>
    );
  return (
    <PortalWriteOffice
      key={fiche.id}
      objectId={fiche.id}
      ficheName={fiche.name}
      email={email}
      initialSubject={params.get("sujet")}
    />
  );
}
export default function Page() {
  return (
    <Suspense fallback={null}>
      <WriteOfficePage />
    </Suspense>
  );
}
