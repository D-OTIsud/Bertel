import { useId, useState } from 'react';
import { Clock3, MapPin, Repeat2, Route, type LucideIcon } from 'lucide-react';
import type { ItinerarySummary } from './utils';

interface Metric {
  key: string;
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
}

const metricNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 20 });

function formatNumber(value: string): string {
  const numeric = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(numeric) ? metricNumber.format(numeric) : value;
}

function durationMetric(itinerary: ItinerarySummary | null): Metric | null {
  if (!itinerary) return null;
  const hours = Number(itinerary.durationHours.replace(',', '.'));
  const minutes = itinerary.durationMinutes ?? (itinerary.durationHours.trim() && Number.isFinite(hours) ? hours * 60 : null);
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const totalMinutes = Math.round(minutes);
  const wholeHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return {
    key: 'duration', label: 'Durée', icon: Clock3,
    value: metricNumber.format(wholeHours || remainingMinutes),
    unit: wholeHours ? `h${remainingMinutes ? ` ${remainingMinutes} min` : ''}` : 'min',
  };
}

function ItineraryMetric({ metric }: { metric: Metric }) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showTooltip = (hovered || focused) && !dismissed;
  const Icon = metric.icon;

  return (
    <li
      className="detail-itinerary-metrics__item"
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="detail-itinerary-metrics__trigger"
        aria-label={`${metric.label} : ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`}
        aria-describedby={showTooltip ? tooltipId : undefined}
        onFocus={() => { setFocused(true); setDismissed(false); }}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && showTooltip) {
            event.preventDefault();
            setDismissed(true);
          }
        }}
      >
        <Icon className="detail-itinerary-metrics__icon" size={17} aria-hidden="true" />
        <span className="detail-itinerary-metrics__value">
          {metric.value}
          {metric.unit ? <span className="detail-itinerary-metrics__unit">{metric.unit}</span> : null}
        </span>
      </button>
      {showTooltip ? (
        <span className="detail-itinerary-metrics__tooltip" id={tooltipId} role="tooltip">{metric.label}</span>
      ) : null}
    </li>
  );
}

/** Compact route facts; missing data never becomes a guessed value. */
export function ItineraryMetrics({ itinerary, stageCount }: { itinerary: ItinerarySummary | null; stageCount: number }) {
  const metrics: Metric[] = [];
  if (itinerary?.distanceKm.trim()) {
    metrics.push({ key: 'distance', label: 'Distance', value: formatNumber(itinerary.distanceKm), unit: 'km', icon: Route });
  }
  const duration = durationMetric(itinerary);
  if (duration) metrics.push(duration);
  if (stageCount > 0) {
    metrics.push({ key: 'stages', label: 'Étapes', value: String(stageCount), icon: MapPin });
  }
  if (itinerary?.isLoop != null) {
    metrics.push({ key: 'loop', label: 'Boucle', value: itinerary.isLoop ? 'Oui' : 'Non', icon: Repeat2 });
  }
  if (!metrics.length) return null;

  return (
    <ul className="detail-itinerary-metrics" aria-label="Chiffres du parcours">
      {metrics.map((metric) => <ItineraryMetric key={metric.key} metric={metric} />)}
    </ul>
  );
}
