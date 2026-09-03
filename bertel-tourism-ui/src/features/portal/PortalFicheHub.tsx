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
 * Chaque état est un MOT avec une icône, jamais une couleur seule.
 */
import { useEffect, useRef } from 'react';
import Link from 'next/link';
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
  media: ObjectWorkspaceMediaModule | undefined;
  note: string;
  onNoteChange: (value: string) => void;
  savedAt: string | null;
  /** Un brouillon a été écarté : la fiche avait changé côté office depuis sa prise. */
  draftDiscarded: boolean;
  sentSnapshot: PortalSentSnapshot | null;
  justSent: boolean;
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
  media,
  note,
  onNoteChange,
  savedAt,
  draftDiscarded,
  sentSnapshot,
  justSent,
  onSend,
  onDiscard,
  onBackToHub,
}: PortalFicheHubProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);
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

  const dirty = rubrics.filter((rubric) => rubric.state === 'dirty');
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
            <p>
              L’office les vérifie, en général sous une semaine. Vous recevrez un e-mail quand ce sera fait.
            </p>
            {fiche.count >= 2 ? (
              <Link className="ghost-button" href="/espace">
                Retour à vos fiches
              </Link>
            ) : null}
          </div>
        ) : null}

        {fiche.count >= 2 ? (
          <Link className="portal-back" href="/espace">
            ← Vos fiches
          </Link>
        ) : null}

        <h1 className="portal-h1" tabIndex={-1} ref={headingRef}>
          {fiche.name}
        </h1>
        <p className="muted">{[fiche.typeLabel, fiche.locality].filter(Boolean).join(' · ')}</p>

        {draftDiscarded ? (
          <p className="notice notice--warn">
            L’office a modifié votre fiche depuis votre dernière visite. Les modifications enregistrées sur cet appareil
            n’ont pas été reprises, pour ne pas écraser son travail. Vérifiez la fiche, puis refaites vos changements.
          </p>
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
                    <Link className="ghost-button" href={rubricHref(rejection.rubricId)} scroll={false}>
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
              <Link key={rubric.id} className="ghost-button" href={rubricHref(rubric.id)} scroll={false}>
                <Circle size={16} aria-hidden /> {TODO_LABEL[rubric.id]}
              </Link>
            ))}
            {photosMissing ? (
              <a className="ghost-button" href="#portal-photos-title">
                <Circle size={16} aria-hidden /> {`Ajoutez des photos (${photos} sur ${PORTAL_PHOTO_TARGET})`}
              </a>
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
            const badge = STATE_BADGE[rubric.state];
            const summary = rubric.summary(editor.draft, archetype);
            const body = (
              <>
                <span className="portal-task__body">
                  <span className="portal-task__title">{rubric.title}</span>
                  <span className="portal-task__summary">{summary || 'Pas encore renseigné'}</span>
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
              hubHref={hubHref}
              onBack={onBackToHub}
            />
          ) : (
            <>
              <PhotosRubric
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
        savedAt={savedAt}
        verificationOpen={Boolean(fiche.openSubmission)}
        onSend={onSend}
        onDiscard={onDiscard}
      />
    </div>
  );
}
