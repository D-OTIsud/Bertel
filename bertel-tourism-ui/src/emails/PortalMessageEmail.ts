import { escapeHtml } from "@/lib/safe-output";

export function portalMessageEmail(data: {
  objectName: string;
  partnerName: string;
  appUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Message d’un partenaire — ${data.objectName}`,
    html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#2d2a2a"><p>Bonjour,</p><h1 style="font-size:22px">Message depuis l’espace partenaire</h1><p>${escapeHtml(data.partnerName)} a écrit à l’office au sujet de ${escapeHtml(data.objectName)}.</p><p><a href="${escapeHtml(data.appUrl)}">Consulter le message dans le CRM</a></p><p>Le message et ses pièces jointes restent accessibles après connexion à Bertel.</p></body></html>`,
  };
}
