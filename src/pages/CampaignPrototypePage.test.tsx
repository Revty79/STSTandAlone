import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignPrototypeForm } from "../components/campaigns/CampaignPrototypeForm";
import { CampaignPrototypeReview } from "../components/campaigns/CampaignPrototypeReview";
import { createEmptyCampaignPrototypeDraft } from "../features/campaign-prototype/campaignPrototype";
import { USER_ROLE } from "../types/user";
import { CampaignPrototypePage } from "./CampaignPrototypePage";

describe("Campaign prototype window", () => {
  it("renders every requested Campaign field and catalog selection control", () => {
    const markup = renderToStaticMarkup(
      <CampaignPrototypeForm
        draft={{
          ...createEmptyCampaignPrototypeDraft(),
          inventoryGenres: ["Fantasy"],
        }}
        errors={{}}
        races={[
          { id: 1, name: "Human" },
          { id: 2, name: "Merfolk" },
        ]}
        racesLoading={false}
        racesError=""
        inventoryGenres={[
          { name: "Fantasy", tagGroup: "Genre Pack", description: "Fantasy Items" },
        ]}
        inventoryGenresLoading={false}
        inventoryGenresError=""
        inventoryItems={[
          {
            id: 20,
            canonicalId: "ITEM-0020",
            name: "Travel Pack",
            recordType: "Item",
            family: "Pack",
            category: "General Gear",
            catalogScope: "equipment",
            equipmentGroup: "general",
            tags: ["Fantasy"],
          },
        ]}
        inventoryItemsLoading={false}
        inventoryItemsError=""
        saving={false}
        submitLabel="Create Campaign"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    for (const label of [
      "Campaign Name",
      "Attribute Points",
      "Skill Points",
      "Max Starting Points Spent per Skill",
      "Needed to Unlock Next Tier",
      "Max Points in a Standard Skill",
      "Starting Credit Amount",
      "Currency System",
      "Derived Currency",
      "Tier 1",
      "Tier 2",
      "Tier 3",
      "Spellcraft",
      "Talismanism",
      "Faith",
      "Psyonics",
      "Special Abilities",
      "Bardic Resonance",
      "Human",
      "Merfolk",
      "Select All",
      "Clear All",
      "CAMPAIGN ITEM CATALOG",
      "Fantasy",
      "Travel Pack",
      "Move All",
      "Available in Campaign",
      "Create Campaign",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain("<span>Genre</span>");
    expect(markup).toContain('aria-label="Item genres"');
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain("every selected linked record");
  });

  it("reveals repeatable currency definitions only for Derived Currency", () => {
    const markup = renderToStaticMarkup(
      <CampaignPrototypeForm
        draft={{
          ...createEmptyCampaignPrototypeDraft(),
          currencySystem: "Derived Currency",
          startingCreditAmount: "200",
          derivedCurrencies: [
            {
              name: "Penny",
              description: "A copper coin.",
              creditsPerUnit: ".01",
            },
            {
              name: "Five Dollar Bill",
              description: "Paper currency with a 5 on it.",
              creditsPerUnit: "5",
            },
          ],
        }}
        errors={{}}
        races={[]}
        racesLoading={false}
        racesError=""
        inventoryGenres={[]}
        inventoryGenresLoading={false}
        inventoryGenresError=""
        inventoryItems={[]}
        inventoryItemsLoading={false}
        inventoryItemsError=""
        saving={false}
        submitLabel="Create Campaign"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain("Currency Name");
    expect(markup).toContain("Brief Description");
    expect(markup).toContain("Credit Value per Unit");
    expect(markup).toContain("Add Another Currency");
    expect(markup).toContain("Remove Currency");
    expect(markup).toContain("200 Credits = 20,000 Penny");
    expect(markup).toContain("200 Credits = 40 Five Dollar Bill");
  });

  it("shows a saved Campaign with its permanent database identity", () => {
    const markup = renderToStaticMarkup(
      <CampaignPrototypeReview
        campaignId={12}
        snapshot={{
          name: "Tidefall",
          attributePoints: 50,
          skillPoints: 100,
          maxStartingSkill: 35,
          pointsToUnlockNextTier: 25,
          maxPointsInSkill: 75,
          startingCreditAmount: 200,
          currencySystem: "Derived Currency",
          derivedCurrencies: [
            {
              name: "Penny",
              description: "A copper coin.",
              creditsPerUnit: 0.01,
            },
            {
              name: "Five Dollar Bill",
              description: "Paper currency with a 5 on it.",
              creditsPerUnit: 5,
            },
          ],
          allowedSystems: ["Tier 1", "Spellcraft"],
          allowedRaces: [{ id: 1, name: "Human" }],
          inventoryGenres: ["Fantasy"],
          inventoryItems: [{
            id: 20,
            canonicalId: "ITEM-0020",
            name: "Travel Pack",
            recordType: "Item",
            family: "Pack",
            category: "General Gear",
            catalogScope: "equipment",
            equipmentGroup: "general",
            tags: ["Fantasy"],
          }],
        }}
        onEdit={vi.fn()}
      />,
    );

    expect(markup).toContain("Campaign Ready");
    expect(markup).toContain("Campaign #12");
    expect(markup).toContain("stored in the local archive");
    expect(markup).toContain("Tidefall");
    expect(markup).toContain("200 Credits");
    expect(markup).toContain("1 Penny = 0.01 Credits");
    expect(markup).toContain("200 Credits = 20,000 Penny");
    expect(markup).toContain("1 Five Dollar Bill = 5 Credits");
    expect(markup).toContain("Human");
    expect(markup).toContain("Fantasy");
    expect(markup).toContain("Travel Pack (ITEM-0020)");
    expect(markup).toContain("Return to Editing");
  });

  it("identifies the window as a permanent G.O.D.-side Campaign archive", () => {
    const markup = renderToStaticMarkup(
      <CampaignPrototypePage
        session={{
          isAuthenticated: true,
          userId: 1,
          username: "Voyager",
          roles: [USER_ROLE.GOD],
        }}
        onBack={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(markup).toContain("THE HEAVENS / CAMPAIGN CREATION");
    expect(markup).toContain("Permanent Campaign archive");
    expect(markup).toContain("Saved Campaigns remain in the local archive");
    expect(markup).toContain("Back to The Heavens");
    expect(markup).not.toContain("Campaign players");
    expect(markup).not.toContain("Characters");
  });
});
