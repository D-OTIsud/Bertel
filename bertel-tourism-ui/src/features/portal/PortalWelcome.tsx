'use client';
import { ImageIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';

export function PortalWelcome({ userName, ficheName, typeLabel, locality, photoUrl, photoCount, onContinue }: {
  userName: string; ficheName: string; typeLabel: string; locality: string;
  photoUrl: string | null; photoCount: number; onContinue: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const services = useServiceAvailability();
  useEffect(() => { heading.current?.focus(); }, []);
  const first = userName.trim().split(/\s+/)[0] ?? '';
  const name = first.includes('@') ? '' : first;
  return <section className="portal-welcome">
    <h1 className="portal-h1" tabIndex={-1} ref={heading}>{name ? `Bienvenue, ${name}` : 'Bienvenue'}</h1>
    <p className="portal-lead">Votre compte est prêt. Voici comment garder votre fiche à jour.</p>
    <div className="portal-card portal-welcome__fiche">
      {photoUrl ? <img src={photoUrl} alt="" /> : <span className="portal-welcome__image" aria-hidden><ImageIcon size={32} /></span>}
      <div><h2>{ficheName}</h2><p className="muted">{[typeLabel, locality].filter(Boolean).join(' · ')}</p><p className="muted">{photoCount} photo{photoCount > 1 ? 's' : ''} · 4 conseillées</p></div>
    </div>
    <section className="portal-card portal-welcome__steps" aria-labelledby="portal-welcome-steps">
      <h2 id="portal-welcome-steps">Comment ça marche</h2>
      <ol>
        <li><strong>Ouvrez une rubrique</strong> et corrigez ce qui a changé : horaires, coordonnées, tarifs…</li>
        <li><strong>Envoyez à l’office</strong> d’un seul bouton, quand vous avez fini.</li>
        <li><strong>L’office relit et publie</strong>, en général sous une semaine.{services.email ? ' Vous êtes prévenu par e-mail.' : ''}</li>
      </ol>
      <p className="notice">Les informations envoyées à l’office sont publiées après sa relecture.</p>
    </section>
    <button type="button" className="primary-button" onClick={onContinue}>Voir ma fiche</button>
  </section>;
}
