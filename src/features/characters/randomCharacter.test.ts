import { describe, expect, it } from "vitest";
import type { CharacterAggregate, CharacterDraft } from "../../types/character";
import type { RaceAggregate } from "../../types/race";
import { evaluateCharacterReadiness, getAttributePointsUsed, getSkillPointsUsed } from "./characterRules";
import {
  createCompletelyRandomAnswers,
  generateRandomCharacterDraft,
  type GuidedRandomCharacterAnswers,
} from "./randomCharacter";

function race(): RaceAggregate {
  return {
    race: {
      id: 3, name: "Human", legacyDescription: "", physicalCharacteristics: "",
      physicalDescription: "", ageRangeText: "18-80", ageMin: 18, ageMax: 80,
      size: "Medium", baseMagic: 2, racialQuirkName: "Adaptable",
      quirkSuccessEffect: "", quirkFailureEffect: "", commonLanguagesKnown: "",
      commonArchetypes: "", genreExamples: "", culturalMindset: "",
      outlookOnMagic: "", createdByUserId: null, sourceSystem: null,
      sourceExternalId: null, createdAt: "created", updatedAt: "updated",
    },
    attributeCaps: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey, index) => ({
      id: index + 1, raceId: 3, attributeKey, maxValue: 10, sortOrder: index,
      createdAt: "created", updatedAt: "updated",
    })),
    movementModes: [], skillLinks: [],
  };
}

function aggregate(): CharacterAggregate {
  return {
    character: { id: 9, campaignId: 12, playerUserId: 2, name: "New Character", campaignName: "Tidefall", playerUsername: "Mariner", createdAt: "created", updatedAt: "updated" },
    profile: { characterId: 9, raceId: null, age: null, sex: "", heightFeet: null, heightInches: null, weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "", personality: "", goals: "", secrets: "", backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0, quintessence: 0, totalQuintessence: 0, fatePoints: 3, creditsRemaining: 100, creationCompletedAt: null, createdAt: "created", updatedAt: "updated" },
    attributes: [], skillAllocations: [], items: [], currencyHoldings: [],
    campaign: { id: 12, name: "Tidefall", attributePoints: 30, skillPoints: 12, maxStartingSkill: 5, pointsToUnlockNextTier: 3, maxPointsInSkill: 75, startingCreditAmount: 100, currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 3, allowedSystems: ["Tier 1"], derivedCurrencies: [] },
    allowedRaces: [{ id: 3, name: "Human" }], selectedRace: null,
    skillCatalog: ["Athletics", "Dodge", "Endurance", "Lore", "Perception", "Persuasion"].map((name, index) => ({
      id: index + 1, name, classification: "standard", tier: 1,
      primaryAttribute: ["STR", "DEX", "CON", "INT", "WIS", "CHR"][index]!,
      secondaryAttribute: null, definition: "",
    })),
    skillRelationships: [],
    authorizedItems: [{
      id: 7, canonicalId: "ITEM-7", name: "Travel Pack", catalogScope: "equipment",
      equipmentGroup: "general", recordType: "Item", category: "Gear", credits: 10,
      priceBasis: "each", description: "", weight: 2, weightUnit: "lb", size: "Small",
      durability: 10, weaponType: null, handedness: null, damage: null, damageType: null,
      rangeText: null, reachText: null, weaponRulesText: null, armorType: null,
      coverage: null, baseSoak: null, armorDamageModifiers: null, armorRulesText: null,
    }],
  };
}

function draft(character: CharacterAggregate): CharacterDraft {
  return {
    name: character.character.name,
    profile: {
      raceId: null, age: null, sex: "", heightFeet: null, heightInches: null,
      weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "",
      definingMarks: "", personality: "", goals: "", secrets: "", backstory: "",
      motivations: "", fame: 0, experience: 0, totalExperience: 0,
      quintessence: 0, totalQuintessence: 0, fatePoints: 3, creditsRemaining: 100,
    },
    attributes: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHR: 0 },
    skillAllocations: [], items: [], currencyHoldings: [],
  };
}

describe("Random Character generation", () => {
  it("creates a saved-draft-ready Character using the exact Campaign budgets", () => {
    const character = aggregate();
    const selectedRace = race();
    const answers: GuidedRandomCharacterAnswers = {
      name: "Rhea Testborn", raceId: 3, focus: "scout", magic: "none",
      equipment: "prepared", temperament: "curious",
    };
    const result = generateRandomCharacterDraft(
      character,
      selectedRace,
      draft(character),
      answers,
      () => 0.37,
    );

    expect(result.draft.name).toBe("Rhea Testborn");
    expect(getAttributePointsUsed(result.draft)).toBe(30);
    expect(getSkillPointsUsed(result.draft)).toBe(12);
    expect(result.draft.items).toEqual([{ itemId: 7, quantity: 1, unitCostCredits: 10 }]);
    expect(evaluateCharacterReadiness(result.draft, character, selectedRace)).toMatchObject({
      ready: true,
      attributesComplete: true,
      skillsComplete: true,
      storyComplete: true,
      equipmentComplete: true,
    });
    expect(result.warnings).toEqual([]);
  });

  it("uses only Campaign choices and does not invent a Rolled Fate Point formula", () => {
    const character = aggregate();
    character.campaign.fatePointMethod = "Rolled";
    character.campaign.assignedFatePoints = null;
    const base = draft(character);
    base.profile.fatePoints = null;
    const answers = createCompletelyRandomAnswers(character, () => 0.2);
    const result = generateRandomCharacterDraft(character, race(), base, answers, () => 0.2);

    expect(answers.raceId).toBe(3);
    expect(result.draft.profile.fatePoints).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/does not define a die formula/i);
  });
});
