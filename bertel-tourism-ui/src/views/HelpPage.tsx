'use client';

// Centre d'aide /aide (spec 2026-07-03-faq-aide-design.md) : recherche métier instantanée
// (searchFaq — accents/préfixes/keywords), rubriques en chips, questions en accordéon,
// deep-links ?question=<id> (ouvre + scrolle) et ?q=<texte> (préremplit la recherche).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search } from 'lucide-react';
import { MarkdownContent } from '../components/markdown/MarkdownContent';
import { ALL_FAQ_ENTRIES } from '../features/help/content';
import { FAQ_RUBRIQUES, type FaqEntry, type FaqRubriqueId } from '../features/help/content/types';
import { searchFaq } from '../features/help/faq-search';
import { createTypeLabel } from '../features/object-editor/create/create-object-options';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 150;

const RUBRIQUE_LABEL = new Map<string, string>(FAQ_RUBRIQUES.map((r) => [r.id, r.label]));
const ENTRY_BY_ID = new Map(ALL_FAQ_ENTRIES.map((e) => [e.id, e]));

function FaqEntryCard({
  entry,
  open,
  showRubrique,
  onToggle,
  onOpenRelated,
}: {
  entry: FaqEntry;
  open: boolean;
  showRubrique: boolean;
  onToggle: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const related = (entry.related ?? [])
    .map((id) => ENTRY_BY_ID.get(id))
    .filter((e): e is FaqEntry => Boolean(e));
  return (
    <article id={`faq-${entry.id}`} className={cn('help-qa', open && 'help-qa--open')}>
      <button type="button" className="help-qa__question" aria-expanded={open} onClick={onToggle}>
        <span className="help-qa__text">{entry.question}</span>
        {showRubrique && (
          <span className="help-qa__rubrique">{RUBRIQUE_LABEL.get(entry.rubrique)}</span>
        )}
        {(entry.types ?? []).map((code) => (
          <span key={code} className="help-qa__badge">{createTypeLabel(code)}</span>
        ))}
        <ChevronDown className="help-qa__chevron" aria-hidden />
      </button>
      {open && (
        <div className="help-qa__answer">
          <MarkdownContent markdown={entry.answer} />
          {related.length > 0 && (
            <p className="help-qa__related">
              <span>Voir aussi :</span>
              {related.map((r) => (
                <button key={r.id} type="button" onClick={() => onOpenRelated(r.id)}>
                  {r.question}
                </button>
              ))}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function HelpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get('question'));
  const [rubrique, setRubrique] = useState<FaqRubriqueId | 'all'>('all');
  const didInitialScroll = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Deep-link entrant : scroller UNE fois vers l'entrée ouverte par ?question=.
  useEffect(() => {
    if (didInitialScroll.current || !openId) return;
    didInitialScroll.current = true;
    document.getElementById(`faq-${openId}`)?.scrollIntoView?.({ block: 'start' });
  }, [openId]);

  function toggleEntry(id: string) {
    const next = openId === id ? null : id;
    setOpenId(next);
    // URL partageable, sans empiler l'historique.
    router.replace(next ? `/aide?question=${next}` : '/aide');
  }

  function openRelated(id: string) {
    setOpenId(id);
    router.replace(`/aide?question=${id}`);
    document.getElementById(`faq-${id}`)?.scrollIntoView?.({ block: 'start' });
  }

  const results = useMemo(
    () => (debouncedQuery.trim() ? searchFaq(ALL_FAQ_ENTRIES, debouncedQuery) : null),
    [debouncedQuery],
  );

  const sections = FAQ_RUBRIQUES.filter((r) => rubrique === 'all' || r.id === rubrique).map(
    (r) => ({ ...r, entries: ALL_FAQ_ENTRIES.filter((e) => e.rubrique === r.id) }),
  );

  return (
    <div className="help-app">
      <header className="help-head">
        <h1>Aide</h1>
        <p className="help-head__sub">
          Cherchez un mot du métier : « artisan », « gîte », « atelier », « publier »…
        </p>
        <div className="help-search">
          <Search className="help-search__icon" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Poser une question ou taper un mot-clé…"
            aria-label="Rechercher dans l'aide"
          />
        </div>
      </header>

      {results ? (
        <section className="help-results" aria-label="Résultats de recherche">
          <p className="help-count" role="status">
            {results.length} résultat{results.length > 1 ? 's' : ''}
          </p>
          {results.length === 0 ? (
            <div className="help-empty">
              <p>Aucun résultat pour « {debouncedQuery.trim()} ».</p>
              <p>Essayez un mot plus court ou un synonyme métier (« artisan », « gîte », « atelier »…).</p>
            </div>
          ) : (
            results.map((entry) => (
              <FaqEntryCard
                key={entry.id}
                entry={entry}
                open={openId === entry.id}
                showRubrique
                onToggle={() => toggleEntry(entry.id)}
                onOpenRelated={openRelated}
              />
            ))
          )}
        </section>
      ) : (
        <>
          {/* Chips de filtre (pas des onglets ARIA : pas de role tablist sans tabs) */}
          <div className="help-chips" aria-label="Rubriques">
            <button
              type="button"
              className={cn('help-chip', rubrique === 'all' && 'help-chip--on')}
              onClick={() => setRubrique('all')}
            >
              Toutes
            </button>
            {FAQ_RUBRIQUES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={cn('help-chip', rubrique === r.id && 'help-chip--on')}
                onClick={() => setRubrique(rubrique === r.id ? 'all' : r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {sections.map((section) => (
            <section key={section.id} className="help-section" aria-label={section.label}>
              <h2 className="help-section__title">{section.label}</h2>
              {section.entries.map((entry) => (
                <FaqEntryCard
                  key={entry.id}
                  entry={entry}
                  open={openId === entry.id}
                  showRubrique={false}
                  onToggle={() => toggleEntry(entry.id)}
                  onOpenRelated={openRelated}
                />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
