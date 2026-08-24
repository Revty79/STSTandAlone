import { describe, expect, it } from "vitest";
import type { AuthSession } from "../types/user";
import { USER_ROLE } from "../types/user";
import {
  authorizeDestination,
  canAccessDestination,
  getPostLoginDestination,
  hasRole,
} from "./authorization";

function sessionWith(roles: AuthSession["roles"]): AuthSession {
  return {
    isAuthenticated: true,
    userId: 1,
    username: "Voyager",
    roles,
  };
}

describe("role authorization", () => {
  it("routes a G.O.D. profile to the protected access choice", () => {
    const session = sessionWith([USER_ROLE.GOD, USER_ROLE.PLAYER]);

    expect(hasRole(session, USER_ROLE.GOD)).toBe(true);
    expect(getPostLoginDestination(session)).toBe("access-choice");
    expect(canAccessDestination(session, "heavens")).toBe(true);
    expect(canAccessDestination(session, "campaign-create")).toBe(true);
    expect(canAccessDestination(session, "skills")).toBe(true);
    expect(canAccessDestination(session, "races")).toBe(true);
    expect(canAccessDestination(session, "creatures")).toBe(true);
    expect(canAccessDestination(session, "equipment")).toBe(true);
    expect(canAccessDestination(session, "inventory")).toBe(true);
    expect(canAccessDestination(session, "npcs")).toBe(true);
    expect(canAccessDestination(session, "realms")).toBe(true);
    expect(canAccessDestination(session, "character-create")).toBe(true);
    expect(canAccessDestination(session, "character-advance")).toBe(true);
  });

  it("routes a Player-only profile directly to Realms", () => {
    const session = sessionWith([USER_ROLE.PLAYER]);

    expect(getPostLoginDestination(session)).toBe("realms");
    expect(canAccessDestination(session, "access-choice")).toBe(false);
    expect(canAccessDestination(session, "heavens")).toBe(false);
    expect(canAccessDestination(session, "campaign-create")).toBe(false);
    expect(canAccessDestination(session, "skills")).toBe(false);
    expect(canAccessDestination(session, "races")).toBe(false);
    expect(canAccessDestination(session, "creatures")).toBe(false);
    expect(canAccessDestination(session, "equipment")).toBe(false);
    expect(canAccessDestination(session, "inventory")).toBe(false);
    expect(canAccessDestination(session, "npcs")).toBe(false);
    expect(canAccessDestination(session, "realms")).toBe(true);
    expect(canAccessDestination(session, "character-create")).toBe(true);
    expect(canAccessDestination(session, "character-advance")).toBe(true);
  });

  it("redirects unauthorized G.O.D. destinations through the central guard", () => {
    const session = sessionWith([USER_ROLE.PLAYER]);

    expect(authorizeDestination(session, "access-choice")).toBe("realms");
    expect(authorizeDestination(session, "heavens")).toBe("realms");
    expect(authorizeDestination(session, "campaign-create")).toBe("realms");
    expect(authorizeDestination(session, "skills")).toBe("realms");
    expect(authorizeDestination(session, "races")).toBe("realms");
    expect(authorizeDestination(session, "creatures")).toBe("realms");
    expect(authorizeDestination(session, "equipment")).toBe("realms");
    expect(authorizeDestination(session, "inventory")).toBe("realms");
    expect(authorizeDestination(session, "npcs")).toBe("realms");
  });
});
