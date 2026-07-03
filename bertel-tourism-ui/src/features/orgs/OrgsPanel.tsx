'use client';
// Console admin — liste des organisations (superadmin). La création (CreateOrgDialog) arrive
// à la tâche suivante ; ici le bouton est présent mais désactivé (« Bientôt disponible »).
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listOrgs, type OrgSummary } from '../../services/orgs';

const SCOPE_LABEL: Record<string, string> = {
  own_objects_only: 'Ses fiches uniquement',
  all_published: 'Tout le publié',
};

export function OrgsPanel() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setOrgs(await listOrgs()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <section className="settings-pane">
      <div className="settings-pane__head">
        <div>
          <h2>Organisations</h2>
          <p className="muted">Structures institutionnelles porteuses des fiches (ORG). La création est réservée au superadmin plateforme.</p>
        </div>
        <div className="settings-pane__actions">
          {/* Remplacé par <CreateOrgDialog onDone={reload} /> à la tâche suivante */}
          <button type="button" className="primary-button" disabled title="Bientôt disponible">Nouvelle organisation</button>
        </div>
      </div>

      {error && <div className="inline-alert inline-alert--danger" role="alert">{error}</div>}
      {loading ? (
        <p className="muted">Chargement des organisations…</p>
      ) : orgs.length === 0 ? (
        <p className="muted">Aucune organisation pour l’instant.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Nom</th><th>Statut</th><th>Périmètre d’accès</th><th>Membres</th><th>Créée le</th><th className="data-table__actions" aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td><span className="badge badge--info badge--xs">{o.status}</span></td>
                <td>{SCOPE_LABEL[o.accessScope ?? ''] ?? '—'}</td>
                <td>{o.memberCount}</td>
                <td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="data-table__actions">
                  <button type="button" className="ghost-button" onClick={() => router.push(`/settings?section=team&org=${encodeURIComponent(o.id)}`)}>
                    Gérer l’équipe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
