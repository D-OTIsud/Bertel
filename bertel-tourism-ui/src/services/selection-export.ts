import { getObjectResource } from './rpc';
import type { ObjectDetail } from '../types/domain';

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  const normalized = str.replace(/\r?\n/g, ' ').trim();
  // Wrap in quotes and escape quotes for valid CSV.
  return `"${normalized.replace(/"/g, '""')}"`;
}

function getLocationStrings(detail: ObjectDetail): { city: string; address: string } {
  const location = detail.raw?.location as { city?: unknown; address?: unknown } | undefined;
  const city = typeof location?.city === 'string' ? location.city : '';
  const address = typeof location?.address === 'string' ? location.address : '';
  return { city, address };
}

export async function exportSelectedObjectsCsv(objectIds: string[], langPrefs: string[]): Promise<void> {
  const ids = [...new Set(objectIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return;

  const details = await Promise.all(ids.map((id) => getObjectResource(id, langPrefs)));

  const headers = ['id', 'name', 'type', 'city', 'address', 'raw_json'];
  const lines = details.map((d) => {
    const { city, address } = getLocationStrings(d);
    return [
      csvEscape(d.id),
      csvEscape(d.name),
      csvEscape(d.type ?? ''),
      csvEscape(city),
      csvEscape(address),
      csvEscape(JSON.stringify(d.raw ?? {})),
    ].join(',');
  });

  const csv = [headers.join(','), ...lines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `selection_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

