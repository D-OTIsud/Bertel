import { callerClient } from '../_document-auth';

// Prédicats d'AUTORISATION propres aux documents d'acteur, partagés par les trois verbes
// d'/api/actor-document et par /api/actor-document/url. Le socle d'authentification
// (Bearer → getUser, client « en tant qu'appelant ») vit dans ../_document-auth, commun aux
// deux familles de routes documents ; ce qui suit est spécifique à l'acteur et n'y monte pas.

/**
 * Prédicat sur l'ACTEUR. Deux surfaces, deux exigences :
 *  - `write = true` (défaut) pour l'upload, la suppression et la promotion : elles modifient
 *    le dossier de l'acteur ;
 *  - `write = false` pour l'URL signée : consulter une pièce jointe n'exige pas de pouvoir
 *    la modifier. L'asymétrie est voulue — c'est le seul écart avec /api/task-document, où
 *    toutes les surfaces vivent derrière le modal d'édition et partagent le prédicat
 *    d'écriture.
 *
 * FAIL-CLOSED : une erreur du RPC rend `false`, jamais un « on laisse passer par défaut ».
 * Acteur inconnu ⇒ `false` côté RPC, jamais une erreur qui fuiterait son existence.
 */
export async function authorizeActor(jwt: string, actorId: string, write = true): Promise<boolean> {
  const { data, error } = await callerClient(jwt).schema('api').rpc(
    write ? 'user_can_write_crm_actor' : 'user_can_read_crm_actor',
    { p_actor_id: actorId },
  );
  return !error && data === true;
}

/**
 * Prédicat sur l'OBJET (établissement) canonique. N'intervient QUE dans la promotion
 * (PATCH) : elle écrit une pièce du dossier privé de l'acteur dans l'espace PUBLIC d'un
 * objet. Les deux prédicats doivent tenir — pouvoir éditer l'acteur ne donne aucun droit
 * de publier sur un objet dont on n'a pas la main.
 */
export async function authorizeObject(jwt: string, objectId: string): Promise<boolean> {
  const { data, error } = await callerClient(jwt)
    .schema('api')
    .rpc('user_can_write_object_canonical', { p_object_id: objectId });
  return !error && data === true;
}
