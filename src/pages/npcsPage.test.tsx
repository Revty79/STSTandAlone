import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { USER_ROLE, type AuthSession } from "../types/user";
import { NpcsPage } from "./NpcsPage";

describe("NPC master sheet", () => {
  it("opens as a Campaign-first NPC index before the full editor", () => {
    const session: AuthSession = {
      isAuthenticated: true,
      userId: 1,
      username: "Voyager",
      roles: [USER_ROLE.GOD],
    };
    const page = renderToStaticMarkup(
      <NpcsPage
        session={session}
        onOpenNpc={vi.fn()}
        onBack={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(page).toContain("NPC Master Sheet");
    expect(page).toContain("MASTER NPC INDEX");
    expect(page).toContain("No Campaign Selected");
    expect(page).toContain("Create Race NPC");
    expect(page).toContain("Create Creature NPC");
    expect(page).toContain("Edit Full Sheet");
  });
});
