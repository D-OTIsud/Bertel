// Découpe une saisie libre (une adresse par ligne, ou séparées par virgule / point-virgule /
// espace) en e-mails normalisés, dédupliqués, et sépare les valides des invalides.
// Même regex que la garde serveur de /api/admin/invite (source unique du critère de validité).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ParsedInviteEmails {
  valid: string[];
  invalid: string[];
}

export function parseInviteEmails(raw: string): ParsedInviteEmails {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (EMAIL_RE.test(token)) valid.push(token);
    else invalid.push(token);
  }

  return { valid, invalid };
}
