import {
  interactionStatusLabel,
  interactionStatusTone,
  isOpenInteractionStatus,
  isKnownInteractionStatus,
  CLOSED_INTERACTION_STATUSES,
} from './crm-status';

describe('crm-status — registre bilingue', () => {
  it('libelle les six statuts du nouveau vocabulaire', () => {
    expect(interactionStatusLabel('new')).toBe('En attente de traitement');
    expect(interactionStatusLabel('in_progress')).toBe('En cours');
    expect(interactionStatusLabel('awaiting_provider')).toBe('Attente prestataire');
    expect(interactionStatusLabel('resolved')).toBe('Traitée');
    expect(interactionStatusLabel('closed')).toBe('Clôturée');
    expect(interactionStatusLabel('canceled')).toBe('Annulée');
  });

  it('libelle encore l’ancien vocabulaire — la base parle planned/done jusqu’à la bascule', () => {
    expect(interactionStatusLabel('planned')).toBe('En attente');
    expect(interactionStatusLabel('done')).toBe('Traitée');
  });

  it('rend null pour un statut inconnu ou absent — jamais un libellé inventé', () => {
    expect(interactionStatusLabel('draft')).toBeNull();
    expect(interactionStatusLabel(null)).toBeNull();
    expect(interactionStatusLabel(undefined)).toBeNull();
  });

  it('classe les tons par famille', () => {
    expect(interactionStatusTone('new')).toBe('open');
    expect(interactionStatusTone('planned')).toBe('open');
    expect(interactionStatusTone('in_progress')).toBe('open');
    expect(interactionStatusTone('awaiting_provider')).toBe('waiting');
    expect(interactionStatusTone('resolved')).toBe('done');
    expect(interactionStatusTone('done')).toBe('done');
    expect(interactionStatusTone('closed')).toBe('closed');
    expect(interactionStatusTone('canceled')).toBe('canceled');
  });

  it('dit ouvert dans les deux vocabulaires', () => {
    for (const s of ['planned', 'new', 'in_progress', 'awaiting_provider']) {
      expect(isOpenInteractionStatus(s)).toBe(true);
    }
    for (const s of ['done', 'resolved', 'closed', 'canceled', null, undefined]) {
      expect(isOpenInteractionStatus(s)).toBe(false);
    }
  });

  it('le jeu fermé couvre les deux vocabulaires — le prompt du kanban en dépend', () => {
    for (const s of ['done', 'resolved', 'closed', 'canceled']) {
      expect(CLOSED_INTERACTION_STATUSES.has(s)).toBe(true);
    }
    expect(CLOSED_INTERACTION_STATUSES.has('awaiting_provider')).toBe(false);
  });

  it('connaît les huit codes du registre (nouveau vocabulaire + legacy)', () => {
    for (const s of [
      'new',
      'in_progress',
      'awaiting_provider',
      'resolved',
      'closed',
      'canceled',
      'planned',
      'done',
    ]) {
      expect(isKnownInteractionStatus(s)).toBe(true);
    }
  });

  it('ne connaît pas un code inventé, ni null/undefined/chaîne vide', () => {
    expect(isKnownInteractionStatus('draft')).toBe(false);
    expect(isKnownInteractionStatus(null)).toBe(false);
    expect(isKnownInteractionStatus(undefined)).toBe(false);
    expect(isKnownInteractionStatus('')).toBe(false);
  });
});
