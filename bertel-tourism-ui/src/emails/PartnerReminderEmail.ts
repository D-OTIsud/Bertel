import {
  renderPartnerInvitationEmailHtml,
  type PartnerInvitationEmailData,
} from "./PartnerInvitationEmail";

export function partnerReminderEmailSubject(
  data: PartnerInvitationEmailData,
): string {
  return `${data.officeName} : votre espace partenaire vous attend`.replace(
    /[\r\n\u0000]+/g,
    " ",
  );
}
export function renderPartnerReminderEmailHtml(
  data: PartnerInvitationEmailData,
): string {
  return renderPartnerInvitationEmailHtml(data)
    .replace(
      "Vous pouvez désormais mettre à jour vous-même",
      "Nous vous avons invité il y a une semaine. Vous pouvez mettre à jour vous-même",
    )
    .replace(
      "Ce lien est personnel.",
      "Ce nouveau lien est personnel. Il s’agit de notre unique relance automatique.",
    );
}
