'use client';

/**
 * Le chrome COMMUN d'une rubrique : retour, titre, phrase d'aide, formulaire, garde de sortie.
 *
 * LA GARDE DE SORTIE COUVRE TOUTES LES SORTIES, pas les deux boutons de cet écran. Sur
 * ordinateur la liste des rubriques reste collée à gauche et cliquable pendant toute la
 * saisie : c'est la sortie la plus naturelle, et c'était la seule non gardée — un clic sur
 * « Vos tarifs » jetait les horaires en cours, en silence. Le hub intercepte donc ses liens
 * et demande à cet écran d'ouvrir SA fenêtre (`leaveRequested`) : un seul vocabulaire, une
 * seule fenêtre.
 *
 * LA GARDE EST DANS LE BON SENS. `ConfirmDialog` mappe Échap ET le clic hors fenêtre sur
 * `onCancel` : la sortie SÛRE doit donc être le cancel. D'où « Rester » en annulation et
 * « Quitter sans garder » en confirmation (tone danger).
 *
 * LE TITRE EST UN `h2`. À partir de 1024 px, le titre de la fiche et celui de la rubrique
 * sont montés ENSEMBLE : deux `h1` visibles simultanément laissent un lecteur d'écran sans
 * hiérarchie. La fiche est la page, la rubrique en est une section.
 *
 * `useUnsavedDraftGuard` n'est PAS utilisé, et c'est délibéré : il appelle `window.confirm`
 * avec le message STAFF « Vous avez des modifications non publiées », pousse une entrée
 * d'historique et intercepte tout lien dont la query diffère — avec `?rubrique=` il se
 * déclencherait à CHAQUE retour au hub.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ActivityRubric } from './rubrics/ActivityRubric';
import { AmenitiesRubric } from './rubrics/AmenitiesRubric';
import { ContactsRubric } from './rubrics/ContactsRubric';
import { HoursRubric } from './rubrics/HoursRubric';
import { PresentationRubric } from './rubrics/PresentationRubric';
import { PricingRubric } from './rubrics/PricingRubric';
import { SeasonRubric } from './rubrics/SeasonRubric';
import { WelcomeRubric } from './rubrics/WelcomeRubric';
import { formatPortalDate } from './portal-format';
import type { PortalFormCache } from './rubrics/rubric-kit';
import type { BuiltPortalRubric, PortalRubricId } from './portal-rubrics';
import type { ArchetypeCode } from '../object-editor/archetypes';
import type { ObjectEditorState } from '../object-editor/useObjectEditorState';
import type { PortalRubricFormProps } from './rubrics/types';

/** Une phrase d'aide par rubrique, en français courant : ce que le visiteur en verra. */
const RUBRIC_HELP: Record<PortalRubricId, string> = {
  contacts: 'Ces coordonnées sont affichées aux visiteurs.',
  presentation: 'Ce texte est lu par les visiteurs avant de venir chez vous.',
  hours: 'Indiquez vos jours et heures d’ouverture habituels.',
  season: 'Indiquez la période où vous accueillez des visiteurs, et vos fermetures.',
  amenities: 'Cochez ce que vous proposez. Les visiteurs filtrent souvent là-dessus.',
  welcome: 'Ce que vous pouvez accueillir, et à quelles conditions.',
  pricing: 'Le tarif que les visiteurs verront en premier.',
  activity: 'Ce qu’il faut savoir avant de réserver votre activité.',
};

const FORMS: Record<PortalRubricId, (props: PortalRubricFormProps) => React.ReactElement> = {
  contacts: ContactsRubric,
  presentation: PresentationRubric,
  hours: HoursRubric,
  season: SeasonRubric,
  amenities: AmenitiesRubric,
  welcome: WelcomeRubric,
  pricing: PricingRubric,
  activity: ActivityRubric,
};

export interface PortalRubricScreenProps {
  rubric: BuiltPortalRubric;
  archetype: ArchetypeCode;
  editor: ObjectEditorState;
  /** Ce qui a été envoyé pour cette rubrique, tel que le partenaire l'avait écrit. */
  sentLines: string[];
  /** Horodatage de l'envoi correspondant, s'il y en a un. */
  sentAt: string | null;
  /** L'office a ACCEPTÉ cette modification mais ne l'a pas encore reportée sur la fiche. */
  approved: boolean;
  /** Retour au hub (navigation DOUCE — la page ne se démonte pas). */
  hubHref: string;
  /** La saisie en cours, tenue par le hub : elle survit au démontage de cet écran. */
  formCache: PortalFormCache;
  /** Le hub demande la sortie (clic sur la liste, « Corriger », « Pour compléter »…). */
  leaveRequested?: boolean;
  /** Réponse à cette demande : `true` = le partenaire accepte de perdre sa saisie. */
  onLeaveResolved?: (leave: boolean) => void;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function PortalRubricScreen({
  rubric,
  archetype,
  editor,
  sentLines,
  sentAt,
  approved,
  hubHref,
  formCache,
  leaveRequested = false,
  onLeaveResolved,
  onBack,
  onDirtyChange,
}: PortalRubricScreenProps) {
  const [formDirty, setFormDirty] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Le titre du panneau prend le focus à l'ouverture : sur téléphone, la liste vient de
    // disparaître, et un lecteur d'écran doit savoir où il a atterri.
    headingRef.current?.focus();
    setFormDirty(false);
  }, [rubric.id]);

  // Le hub a intercepté un lien : il ne connaît pas l'état du formulaire, c'est ici qu'on
  // décide s'il faut demander ou laisser passer.
  useEffect(() => {
    if (!leaveRequested) return;
    if (formDirty) setAskLeave(true);
    else onLeaveResolved?.(true);
  }, [leaveRequested, formDirty, onLeaveResolved]);

  function reportDirty(dirty: boolean) {
    setFormDirty(dirty);
    onDirtyChange(dirty);
  }

  function requestLeave() {
    if (formDirty) {
      setAskLeave(true);
      return;
    }
    onBack();
  }

  /** « Quitter sans garder » doit dire vrai : la saisie en cours est OUBLIÉE. */
  function leaveWithoutKeeping() {
    formCache.delete(rubric.id);
    setAskLeave(false);
    if (leaveRequested) {
      onLeaveResolved?.(true);
      return;
    }
    onBack();
  }

  function stay() {
    setAskLeave(false);
    if (leaveRequested) onLeaveResolved?.(false);
  }

  const Form = FORMS[rubric.id];
  const waiting = rubric.state === 'pending' || rubric.state === 'rejected';

  return (
    <section className="portal-rubric" aria-labelledby="portal-rubric-title">
      <Link
        className="portal-back"
        href={hubHref}
        scroll={false}
        onClick={(event) => {
          if (!formDirty) return;
          event.preventDefault();
          setAskLeave(true);
        }}
      >
        <ArrowLeft size={18} aria-hidden /> Retour à la fiche
      </Link>

      <h2 className="portal-h1" id="portal-rubric-title" tabIndex={-1} ref={headingRef}>
        {rubric.title}
      </h2>
      <p className="portal-lead">{RUBRIC_HELP[rubric.id]}</p>

      {waiting ? (
        <div className="notice">
          <Clock size={18} aria-hidden />
          <span>
            {sentAt
              ? `Vous avez envoyé une mise à jour de cette rubrique le ${formatPortalDate(sentAt)}. Elle apparaîtra ici une fois vérifiée par l’office.`
              : 'Vous avez envoyé une mise à jour de cette rubrique. Elle apparaîtra ici une fois vérifiée par l’office.'}
            <SentLines lines={sentLines} />
          </span>
        </div>
      ) : null}

      {approved && !waiting ? (
        // `approved` est la forme DOMINANTE (5 rubriques sur 7) : l'office accepte, puis
        // recopie À LA MAIN. Entre les deux, la rubrique montre l'ANCIENNE valeur publiée —
        // sans cette phrase, le partenaire croit son envoi perdu et ressaisit.
        <div className="notice">
          <Check size={18} aria-hidden />
          <span>
            {sentAt
              ? `L’office a accepté cette modification le ${formatPortalDate(sentAt)}. Elle apparaîtra sur votre fiche dès qu’il l’aura recopiée.`
              : 'L’office a accepté cette modification. Elle apparaîtra sur votre fiche dès qu’il l’aura recopiée.'}
            <SentLines lines={sentLines} />
          </span>
        </div>
      ) : null}

      {rubric.state === 'unavailable' || rubric.readOnlyReason ? (
        <>
          <p className="notice notice--warn">{rubric.readOnlyReason}</p>
          <button type="button" className="ghost-button" onClick={onBack}>
            Retour à la fiche
          </button>
        </>
      ) : (
        <Form
          rubric={rubric}
          archetype={archetype}
          editor={editor}
          formKey={rubric.id}
          formCache={formCache}
          onDone={() => {
            // Validé : plus rien à garder en réserve, la valeur vit dans l'éditeur.
            formCache.delete(rubric.id);
            onBack();
          }}
          onCancel={requestLeave}
          onDirtyChange={reportDirty}
        />
      )}

      <ConfirmDialog
        open={askLeave}
        className="portal-modal"
        title="Quitter sans valider ?"
        message="Vos changements dans cette rubrique ne seront pas gardés."
        // Échap et le clic hors fenêtre tombent sur `onCancel` : c'est donc « Rester ».
        cancelLabel="Rester"
        confirmLabel="Quitter sans garder"
        tone="danger"
        onCancel={stay}
        onConfirm={leaveWithoutKeeping}
      />
    </section>
  );
}

/** Ce que le partenaire avait écrit, relu depuis l'instantané local. */
function SentLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {' '}
      Vous aviez indiqué :
      <span className="portal-sent-lines">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </>
  );
}
