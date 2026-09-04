'use client';

/**
 * « Portail acteurs » (/settings, 18a §4.3-4.5) — quelles rubriques un partenaire peut
 * remplir lui-même, type de fiche par type de fiche.
 *
 * PUBLIC : un agent d'office. Le vocabulaire métier y est légitime (« prestataire », « type
 * de fiche ») — contrairement au portail lui-même, où il est proscrit.
 *
 * CE QUI EST LISTÉ. Les RUBRIQUES du portail (`PORTAL_RUBRICS`), pas les 22 sections de
 * l'éditeur : le partenaire ne voit jamais que ces sept-là, et régler une section qu'aucun
 * écran ne rend serait un réglage sans effet — donc un mensonge. La liste suit l'ARCHÉTYPE
 * du type choisi : un gîte n'a pas d'horaires à la journée, un restaurant n'a pas de
 * calendrier saisonnier. La source est le registre du portail, jamais une copie locale.
 *
 * LE PLANCHER DUR ne se règle pas : `api.actor_portal_floor_modules()` est une FONCTION SQL,
 * et `api.rpc_set_actor_section_visibility` refuse en 22023 toute écriture qui le vise — même
 * pour RE-ouvrir un de ses modules. L'écran le rend donc verrouillé, et le dit : proposer un
 * interrupteur dont chaque clic échoue est pire que ne rien proposer.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import {
  actorVisibilityKeys,
  getActorSectionVisibility,
  setActorSectionVisibility,
} from '../../services/actor-visibility';
import { PORTAL_RUBRICS, resolvePortalArchetype } from '../portal/portal-rubrics';
import { TYPE_ARCHETYPES, TYPE_LABEL } from '../object-editor/archetypes';
import { SkeletonBlock } from '../../components/common/SkeletonBlock';

/**
 * Les types de fiche qu'un partenaire peut se voir confier — ceux, et seulement ceux, pour
 * lesquels le registre du portail ouvre au moins une rubrique. Dérivés, jamais recopiés :
 * une rubrique ajoutée à un archétype fait apparaître ses types ici toute seule.
 * ITI et FMA n'ont aucune rubrique ; ORG n'est pas une fiche.
 */
const PORTAL_TYPE_CODES: string[] = Object.keys(TYPE_ARCHETYPES)
  .filter((code) => resolvePortalArchetype(code) !== null)
  .sort((a, b) => (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b, 'fr'));

/** Le type ouvert par défaut : la population de partenaires la plus nombreuse. */
const DEFAULT_TYPE = PORTAL_TYPE_CODES.includes('HLO') ? 'HLO' : (PORTAL_TYPE_CODES[0] ?? 'RES');

export function ActorSectionVisibilityForm({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [objectType, setObjectType] = useState<string>(DEFAULT_TYPE);
  const [error, setError] = useState<string | null>(null);

  const matrixQuery = useQuery({
    queryKey: actorVisibilityKeys.matrix(orgId, objectType),
    queryFn: () => getActorSectionVisibility(orgId, objectType),
  });

  const archetype = resolvePortalArchetype(objectType);
  const rubrics = useMemo(
    () => (archetype ? PORTAL_RUBRICS.filter((rubric) => rubric.archetypes.includes(archetype)) : []),
    [archetype],
  );

  const floor = matrixQuery.data?.floorModules ?? [];
  const masked = matrixQuery.data?.maskedModules ?? [];

  const toggle = useMutation({
    mutationFn: ({ moduleId, visible }: { moduleId: string; visible: boolean }) =>
      setActorSectionVisibility(orgId, objectType, moduleId, visible),
    onMutate: () => setError(null),
    onSuccess: () =>
      // La MÊME table est lue par l'éditeur en mode portail : sans invalidation, l'écran
      // afficherait un réglage que la fiche du partenaire n'a pas encore.
      queryClient.invalidateQueries({ queryKey: actorVisibilityKeys.matrix(orgId, objectType) }),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Le réglage n’a pas pu être enregistré.'),
  });

  return (
    <div className="field-block">
      {/* Le <label> reste SIBLING du <select> : l'envelopper ferait entrer le texte des
          options dans le nom accessible du champ (« Type de ficheActivitéCamping… »). */}
      <div className="field-block">
        <label htmlFor="asv-type">Type de fiche</label>
        <select
          id="asv-type"
          value={objectType}
          onChange={(event) => {
            setError(null);
            setObjectType(event.target.value);
          }}
        >
          {PORTAL_TYPE_CODES.map((code) => (
            <option key={code} value={code}>
              {TYPE_LABEL[code] ?? code}
            </option>
          ))}
        </select>
        <span className="muted">Chaque type de fiche a ses propres rubriques, et son propre réglage.</span>
      </div>

      {matrixQuery.isLoading && (
        <div role="status" aria-busy="true" aria-label="Chargement des rubriques">
          <SkeletonBlock className="h-10 w-full rounded-shellMd" />
          <SkeletonBlock className="h-10 w-full rounded-shellMd" />
        </div>
      )}

      {matrixQuery.isError && (
        <div className="inline-alert inline-alert--danger" role="alert">
          {(matrixQuery.error as Error).message}
          <button type="button" className="ghost-button" onClick={() => void matrixQuery.refetch()}>
            Réessayer
          </button>
        </div>
      )}

      {error && (
        <div className="inline-alert inline-alert--danger" role="alert">
          {error}
        </div>
      )}

      {!matrixQuery.isLoading && !matrixQuery.isError && (
        // Vocabulaire de liste MAISON (`perm-list` / `perm-row` / `perm-check`), celui du
        // tiroir de droits d'un membre : même geste (une case, un libellé, une note en
        // sourdine), même écran de réglages. Inventer des classes ici les aurait laissées
        // sans style.
        <ul className="perm-list">
          {rubrics.map((rubric) => {
            // Le plancher passe AVANT le masque : un module du plancher n'est pas « fermé
            // par l'office », il est hors de portée — et le rouvrir échouerait en 22023.
            const locked = floor.includes(rubric.module);
            const visible = !locked && !masked.includes(rubric.module);
            return (
              <li key={rubric.id} className="perm-row">
                <input
                  type="checkbox"
                  id={`asv-${rubric.id}`}
                  className="perm-check"
                  checked={visible}
                  disabled={locked || toggle.isPending}
                  onChange={() => toggle.mutate({ moduleId: rubric.module, visible: !visible })}
                />
                <label htmlFor={`asv-${rubric.id}`} className="perm-row__label">
                  {rubric.title}
                  <span className="perm-inherit">
                    {locked
                      ? 'verrouillé — cette rubrique reste à l’office'
                      : visible
                        ? 'le prestataire peut la remplir'
                        : 'fermée — le prestataire ne la voit pas'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* Le reste de la fiche. Il ne s'agit pas d'un réglage laissé « à faire » : c'est le
          plancher, verrouillé côté serveur, et l'agent doit savoir qu'il existe — sinon il
          cherchera où ouvrir les photos ou la publication. */}
      <div className="field-block">
        <span>
          <Lock size={12} aria-hidden /> Jamais visible par les prestataires
        </span>
        <ul>
          <li>
            Gestion interne — informations juridiques, publication, suivi, identifiants de
            synchronisation, diffusion, relations et sous-lieux.
          </li>
          <li>
            Photos — le prestataire voit les photos de sa fiche, mais il ne peut ni en ajouter ni
            en retirer (lecture seule en v1).
          </li>
        </ul>
        <span className="muted">
          Ces rubriques ne sont pas paramétrables : le serveur refuse de les ouvrir.
        </span>
      </div>
    </div>
  );
}
