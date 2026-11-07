const LOCAL_ATOM = /^(?:[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]|[^\x00-\x7f\p{Cc}\p{Cs}\s])+$/u;
const DOMAIN_INPUT = /^(?:[A-Za-z0-9.-]|[^\x00-\x7f\p{Cc}\p{Cs}\s])+$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** One bare mailbox, shared by the UI, generation lookup and the SMTP route. */
export function listEmailMailbox(value: string): string | null {
  const mailbox = value.trim();
  if (mailbox.length > 1024) return null;
  const [local, inputDomain, ...extra] = mailbox.split('@');
  if (extra.length || !inputDomain || !DOMAIN_INPUT.test(inputDomain) ||
      !local.split('.').every((atom) => LOCAL_ATOM.test(atom))) return null;
  // Keep SMTPUTF8 local parts byte-exact, including their case and spelling.
  const localBytes = /^[\x00-\x7f]+$/.test(local) ? local.length : new TextEncoder().encode(local).length;
  if (localBytes > 64) return null;
  let domain: string;
  try {
    // Match the relay's case conversion before IDNA, including Greek final sigma.
    const url = new URL(`https://${inputDomain.toLowerCase()}/`);
    if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    domain = url.hostname;
  } catch { return null; }
  const labels = domain.split('.');
  // URL also accepts IPs, so require DNS labels and a nonnumeric suffix.
  if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1]) || !labels.every((label) => DNS_LABEL.test(label)) ||
      localBytes + 1 + domain.length > 254) return null;
  return `${local}@${domain}`;
}
