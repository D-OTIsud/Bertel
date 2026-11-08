import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErasureResultPanel } from './ErasureResultPanel';
import type { ErasureResult } from '@/services/rgpd';

const completed: ErasureResult = {
  ok: true,
  status: 'completed',
  operationId: 'op-1',
  report: { rows_anonymized: 7 },
  tasks: [],
  cleanupStatusUnavailable: false,
  counts: { total: 2, succeeded: 2, pending: 0, failed: 0 },
};

describe('ErasureResultPanel', () => {
  it('rend un role=status et le titre selon le mode quand complet', () => {
    const { rerender } = render(
      <ErasureResultPanel result={completed} mode="anonymize" subjectLabel="Acteur" subjectId="id-1" />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Sujet anonymisé')).toBeInTheDocument();
    rerender(
      <ErasureResultPanel
        result={{ ...completed, report: { rows_deleted: 3 } }}
        mode="delete"
        subjectLabel="Acteur"
        subjectId="id-1"
      />,
    );
    expect(screen.getByText('Sujet supprimé')).toBeInTheDocument();
  });

  it('ne rend JAMAIS un titre de succès quand status=partial, même avec ok absent', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, ok: false, status: 'partial', counts: { total: 2, succeeded: 1, pending: 1, failed: 0 } }}
        mode="delete"
        subjectLabel="Acteur"
        subjectId="id-1"
      />,
    );
    expect(screen.queryByText('Sujet supprimé')).not.toBeInTheDocument();
    expect(screen.getByText(/nettoyage incomplet/i)).toBeInTheDocument();
  });

  it('affiche le bouton de reprise uniquement quand ce n\'est pas complet, et l\'appelle', async () => {
    const user = userEvent.setup();
    const onResume = jest.fn();
    render(
      <ErasureResultPanel
        result={{ ...completed, ok: false, status: 'partial' }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
        onResume={onResume}
      />,
    );
    const button = screen.getByRole('button', { name: /reprendre/i });
    await user.click(button);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('n\'affiche pas de bouton de reprise quand status=completed', () => {
    const onResume = jest.fn();
    render(<ErasureResultPanel result={completed} mode="anonymize" subjectLabel="A" subjectId="id" onResume={onResume} />);
    expect(screen.queryByRole('button', { name: /reprendre/i })).not.toBeInTheDocument();
  });

  it('les stats reflètent les compteurs de tâches', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, counts: { total: 3, succeeded: 3, pending: 0, failed: 0 } }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('un compte auth conservé (anonymize) est affiché explicitement, jamais tu', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, report: { authRetained: true } }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText(/conservé/i)).toBeInTheDocument();
  });

  it('manualReviewRequired rend une alerte de revue manuelle', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, report: { manualReviewRequired: true } }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText(/revue manuelle/i)).toBeInTheDocument();
  });

  it('des tâches échouées rendent une alerte danger', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, ok: false, status: 'partial', counts: { total: 2, succeeded: 1, pending: 0, failed: 1 } }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByRole('note', { name: /tâches échouées/i })).toBeInTheDocument();
  });

  it('un auth_delete task pending est affiché comme "demandée en cours", jamais "supprimé" avant confirmation', () => {
    render(
      <ErasureResultPanel
        result={{
          ...completed,
          ok: false,
          status: 'partial',
          report: {},
          tasks: [{ id: 't1', action: 'auth_delete', metadata: {}, status: 'pending', attempts: 0, lastError: null }],
        }}
        mode="delete"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText(/en cours/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Supprimé$/)).not.toBeInTheDocument();
  });

  it('un auth_delete task succeeded est affiché comme "Supprimé"', () => {
    render(
      <ErasureResultPanel
        result={{
          ...completed,
          report: {},
          tasks: [{ id: 't1', action: 'auth_delete', metadata: {}, status: 'succeeded', attempts: 1, lastError: null }],
        }}
        mode="delete"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText('Supprimé')).toBeInTheDocument();
  });

  it('cleanupStatusUnavailable rend une alerte de statut non confirmé', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, ok: false, status: 'partial', cleanupStatusUnavailable: true }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText(/statut non confirmé/i)).toBeInTheDocument();
  });

  it('sans résultat, affiche Statut non confirmé, la référence et la reprise, sans succès ni sujet', async () => {
    const user = userEvent.setup();
    const onResume = jest.fn();
    render(<ErasureResultPanel reference="request-ref" onResume={onResume} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Statut non confirmé')).toBeInTheDocument();
    expect(screen.getByText('Référence de reprise')).toBeInTheDocument();
    expect(screen.queryByText('requestId')).not.toBeInTheDocument();
    expect(screen.getByText('request-ref')).toBeInTheDocument();
    expect(screen.queryByText('Sujet')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('operationId')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reprendre le nettoyage de cette opération' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('un completed récupéré sans mode réutilise le titre de reprise, sans sujet inventé', () => {
    render(<ErasureResultPanel result={completed} />);
    expect(screen.getByText('Nettoyage repris et terminé.')).toBeInTheDocument();
    expect(screen.queryByText('Sujet anonymisé')).not.toBeInTheDocument();
    expect(screen.queryByText('Sujet supprimé')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Identifiant')).not.toBeInTheDocument();
  });

  it('un partial récupéré sans mode garde le titre partiel et la reprise', () => {
    render(<ErasureResultPanel result={{ ...completed, ok: false, status: 'partial' }} onResume={jest.fn()} />);
    expect(screen.getByText(/nettoyage incomplet/i)).toBeInTheDocument();
    expect(screen.queryByText('Nettoyage repris et terminé.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reprendre/i })).toBeInTheDocument();
  });

  it('un completed marqué non rechargé ne rend aucun titre de succès et propose la reprise', () => {
    render(
      <ErasureResultPanel
        result={{ ...completed, cleanupStatusUnavailable: true }}
        mode="delete"
        subjectLabel="A"
        subjectId="id"
        onResume={jest.fn()}
      />,
    );
    expect(screen.queryByText('Sujet supprimé')).not.toBeInTheDocument();
    expect(screen.getAllByText('Statut non confirmé').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /reprendre/i })).toBeInTheDocument();
  });

  it('conserve le JSON brut dans un details', () => {
    render(<ErasureResultPanel result={completed} mode="anonymize" subjectLabel="A" subjectId="id" />);
    expect(screen.getByText(/Détail technique/i)).toBeInTheDocument();
    expect(screen.getByText(/rows_anonymized/)).toBeInTheDocument();
  });
});
