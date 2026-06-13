import { render, fireEvent, within } from '@testing-library/react';
import { CrmTimeline, Pav, type CrmTimelineCardItem } from './crm-primitives';

// Repli portrait acteur (revue) : une photo cassée/404 retombe sur les initiales teintées —
// jamais de tuile vide (le GC des orphelins storage est différé ⇒ des url mortes existeront).
describe('Pav — portrait acteur', () => {
  it('rend l img quand photoUrl est fourni', () => {
    const { container } = render(<Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/p.jpg" />);
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://cdn/p.jpg');
    // alt décoratif (le nom est rendu à côté).
    expect(img).toHaveAttribute('alt', '');
  });

  it('rend les initiales quand photoUrl est absent', () => {
    const { container, getByText } = render(<Pav name="Marie Hoarau" tintKey="actor-1" />);
    expect(container.querySelector('.pav--photo')).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('une photo cassée retombe sur les initiales', () => {
    const { container, queryByText, getByText } = render(
      <Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/dead.jpg" />,
    );
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(queryByText('MH')).toBeNull(); // encore l'image, pas d'initiales

    fireEvent.error(img as Element);

    // L'image a disparu ⇒ repli sur la tuile d'initiales teintées.
    expect(container.querySelector('.pav--photo')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('change de photoUrl ⇒ l état d erreur est remis à zéro (pas de repli qui colle)', () => {
    const { container, rerender } = render(
      <Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/dead.jpg" />,
    );
    fireEvent.error(container.querySelector('.pav--photo img') as Element);
    expect(container.querySelector('.pav--photo')).toBeNull(); // cassée → initiales

    // Nouvel acteur avec une photo valide : on retente l'image (l'erreur ne colle pas).
    rerender(<Pav name="Jean Payet" tintKey="actor-2" photoUrl="https://cdn/fresh.jpg" />);
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://cdn/fresh.jpg');
  });
});

// Rectif PO v5 points 4+5 : la carte timeline porte le SUJET en titre + le référent en pied,
// et devient cliquable → fiche acteur quand onOpenActor + actorId sont fournis.
function makeItem(overrides: Partial<CrmTimelineCardItem> = {}): CrmTimelineCardItem {
  return {
    id: 'i1',
    interactionType: 'note',
    subject: 'Note interne',
    body: 'Corps de la note.',
    occurredAt: '2026-06-04T10:00:00Z',
    topicName: 'Modification infos BDD',
    sentimentCode: 'positif',
    sentimentName: 'Positif',
    objectId: 'obj-1',
    objectName: 'Hotel Basalte & Lagon',
    ownerName: 'Florence',
    actorName: 'Mme Marie Hoarau',
    actorId: 'actor-1',
    ...overrides,
  };
}

describe('CrmTimeline / TlCard (rectif PO v5 points 4+5)', () => {
  it('titre = sujet normalisé (topicName) prioritaire, type relégué en pastille', () => {
    const { container, getByText } = render(<CrmTimeline items={[makeItem()]} />);
    // Le titre (strong) porte le sujet normalisé, PAS le type d'interaction.
    expect(container.querySelector('.tl-card__top strong')?.textContent).toBe('Modification infos BDD');
    // Le type reste affiché, en pastille secondaire seulement.
    expect(getByText('Note interne')).toBeInTheDocument();
  });

  it('titre : sans topicName, retombe sur subject (ex. « Note interne » des lignes importées)', () => {
    const { container } = render(<CrmTimeline items={[makeItem({ topicName: null, subject: 'Note interne' })]} />);
    expect(container.querySelector('.tl-card__top strong')?.textContent).toBe('Note interne');
  });

  it('titre : sans topicName ni subject, retombe sur le libellé du type', () => {
    const { container } = render(<CrmTimeline items={[makeItem({ topicName: null, subject: '', interactionType: 'call' })]} />);
    expect(container.querySelector('.tl-card__top strong')?.textContent).toBe('Appel');
  });

  it('référent affiché en pied : « par {ownerName} », « par Système » si absent', () => {
    const { getByText, rerender } = render(<CrmTimeline items={[makeItem()]} />);
    expect(getByText('par Florence')).toBeInTheDocument();
    rerender(<CrmTimeline items={[makeItem({ ownerName: null })]} />);
    expect(getByText('par Système')).toBeInTheDocument();
  });

  it('clic sur la carte → onOpenActor(actorId) quand le callback est fourni', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem()]} showContext={false} onOpenActor={onOpenActor} />);
    const card = container.querySelector('.tl-card') as HTMLElement;
    expect(card).toHaveAttribute('role', 'button');
    fireEvent.click(card);
    expect(onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  it('Entrée/Espace au clavier déclenchent aussi onOpenActor (a11y)', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem()]} showContext={false} onOpenActor={onOpenActor} />);
    const card = container.querySelector('.tl-card') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onOpenActor).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpenActor).toHaveBeenCalledTimes(2);
  });

  it('sans onOpenActor (fiche acteur), la carte n est pas un bouton (pas d auto-lien)', () => {
    const { container } = render(<CrmTimeline items={[makeItem()]} />);
    const card = container.querySelector('.tl-card') as HTMLElement;
    expect(card).not.toHaveAttribute('role', 'button');
    expect(card).not.toHaveClass('is-clickable');
  });

  it('actorId absent : carte non cliquable même avec onOpenActor', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem({ actorId: null })]} onOpenActor={onOpenActor} />);
    const card = container.querySelector('.tl-card') as HTMLElement;
    expect(card).not.toHaveAttribute('role', 'button');
    fireEvent.click(card);
    expect(onOpenActor).not.toHaveBeenCalled();
  });

  it('le tag de contexte garde son propre clic → onOpenObject (stopPropagation, pas l acteur)', () => {
    const onOpenActor = jest.fn();
    const onOpenObject = jest.fn();
    const { container } = render(
      <CrmTimeline items={[makeItem()]} onOpenActor={onOpenActor} onOpenObject={onOpenObject} />,
    );
    const card = container.querySelector('.tl-card') as HTMLElement;
    const ctxTag = within(card).getByRole('button', { name: /hotel basalte/i });
    fireEvent.click(ctxTag);
    expect(onOpenObject).toHaveBeenCalledWith('obj-1');
    // stopPropagation : le clic sur le tag NE déclenche PAS l'ouverture de l'acteur.
    expect(onOpenActor).not.toHaveBeenCalled();
  });
});
