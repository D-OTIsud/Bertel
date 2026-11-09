import { Check, X } from 'lucide-react';
import type { LegalMention } from './legal-mentions';

interface LegalMentionsCardProps {
  mentions: readonly LegalMention[];
}

export function LegalMentionsCard({ mentions }: LegalMentionsCardProps) {
  return (
    <article className="detail-section detail-section--aside detail-legal">
      <h3 className="detail-legal__title">Mentions légales</h3>
      <ul className="detail-legal__list">
        {mentions.map((mention) => (
          <li key={mention.label} className="detail-legal__item">
            <span>{mention.label}</span>
            {mention.isValid
              ? <Check size={14} className="detail-legal__icon detail-legal__icon--valid" aria-hidden />
              : <X size={14} className="detail-legal__icon detail-legal__icon--invalid" aria-hidden />}
            <span className="sr-only">{mention.isValid ? ' : valide' : ' : non valide'}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
