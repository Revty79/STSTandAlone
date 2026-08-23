import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignInformationPanel } from "../components/CampaignInformationPanel";
import { CampaignCharacterPanel } from "../components/CampaignCharacterPanel";
import { CampaignPlayerPanel } from "../components/CampaignPlayerPanel";
import type { CampaignAggregate } from "../types/campaign";
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
        onCreateCampaign={vi.fn()}
        onOpenRaces={vi.fn()}
        onOpenSkills={vi.fn()}
        onOpenCreatures={vi.fn()}
        onOpenEquipment={vi.fn()}
        onOpenInventory={vi.fn()}
        onReturn={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    const information = renderToStaticMarkup(
      <CampaignInformationPanel
        campaign={null}
        loading={false}
        error=""
        onClose={vi.fn()}
      />,
    );

    expect(dashboard).toContain("View Campaign");
    expect(dashboard).toContain("Create Campaign");
    expect(dashboard).not.toContain("FUTURE EXPANSION");
    expect(dashboard).not.toContain("Genres / Worlds");
    expect(dashboard).not.toContain("Game Rules");
    expect(dashboard).toContain(">Creatures<");
    expect(dashboard).toContain(">NPCs<");
    expect(dashboard).not.toContain("Creatures &amp; NPCs");
    expect(dashboard).not.toContain("Magic &amp; Spells");
    expect(dashboard).not.toContain("Special Abilities");
    expect(information).toContain("No Campaign Selected");
    expect(information).toContain(
      "Select a campaign to view its information.",
    );
  });

  it("renders the saved Campaign with every linked archive section", () => {
    const campaign: CampaignAggregate = {
      campaign: {
        id: 12, name: "Tidefall", attributePoints: 50, skillPoints: 100,
        maxStartingSkill: 35, pointsToUnlockNextTier: 25, maxPointsInSkill: 75,
        startingCreditAmount: 200, currencySystem: "Derived Currency",
        createdByUserId: 1, createdAt: "created", updatedAt: "updated",
      },
      derivedCurrencies: [{
        id: 1, campaignId: 12, name: "Penny", description: "A copper coin.",
        creditsPerUnit: 0.01, sortOrder: 0,
      }],
      allowedSystems: ["Tier 1", "Spellcraft"],
      allowedRaces: [{ id: 3, name: "Human" }],
      inventoryGenres: [{
        id: 4, name: "Fantasy", tagGroup: "Genre Pack", description: "Fantasy Items",
      }],
      inventoryItems: [{
        id: 7, canonicalId: "ITEM-0007", name: "Travel Pack", recordType: "Item",
        family: "Pack", category: "Gear", tags: ["Fantasy"],
      }],
    };
    const information = renderToStaticMarkup(
      <CampaignInformationPanel
        campaign={campaign}
        loading={false}
        error=""
        onClose={vi.fn()}
      />,
    );

    for (const value of [
      "Tidefall", "Penny", "Spellcraft", "Human", "Fantasy", "Travel Pack", "ITEM-0007",
    ]) {
      expect(information).toContain(value);
    }
  });

  it("shows every local profile and marks profiles already added to the Campaign", () => {
    const profiles = renderToStaticMarkup(
      <CampaignPlayerPanel
        campaignName="Tidefall"
        profiles={[
          {
            id: 1, username: "Voyager", roles: [USER_ROLE.GOD, USER_ROLE.PLAYER],
            isCampaignPlayer: true,
          },
          {
            id: 2, username: "Mariner", roles: [USER_ROLE.PLAYER],
            isCampaignPlayer: false,
          },
        ]}
        loading={false}
        error=""
        addingProfileId={null}
        successMessage=""
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(profiles).toContain("Profiles for Tidefall");
    expect(profiles).toContain("Voyager");
    expect(profiles).toContain("Mariner");
    expect(profiles).toContain(">Added<");
    expect(profiles).toContain(">Add<");
  });

  it("shows multiple linked New Character placeholders without asking for a sheet name", () => {
    const characters = renderToStaticMarkup(
      <CampaignCharacterPanel
        campaignName="Tidefall"
        playerName="Mariner"
        characters={[
          {
            id: 31, campaignId: 12, playerUserId: 2, name: "New Character",
            createdAt: "created", updatedAt: "updated",
          },
          {
            id: 32, campaignId: 12, playerUserId: 2, name: "New Character",
            createdAt: "created", updatedAt: "updated",
          },
        ]}
        loading={false}
        saving={false}
        error=""
        successMessage=""
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(characters).toContain("Characters for Mariner in Tidefall");
    expect(characters).toContain("Add New Character");
    expect(characters.match(/New Character/g)?.length).toBeGreaterThanOrEqual(3);
    expect(characters).toContain("Character Sheet Name field will update this same linked record");
    expect(characters).not.toContain("Character Name</span>");
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
