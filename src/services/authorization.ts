import type { AuthenticatedDestination } from "../types/navigation";
import {
  USER_ROLE,
  type AuthSession,
  type UserRole,
} from "../types/user";

export function hasRole(session: AuthSession, role: UserRole): boolean {
  return session.roles.includes(role);
}

export function canAccessDestination(
  session: AuthSession,
  destination: AuthenticatedDestination,
): boolean {
  switch (destination) {
    case "access-choice":
    case "heavens":
    case "campaign-create":
    case "skills":
    case "races":
    case "creatures":
    case "equipment":
    case "inventory":
      return hasRole(session, USER_ROLE.GOD);
    case "realms":
      return (
        hasRole(session, USER_ROLE.GOD) ||
        hasRole(session, USER_ROLE.PLAYER)
      );
  }
}

export function getPostLoginDestination(
  session: AuthSession,
): AuthenticatedDestination {
  if (hasRole(session, USER_ROLE.GOD)) {
    return "access-choice";
  }

  if (hasRole(session, USER_ROLE.PLAYER)) {
    return "realms";
  }

  throw new Error("The authenticated profile has no authorized destination.");
}

export function authorizeDestination(
  session: AuthSession,
  requestedDestination: AuthenticatedDestination,
): AuthenticatedDestination {
  return canAccessDestination(session, requestedDestination)
    ? requestedDestination
    : getPostLoginDestination(session);
}

export function formatRoleAccess(session: AuthSession): string {
  const labels: string[] = [];

  if (hasRole(session, USER_ROLE.GOD)) {
    labels.push("G.O.D.");
  }

  if (hasRole(session, USER_ROLE.PLAYER)) {
    labels.push("PLAYER");
  }

  return labels.join(" • ");
}
