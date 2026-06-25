import { render, screen } from '@testing-library/react';
import { ErasureResultPanel } from './ErasureResultPanel';
import type { ErasureResult } from '@/services/rgpd';

const baseResult: ErasureResult = {
  ok: true,
  report: { rows_anonymized: 7 },
  storageDeleted: ['a', 'b'],
  storageError: null,
  authUserDeleted: false,
  authError: null,
};

describe('ErasureResultPanel', () => {
  it('rend un role=status et le titre selon le mode', () => {
    const { rerender } = render(
      <ErasureResultPanel result={baseResult} mode="anonymize" subjectLabel="Acteur" subjectId="id-1" />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Sujet anonymisé')).toBeInTheDocument();
    rerender(
      <ErasureResultPanel
        result={{ ...baseResult, report: { rows_deleted: 3 } }}
        mode="delete"
        subjectLabel="Acteur"
        subjectId="id-1"
      />,
    );
    expect(screen.getByText('Sujet supprimé')).toBeInTheDocument();
  });

  it('les stats reflètent storageDeleted et authUserDeleted', () => {
    render(
      <ErasureResultPanel
        result={{ ...baseResult, storageDeleted: ['x', 'y', 'z'], authUserDeleted: true }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Supprimé')).toBeInTheDocument();
  });

  it('storageError rend une chip warn, authError une chip danger', () => {
    render(
      <ErasureResultPanel
        result={{ ...baseResult, storageError: 'quota', authError: 'token expiré' }}
        mode="anonymize"
        subjectLabel="A"
        subjectId="id"
      />,
    );
    expect(screen.getByRole('note', { name: /stockage/i })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: /compte/i })).toBeInTheDocument();
  });

  it('conserve le JSON brut dans un details', () => {
    render(<ErasureResultPanel result={baseResult} mode="anonymize" subjectLabel="A" subjectId="id" />);
    expect(screen.getByText(/Détail technique/i)).toBeInTheDocument();
    expect(screen.getByText(/rows_anonymized/)).toBeInTheDocument();
  });
});
