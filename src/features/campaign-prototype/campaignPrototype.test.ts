import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  completeCampaignPrototype,
  convertCreditsToDerivedUnits,
  createEmptyCampaignPrototypeDraft,
  deduplicateCampaignInventoryItems,
  type CampaignSystemOption,
} from "./campaignPrototype";

describe("Campaign prototype completion", () => {
  it("keeps the original tier and system terminology", () => {
    expect(CAMPAIGN_SYSTEM_OPTIONS).toEqual([
      "Tier 1",
      "Tier 2",
      "Tier 3",
      "Spellcraft",
      "Talismanism",
      "Faith",
      "Psyonics",
      "Special Abilities",
      "Bardic Resonance",
    ]);
  });

  it("requires identity, numeric values, and a clear currency choice", () => {
    const result = completeCampaignPrototype(
      createEmptyCampaignPrototypeDraft(),
      [],
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({
      name: "Campaign Name is required.",
      attributePoints: "Attribute Points is required.",
      skillPoints: "Skill Points is required.",
      maxStartingSkill: "Max Starting Points Spent per Skill is required.",
      pointsToUnlockNextTier: "Needed to Unlock Next Tier is required.",
      maxPointsInSkill: "Max Points in a Standard Skill is required.",
      startingCreditAmount: "Starting Credit Amount is required.",
      currencySystem: "Choose Credits or Derived Currency.",
      fatePointMethod: "Choose Assigned or Rolled Fate Points.",
    });
  });

  it("rejects malformed and negative numeric input without inventing final ranges", () => {
    const draft = {
      ...createEmptyCampaignPrototypeDraft(),
      name: "Tidefall",
      attributePoints: "not-a-number",
      skillPoints: "-1",
      maxStartingSkill: "40",
      pointsToUnlockNextTier: "25",
      maxPointsInSkill: "75",
      startingCreditAmount: "200",
      currencySystem: "Credits" as const,
      fatePointMethod: "Assigned" as const,
      assignedFatePoints: "3",
    };

    const result = completeCampaignPrototype(draft, []);

    expect(result.ok).toBe(false);
    expect(result.errors.attributePoints).toBe(
      "Attribute Points must be a valid number.",
    );
    expect(result.errors.skillPoints).toBe("Skill Points cannot be negative.");
    expect(result.errors.maxStartingSkill).toBeUndefined();
  });

  it("captures a typed in-memory review snapshot with selected catalog races", () => {
    const draft = {
      ...createEmptyCampaignPrototypeDraft(),
      name: "  Tidefall  ",
      attributePoints: "50",
      skillPoints: "120",
      maxStartingSkill: "35.5",
      pointsToUnlockNextTier: "25",
      maxPointsInSkill: "75",
      startingCreditAmount: "250",
      currencySystem: "Credits" as const,
      fatePointMethod: "Assigned" as const,
      assignedFatePoints: "4",
      allowedSystems: ["Tier 1", "Spellcraft", "Faith"] as CampaignSystemOption[],
      allowedRaceIds: [9, 2],
      inventoryGenres: ["Fantasy", "Historical"],
      inventoryItems: [{
        id: 12,
        canonicalId: "ITEM-0012",
        name: "Travel Pack",
        recordType: "Item",
        family: "Pack",
        category: "General Gear",
        catalogScope: "equipment" as const,
        equipmentGroup: "general" as const,
        tags: ["Fantasy"],
      }],
    };

    const result = completeCampaignPrototype(draft, [
      { id: 2, name: "Human" },
      { id: 5, name: "Merfolk" },
      { id: 9, name: "Serrian" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toEqual({
      name: "Tidefall",
      attributePoints: 50,
      skillPoints: 120,
      maxStartingSkill: 35.5,
      pointsToUnlockNextTier: 25,
      maxPointsInSkill: 75,
      startingCreditAmount: 250,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 4,
      derivedCurrencies: [],
      allowedSystems: ["Tier 1", "Spellcraft", "Faith"],
      allowedRaces: [
        { id: 2, name: "Human" },
        { id: 9, name: "Serrian" },
      ],
      inventoryGenres: ["Fantasy", "Historical"],
      inventoryItems: [{
        id: 12,
        canonicalId: "ITEM-0012",
        name: "Travel Pack",
        recordType: "Item",
        family: "Pack",
        category: "General Gear",
        catalogScope: "equipment",
        equipmentGroup: "general",
        tags: ["Fantasy"],
      }],
    });
  });

  it("shows an Item only once when it belongs to multiple selected genres", () => {
    const sharedItem = {
      id: 12,
      canonicalId: "ITEM-0012",
      name: "Travel Pack",
      recordType: "Item",
      family: "Pack",
      category: "General Gear",
      catalogScope: "equipment" as const,
      equipmentGroup: "general" as const,
      tags: ["Fantasy", "Historical"],
    };

    expect(deduplicateCampaignInventoryItems([
      sharedItem,
      { ...sharedItem },
      { ...sharedItem, id: 3, canonicalId: "ITEM-0003", name: "Bedroll" },
    ])).toEqual([
      { ...sharedItem, id: 3, canonicalId: "ITEM-0003", name: "Bedroll" },
      sharedItem,
    ]);
  });

  it("requires and captures multiple Derived Currency entries only when selected", () => {
    const draft = {
      ...createEmptyCampaignPrototypeDraft(),
      name: "Iron Marches",
      attributePoints: "50",
      skillPoints: "100",
      maxStartingSkill: "30",
      pointsToUnlockNextTier: "25",
      maxPointsInSkill: "80",
      startingCreditAmount: "400",
      currencySystem: "Derived Currency" as const,
      fatePointMethod: "Rolled" as const,
    };

    const incomplete = completeCampaignPrototype(draft, []);
    expect(incomplete.ok).toBe(false);
    expect(incomplete.errors.derivedCurrencies).toBe(
      "Add at least one Derived Currency entry.",
    );

    const invalidRow = completeCampaignPrototype({
      ...draft,
      derivedCurrencies: [{ name: "", description: "", creditsPerUnit: "" }],
    }, []);
    expect(invalidRow.ok).toBe(false);
    expect(invalidRow.errors.derivedCurrencyRows?.[0]).toEqual({
      name: "Currency 1 Name is required.",
      description: "Currency 1 Description is required.",
      creditsPerUnit: "Currency 1 Credit Value must be greater than zero.",
    });

    const complete = completeCampaignPrototype({
      ...draft,
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
    }, []);
    expect(complete.ok).toBe(true);
    if (!complete.ok) return;
    expect(complete.snapshot.derivedCurrencies).toEqual([
      { name: "Penny", description: "A copper coin.", creditsPerUnit: 0.01 },
      {
        name: "Five Dollar Bill",
        description: "Paper currency with a 5 on it.",
        creditsPerUnit: 5,
      },
    ]);
  });

  it("stores Assigned Fate Points or leaves each Rolled result for Character Identity", () => {
    const base = {
      ...createEmptyCampaignPrototypeDraft(),
      name: "Tidefall",
      attributePoints: "50",
      skillPoints: "100",
      maxStartingSkill: "10",
      pointsToUnlockNextTier: "5",
      maxPointsInSkill: "75",
      startingCreditAmount: "100",
      currencySystem: "Credits" as const,
    };
    const missingAssigned = completeCampaignPrototype({
      ...base,
      fatePointMethod: "Assigned",
    }, []);
    expect(missingAssigned.ok).toBe(false);
    expect(missingAssigned.errors.assignedFatePoints).toContain("required");

    const rolled = completeCampaignPrototype({
      ...base,
      fatePointMethod: "Rolled",
    }, []);
    expect(rolled.ok).toBe(true);
    if (rolled.ok) {
      expect(rolled.snapshot).toMatchObject({
        fatePointMethod: "Rolled",
        assignedFatePoints: null,
      });
    }
  });

  it("converts the shared Credit value into each denomination", () => {
    expect(convertCreditsToDerivedUnits(400, 0.01)).toBe(40_000);
    expect(convertCreditsToDerivedUnits(400, 5)).toBe(80);
    expect(convertCreditsToDerivedUnits(400, 0)).toBeNull();
  });
});
