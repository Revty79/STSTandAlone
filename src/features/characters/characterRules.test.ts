import { describe, expect, it } from "vitest";
import type { CharacterAggregate, CharacterDraft } from "../../types/character";
import type { RaceAggregate } from "../../types/race";
import {
  buildSkillAllocationTree,
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterHp,
  getCharacterSkillRanks,
  getMovementInitiative,
  getSkillRank,
  getSkillRollTarget,
  getStartingFundsRemaining,
  isSkillAllowedByCampaign,
  normalizeSkillAttributeKey,
} from "./characterRules";

function race(): RaceAggregate {
  return {
    race: {
      id: 3, name: "Human", legacyDescription: "", physicalCharacteristics: "",
      physicalDescription: "", ageRangeText: "", ageMin: null, ageMax: null,
      size: "Medium", baseMagic: 2, racialQuirkName: "Adaptable",
      quirkSuccessEffect: "", quirkFailureEffect: "", commonLanguagesKnown: "",
      commonArchetypes: "", genreExamples: "", culturalMindset: "",
      outlookOnMagic: "", createdByUserId: null, sourceSystem: null,
      sourceExternalId: null, createdAt: "created", updatedAt: "updated",
    },
    attributeCaps: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map(
      (attributeKey, index) => ({
        id: index + 1, raceId: 3, attributeKey, maxValue: 40, sortOrder: index,
        createdAt: "created", updatedAt: "updated",
      }),
    ),
    movementModes: [{
      id: 1, raceId: 3, movementMode: "Walk", baseValue: 5, notes: "",
      sortOrder: 0, createdAt: "created", updatedAt: "updated",
    }],
    skillLinks: [],
  };
}

function aggregate(): CharacterAggregate {
  return {
    character: {
      id: 9, campaignId: 12, playerUserId: 2, name: "Neris",
      campaignName: "Tidefall", playerUsername: "Mariner",
      createdAt: "created", updatedAt: "updated",
    },
    profile: {
      characterId: 9, raceId: 3, age: 24, sex: "Female",
      heightFeet: 5, heightInches: 7,
      weight: 65, skinColor: "Bronze", eyeColor: "Green", hairColor: "Black",
      deity: "", definingMarks: "", personality: "", goals: "", secrets: "",
      backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0,
      quintessence: 0, totalQuintessence: 0, creditsRemaining: 80,
      creationCompletedAt: null,
      createdAt: "created", updatedAt: "updated",
    },
    attributes: [],
    skillAllocations: [],
    items: [],
    campaign: {
      id: 12, name: "Tidefall", attributePoints: 150, skillPoints: 10,
      maxStartingSkill: 6, pointsToUnlockNextTier: 5, maxPointsInSkill: 75,
      startingCreditAmount: 100, currencySystem: "Credits",
      allowedSystems: ["Tier 1", "Tier 2"], derivedCurrencies: [],
    },
    allowedRaces: [{ id: 3, name: "Human" }],
    selectedRace: race(),
    skillCatalog: [
      { id: 1, name: "Athletics", classification: "standard", tier: 1, primaryAttribute: "STR", secondaryAttribute: null, definition: "" },
      { id: 2, name: "Climbing", classification: "standard", tier: 2, primaryAttribute: "STR", secondaryAttribute: null, definition: "" },
      { id: 3, name: "Spellcraft", classification: "magic access", tier: null, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
    ],
    skillRelationships: [{ skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 }],
    authorizedItems: [{ id: 7, canonicalId: "ITEM-7", name: "Rope", catalogScope: "inventory", equipmentGroup: null, recordType: "Item", category: "Gear", credits: 10, priceBasis: "each" }],
  };
}

function draft(): CharacterDraft {
  return {
    name: "Neris",
    profile: {
      raceId: 3, age: 24, sex: "Female", heightFeet: 5, heightInches: 7,
      weight: 65,
      skinColor: "Bronze", eyeColor: "Green", hairColor: "Black", deity: "",
      definingMarks: "", personality: "", goals: "", secrets: "", backstory: "",
      motivations: "", fame: 0, experience: 0, totalExperience: 0,
      quintessence: 0, totalQuintessence: 0,
    },
    attributes: { STR: 25, DEX: 25, CON: 25, INT: 25, WIS: 25, CHR: 25 },
    skillAllocations: [
      { draftId: 10, skillId: 1, parentDraftId: null, points: 5 },
      { draftId: 11, skillId: 2, parentDraftId: 10, points: 5 },
    ],
    items: [{ itemId: 7, quantity: 2, unitCostCredits: 10 }],
  };
}

describe("Character rules", () => {
  it("keeps all derived Attribute, HP, initiative, movement, and roll calculations deterministic", () => {
    expect([1, 2, 6, 11, 16, 21, 29, 30, 35, 40, 45].map(getAttributeModifier))
      .toEqual([-5, -4, -3, -2, -1, 0, 0, 1, 2, 3, 4]);
    expect(getAttributeRollTarget(35)).toBe(65);
    expect(getCharacterHp(35)).toBe(72);
    expect([getBaseInitiative(1), getBaseInitiative(5), getBaseInitiative(10), getBaseInitiative(30)])
      .toEqual([1, 2, 3, 7]);
    expect(getMovementInitiative(30, 5)).toBe(35);
    expect(getSkillRank(5, 2, null, 1)).toBe(7);
    expect(getSkillRank(5, 2, 7, 2)).toBe(12);
    expect(getSkillRollTarget(35, 12)).toBe(53);
    expect(normalizeSkillAttributeKey("CHA")).toBe("CHR");
  });

  it("uses Campaign budgets, Race caps, tier thresholds, and starting funds for readiness", () => {
    const character = aggregate();
    const currentDraft = draft();
    expect(evaluateCharacterReadiness(currentDraft, character, race())).toMatchObject({
      ready: true, attributesUsed: 150, skillPointsUsed: 10, fundsRemaining: 80,
    });

    currentDraft.attributes.STR = 41;
    currentDraft.attributes.DEX = 9;
    expect(evaluateCharacterReadiness(currentDraft, character, race()).attributesComplete).toBe(false);
    currentDraft.attributes.STR = 25;
    currentDraft.attributes.DEX = 25;
    currentDraft.skillAllocations[0].points = 4;
    currentDraft.skillAllocations[1].points = 6;
    expect(evaluateCharacterReadiness(currentDraft, character, race()).skillsComplete).toBe(false);
    currentDraft.items[0].quantity = 11;
    expect(evaluateCharacterReadiness(currentDraft, character, race()).ready).toBe(false);
    expect(getStartingFundsRemaining(currentDraft, 100)).toBe(0);
    currentDraft.items = [{ itemId: 999, quantity: 1, unitCostCredits: 0 }];
    expect(evaluateCharacterReadiness(currentDraft, character, race()).issues)
      .toContain("Starting possessions must be priced and authorized by this Campaign.");
  });

  it("keeps the same Skill in separate parent allocation branches without string IDs", () => {
    const tree = buildSkillAllocationTree([
      { draftId: 1, skillId: 10, parentDraftId: null, points: 5 },
      { draftId: 2, skillId: 20, parentDraftId: null, points: 5 },
      { draftId: 3, skillId: 30, parentDraftId: 1, points: 2 },
      { draftId: 4, skillId: 30, parentDraftId: 2, points: 3 },
    ]);
    expect(tree).toEqual([
      { skillId: 10, points: 5, children: [{ skillId: 30, points: 2, children: [] }] },
      { skillId: 20, points: 5, children: [{ skillId: 30, points: 3, children: [] }] },
    ]);
  });

  it("uses Campaign systems to control ordinary tiers and special access roots", () => {
    const character = aggregate();
    const athletics = character.skillCatalog[0];
    const climbing = character.skillCatalog[1];
    const spellcraft = character.skillCatalog[2];
    expect(isSkillAllowedByCampaign(climbing, athletics, ["Tier 1"])).toBe(false);
    expect(isSkillAllowedByCampaign(climbing, athletics, ["Tier 1", "Tier 2"])).toBe(true);
    expect(isSkillAllowedByCampaign(spellcraft, spellcraft, ["Tier 1"])).toBe(false);
    expect(isSkillAllowedByCampaign(spellcraft, spellcraft, ["Spellcraft"])).toBe(true);

    const ranks = getCharacterSkillRanks(draft(), character.skillCatalog);
    expect(ranks.get(10)).toBe(5);
    expect(ranks.get(11)).toBe(10);
  });
});
