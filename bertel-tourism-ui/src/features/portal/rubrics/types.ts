/**
 * Le contrat commun des formulaires de rubrique du portail (18a).
 *
 * Chaque rubrique écrit UNE tranche via son updater pur (`portal-bindings`) puis rend la
 * main au hub. Elle ne connaît ni la navigation, ni l'envoi, ni le brouillon : le chrome
 * (`PortalRubricScreen`) porte le retour, le titre et la confirmation de sortie.
 */
import type { ArchetypeCode } from '../../object-editor/archetypes';
import type { ObjectEditorState } from '../../object-editor/useObjectEditorState';
import type { BuiltPortalRubric } from '../portal-rubrics';
import type { PortalFormCache } from './rubric-kit';

export interface PortalRubricFormProps {
  rubric: BuiltPortalRubric;
  archetype: ArchetypeCode;
  editor: ObjectEditorState;
  /**
   * Clé de resynchronisation §212 — change dès que la rubrique affichée change. L'état
   * local se réaligne alors PENDANT LE RENDU, jamais dans un effet (un rendu avec les
   * valeurs de la rubrique précédente serait visible).
   */
  formKey: string;
  /** « Valider » a écrit la tranche : retour au hub. */
  onDone: () => void;
  /** « Retour sans changer » — le chrome décide s'il faut confirmer. */
  onCancel: () => void;
  /** Remonte l'état « ce formulaire a été touché » au chrome, qui garde la sortie. */
  onDirtyChange: (dirty: boolean) => void;
  /**
   * La saisie en cours, tenue par le hub. Elle survit au démontage de l'écran — c'est le
   * seul filet du bouton Retour du téléphone, qui ne passe par aucun lien interceptable.
   */
  formCache?: PortalFormCache;
}
