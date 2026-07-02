// Impression de la sélection Explorer (SelectionBar → Imprimer) : chaque fiche sélectionnée
// devient un OtiPoi, la donnée des cartes « carnet » du module Listes (accroche, photo,
// ville, coordonnées, contacts publics). Source = la ressource complète (getObjectResource),
// lue par le parser vivant du tiroir (object-detail-parser) — pas de re-parsing ad hoc.
import type { ObjectDetail } from '../../types/domain';
import type { OtiPoi } from '@/features/lists/OtiTemplate';
import { parseObjectDetail } from '@/services/object-detail-parser';

/**
 * Ressource objet → OtiPoi. Les contacts miroitent le contrat DB `api.list_item_contacts`
 * (celui des listes) : téléphone fixe avec repli mobile + site web, PUBLICS uniquement.
 */
export function selectionDetailToOtiPoi(detail: ObjectDetail): OtiPoi {
  const parsed = parseObjectDetail((detail.raw ?? {}) as Record<string, unknown>);
  const publicContacts = parsed.contacts.object.filter((contact) => contact.isPublic);
  const phone =
    publicContacts.find((contact) => contact.kindCode === 'phone') ??
    publicContacts.find((contact) => contact.kindCode === 'mobile');
  const web = publicContacts.find((contact) => contact.kindCode === 'website');

  return {
    id: detail.id,
    name: parsed.identity.name || detail.name,
    typeCode: parsed.identity.type || detail.type || '',
    city: parsed.location?.city || null,
    image: parsed.media.hero?.url || null,
    subtitle: parsed.text.chapo || parsed.text.description || null,
    note: null,
    lat: parsed.location?.latitude ?? null,
    lon: parsed.location?.longitude ?? null,
    phone: phone?.value ?? null,
    web: web?.value ?? null,
  };
}

/**
 * Chauffe le cache HTTP des visuels avant window.print() : le portail d'impression est
 * display:none, Chrome ne charge les background-image qu'au rendu d'impression — sans
 * préchargement l'aperçu peut s'ouvrir avec des cadres vides.
 * ponytail: best-effort borné à timeoutMs (image morte ou réseau lent ⇒ on imprime quand
 * même, le cadre reste sur sa couleur de repli) ; pas de retry.
 */
export function preloadImages(urls: Array<string | null>, timeoutMs = 4000): Promise<void> {
  const distinct = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  if (distinct.length === 0) return Promise.resolve();

  const loads = distinct.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      }),
  );
  const deadline = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });

  return Promise.race([Promise.all(loads).then(() => undefined), deadline]);
}
