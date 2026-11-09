import { render, screen } from '@testing-library/react';
import type { LegalItem } from './utils';
import { LegalMentionsCard } from './LegalMentionsCard';
import { buildLegalMentions } from './legal-mentions';

function legal(typeCode: string, label: string, overrides: Partial<LegalItem> = {}): LegalItem {
  return {
    typeCode,
    label,
    status: 'active',
    documentId: 'non fourni',
    validityMode: 'non precisee',
    daysUntilExpiry: 'n/a',
    deliveredAt: 'en attente',
    isPublic: true,
    ...overrides,
  };
}

describe('buildLegalMentions', () => {
  it('hides SIREN when a SIRET is present', () => {
    const mentions = buildLegalMentions([legal('siren', 'SIREN'), legal('siret', 'SIRET')]);

    expect(mentions.map((mention) => mention.label)).toEqual(['SIRET']);
  });

  it('hides SIREN even when the SIRET is not valid', () => {
    const mentions = buildLegalMentions([
      legal('siret', 'SIRET', { status: 'expired' }),
      legal('siren', 'SIREN'),
    ]);

    expect(mentions).toEqual([{ label: 'SIRET', isValid: false }]);
  });

  it('keeps SIREN when there is no SIRET', () => {
    const mentions = buildLegalMentions([legal('siren', 'SIREN'), legal('tourist_tax', 'Taxe de séjour')]);

    expect(mentions.map((mention) => mention.label)).toEqual(['SIREN', 'Taxe de séjour']);
  });

  it('does not let a private SIRET hide a public SIREN', () => {
    const mentions = buildLegalMentions([
      legal('siret', 'SIRET', { isPublic: false }),
      legal('siren', 'SIREN'),
    ]);

    expect(mentions.map((mention) => mention.label)).toEqual(['SIREN']);
  });

  it('treats only an active status as valid', () => {
    const mentions = buildLegalMentions([
      legal('tourist_tax', 'Taxe de séjour', { status: ' Active ' }),
      legal('kbis', 'Extrait KBIS', { status: 'Statut inconnu' }),
    ]);

    expect(mentions.map((mention) => mention.isValid)).toEqual([true, false]);
  });

  it('drops private records and records without a label', () => {
    expect(buildLegalMentions([legal('kbis', 'Extrait KBIS', { isPublic: false }), legal('x', '  ')])).toEqual([]);
  });
});

describe('LegalMentionsCard', () => {
  it('announces each state without displaying the raw status', () => {
    render(
      <LegalMentionsCard
        mentions={[
          { label: 'SIRET', isValid: true },
          { label: 'Taxe de séjour', isValid: false },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Mentions légales' })).toBeInTheDocument();
    expect(screen.getByText('SIRET').closest('li')).toHaveTextContent('SIRET : valide');
    expect(screen.getByText('Taxe de séjour').closest('li')).toHaveTextContent('Taxe de séjour : non valide');
    expect(screen.queryByText(/active/i)).not.toBeInTheDocument();
  });
});
