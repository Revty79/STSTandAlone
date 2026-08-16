import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignInformationPanel } from "../components/CampaignInformationPanel";
import type { AuthSession } from "../types/user";
import { USER_ROLE } from "../types/user";
import { HeavensDashboardPage } from "./HeavensDashboardPage";
import { RealmsDashboardPage } from "./RealmsDashboardPage";

function sessionWith(roles: AuthSession["roles"]): AuthSession {
  return {
    isAuthenticated: true,
    userId: 1,
    username: "Voyager",
    roles,
  };
}

describe("dashboard shells", () => {
  it("offers campaign information from the Heavens dashboard", () => {
    const dashboard = renderToStaticMarkup(
      <HeavensDashboardPage
        session={sessionWith([USER_ROLE.GOD, USER_ROLE.PLAYER])}
        onOpenSkills={vi.fn()}
        onReturn={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    const information = renderToStaticMarkup(
      <CampaignInformationPanel onClose={vi.fn()} />,
    );

    expect(dashboard).toContain("View Campaign");
    expect(dashboard).toContain("FUTURE EXPANSION");
    expect(dashboard).not.toContain("Magic &amp; Spells");
    expect(dashboard).not.toContain("Special Abilities");
    expect(information).toContain("No Campaign Selected");
    expect(information).toContain(
      "Select a campaign to view its information.",
    );
  });

  it("does not render G.O.D.-only navigation for a Player-only dashboard", () => {
    const dashboard = renderToStaticMarkup(
      <RealmsDashboardPage
        session={sessionWith([USER_ROLE.PLAYER])}
        onLogout={vi.fn()}
      />,
    );

    expect(dashboard).toContain("THE REALMS");
    expect(dashboard).toContain("Create Character");
    expect(dashboard).not.toContain("Return to Paths");
  });

  it("renders Return to Paths only when authorization supplies it", () => {
    const dashboard = renderToStaticMarkup(
      <RealmsDashboardPage
        session={sessionWith([USER_ROLE.GOD, USER_ROLE.PLAYER])}
        onReturn={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(dashboard).toContain("Return to Paths");
  });
});
