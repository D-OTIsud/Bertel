'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import type { BuiltPortalRubric } from './portal-rubrics';
import type { PortalRejection } from './PortalFicheHub';

export function PortalOfficeReturns({ rubrics, rejections, approvedModules, appliedModules, hubHref, officeEmail, onBack, onOpenRubric }: {
  rubrics: BuiltPortalRubric[]; rejections: PortalRejection[];
  approvedModules: ReadonlySet<string>; appliedModules: ReadonlySet<string>;
  hubHref: string; officeEmail: string | null; onBack: () => void; onOpenRubric: (id: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const accepted = rubrics.filter((rubric) => approvedModules.has(rubric.module) || appliedModules.has(rubric.module));
  return <section className="portal-office-returns" aria-labelledby="portal-office-returns-title">
    <Link className="portal-back" href={hubHref} scroll={false} onClick={(event) => { event.preventDefault(); onBack(); }}><ArrowLeft size={18} aria-hidden /> Retour à la fiche</Link>
    <h2 className="portal-h1" id="portal-office-returns-title" tabIndex={-1} ref={heading}>Retours de l’office</h2>
    {rejections.length ? <section className="portal-card portal-returns">
      <h3>L’office n’a pas pu garder une modification :</h3>
      <ul>{rejections.map((rejection) => <li key={rejection.module}>
        <strong>{rejection.title}</strong><span className="badge badge--danger"><AlertTriangle size={14} aria-hidden /> À reprendre</span>
        {rejection.note ? <blockquote>{rejection.note}</blockquote> : null}
        {rejection.rubricId && rubrics.some((rubric) => rubric.id === rejection.rubricId && rubric.state !== 'unavailable') ? <Link
          href={`${hubHref}?rubrique=${rejection.rubricId}`} scroll={false} className="ghost-button"
          onClick={(event) => { event.preventDefault(); onOpenRubric(rejection.rubricId!); }}>Corriger {rejection.title.toLowerCase()}</Link> : null}
      </li>)}</ul>
      {officeEmail ? <a className="ghost-button" href={`mailto:${officeEmail}`}>Répondre à l’office</a> : null}
    </section> : <p className="notice">Aucune correction n’est demandée pour cette fiche.</p>}
    {accepted.length ? <section className="portal-review-news" aria-label="Les autres nouvelles">
      <h3>Les autres nouvelles</h3>
      <ul>{accepted.map((rubric) => <li className="portal-card" key={rubric.id}>
        <strong>{rubric.title}</strong>
        <p>{appliedModules.has(rubric.module) ? 'Votre modification est publiée sur la fiche.' : 'Acceptée par l’office. Elle apparaîtra sur votre fiche dès qu’il l’aura recopiée.'}</p>
        <span className="badge badge--ok"><Check size={14} aria-hidden /> {appliedModules.has(rubric.module) ? 'Publié' : 'Accepté — en cours de report'}</span>
      </li>)}</ul>
    </section> : null}
  </section>;
}
