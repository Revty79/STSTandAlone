import { describe, expect, it } from "vitest";
import type { CharacterAggregate, CharacterSkillAllocation } from "../../types/character";
import { createEmptySpell } from "../spell-construction/utilities/spellFactory";
import { resolveCharacterSpellCastingContext } from "./characterSpellCasting";

function allocation(
  id: number,
  skillId: number,
  skillName: string,
  parentAllocationId: number | null,
  points: number,
): CharacterSkillAllocation {
  return {
    id, characterId: 9, skillId, skillName, skillClassification: "standard",
    skillTier: 1, primaryAttribute: "INT", parentAllocationId, points,
    createdAt: "created", updatedAt: "updated",
  };
}

function aggregate(): CharacterAggregate {
  return {
    character: { id: 9, campaignId: 12, playerUserId: 2, name: "Neris", campaignName: "Tidefall", playerUsername: "Mariner", createdAt: "created", updatedAt: "updated" },
    profile: { characterId: 9, raceId: 3, age: null, sex: "", heightFeet: null, heightInches: null, weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "", personality: "", goals: "", secrets: "", backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0, quintessence: 0, totalQuintessence: 0, fatePoints: 0, creditsRemaining: 0, creationCompletedAt: "completed", createdAt: "created", updatedAt: "updated" },
    attributes: [], items: [], currencyHoldings: [],
    campaign: { id: 12, name: "Tidefall", attributePoints: 0, skillPoints: 0, maxStartingSkill: 0, pointsToUnlockNextTier: 0, maxPointsInSkill: 0, startingCreditAmount: 0, currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 0, allowedSystems: [], derivedCurrencies: [] },
    allowedRaces: [],
    selectedRace: {
      race: { id: 3, name: "Human", legacyDescription: "", physicalCharacteristics: "", physicalDescription: "", ageRangeText: "", ageMin: null, ageMax: null, size: "Medium", baseMagic: 2, racialQuirkName: "", quirkSuccessEffect: "", quirkFailureEffect: "", commonLanguagesKnown: "", commonArchetypes: "", genreExamples: "", culturalMindset: "", outlookOnMagic: "", createdByUserId: null, sourceSystem: null, sourceExternalId: null, createdAt: "created", updatedAt: "updated" },
      attributeCaps: [], movementModes: [], skillLinks: [],
    },
    skillCatalog: [
      { id: 1, name: "Spellcraft", classification: "magic access", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
      { id: 2, name: "Faith", classification: "magic access", tier: 1, primaryAttribute: "WIS", secondaryAttribute: null, definition: "" },
      { id: 3, name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
      { id: 4, name: "Devotion", classification: "standard", tier: 1, primaryAttribute: "WIS", secondaryAttribute: null, definition: "" },
      { id: 5, name: "Elemental Sphere", classification: "sphere", tier: 2, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
      { id: 6, name: "Tidal Light", classification: "spell", tier: 3, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
    ],
    skillRelationships: [], authorizedItems: [],
    skillAllocations: [
      allocation(100, 1, "Spellcraft", null, 1),
      allocation(101, 3, "Channeling", 100, 16),
      allocation(102, 5, "Elemental Sphere", 100, 1),
      allocation(104, 6, "Tidal Light", 102, 1),
      allocation(200, 2, "Faith", null, 1),
      allocation(201, 4, "Devotion", 200, 6),
      allocation(202, 5, "Elemental Sphere", 200, 1),
      allocation(204, 6, "Tidal Light", 202, 1),
    ],
  };
}

describe("Character Spell casting context", () => {
  it("uses the exact owned Spell tree instead of borrowing another tree's level", () => {
    const character = aggregate();
    const spell = { ...createEmptySpell(), frameworkSkillId: 5 };

    expect(resolveCharacterSpellCastingContext(character, spell, 104)).toMatchObject({
      system: "Spellcraft",
      profile: { spellAccessLevel: "Master", manaPool: 32 },
    });
    expect(resolveCharacterSpellCastingContext(character, spell, 204)).toMatchObject({
      system: "Faith",
      profile: { spellAccessLevel: "Novice", manaPool: 12 },
    });
  });

  it("honors a personal Spell's stored tree and leaves an ambiguous tree unresolved", () => {
    const character = aggregate();
    const spell = { ...createEmptySpell(), frameworkSkillId: 5 };

    expect(resolveCharacterSpellCastingContext(character, { ...spell, castingSystem: "Faith" }))
      .toMatchObject({ system: "Faith", profile: { spellAccessLevel: "Novice" } });
    expect(resolveCharacterSpellCastingContext(character, spell)).toBeNull();
  });
});
