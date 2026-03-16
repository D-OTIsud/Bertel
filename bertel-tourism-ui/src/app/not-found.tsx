import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="page-grid">
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <h2>Page introuvable</h2>
        </div>
        <p>La page demandee n existe pas.</p>
        <p>
          <Link href="/" className="primary-button" style={{ display: 'inline-block', marginTop: '1rem' }}>
            Retour a l accueil
          </Link>
        </p>
      </article>
    </section>
  );
}
