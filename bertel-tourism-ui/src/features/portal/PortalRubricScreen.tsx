'use client';

/**
 * Le chrome COMMUN d'une rubrique : retour, titre, phrase d'aide, formulaire, garde de sortie.
 *
 * LA GARDE DE SORTIE EST DANS LE BON SENS. `ConfirmDialog` mappe Échap ET le clic hors
 * fenêtre sur `onCancel` : la sortie SÛRE doit donc être le cancel. D'où « Rester » en
 * annulation et « Quitter sans garder » en confirmation (tone danger). L'inverse jetterait
 * la saisie sur une touche Échap malheureuse.
 *
 * `useUnsavedDraftGuard` n'est PAS utilisé, et c'est délibéré : il appelle `window.confirm`
 * avec le message STAFF « Vous avez des modifications non publiées », pousse une entrée
 * d'historique et intercepte tout lien dont la query diffère — avec `?rubrique=` il se
 * déclencherait à CHAQUE retour au hub. Le brouillon local est le filet.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
  /** Horodatage de l'envoi en cours pour cette rubrique, s'il y en a un. */
  sentAt: string | null;
  /** Retour au hub (navigation DOUCE — la page ne se démonte pas). */
  hubHref: string;
  onBack: () => void;
}

export function PortalRubricScreen({
  rubric,
  archetype,
  editor,
  sentLines,
  sentAt,
  hubHref,
  onBack,
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

  function requestLeave() {
    if (formDirty) {
      setAskLeave(true);
      return;
    }
    onBack();
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

      <h1 className="portal-h1" id="portal-rubric-title" tabIndex={-1} ref={headingRef}>
        {rubric.title}
      </h1>
      <p className="portal-lead">{RUBRIC_HELP[rubric.id]}</p>

      {waiting ? (
        <div className="notice">
          <span>
            {sentAt
              ? `Vous avez envoyé une mise à jour de cette rubrique le ${formatPortalDate(sentAt)}. Elle apparaîtra ici une fois vérifiée par l’office.`
              : 'Vous avez envoyé une mise à jour de cette rubrique. Elle apparaîtra ici une fois vérifiée par l’office.'}
            {sentLines.length > 0 ? (
              <>
                {' '}
                Vous aviez indiqué :
                <span className="portal-sent-lines">
                  {sentLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </>
            ) : null}
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
          onDone={onBack}
          onCancel={requestLeave}
          onDirtyChange={setFormDirty}
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
        onCancel={() => setAskLeave(false)}
        onConfirm={() => {
          setAskLeave(false);
          onBack();
        }}
      />
    </section>
  );
}
