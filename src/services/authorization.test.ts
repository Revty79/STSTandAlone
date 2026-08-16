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
    expect(canAccessDestination(session, "realms")).toBe(true);
  });

  it("routes a Player-only profile directly to Realms", () => {
    const session = sessionWith([USER_ROLE.PLAYER]);

    expect(getPostLoginDestination(session)).toBe("realms");
    expect(canAccessDestination(session, "access-choice")).toBe(false);
    expect(canAccessDestination(session, "heavens")).toBe(false);
    expect(canAccessDestination(session, "realms")).toBe(true);
  });

  it("redirects unauthorized G.O.D. destinations through the central guard", () => {
    const session = sessionWith([USER_ROLE.PLAYER]);

    expect(authorizeDestination(session, "access-choice")).toBe("realms");
    expect(authorizeDestination(session, "heavens")).toBe("realms");
  });
});
