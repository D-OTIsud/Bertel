export function isDemoOnlyModule(path: string): boolean {
  // D5 (revue UX) : /moderation retiré — le module est branché sur ses RPC réels
  // (P2.1 §120, file pending_change) ; le laisser ici le rendait inaccessible en
  // production (masqué du menu + page « Module non branché »).
  // /audits et /publications restent des maquettes de démo (RPC absents).
  return ['/audits', '/publications'].includes(path);
}
