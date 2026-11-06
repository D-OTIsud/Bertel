import { getSupabaseClient } from "../lib/supabase";
import {
  invitePortalAccess,
  resendPortalAccess,
  type PortalActionResult,
} from "./actor-access";

export interface PortalLaunchActor {
  actor_id: string;
  actor_name: string;
  email: string;
  user_id: string | null;
  activated_at: string | null;
  invited_at: string | null;
  first_submission_at: string | null;
  reminded_at: string | null;
  fiche_names: string[];
  types: string[];
  communes: string[];
  email_conflict: boolean;
}
export interface PortalLaunchSnapshot {
  stats: {
    reachable: number;
    invited: number;
    activated: number;
    submitted: number;
    reminded: number;
  };
  actors: PortalLaunchActor[];
  pending: number;
  averageReviewDays: number | null;
  smtp: { configured: boolean; tested: boolean; testedAt: string | null };
  office: { name: string; email: string | null; phone: string | null };
  applicationConfigured: boolean;
  invitationHtml: string;
  remindersEnabled: boolean;
  canInvite?: boolean;
  reminderFailures?: number;
}
async function call(orgId: string, action: "read" | "test") {
  const client = getSupabaseClient();
  if (!client) throw new Error("Service indisponible.");
  const { data } = await client.auth.getSession();
  if (!data.session)
    throw new Error("Votre session a expiré. Reconnectez-vous.");
  const response = await fetch("/api/portal-launch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orgId, action }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Vous n’avez pas les droits d’administration de cet office."
        : action === "test"
          ? "Le test n’a pas pu être envoyé. Vérifiez le SMTP et l’adresse de l’application."
          : "La console n’a pas pu être chargée. Réessayez.",
    );
  return response.json();
}
export const getPortalLaunch = (orgId: string): Promise<PortalLaunchSnapshot> =>
  call(orgId, "read");
export const sendPortalLaunchTest = (
  orgId: string,
): Promise<{ sent: boolean }> => call(orgId, "test");

export interface PortalLaunchFilters {
  types: string[];
  commune: string;
  limit: number | null;
  excludeInvited: boolean;
}
export function selectPortalLaunchActors(
  actors: PortalLaunchActor[],
  filters: PortalLaunchFilters,
): PortalLaunchActor[] {
  return actors
    .filter(
      (actor) =>
        !actor.activated_at &&
        !actor.email_conflict &&
        (!filters.excludeInvited || !actor.invited_at) &&
        (!filters.types.length ||
          actor.types.some((type) => filters.types.includes(type))) &&
        (!filters.commune || actor.communes.includes(filters.commune)),
    )
    .slice(0, filters.limit ?? actors.length);
}
export interface PortalLaunchResult {
  actorId: string;
  name: string;
  sent: boolean;
  error?: string;
  trackingFailed?: boolean;
}
/** Le lot figé à l'écran est envoyé en série ; chaque route revalide ses droits. */
export async function invitePortalLaunchGroup(
  actors: PortalLaunchActor[],
  onProgress: (result: PortalLaunchResult, index: number) => void,
): Promise<PortalLaunchResult[]> {
  const results: PortalLaunchResult[] = [];
  for (const actor of actors) {
    let result: PortalLaunchResult;
    try {
      const outcome: PortalActionResult = await (
        actor.user_id ? resendPortalAccess : invitePortalAccess
      )(actor.actor_id, actor.email);
      result = {
        actorId: actor.actor_id,
        name: actor.actor_name,
        sent: true,
        trackingFailed: outcome.tracked === false,
      };
    } catch (error) {
      result = {
        actorId: actor.actor_id,
        name: actor.actor_name,
        sent: false,
        error:
          error instanceof Error ? error.message : "Invitation impossible.",
      };
    }
    results.push(result);
    onProgress(result, results.length);
  }
  return results;
}
