'use client';

/**
 * La fiche, vue par le partenaire : une LISTE DE RUBRIQUES, un panneau, une barre d'envoi.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * UN SEUL ARBRE REACT POUR LES DEUX TAILLES D'ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Le conteneur porte `data-view="hub" | "rubric"` et c'est la CSS qui masque : à partir de
 * 1024 px la liste reste à gauche pendant la saisie, en dessous elle s'efface quand une
 * rubrique est ouverte. Aucun `useMediaQuery`, aucun rendu conditionnel par taille — sinon
 * le premier rendu serveur et le premier rendu client divergent (hydratation), le focus
 * saute au franchissement du seuil, et il y a deux chemins à tester au lieu d'un.
 *
 * ⚠ `data-view` est porté par `.portal-fiche-page`. `.portal-fiche` est DÉJÀ la carte d'une
 * fiche sur l'accueil (Task 12) : le réutiliser ici ferait porter à l'accueil les règles de
 * cette page.
 *
 * LA LISTE EST CLIQUABLE PENDANT LA SAISIE (c'est tout l'intérêt des deux colonnes), donc
 * elle DOIT être gardée : chaque lien qui quitte une rubrique modifiée passe par
 * `guardedLeave`, qui délègue la question à l'écran de rubrique — une seule fenêtre, un
 * seul vocabulaire.
 *
 * Chaque état est un MOT avec une icône, jamais une couleur seule.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Clock,
  Info,
  Pencil,
} from 'lucide-react';
import { PortalRubricScreen } from './PortalRubricScreen';
import { PortalSendBar } from './PortalSendBar';
import { PortalVerifyCard } from './PortalVerifyCard';
import { PhotosRubric, PORTAL_PHOTO_TARGET, countPortalPhotos } from './rubrics/PhotosRubric';
import { formatPortalDate, portalProgressLabel } from './portal-format';
import type { PortalFormCache } from './rubrics/rubric-kit';
import type { BuiltPortalRubric, PortalRubricId, RubricState } from './portal-rubrics';
import type { PortalSentSnapshot } from './usePortalDraft';
import type { ArchetypeCode } from '../object-editor/archetypes';
import type { ObjectEditorState } from '../object-editor/useObjectEditorState';
import type { ObjectWorkspaceMediaModule } from '../../services/object-workspace-parser';

/** L'état d'une rubrique, EN MOTS. Table EXHAUSTIVE par construction : un état ajouté au
 *  registre sans libellé casse la compilation plutôt que d'afficher une pastille muette. */
const STATE_BADGE: Record<RubricState, { label: string; className: string; Icon: typeof Check }> = {
  todo: { label: 'À faire', className: 'badge--warn', Icon: Circle },
  filled: { label: 'Rempli', className: 'badge--ok', Icon: Check },
  dirty: { label: 'Modifié — à envoyer', className: 'badge--info', Icon: Pencil },
  pending: { label: 'Envoyé — en vérification', className: 'badge--muted', Icon: Clock },
  rejected: { label: 'À reprendre', className: 'badge--danger', Icon: AlertTriangle },
  unavailable: { label: 'Indisponible pour le moment', className: 'badge--muted', Icon: Info },
};

/**
 * L'office a ACCEPTÉ mais n'a pas encore recopié. C'est le cas DOMINANT (5 rubriques sur 7
 * sont reportées à la main) et il n'a pas d'état au registre : la rubrique retombe sur la
 * donnée PUBLIÉE, qui ne contient pas encore le report. Sans ce libellé, le partenaire
 * rouvre sa rubrique, y retrouve son ancienne valeur avec « Rempli », et ressaisit.
 */
const APPROVED_BADGE = { label: 'Accepté — en cours de report', className: 'badge--info', Icon: Check };

/** Le geste attendu, à l'impératif : « Indiquez vos horaires », pas « Horaires ». */
const TODO_LABEL: Record<PortalRubricId, string> = {
  contacts: 'Indiquez vos coordonnées',
  presentation: 'Présentez votre établissement',
  hours: 'Indiquez vos horaires',
  season: 'Indiquez vos périodes d’ouverture',
  amenities: 'Indiquez vos équipements',
  welcome: 'Indiquez votre capacité d’accueil',
  pricing: 'Indiquez un tarif',
  activity: 'Décrivez votre activité',
};

export interface PortalHubFiche {
  id: string;
  name: string;
  typeLabel: string;
  locality: string;
  address: string;
  publicPhone: string;
  officeEmail: string | null;
  officePhone: string | null;
  /** Nombre de fiches du compte : le lien « Vos fiches » n'a de sens qu'à partir de deux. */
  count: number;
  openSubmission: { id: string; submittedAt: string } | null;
}

export interface PortalRejection {
  module: string;
  rubricId: string | null;
  title: string;
  note: string | null;
}

export interface PortalFicheHubProps {
  fiche: PortalHubFiche;
  archetype: ArchetypeCode;
  rubrics: BuiltPortalRubric[];
  activeRubricId: string | null;
  editor: ObjectEditorState;
  rejections: PortalRejection[];
  /** Modules acceptés par l'office mais pas encore recopiés sur la fiche. */
  approvedModules: Set<string>;
  media: ObjectWorkspaceMediaModule | undefined;
  note: string;
  onNoteChange: (value: string) => void;
  savedAt: string | null;
  /** Un brouillon a été écarté : la fiche avait changé côté office depuis sa prise. */
  draftDiscarded: boolean;
  /** Les titres des rubriques qui n'ont PAS été reprises — on les nomme, on ne les tait pas. */
  discardedRubrics: string[];
  /** Le rafraîchissement a échoué mais la fiche est en cache : on le dit, on ne cache rien. */
  refreshFailed: boolean;
  sentSnapshot: PortalSentSnapshot | null;
  justSent: boolean;
  /** La saisie en cours d'une rubrique — vit ici, donc survit au changement d'écran. */
  formCache: PortalFormCache;
  onSend: () => void;
  onDiscard: () => void;
  onBackToHub: () => void;
}

export function PortalFicheHub({
  fiche,
  archetype,
  rubrics,
  activeRubricId,
  editor,
  rejections,
  approvedModules,
  media,
  note,
  onNoteChange,
  savedAt,
  draftDiscarded,
  discardedRubrics,
  refreshFailed,
  sentSnapshot,
  justSent,
  formCache,
  onSend,
  onDiscard,
  onBackToHub,
}: PortalFicheHubProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<HTMLElement>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const active = rubrics.find((rubric) => rubric.id === activeRubricId) ?? null;

  useEffect(() => {
    // Le remerciement passe avant le titre : c'est la réponse à l'action qui vient d'avoir
    // lieu. Pas de toast — il couvrirait la barre haute sur un téléphone.
    if (justSent) {
      thanksRef.current?.focus();
      return;
    }
    if (!active) headingRef.current?.focus();
  }, [justSent, active]);

  /**
   * Tout lien qui QUITTE une rubrique passe par ici. Sans saisie en cours il laisse
   * filer ; sinon il retient la destination et demande à l'écran de rubrique d'ouvrir sa
   * fenêtre de confirmation.
   */
  const guardedLeave = useCallback(
    (href: string) => (event: MouseEvent) => {
      if (!active || !formDirty) return;
      event.preventDefault();
      setLeaveTarget(href);
    },
    [active, formDirty],
  );

  const resolveLeave = useCallback(
    (leave: boolean) => {
      const href = leaveTarget;
      setLeaveTarget(null);
      if (leave && href) router.push(href, { scroll: false });
    },
    [leaveTarget, router],
  );

  const dirty = rubrics.filter((rubric) => rubric.state === 'dirty');
  // Une rubrique DÉJÀ partie en vérification et remodifiée depuis : sa saisie est au chaud
  // mais rien ne peut partir tant que l'office n'a pas répondu. Sans ce comptage, « Valider »
  // n'a AUCUN effet visible et la phrase prévue pour ce cas est inatteignable.
  const held = rubrics.filter((rubric) => rubric.state === 'pending' && editor.dirtySections[rubric.module]);
  const todo = rubrics.filter((rubric) => rubric.state === 'todo');
  const countable = rubrics.filter((rubric) => rubric.state !== 'unavailable');
  const done = countable.filter((rubric) => rubric.state !== 'todo').length;
  const photos = countPortalPhotos(media);
  const photosMissing = photos < PORTAL_PHOTO_TARGET;
  const hubHref = `/espace/fiches/${fiche.id}`;
  const rubricHref = (id: string) => `${hubHref}?rubrique=${id}`;

  return (
    <div className="portal-fiche-page" data-view={active ? 'rubric' : 'hub'}>
      <div className="portal-fiche-head">
        {justSent ? (
          <div className="portal-card panel-card motion-success portal-thanks" role="status" tabIndex={-1} ref={thanksRef}>
            <CheckCircle size={28} aria-hidden />
            <h2>Merci ! Vos modifications ont été envoyées à l’office.</h2>
            <p>L’office les vérifie, en général sous une semaine. Vous recevrez un e-mail quand ce sera fait.</p>
            {fiche.count >= 2 ? (
              <Link className="ghost-button" href="/espace">
                Retour à vos fiches
              </Link>
            ) : null}
          </div>
        ) : null}

        {fiche.count >= 2 ? (
          <Link className="portal-back" href="/espace" onClick={guardedLeave('/espace')}>
            ← Vos fiches
          </Link>
        ) : null}

        <h1 className="portal-h1" tabIndex={-1} ref={headingRef}>
          {fiche.name}
        </h1>
        <p className="muted">{[fiche.typeLabel, fiche.locality].filter(Boolean).join(' · ')}</p>

        {refreshFailed ? (
          <p className="notice notice--warn">
            <Info size={18} aria-hidden /> Nous n’avons pas pu vérifier les dernières informations. Voici votre fiche
            telle qu’elle était enregistrée sur cet appareil. Vos modifications sont toujours là.
          </p>
        ) : null}

        {draftDiscarded ? (
          <div className="notice notice--warn" role="status" aria-label="Modifications non reprises">
            <AlertTriangle size={18} aria-hidden />
            <span>
              L’office a modifié votre fiche depuis votre dernière visite.
              {discardedRubrics.length > 0 ? (
                <>
                  {' '}
                  Ces rubriques n’ont pas été reprises, pour ne pas écraser son travail :{' '}
                  <strong>{discardedRubrics.join(', ')}</strong>. Vérifiez la fiche, puis refaites ces changements.
                </>
              ) : (
                <> Les modifications enregistrées sur cet appareil n’ont pas été reprises.</>
              )}{' '}
              Votre message à l’office a été gardé.
            </span>
          </div>
        ) : null}

        <p className="notice">
          <Info size={18} aria-hidden /> Ce que vous modifiez ici est vérifié par l’office avant d’être publié.
        </p>

        {fiche.openSubmission ? (
          <p className="notice notice--warn">
            <Clock size={18} aria-hidden /> Envoyé le {formatPortalDate(fiche.openSubmission.submittedAt)}. L’office
            vérifie vos modifications. Vous pouvez continuer à préparer d’autres changements.
          </p>
        ) : null}

        {rejections.length > 0 ? (
          <section className="portal-card panel-card panel-card--warning portal-returns" aria-label="Retours de l’office">
            <h2>Retours de l’office</h2>
            <p>L’office n’a pas pu garder une modification :</p>
            <ul>
              {rejections.map((rejection) => (
                <li key={`${rejection.module}-${rejection.title}`}>
                  <p>
                    <strong>{rejection.title}</strong> — refusé{rejection.note ? ' : ' : '.'}
                  </p>
                  {rejection.note ? <blockquote>{rejection.note}</blockquote> : null}
                  {rejection.rubricId ? (
                    <Link
                      className="ghost-button"
                      href={rubricHref(rejection.rubricId)}
                      scroll={false}
                      onClick={guardedLeave(rubricHref(rejection.rubricId))}
                    >
                      Corriger
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="portal-progress">
          <p>{portalProgressLabel(done, countable.length)}</p>
          {/* La barre est DÉCORATIVE : la valeur est portée par la phrase juste au-dessus. */}
          <span className="portal-progress__track" aria-hidden>
            <span style={{ width: `${countable.length > 0 ? Math.round((done / countable.length) * 100) : 0}%` }} />
          </span>
        </div>

        {todo.length > 0 || photosMissing ? (
          <section className="portal-card portal-todo" aria-label="Pour compléter votre fiche">
            <h2>Pour compléter votre fiche</h2>
            {todo.map((rubric) => (
              <Link
                key={rubric.id}
                className="ghost-button"
                href={rubricHref(rubric.id)}
                scroll={false}
                onClick={guardedLeave(rubricHref(rubric.id))}
              >
                <Circle size={16} aria-hidden /> {TODO_LABEL[rubric.id]}
              </Link>
            ))}
            {photosMissing ? (
              // Un bouton, pas une ancre : une ancre fait défiler SANS déplacer le focus,
              // et un utilisateur au clavier reste là où il était.
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  photosRef.current?.scrollIntoView({ block: 'start' });
                  photosRef.current?.focus();
                }}
              >
                <Circle size={16} aria-hidden /> {`Ajoutez des photos (${photos} sur ${PORTAL_PHOTO_TARGET})`}
              </button>
            ) : null}
          </section>
        ) : (
          <p className="notice">
            <Check size={18} aria-hidden /> Votre fiche est complète. Merci !
          </p>
        )}
      </div>

      <div className="portal-fiche-layout">
        <ol className="portal-tasks portal-hub-list" aria-label="Les rubriques de votre fiche">
          {rubrics.map((rubric) => {
            // « À faire » compris : quand la valeur acceptée n'est pas encore recopiée, la
            // donnée publiée peut être VIDE — c'est le cas où le partenaire ressaisit le plus.
            const approvedPending =
              approvedModules.has(rubric.module) && (rubric.state === 'filled' || rubric.state === 'todo');
            const badge = approvedPending ? APPROVED_BADGE : STATE_BADGE[rubric.state];
            const summary = rubric.summary(editor.draft, archetype);
            const heldHere = rubric.state === 'pending' && editor.dirtySections[rubric.module];
            const body = (
              <>
                <span className="portal-task__body">
                  <span className="portal-task__title">{rubric.title}</span>
                  <span className="portal-task__summary">{summary || 'Pas encore renseigné'}</span>
                  {heldHere ? (
                    <span className="portal-task__held">Vos nouveaux changements sont gardés ici.</span>
                  ) : null}
                </span>
                <span className={`badge ${badge.className}`}>
                  <badge.Icon size={14} aria-hidden /> {badge.label}
                </span>
              </>
            );
            return (
              <li key={rubric.id}>
                {rubric.state === 'unavailable' ? (
                  // Non cliquable : ouvrir un écran qui ne peut rien enregistrer serait un
                  // bouton qui échoue.
                  <span className="portal-task__link portal-task__link--off">{body}</span>
                ) : (
                  <Link
                    className="portal-task__link"
                    href={rubricHref(rubric.id)}
                    scroll={false}
                    aria-current={rubric.id === activeRubricId ? 'step' : undefined}
                    onClick={guardedLeave(rubricHref(rubric.id))}
                  >
                    {body}
                    <ChevronRight size={20} aria-hidden className="portal-fiche__chevron" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        <div className="portal-panel">
          {active ? (
            <PortalRubricScreen
              rubric={active}
              archetype={archetype}
              editor={editor}
              sentLines={sentSnapshot?.lines[active.module] ?? []}
              sentAt={sentSnapshot?.submittedAt ?? fiche.openSubmission?.submittedAt ?? null}
              approved={approvedModules.has(active.module)}
              hubHref={hubHref}
              formCache={formCache}
              leaveRequested={leaveTarget !== null}
              onLeaveResolved={resolveLeave}
              onBack={onBackToHub}
              onDirtyChange={setFormDirty}
            />
          ) : (
            <>
              <PhotosRubric
                ref={photosRef}
                media={media}
                ficheName={fiche.name}
                officeEmail={fiche.officeEmail}
                officePhone={fiche.officePhone}
              />
              <PortalVerifyCard
                ficheName={fiche.name}
                typeLabel={fiche.typeLabel}
                address={fiche.address}
                publicPhone={fiche.publicPhone}
                officeEmail={fiche.officeEmail}
                officePhone={fiche.officePhone}
                note={note}
                onNoteChange={onNoteChange}
                hasPendingChanges={dirty.length > 0}
              />
            </>
          )}
        </div>
      </div>

      <PortalSendBar
        dirtyCount={dirty.length}
        heldCount={held.length}
        savedAt={savedAt}
        verificationOpen={Boolean(fiche.openSubmission)}
        onSend={onSend}
        onDiscard={onDiscard}
      />
    </div>
  );
}
