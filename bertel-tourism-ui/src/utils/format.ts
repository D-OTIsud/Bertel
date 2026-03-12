import type { ObjectCard } from '../types/domain';

export function formatObjectPrice(card: ObjectCard): string {
  if (card.render?.price) {
    return card.render.price;
  }

  if (card.min_price == null) {
    return 'Tarif sur demande';
  }

  return `${card.min_price} EUR`;
}

export function formatObjectRating(card: ObjectCard): string {
  if (card.render?.rating) {
    return card.render.rating;
  }

  if (card.rating == null) {
    return 'Sans note';
  }

  return `${card.rating.toFixed(1)} / 5`;
}