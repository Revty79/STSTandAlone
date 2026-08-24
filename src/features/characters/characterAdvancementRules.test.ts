import { describe, expect, it } from "vitest";
import type { CharacterAggregate } from "../../types/character";
import type { RaceAggregate } from "../../types/race";
import {
  buildCharacterAdvancementSkills,
  getMaximumAffordableSkillPoints,
  getSkillAdvancementCost,
} from "./characterAdvancementRules";

function selectedRace(racialAthletics = 0): RaceAggregate {
  return {
    race: {
      id: 3, name: "Human", legacyDescription: "", physicalCharacteristics: "",
      physicalDescription: "", ageRangeText: "", ageMin: null, ageMax: null,
      size: "Medium", baseMagic: 2, racialQuirkName: "", quirkSuccessEffect: "",
      quirkFailureEffect: "", commonLanguagesKnown: "", commonArchetypes: "",
      genreExamples: "", culturalMindset: "", outlookOnMagic: "",
      createdByUserId: null, sourceSystem: null, sourceExternalId: null,
      createdAt: "created", updatedAt: "updated",
    },
    attributeCaps: [],
    movementModes: [],
    skillLinks: racialAthletics > 0 ? [{
      id: 1, raceId: 3, skillId: 1, skillName: "Athletics",
      skillClassification: "standard", linkType: "bonus", value: racialAthletics,
      sortOrder: 0, createdAt: "created", updatedAt: "updated",
    }] : [],
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
      heightFeet: 5, heightInches: 7, weight: 65, skinColor: "Bronze",
      eyeColor: "Green", hairColor: "Black", deity: "None", definingMarks: "None",
      personality: "Patient", goals: "Explore", secrets: "None",
      backstory: "A traveler.", motivations: "Discovery", fame: 0,
      experience: 9, totalExperience: 40, quintessence: 2,
      totalQuintessence: 2, creditsRemaining: 80,
      creationCompletedAt: "completed", createdAt: "created", updatedAt: "updated",
    },
    attributes: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey) => ({
      characterId: 9,
      attributeKey: attributeKey as "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHR",
      value: 25,
    })),
    skillAllocations: [{
      id: 10, characterId: 9, skillId: 1, skillName: "Athletics",
      skillClassification: "standard", skillTier: 1, primaryAttribute: "STR",
      parentAllocationId: null, points: 5, createdAt: "created", updatedAt: "updated",
    }],
    items: [],
    campaign: {
      id: 12, name: "Tidefall", attributePoints: 150, skillPoints: 10,
      maxStartingSkill: 5, pointsToUnlockNextTier: 5, maxPointsInSkill: 75,
      startingCreditAmount: 100, currencySystem: "Credits",
      allowedSystems: ["Tier 1"], derivedCurrencies: [],
    },
    allowedRaces: [{ id: 3, name: "Human" }],
    selectedRace: selectedRace(),
    skillCatalog: [
      { id: 1, name: "Athletics", classification: "standard", tier: 1, primaryAttribute: "STR", secondaryAttribute: null, definition: "Physical conditioning." },
      { id: 2, name: "Climbing", classification: "standard", tier: 2, primaryAttribute: "STR", secondaryAttribute: null, definition: "Climb difficult surfaces." },
      { id: 3, name: "Navigation", classification: "standard", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "Find a route." },
    ],
    skillRelationships: [{
      skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0,
    }],
    authorizedItems: [],
  };
}

describe("Character advancement rules", () => {
  it("charges ten for a first point and then the current effective value", () => {
    expect(getSkillAdvancementCost(0)).toBe(10);
    expect(getSkillAdvancementCost(1)).toBe(1);
    expect(getSkillAdvancementCost(5)).toBe(5);
    expect(getSkillAdvancementCost(10)).toBe(10);
    expect(getSkillAdvancementCost(5, 3)).toBe(18);
    expect(getSkillAdvancementCost(0, 4)).toBe(16);
    expect(getMaximumAffordableSkillPoints(5, 17, 75)).toBe(2);
    expect(getMaximumAffordableSkillPoints(0, 20, 75)).toBe(5);
    expect(getMaximumAffordableSkillPoints(74, 500, 75)).toBe(1);
  });

  it("offers new roots and newly unlocked child Skills without reapplying starting tier limits", () => {
    const skills = buildCharacterAdvancementSkills(aggregate());
    const athletics = skills.find((entry) => entry.skill.name === "Athletics");
    const climbing = skills.find((entry) => entry.skill.name === "Climbing");
    const navigation = skills.find((entry) => entry.skill.name === "Navigation");

    expect(athletics).toMatchObject({ effectivePoints: 5, experienceCost: 5, canAfford: true });
    expect(climbing).toMatchObject({
      parentAllocationId: 10, effectivePoints: 0, experienceCost: 10, canAfford: false,
    });
    expect(navigation).toMatchObject({
      parentAllocationId: null, effectivePoints: 0, experienceCost: 10,
    });
  });

  it("counts racial points as already-owned points when calculating advancement cost", () => {
    const character = aggregate();
    character.selectedRace = selectedRace(10);
    character.skillAllocations[0].points = 0;
    character.profile.experience = 20;

    const athletics = buildCharacterAdvancementSkills(character)
      .find((entry) => entry.skill.name === "Athletics");

    expect(athletics).toMatchObject({
      purchasedPoints: 0,
      racialPoints: 10,
      effectivePoints: 10,
      nextEffectivePoints: 11,
      experienceCost: 10,
      owned: true,
      canAfford: true,
    });
  });

  it("hides every Tier 3 supernatural purchase above the Character casting level", () => {
    const character = aggregate();
    character.campaign.allowedSystems.push("Spellcraft");
    character.skillCatalog.push(
      { id: 4, name: "Spellcraft", classification: "magic access", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
      { id: 5, name: "Evocation", classification: "sphere", tier: 2, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
      { id: 6, name: "Arcane Technique", classification: "supernatural technique", tier: 3, primaryAttribute: "INT", secondaryAttribute: null, definition: "", spellLevel: "Novice" },
      { id: 7, name: "Channeling", classification: "magic stabalization", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
    );
    character.skillRelationships.push(
      { skillId: 5, relatedSkillId: 4, relationshipType: "parent", sortOrder: 0 },
      { skillId: 6, relatedSkillId: 5, relationshipType: "parent", sortOrder: 0 },
    );
    character.skillAllocations.push(
      { id: 20, characterId: 9, skillId: 4, skillName: "Spellcraft", skillClassification: "magic access", skillTier: 1, primaryAttribute: "INT", parentAllocationId: null, points: 1, createdAt: "created", updatedAt: "updated" },
      { id: 21, characterId: 9, skillId: 5, skillName: "Evocation", skillClassification: "sphere", skillTier: 2, primaryAttribute: "INT", parentAllocationId: 20, points: 1, createdAt: "created", updatedAt: "updated" },
      { id: 22, characterId: 9, skillId: 7, skillName: "Channeling", skillClassification: "magic stabalization", skillTier: 1, primaryAttribute: "INT", parentAllocationId: null, points: 1, createdAt: "created", updatedAt: "updated" },
    );

    expect(buildCharacterAdvancementSkills(character)
      .some((entry) => entry.skill.id === 6)).toBe(false);

    character.selectedRace!.race.baseMagic = 12;
    expect(buildCharacterAdvancementSkills(character)
      .find((entry) => entry.skill.id === 6)).toMatchObject({
        parentAllocationId: 21,
        effectivePoints: 0,
        experienceCost: 10,
    });
  });

  it("uses 100 as the effective advancement maximum for Special Abilities", () => {
    const character = aggregate();
    character.campaign.allowedSystems.push("Special Abilities");
    character.profile.experience = 10_000;
    character.skillCatalog.push({
      id: 8, name: "Moonshadow Omen", classification: "special ability",
      tier: null, primaryAttribute: null, secondaryAttribute: null, definition: "",
    });
    character.skillAllocations.push({
      id: 30, characterId: 9, skillId: 8, skillName: "Moonshadow Omen",
      skillClassification: "special ability", skillTier: null, primaryAttribute: null,
      parentAllocationId: null, points: 75, createdAt: "created", updatedAt: "updated",
    });

    const specialAbility = buildCharacterAdvancementSkills(character)
      .find((entry) => entry.skill.id === 8);
    expect(specialAbility).toMatchObject({
      effectivePoints: 75,
      maximumEffectivePoints: 100,
      experienceCost: 75,
      atMaximum: false,
    });
    expect(getMaximumAffordableSkillPoints(
      specialAbility!.effectivePoints,
      character.profile.experience,
      specialAbility!.maximumEffectivePoints,
    )).toBe(25);
  });
});
