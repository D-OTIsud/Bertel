import { render, fireEvent, waitFor, within } from '@testing-library/react';
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
    interlocutorEmail: null,
    source: 'bertel_ui',
    status: 'done',
    resolvedAt: '2026-06-05T10:00:00Z',
    replies: [],
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

  it('clic sur la région navigable → onOpenActor(actorId) quand le callback est fourni', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem()]} showContext={false} onOpenActor={onOpenActor} />);
    // A11y (§66) : c'est la sous-région .tl-card__nav qui porte role=button, pas la carte.
    const nav = container.querySelector('.tl-card__nav') as HTMLElement;
    expect(nav).toHaveAttribute('role', 'button');
    // La carte conteneur reste un <div> neutre (plus de role=button qui imbriquerait des boutons).
    expect(container.querySelector('.tl-card')).not.toHaveAttribute('role', 'button');
    fireEvent.click(nav);
    expect(onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  it('Entrée/Espace au clavier sur la région navigable déclenchent aussi onOpenActor (a11y)', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem()]} showContext={false} onOpenActor={onOpenActor} />);
    const nav = container.querySelector('.tl-card__nav') as HTMLElement;
    fireEvent.keyDown(nav, { key: 'Enter' });
    expect(onOpenActor).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(nav, { key: ' ' });
    expect(onOpenActor).toHaveBeenCalledTimes(2);
  });

  it('sans onOpenActor (fiche acteur), la région navigable n est pas un bouton (pas d auto-lien)', () => {
    const { container } = render(<CrmTimeline items={[makeItem()]} />);
    const nav = container.querySelector('.tl-card__nav') as HTMLElement;
    expect(nav).not.toHaveAttribute('role', 'button');
    expect(container.querySelector('.tl-card')).not.toHaveClass('is-clickable');
  });

  it('actorId absent : région navigable non cliquable même avec onOpenActor', () => {
    const onOpenActor = jest.fn();
    const { container } = render(<CrmTimeline items={[makeItem({ actorId: null })]} onOpenActor={onOpenActor} />);
    const nav = container.querySelector('.tl-card__nav') as HTMLElement;
    expect(nav).not.toHaveAttribute('role', 'button');
    fireEvent.click(nav);
    expect(onOpenActor).not.toHaveBeenCalled();
  });

  it('le tag de contexte garde son propre clic → onOpenObject (stopPropagation, pas l acteur)', () => {
    const onOpenActor = jest.fn();
    const onOpenObject = jest.fn();
    const { container } = render(
      <CrmTimeline items={[makeItem()]} onOpenActor={onOpenActor} onOpenObject={onOpenObject} />,
    );
    // Le tag de contexte est un bouton .ctx-tag DANS la région navigable (role=button) — on le
    // cible par sa classe car le nom accessible de la région englobe « Hotel Basalte & Lagon »
    // (deux boutons matcheraient sinon).
    const ctxTag = container.querySelector('.ctx-tag') as HTMLElement;
    fireEvent.click(ctxTag);
    expect(onOpenObject).toHaveBeenCalledWith('obj-1');
    // stopPropagation : le clic sur le tag NE déclenche PAS l'ouverture de l'acteur.
    expect(onOpenActor).not.toHaveBeenCalled();
  });
});

// §65/§66 — fil de discussion + fix « par Système » + chip de statut.
describe('TlCard — fil de discussion (§65/§66)', () => {
  it('auteur du pied via interactionAuthorOf : interlocuteur quand owner null', () => {
    const { getByText, queryByText } = render(
      <CrmTimeline items={[makeItem({ ownerName: null, interlocutorEmail: 'demande@etab.re', source: 'import_berta2_crm' })]} />,
    );
    // L'interlocuteur connu prime sur « Système » (et même sur l'étiquette import).
    expect(getByText('par demande@etab.re')).toBeInTheDocument();
    expect(queryByText('par Système')).toBeNull();
  });

  it('« par Import Berta 2 » quand owner+interlocuteur null mais source import (plus jamais « Système »)', () => {
    const { getByText } = render(
      <CrmTimeline items={[makeItem({ ownerName: null, interlocutorEmail: null, source: 'import_berta2_crm' })]} />,
    );
    expect(getByText('par Import Berta 2')).toBeInTheDocument();
  });

  it('rend les réponses NICHÉES sous la racine (auteur · date + corps + pastille)', () => {
    const item = makeItem({
      replies: [
        { id: 'r1', interactionType: 'note', body: 'Première réponse.', occurredAt: '2026-06-06T08:00:00Z',
          createdAt: '2026-06-06T08:01:00Z', sentimentCode: 'positif', sentimentName: 'Positif',
          ownerName: 'Florence', interlocutorEmail: null, source: 'bertel_ui' },
        { id: 'r2', interactionType: 'note', body: 'Deuxième réponse.', occurredAt: '2026-06-07T08:00:00Z',
          createdAt: '2026-06-07T08:01:00Z', sentimentCode: null, sentimentName: null,
          ownerName: null, interlocutorEmail: 'client@etab.re', source: 'bertel_ui' },
      ],
    });
    const { container, getByText } = render(<CrmTimeline items={[item]} />);
    const replies = container.querySelectorAll('.tl-replies .tl-reply');
    expect(replies).toHaveLength(2);
    expect(getByText('Première réponse.')).toBeInTheDocument();
    expect(getByText('Deuxième réponse.')).toBeInTheDocument();
    // Auteur de la 2e réponse résolu sur l'interlocuteur (owner null) — fix « par Système ».
    expect(getByText(/client@etab\.re/)).toBeInTheDocument();
  });

  it('aucune réponse → pas de bloc .tl-replies', () => {
    const { container } = render(<CrmTimeline items={[makeItem({ replies: [] })]} />);
    expect(container.querySelector('.tl-replies')).toBeNull();
  });

  it('chip de statut : « En attente » si planned, « Traitée » si done', () => {
    const { getByText, queryByText, rerender } = render(
      <CrmTimeline items={[makeItem({ status: 'planned', resolvedAt: null })]} />,
    );
    expect(getByText('En attente')).toBeInTheDocument();
    expect(queryByText('Traitée')).toBeNull();
    rerender(<CrmTimeline items={[makeItem({ status: 'done', resolvedAt: '2026-06-05T10:00:00Z' })]} />);
    expect(getByText('Traitée')).toBeInTheDocument();
    expect(queryByText('En attente')).toBeNull();
  });
});

// §65/§66 — composer de réponse inline + bascule « Marquer traitée / Rouvrir », gatés.
describe('TlCard — répondre + résoudre (§65/§66)', () => {
  it('sans onReply/onResolve (lecture), aucune action « Répondre » / « Marquer traitée »', () => {
    const { queryByRole } = render(<CrmTimeline items={[makeItem({ status: 'planned' })]} />);
    expect(queryByRole('button', { name: /répondre/i })).toBeNull();
    expect(queryByRole('button', { name: /marquer traitée|rouvrir/i })).toBeNull();
  });

  it('« Répondre » ouvre le composer inline et envoie onReply(rootId, body, sentimentCode)', async () => {
    const onReply = jest.fn().mockResolvedValue(undefined);
    const { getByRole, getByPlaceholderText, getByLabelText } = render(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'planned' })]} canWrite onReply={onReply} />,
    );
    fireEvent.click(getByRole('button', { name: /répondre/i }));
    fireEvent.change(getByPlaceholderText(/votre réponse/i), { target: { value: 'Ma réponse au fil.' } });
    fireEvent.change(getByLabelText('Sentiment de la réponse'), { target: { value: 'positif' } });
    fireEvent.click(getByRole('button', { name: /envoyer/i }));
    await waitFor(() => expect(onReply).toHaveBeenCalledWith('root-1', 'Ma réponse au fil.', 'positif'));
  });

  it('« Répondre » place le focus dans le textarea du composer (a11y §66)', () => {
    const onReply = jest.fn().mockResolvedValue(undefined);
    const { getByRole, getByPlaceholderText } = render(
      <CrmTimeline items={[makeItem({ status: 'planned' })]} canWrite onReply={onReply} />,
    );
    fireEvent.click(getByRole('button', { name: /répondre/i }));
    // À l'ouverture, le curseur est dans le champ de réponse (le composer n'est monté qu'alors).
    expect(getByPlaceholderText(/votre réponse/i)).toHaveFocus();
  });

  it('le composer de réponse a un textarea (≥ 3 lignes) ; « Envoyer » désactivé tant que vide', () => {
    const onReply = jest.fn().mockResolvedValue(undefined);
    const { getByRole, getByPlaceholderText } = render(
      <CrmTimeline items={[makeItem({ status: 'planned' })]} canWrite onReply={onReply} />,
    );
    fireEvent.click(getByRole('button', { name: /répondre/i }));
    const field = getByPlaceholderText(/votre réponse/i);
    expect(field.tagName).toBe('TEXTAREA');
    expect(Number(field.getAttribute('rows'))).toBeGreaterThanOrEqual(3);
    expect(getByRole('button', { name: /envoyer/i })).toBeDisabled();
  });

  it('a11y : aucun contrôle interactif n est imbriqué dans la région role=button (séparation)', () => {
    // §66 — la carte cliquable expose une région de navigation (role=button) ; les contrôles
    // du fil (Répondre / Marquer traitée + composer) sont des FRÈRES de cette région, jamais
    // ses descendants — sinon <button>/<textarea> dans role=button = ARIA/clavier invalides.
    const onReply = jest.fn().mockResolvedValue(undefined);
    const onResolve = jest.fn().mockResolvedValue(undefined);
    const { container, getByRole, getByPlaceholderText } = render(
      <CrmTimeline
        items={[makeItem({ status: 'planned' })]}
        canWrite
        onReply={onReply}
        onResolve={onResolve}
        onOpenActor={jest.fn()}
      />,
    );
    const nav = container.querySelector('.tl-card__nav') as HTMLElement;
    expect(nav).toHaveAttribute('role', 'button');
    // Les boutons d'action du fil ne sont PAS dans la région de navigation.
    expect(nav.contains(getByRole('button', { name: /répondre/i }))).toBe(false);
    expect(nav.contains(getByRole('button', { name: /marquer traitée/i }))).toBe(false);
    // …et le composer (textarea/select/boutons) non plus, une fois ouvert.
    fireEvent.click(getByRole('button', { name: /répondre/i }));
    expect(nav.contains(getByPlaceholderText(/votre réponse/i))).toBe(false);
    expect(nav.contains(getByRole('button', { name: /envoyer/i }))).toBe(false);
    // Garde-fou : sous le role=button, aucun contrôle de fil (textarea/select + boutons
    // Répondre/Marquer traitée/Rouvrir/Envoyer/Annuler). Le tag de contexte (.ctx-tag) reste
    // volontairement dans la région (navigation objet, stopPropagation) — il est exclu du compte.
    const threadControls = Array.from(nav.querySelectorAll('button, textarea, select')).filter(
      (el) => !el.classList.contains('ctx-tag'),
    );
    expect(threadControls).toHaveLength(0);
  });

  it('clic sur la région navigable → onOpenActor même avec des contrôles d action présents', () => {
    // La séparation ne casse pas la navigation : cliquer la région ouvre toujours l'acteur.
    const onOpenActor = jest.fn();
    const { container } = render(
      <CrmTimeline
        items={[makeItem({ status: 'planned' })]}
        canWrite
        onReply={jest.fn()}
        onResolve={jest.fn()}
        onOpenActor={onOpenActor}
      />,
    );
    fireEvent.click(container.querySelector('.tl-card__nav') as HTMLElement);
    expect(onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  it('les contrôles du composer stopPropagation (clic ne navigue PAS vers l acteur)', async () => {
    const onReply = jest.fn().mockResolvedValue(undefined);
    const onOpenActor = jest.fn();
    // La carte cliquable (actorId + onOpenActor) est elle-même role="button" et son nom
    // accessible englobe les libellés ⇒ on scope les requêtes au pied d'actions / composer.
    const { container, getByPlaceholderText } = render(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'planned' })]} canWrite onReply={onReply} onOpenActor={onOpenActor} />,
    );
    const actionsBar = container.querySelector('.tl-actions') as HTMLElement;
    // Ouvrir le composer ne doit pas ouvrir la fiche acteur.
    fireEvent.click(within(actionsBar).getByRole('button', { name: /répondre/i }));
    expect(onOpenActor).not.toHaveBeenCalled();
    fireEvent.change(getByPlaceholderText(/votre réponse/i), { target: { value: 'Réponse.' } });
    const composer = container.querySelector('.tl-reply-composer') as HTMLElement;
    // Envoyer ne déclenche pas non plus la navigation.
    fireEvent.click(within(composer).getByRole('button', { name: /envoyer/i }));
    await waitFor(() => expect(onReply).toHaveBeenCalled());
    expect(onOpenActor).not.toHaveBeenCalled();
  });

  it('« Marquer traitée » → onResolve(rootId, true) ; « Rouvrir » → onResolve(rootId, false)', async () => {
    const onResolve = jest.fn().mockResolvedValue(undefined);
    const { getByRole, rerender } = render(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'planned', resolvedAt: null })]} canWrite onResolve={onResolve} />,
    );
    fireEvent.click(getByRole('button', { name: /marquer traitée/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('root-1', true));
    // Déjà traitée → le bouton bascule sur « Rouvrir ».
    rerender(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'done', resolvedAt: '2026-06-05T10:00:00Z' })]} canWrite onResolve={onResolve} />,
    );
    fireEvent.click(getByRole('button', { name: /rouvrir/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('root-1', false));
  });

  it('« Marquer traitée » stopPropagation (pas de navigation vers l acteur)', async () => {
    const onResolve = jest.fn().mockResolvedValue(undefined);
    const onOpenActor = jest.fn();
    // Carte cliquable ⇒ scope au pied d'actions (le nom accessible de la carte englobe le libellé).
    const { container } = render(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'planned' })]} canWrite onResolve={onResolve} onOpenActor={onOpenActor} />,
    );
    const actionsBar = container.querySelector('.tl-actions') as HTMLElement;
    fireEvent.click(within(actionsBar).getByRole('button', { name: /marquer traitée/i }));
    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(onOpenActor).not.toHaveBeenCalled();
  });

  it('gating : sans permission, actions désactivées avec raison (no-write-trap)', () => {
    const onReply = jest.fn();
    const onResolve = jest.fn();
    const { getByRole } = render(
      <CrmTimeline
        items={[makeItem({ status: 'planned' })]}
        canWrite={false}
        readOnlyReason="Lecture seule : permission requise"
        onReply={onReply}
        onResolve={onResolve}
      />,
    );
    const replyBtn = getByRole('button', { name: /répondre/i });
    const resolveBtn = getByRole('button', { name: /marquer traitée/i });
    expect(replyBtn).toBeDisabled();
    expect(resolveBtn).toBeDisabled();
    expect(replyBtn).toHaveAttribute('title', expect.stringMatching(/lecture seule/i));
  });

  it('échec d envoi → erreur visible inline, composer conservé (pas de double-submit)', async () => {
    const onReply = jest.fn().mockRejectedValue(new Error('refus RLS'));
    const { getByRole, getByPlaceholderText, findByText } = render(
      <CrmTimeline items={[makeItem({ id: 'root-1', status: 'planned' })]} canWrite onReply={onReply} />,
    );
    fireEvent.click(getByRole('button', { name: /répondre/i }));
    fireEvent.change(getByPlaceholderText(/votre réponse/i), { target: { value: 'Texte conservé' } });
    fireEvent.click(getByRole('button', { name: /envoyer/i }));
    expect(await findByText(/refus RLS/)).toBeInTheDocument();
    // Saisie conservée pour retenter.
    expect(getByPlaceholderText(/votre réponse/i)).toHaveValue('Texte conservé');
  });
});
