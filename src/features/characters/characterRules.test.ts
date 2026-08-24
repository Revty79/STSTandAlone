import { describe, expect, it } from "vitest";
import type { CharacterAggregate, CharacterDraft } from "../../types/character";
import type { RaceAggregate } from "../../types/race";
import {
  CHARACTER_SPELL_ACCESS_LEVELS,
  buildSkillAllocationTree,
  canAccessSpellAtLevel,
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterHp,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillGroupKey,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getMovementInitiative,
  getSpellAccessLevelForManaPool,
  getRacialSkillGrant,
  getSkillPointsUsed,
  getSkillRank,
  getSkillRollTarget,
  getSkillTierLabel,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  getStartingFundsRemaining,
  isSkillAllowedByCampaign,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
  reconcileRacialSkillAnchors,
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
      deity: "None", definingMarks: "None", personality: "Patient", goals: "Explore", secrets: "None",
      backstory: "A traveler.", motivations: "Discovery", fame: 0, experience: 0, totalExperience: 0,
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
      { id: 3, name: "Spellcraft", classification: "magic access", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
    ],
    skillRelationships: [{ skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 }],
    authorizedItems: [{
      id: 7, canonicalId: "ITEM-7", name: "Rope", catalogScope: "equipment",
      equipmentGroup: "general", recordType: "Item", category: "Gear", credits: 10,
      priceBasis: "each", description: "A sturdy rope.", weight: 2, weightUnit: "lb",
      size: "Small", durability: 10, weaponType: null, handedness: null, damage: null,
      damageType: null, rangeText: null, reachText: null, weaponRulesText: null,
      armorType: null, coverage: null, baseSoak: null, armorDamageModifiers: null,
      armorRulesText: null,
    }],
  };
}

function draft(): CharacterDraft {
  return {
    name: "Neris",
    profile: {
      raceId: 3, age: 24, sex: "Female", heightFeet: 5, heightInches: 7,
      weight: 65,
      skinColor: "Bronze", eyeColor: "Green", hairColor: "Black", deity: "None",
      definingMarks: "None", personality: "Patient", goals: "Explore", secrets: "None", backstory: "A traveler.",
      motivations: "Discovery", fame: 0, experience: 0, totalExperience: 0,
      quintessence: 0, totalQuintessence: 0, creditsRemaining: 80,
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

  it("requires every Identity and Story field plus an Equipment-catalog purchase before locking", () => {
    const character = aggregate();
    const currentDraft = draft();

    currentDraft.profile.deity = "";
    expect(evaluateCharacterReadiness(currentDraft, character, race())).toMatchObject({
      ready: false,
      identityComplete: false,
    });

    currentDraft.profile.deity = "None";
    currentDraft.profile.secrets = "";
    expect(evaluateCharacterReadiness(currentDraft, character, race())).toMatchObject({
      ready: false,
      storyComplete: false,
    });

    currentDraft.profile.secrets = "None";
    currentDraft.items = [];
    expect(evaluateCharacterReadiness(currentDraft, character, race())).toMatchObject({
      ready: false,
      equipmentComplete: false,
    });
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
    expect(isSkillAllowedByCampaign(climbing, athletics, ["Tier 1"], false)).toBe(true);
    expect(isSkillAllowedByCampaign(spellcraft, spellcraft, ["Tier 1"])).toBe(false);
    expect(isSkillAllowedByCampaign(spellcraft, spellcraft, ["Tier 1", "Spellcraft"])).toBe(true);
    expect(isSkillAllowedByCampaign(spellcraft, spellcraft, ["Spellcraft"], false)).toBe(true);

    expect(getSkillUnlockThreshold(athletics, 5)).toBe(5);
    expect([
      spellcraft,
      { ...spellcraft, name: "Talismanism" },
      { ...spellcraft, name: "Faith" },
      { ...spellcraft, name: "Psionic Focus" },
      { ...spellcraft, name: "Resonant Performance" },
    ].map((skill) => getSkillUnlockThreshold(skill, 5))).toEqual([1, 1, 1, 1, 1]);

    const ranks = getCharacterSkillRanks(draft(), character.skillCatalog);
    expect(ranks.get(10)).toBe(5);
    expect(ranks.get(11)).toBe(10);
  });

  it("calculates separate supernatural mana pools and gates spells by their recorded level", () => {
    const character = aggregate();
    const base = character.skillCatalog[2];
    character.skillCatalog = [
      { ...base, id: 10, name: "Channeling", classification: "magic stabalization" },
      { ...base, id: 11, name: "Devotion", classification: "divine stabalization", primaryAttribute: "WIS" },
      { ...base, id: 12, name: "Psionic Channeling", classification: "psionic stabalization", primaryAttribute: "WIS" },
      { ...base, id: 13, name: "Resonance Attunement", classification: "bardic stabalization", primaryAttribute: "CHA" },
      { ...base, id: 20, name: "Spellcraft", classification: "magic access" },
      { ...base, id: 21, name: "Faith", classification: "magic access", primaryAttribute: "WIS" },
      { ...base, id: 22, name: "Psionic Focus", classification: "magic access", primaryAttribute: "WIS" },
      { ...base, id: 23, name: "Resonant Performance", classification: "magic access", primaryAttribute: "CHA" },
      { ...base, id: 30, name: "Flame Bolt", classification: "spell", tier: 3, spellLevel: "Apprentice", manaCost: 8 },
      { ...base, id: 31, name: "Greater Flame", classification: "spell", tier: 3, spellLevel: "Novice", manaCost: 15 },
    ];
    const currentDraft = draft();
    const selectedRace = race();
    selectedRace.race.baseMagic = 1;
    currentDraft.skillAllocations = [
      { draftId: 1, skillId: 10, parentDraftId: null, points: 1 },
      { draftId: 2, skillId: 11, parentDraftId: null, points: 44 },
    ];

    const profiles = getCharacterManaProfiles(currentDraft, character.skillCatalog, selectedRace);
    expect(CHARACTER_SPELL_ACCESS_LEVELS).toEqual([
      { name: "Apprentice", minimumMana: 1, midpointMana: 6, twoSpellUnlockMana: 12 },
      { name: "Novice", minimumMana: 12, midpointMana: 16, twoSpellUnlockMana: 32 },
      { name: "Master", minimumMana: 32, midpointMana: 36, twoSpellUnlockMana: 72 },
      { name: "High Master", minimumMana: 72, midpointMana: 71, twoSpellUnlockMana: 142 },
      { name: "Grand Master", minimumMana: 142, midpointMana: null, twoSpellUnlockMana: null },
    ]);
    expect(profiles.map(({ system, sourceSkillPoints, manaPool, spellAccessLevel }) => ({
      system, sourceSkillPoints, manaPool, spellAccessLevel,
    }))).toEqual([
      { system: "Spellcraft", sourceSkillPoints: 1, manaPool: 1, spellAccessLevel: "Apprentice" },
      { system: "Talismanism", sourceSkillPoints: 1, manaPool: 1, spellAccessLevel: "Apprentice" },
      { system: "Faith", sourceSkillPoints: 44, manaPool: 44, spellAccessLevel: "Master" },
      { system: "Psyonics", sourceSkillPoints: 0, manaPool: 0, spellAccessLevel: null },
      { system: "Bardic Resonance", sourceSkillPoints: 0, manaPool: 0, spellAccessLevel: null },
    ]);
    expect([0, 1, 11, 12, 31, 32, 71, 72, 141, 142]
      .map(getSpellAccessLevelForManaPool))
      .toEqual([
        null, "Apprentice", "Apprentice", "Novice", "Novice", "Master",
        "Master", "High Master", "High Master", "Grand Master",
      ]);
    expect(getCharacterMagicSystem(character.skillCatalog[4])).toBe("Spellcraft");
    expect(getCharacterMagicSystem(character.skillCatalog[5])).toBe("Faith");
    expect(canAccessSpellAtLevel(character.skillCatalog[8], "Apprentice")).toBe(true);
    expect(canAccessSpellAtLevel(character.skillCatalog[9], "Apprentice")).toBe(false);
    expect(canAccessSpellAtLevel(character.skillCatalog[9], "Novice")).toBe(true);
    expect(getSkillTierLabel(character.skillCatalog[8])).toBe("Apprentice Spell · Tier 3");
  });

  it("groups only explicitly tagged Special Abilities and preserves supernatural Attributes and tier names", () => {
    const base = aggregate().skillCatalog[2];
    const spellcraft = { ...base, name: "Spellcraft", classification: "magic access", tier: 1, primaryAttribute: "INT" };
    const psionics = { ...base, name: "Psionic Focus", classification: "magic access", tier: 1, primaryAttribute: "WIS" };
    const bardic = { ...base, name: "Resonant Performance", classification: "magic access", tier: 1, primaryAttribute: "CHA" };
    const specialAbility = { ...base, name: "Flight", classification: "special ability", tier: null, primaryAttribute: null };

    expect(getCharacterSkillGroupKey(spellcraft)).toBe("INT");
    expect(getCharacterSkillGroupKey(psionics)).toBe("WIS");
    expect(getCharacterSkillGroupKey(bardic)).toBe("CHR");
    expect(getCharacterSkillGroupKey(specialAbility)).toBe("SPECIAL");
    expect(isSpecialAbilitySkill(specialAbility)).toBe(true);
    expect(isSpecialAbilitySkill({ ...specialAbility, classification: "special abilities" })).toBe(true);
    expect(isSpecialAbilitySkill(spellcraft)).toBe(false);
    expect(isSkillAllowedByCampaign(
      specialAbility,
      specialAbility,
      ["Tier 1", "Special Abilities"],
    )).toBe(true);
    expect(isSkillAllowedByCampaign(specialAbility, specialAbility, ["Tier 1"])).toBe(false);

    expect(getSkillTierLabel({ ...base, classification: "sphere", tier: 2 })).toBe("Sphere · Tier 2");
    expect(getSkillTierLabel({ ...base, classification: "spell", tier: 3 })).toBe("Spell · Tier 3");
    expect(getSkillTierLabel({ ...base, classification: "discipline", tier: 2 })).toBe("Discipline · Tier 2");
    expect(getSkillTierLabel({ ...base, classification: "psionic skill", tier: 3 })).toBe("Psionic Skill · Tier 3");
    expect(getSkillTierLabel({ ...base, classification: "resonance", tier: 2 })).toBe("Resonance · Tier 2");
    expect(getSkillTierLabel({ ...base, classification: "reverberation", tier: 3 })).toBe("Reverberation · Tier 3");
  });

  it("keeps racial Skill values free, creates structural parent anchors, and uses Special Ability math", () => {
    const character = aggregate();
    const selectedRace = race();
    selectedRace.skillLinks = [{
      id: 1,
      raceId: selectedRace.race.id,
      skillId: 2,
      skillName: "Climbing",
      skillClassification: "standard",
      linkType: "bonus",
      value: 4,
      sortOrder: 0,
      createdAt: "created",
      updatedAt: "updated",
    }];
    let nextId = -1;
    const allocations = reconcileRacialSkillAnchors(
      [],
      selectedRace,
      character.skillRelationships,
      () => nextId--,
    );

    expect(allocations).toEqual([
      { draftId: -1, skillId: 1, parentDraftId: null, points: 0 },
      { draftId: -2, skillId: 2, parentDraftId: -1, points: 0 },
    ]);
    expect(getRacialSkillGrant(selectedRace, 2)).toEqual({ granted: true, minimum: 4 });
    expect(getEffectiveSkillPoints(3, selectedRace, 2)).toBe(7);
    expect(getSkillPointsUsed({ ...draft(), skillAllocations: allocations })).toBe(0);
    expect(buildSkillAllocationTree(allocations)).toEqual([{
      skillId: 1,
      points: 0,
      children: [{ skillId: 2, points: 0, children: [] }],
    }]);
    expect(getSpecialAbilityRollTarget(25)).toBe(75);
  });
});
