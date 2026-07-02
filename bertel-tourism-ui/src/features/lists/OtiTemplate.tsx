'use client';

// OtiTemplate — rendu « site public OTI » d'une liste (3 directions : Carnet éditorial,
// Grille magazine, Itinéraire feuille-de-route). Isomorphe : sert l'aperçu de composition,
// la page publique et (à venir) le HTML email. Porté depuis le projet design 019e20ac
// (oti-templates.jsx) et adapté aux données réelles (item.card + note de liste).
// Style : features/lists/oti-template.css (scopé .oti). Aucune injection HTML (texte brut).
import type { CSSProperties } from 'react';
import {
  Bed,
  Compass,
  Globe,
  Landmark,
  MapPin,
  Navigation,
  Phone,
  ShoppingBag,
  Star,
  TreePine,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react';
import type { ListAccent, ListTemplate, ObjectListItem } from '@/services/lists';
import { HUE_BY_TYPE, LABEL_BY_TYPE, OTI_ACCENTS, webHref, webLabel, type ListHue } from './type-meta';
import OtiMapRecapLazy from './OtiMapRecapLazy';
import { locatedPois, type OtiMapSnapshot } from './oti-map-utils';

type IconCmp = typeof MapPin;

export interface OtiPoi {
  id: string;
  name: string;
  typeCode: string;
  city: string | null;
  image: string | null;
  subtitle: string | null;
  note: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  web: string | null;
}

const ACCENT: Record<ListAccent, { ink: string; deep: string; soft: string }> =
  OTI_ACCENTS as Record<ListAccent, { ink: string; deep: string; soft: string }>;

export const ICON_BY_TYPE: Record<string, IconCmp> = {
  HOT: Bed, HLO: Bed, HPA: Bed, CAMP: Bed, RVA: Bed,
  RES: UtensilsCrossed, ACT: Compass, ASC: Compass, ITI: Navigation,
  VIS: Landmark, PCU: Landmark, PRD: Wheat, COM: ShoppingBag,
  SPU: TreePine, PNA: TreePine, LOI: Compass, EVT: Star, FMA: Star,
};

function typeMeta(code: string, lang: 'fr' | 'en'): { label: string; hue: ListHue; Icon: IconCmp } {
  const hue = HUE_BY_TYPE[code] ?? 'teal';
  const label = LABEL_BY_TYPE[code]?.[lang] ?? code;
  const Icon = ICON_BY_TYPE[code] ?? MapPin;
  return { label, hue, Icon };
}

const t = (fr: string, en: string, lang: 'fr' | 'en') => (lang === 'en' ? en : fr);

/** Convertit les items d'une liste (card + note) en POIs de rendu, résolus par langue. */
export function itemsToOtiPois(items: ObjectListItem[], lang: 'fr' | 'en'): OtiPoi[] {
  return items.map((it) => {
    const card = it.card;
    const loc = (card?.raw?.location ?? null) as Record<string, unknown> | null;
    return {
      id: it.objectId,
      name: card?.name ?? it.objectId,
      typeCode: card?.type ?? '',
      city: card?.city ?? null,
      image: card?.image ?? null,
      subtitle: card?.description ?? null,
      note: (lang === 'en' ? it.noteEn : it.noteFr) ?? null,
      lat: loc && typeof loc.lat === 'number' ? loc.lat : null,
      lon: loc && typeof loc.lon === 'number' ? loc.lon : null,
      phone: it.phone,
      web: it.web,
    };
  });
}

function Wave({ tone, flip }: { tone: 'paper' | 'ink'; flip?: boolean }) {
  return (
    <svg
      className={`oti-wave oti-wave--${tone}${flip ? ' flip' : ''}`}
      viewBox="0 0 1440 72"
      preserveAspectRatio="none"
      aria-hidden
      style={{ height: 48 }}
    >
      <path d="M0,34 C210,74 430,6 720,34 C1010,62 1230,10 1440,40 L1440,72 L0,72 Z" />
    </svg>
  );
}

function Eyebrow({ poi, lang, withCity }: { poi: OtiPoi; lang: 'fr' | 'en'; withCity?: boolean }) {
  const m = typeMeta(poi.typeCode, lang);
  const Icon = m.Icon;
  return (
    <span className={`oti-eyebrow hue-${m.hue}`}>
      <Icon />
      {m.label.toUpperCase()}
      {withCity && poi.city && (
        <span className="sep">
          · <b>{poi.city}</b>
        </span>
      )}
    </span>
  );
}

function TypeChip({ poi, lang }: { poi: OtiPoi; lang: 'fr' | 'en' }) {
  const m = typeMeta(poi.typeCode, lang);
  const Icon = m.Icon;
  return (
    <span className={`oti-chip hue-${m.hue}`}>
      <Icon />
      {m.label}
    </span>
  );
}

function CoupDeCoeur({ poi, lang, advisorFirst }: { poi: OtiPoi; lang: 'fr' | 'en'; advisorFirst: string }) {
  if (!poi.note) return null;
  return (
    <div className="oti-note">
      <div className="oti-note__lbl">
        <Star width={15} height={15} />
        {advisorFirst
          ? t(`Le coup de cœur de ${advisorFirst}`, `${advisorFirst}’s pick`, lang)
          : t('Le coup de cœur du conseiller', 'The advisor’s pick', lang)}
      </div>
      <p className="oti-note__text">{poi.note}</p>
    </div>
  );
}

function Contacts({ poi, lang, solidMap, iconsOnly }: { poi: OtiPoi; lang: 'fr' | 'en'; solidMap?: boolean; iconsOnly?: boolean }) {
  const items = [];
  if (poi.lat != null && poi.lon != null) {
    items.push(
      <a
        key="map"
        className={`oti-cbtn${solidMap ? ' oti-cbtn--solid' : ''}${iconsOnly ? ' oti-cbtn--ico' : ''}`}
        href={`https://maps.google.com/?q=${poi.lat},${poi.lon}`}
        target="_blank"
        rel="noreferrer"
        title={t('Voir sur la carte', 'View on map', lang)}
      >
        <MapPin />
        {!iconsOnly && t('Voir sur la carte', 'View on map', lang)}
      </a>,
    );
  }
  if (poi.phone) {
    items.push(
      <a key="tel" className={`oti-cbtn${iconsOnly ? ' oti-cbtn--ico' : ''}`} href={`tel:${poi.phone.replace(/\s/g, '')}`}>
        <Phone />
        {!iconsOnly && poi.phone}
      </a>,
    );
  }
  if (poi.web) {
    items.push(
      <a key="web" className={`oti-cbtn${iconsOnly ? ' oti-cbtn--ico' : ''}`} href={webHref(poi.web)} target="_blank" rel="noreferrer">
        <Globe />
        {!iconsOnly && webLabel(poi.web)}
      </a>,
    );
  }
  if (items.length === 0) return null;
  return <div className="oti-contacts">{items}</div>;
}

interface RenderCtx {
  lang: 'fr' | 'en';
  advisorFirst: string;
}

function Hero({ name, recipient, cover, pois, lang, logoUrl, brandName }: {
  name: string;
  recipient: string | null;
  cover: string | null;
  pois: OtiPoi[];
  lang: 'fr' | 'en';
  logoUrl: string | null;
  brandName: string;
}) {
  const typeSet = [...new Set(pois.map((p) => p.typeCode))];
  // Fond du hero : cover_url explicite de la liste, sinon repli sur la photo du premier
  // lieu (cover_url n'a pas encore de surface d'édition — sans repli le hero reste uni).
  const bg = cover ?? pois.find((p) => p.image)?.image ?? null;
  return (
    <header className="oti-hero">
      <div className="oti-hero__bg" style={{ backgroundImage: bg ? `url("${bg}")` : undefined }} />
      <div className="oti-hero__inner">
        <div className="oti-hero__top">
          <span className="oti-logochip">
            {logoUrl ? <img src={logoUrl} alt={brandName} /> : brandName}
          </span>
          <span className="oti-hero__origin">
            <span className="dot" />
            {t('Sélection personnalisée', 'Handpicked for you', lang)}
          </span>
        </div>
        <div className="oti-hero__script oti-script">
          {recipient ? `${t('Pour ', 'For ', lang)}${recipient},` : t('Rien que pour vous,', 'Just for you,', lang)}
        </div>
        <h1 className="oti-hero__title">{name}</h1>
        <div className="oti-hero__meta">
          <span className="mi">
            <MapPin width={15} height={15} /> {pois.length} {t('lieux sélectionnés', 'handpicked spots', lang)}
          </span>
          {typeSet.length > 0 && (
            <>
              <span className="mdot" />
              <span className="mi">{typeSet.map((c) => typeMeta(c, lang).label).join(' · ')}</span>
            </>
          )}
          <span className="mdot" />
          <span className="mi">
            <Compass width={15} height={15} /> {t('Sud de la Réunion', 'South of Réunion', lang)}
          </span>
        </div>
      </div>
      <Wave tone="paper" />
    </header>
  );
}

function AgentWord({ intro, lang, advisorName, advisorInitials }: {
  intro: string | null;
  lang: 'fr' | 'en';
  advisorName: string | null;
  advisorInitials: string;
}) {
  if (!intro) return null;
  return (
    <section className="oti-word">
      <span className="oti-ava">{advisorInitials}</span>
      <div className="oti-word__body">
        <div className="oti-word__lbl">{t('Un mot de votre conseiller', 'A word from your advisor', lang)}</div>
        <p className="oti-word__text">{intro}</p>
        <div className="oti-word__sign">
          {advisorName ?? 'OTI du Sud'}
          <small>{t('Conseiller en séjour · OTI du Sud', 'Travel advisor · OTI du Sud', lang)}</small>
        </div>
      </div>
    </section>
  );
}

function SectHead({ lang, count }: { lang: 'fr' | 'en'; count: number }) {
  return (
    <div className="oti-secthead">
      <span className="oti-secthead__script oti-script">{t('À découvrir', 'Discover', lang)}</span>
      <span className="oti-secthead__line" />
      <span className="oti-secthead__count">{count} {t('étapes', 'stops', lang)}</span>
    </div>
  );
}

function Footer({ lang, brandName }: { lang: 'fr' | 'en'; brandName: string }) {
  return (
    <footer className="oti-foot">
      <Wave tone="ink" flip />
      <div className="oti-foot__top">
        <div className="oti-foot__brand">
          <span className="n">
            {brandName}
            <small>{t('Sud de la Réunion — l’île intense', 'South Réunion — the intense island', lang)}</small>
          </span>
        </div>
      </div>
      <div className="oti-foot__legal">
        <span>© 2026 {brandName}</span>
        <span>
          {t(
            'Vous recevez ce message car un conseiller vous a préparé cette sélection.',
            'You received this because an advisor prepared this selection for you.',
            lang,
          )}
        </span>
      </div>
    </footer>
  );
}

function TplCarnet({ pois, ctx }: { pois: OtiPoi[]; ctx: RenderCtx }) {
  return (
    <div className="oti-body">
      <SectHead lang={ctx.lang} count={pois.length} />
      <div className="oti-carnet">
        {pois.map((p, i) => (
          <article className="oti-poi--carnet" key={p.id}>
            <div className="oti-poi__media" style={{ backgroundImage: p.image ? `url("${p.image}")` : undefined }}>
              <span className="oti-poi__num">{String(i + 1).padStart(2, '0')}</span>
              {p.city && (
                <span className="oti-poi__citychip">
                  <MapPin /> {p.city}
                </span>
              )}
            </div>
            <div className="oti-poi__body">
              <Eyebrow poi={p} lang={ctx.lang} />
              <h3 className="oti-poi__title">{p.name}</h3>
              {p.subtitle && <div className="oti-poi__type">{p.subtitle}</div>}
              <CoupDeCoeur poi={p} lang={ctx.lang} advisorFirst={ctx.advisorFirst} />
              <Contacts poi={p} lang={ctx.lang} solidMap />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TplGrille({ pois, ctx }: { pois: OtiPoi[]; ctx: RenderCtx }) {
  return (
    <div className="oti-body">
      <SectHead lang={ctx.lang} count={pois.length} />
      <div className="oti-grid">
        {pois.map((p, i) => (
          <article className="oti-card" key={p.id}>
            <div className="oti-card__media" style={{ backgroundImage: p.image ? `url("${p.image}")` : undefined }}>
              <span className="oti-card__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="oti-card__chip">
                <TypeChip poi={p} lang={ctx.lang} />
              </span>
            </div>
            <div className="oti-card__body">
              <Eyebrow poi={p} lang={ctx.lang} withCity />
              <h3 className="oti-poi__title">{p.name}</h3>
              {p.subtitle && <div className="oti-card__type">{p.subtitle}</div>}
              <CoupDeCoeur poi={p} lang={ctx.lang} advisorFirst={ctx.advisorFirst} />
              <Contacts poi={p} lang={ctx.lang} iconsOnly />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MapRecap({
  pois,
  lang,
  staticMap,
  snapshot,
  onSnapshot,
}: {
  pois: OtiPoi[];
  lang: 'fr' | 'en';
  staticMap?: boolean;
  snapshot?: OtiMapSnapshot | null;
  onSnapshot?: (shot: OtiMapSnapshot) => void;
}) {
  // Carte MapLibre réelle dès qu'un lieu est géolocalisé. Le portail d'impression
  // (display:none) ne peut pas monter de canvas WebGL : il passe staticMap et reçoit le
  // cliché figé par l'aperçu via onSnapshot→mapSnapshot (ListComposeView).
  if (!staticMap && locatedPois(pois).length > 0) {
    return <OtiMapRecapLazy pois={pois} lang={lang} onSnapshot={onSnapshot} />;
  }
  // Statique (portail print) ou aucune coordonnée : cliché si disponible, sinon le bloc
  // décoratif — sans pins factices (ils suggéraient une géographie fausse).
  return (
    <div className="oti-map">
      {snapshot ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="oti-map__shotimg" src={snapshot.url} alt="" />
          {snapshot.pins.map((p) => (
            <span key={p.n} className="oti-map__pin" style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}>
              {p.n}
            </span>
          ))}
          <span className="oti-map__attrib">© OpenStreetMap</span>
        </>
      ) : null}
      <div className="oti-map__cap">
        <div className="s oti-script">{t('Votre parcours', 'Your route', lang)}</div>
        <div className="t">{t('dans le Sud', 'across the South', lang)}</div>
      </div>
    </div>
  );
}

function TplItineraire({ pois, ctx }: { pois: OtiPoi[]; ctx: RenderCtx }) {
  return (
    <div className="oti-body">
      <SectHead lang={ctx.lang} count={pois.length} />
      <div className="oti-route">
        <div className="oti-route__line" />
        {pois.map((p, i) => (
          <div className="oti-stop" key={p.id}>
            <span className="oti-stop__pin">{i + 1}</span>
            <div className="oti-stop__card">
              <div className="oti-stop__media" style={{ backgroundImage: p.image ? `url("${p.image}")` : undefined }} />
              <div className="oti-stop__body">
                <Eyebrow poi={p} lang={ctx.lang} withCity />
                <h3 className="oti-poi__title">{p.name}</h3>
                {p.subtitle && <div className="oti-stop__type">{p.subtitle}</div>}
                <CoupDeCoeur poi={p} lang={ctx.lang} advisorFirst={ctx.advisorFirst} />
                <Contacts poi={p} lang={ctx.lang} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface OtiTemplateProps {
  template: ListTemplate;
  lang: 'fr' | 'en';
  accent: ListAccent;
  name: string;
  recipient?: string | null;
  intro?: string | null;
  coverUrl?: string | null;
  items: OtiPoi[];
  narrow?: boolean;
  showMap?: boolean;
  /** Instance du portail d'impression : jamais de carte WebGL, seulement le cliché reçu. */
  staticMap?: boolean;
  /** Cliché figé par l'instance aperçu (compose) — rendu par l'instance staticMap. */
  mapSnapshot?: OtiMapSnapshot | null;
  /** Remonte le cliché de la carte live vers le parent (pour le portail d'impression). */
  onMapSnapshot?: (shot: OtiMapSnapshot) => void;
  advisorName?: string | null;
  brandName?: string;
  logoUrl?: string | null;
}

function initials(name: string | null, brand: string): string {
  const src = (name && name.trim()) || brand;
  return src.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'OS';
}

export default function OtiTemplate({
  template,
  lang,
  accent,
  name,
  recipient = null,
  intro = null,
  coverUrl = null,
  items,
  narrow = false,
  showMap,
  staticMap = false,
  mapSnapshot = null,
  onMapSnapshot,
  advisorName = null,
  brandName = 'OTI du Sud',
  logoUrl = null,
}: OtiTemplateProps) {
  const acc = ACCENT[accent] ?? ACCENT.teal;
  const style = {
    '--oti-accent': acc.ink,
    '--oti-accent-d': acc.deep,
    '--oti-accent-soft': acc.soft,
  } as CSSProperties;
  const ctx: RenderCtx = { lang, advisorFirst: advisorName ? advisorName.split(' ')[0] : '' };
  const withMap = showMap === undefined ? template === 'itineraire' : showMap;
  const Body = template === 'grille' ? TplGrille : template === 'itineraire' ? TplItineraire : TplCarnet;

  return (
    <div className={`oti${narrow ? ' oti--narrow' : ''}`} style={style}>
      <Hero
        name={name}
        recipient={recipient}
        cover={coverUrl}
        pois={items}
        lang={lang}
        logoUrl={logoUrl}
        brandName={brandName}
      />
      <AgentWord intro={intro} lang={lang} advisorName={advisorName} advisorInitials={initials(advisorName, brandName)} />
      {withMap && items.length > 0 && (
        <div className="oti-body" style={{ paddingBottom: 0 }}>
          <MapRecap pois={items} lang={lang} staticMap={staticMap} snapshot={mapSnapshot} onSnapshot={onMapSnapshot} />
        </div>
      )}
      <Body pois={items} ctx={ctx} />
      <Footer lang={lang} brandName={brandName} />
    </div>
  );
}
