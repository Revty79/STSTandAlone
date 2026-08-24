import { describe, expect, it, vi } from "vitest";
import type { RaceRepository } from "./raceRepository";
import type { RaceAggregate } from "../../types/race";
import type { SaveCharacterAggregate } from "../../types/character";
import {
  TauriCharacterRepository,
  type CharacterDatabase,
} from "./characterRepository";

function selectedRace(): RaceAggregate {
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
    attributeCaps: [], movementModes: [], skillLinks: [],
  };
}

function databaseFixture() {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const database: CharacterDatabase = {
    async select<T>(query: string, values: unknown[] = []): Promise<T> {
      calls.push({ query, values });
      if (/from campaign_characters character\s+join campaigns/i.test(query)) return [{
        id: 9, campaignId: 12, playerUserId: 2, name: "Neris",
        campaignName: "Tidefall", playerUsername: "Mariner",
        createdAt: "created", updatedAt: "updated", attributePoints: 150,
        skillPoints: 10, maxStartingSkill: 5, pointsToUnlockNextTier: 5,
        maxPointsInSkill: 75, startingCreditAmount: 100, currencySystem: "Derived Currency",
      }] as T;
      if (/from campaign_character_profiles/i.test(query)) return [{
        characterId: 9, raceId: 3, age: 24, sex: "Female",
        heightFeet: 5, heightInches: 7,
        weight: 65, skinColor: "Bronze", eyeColor: "Green", hairColor: "Black",
        deity: "", definingMarks: "", personality: "", goals: "", secrets: "",
        backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0,
        quintessence: 0, totalQuintessence: 0, creditsRemaining: 80,
        creationCompletedAt: null,
        createdAt: "created", updatedAt: "updated",
      }] as T;
      if (/from campaign_character_attributes/i.test(query)) return [
        { characterId: 9, attributeKey: "STR", value: 25 },
        { characterId: 9, attributeKey: "DEX", value: 25 },
        { characterId: 9, attributeKey: "CON", value: 25 },
        { characterId: 9, attributeKey: "INT", value: 25 },
        { characterId: 9, attributeKey: "WIS", value: 25 },
        { characterId: 9, attributeKey: "CHR", value: 25 },
      ] as T;
      if (/from campaign_character_skill_allocations/i.test(query)) return [{
        id: 21, characterId: 9, skillId: 1, skillName: "Athletics",
        skillClassification: "standard", skillTier: 1, primaryAttribute: "STR",
        parentAllocationId: null, points: 5, createdAt: "created", updatedAt: "updated",
      }] as T;
      if (/from campaign_character_items/i.test(query)) return [{
        characterId: 9, itemId: 7, canonicalId: "ITEM-7", name: "Rope",
        catalogScope: "inventory", equipmentGroup: null, recordType: "Item",
        category: "Gear", quantity: 2, unitCostCredits: 10, acquiredAt: "created",
      }] as T;
      if (/from campaign_allowed_systems/i.test(query)) return [
        { systemName: "Tier 1" }, { systemName: "Tier 2" },
      ] as T;
      if (/from campaign_derived_currencies/i.test(query)) return [{
        id: 1, campaignId: 12, name: "Crown", description: "A gold coin.",
        creditsPerUnit: 5, sortOrder: 0,
      }] as T;
      if (/select race\.id,race\.name from campaign_allowed_races/i.test(query)) {
        return [{ id: 3, name: "Human" }] as T;
      }
      if (/from skills order by/i.test(query)) return [{
        id: 1, name: "Athletics", classification: "standard", tier: 1,
        primaryAttribute: "STR", secondaryAttribute: null, definition: "",
      }] as T;
      if (/from skill_relationships/i.test(query)) return [] as T;
      if (/from campaign_inventory_items allowed/i.test(query)) return [{
        id: 7, canonicalId: "ITEM-7", name: "Rope", catalogScope: "inventory",
        equipmentGroup: null, recordType: "Item", category: "Gear", credits: 10,
        priceBasis: "each",
      }] as T;
      if (/select exists/i.test(query)) return [{ allowed: 1 }] as T;
      return [] as T;
    },
    async execute() { return { rowsAffected: 0 }; },
  };
  return { database, calls };
}

describe("TauriCharacterRepository", () => {
  it("reconstructs the complete ownership-scoped Character aggregate", async () => {
    const fixture = databaseFixture();
    const races = {
      getRaceAggregate: vi.fn(async () => selectedRace()),
    } as unknown as RaceRepository;
    const repository = new TauriCharacterRepository(async () => fixture.database, races);

    const loaded = await repository.getCharacterAggregate(9, 12, 2);
    expect(loaded).toMatchObject({
      character: { id: 9, campaignId: 12, playerUserId: 2, name: "Neris" },
      profile: { raceId: 3, creditsRemaining: 80 },
      skillAllocations: [{ skillId: 1, points: 5 }],
      items: [{ itemId: 7, quantity: 2 }],
      campaign: {
        attributePoints: 150, skillPoints: 10, currencySystem: "Derived Currency",
        allowedSystems: ["Tier 1", "Tier 2"],
      },
      allowedRaces: [{ id: 3, name: "Human" }],
      selectedRace: { race: { id: 3, name: "Human" } },
      authorizedItems: [{ id: 7, name: "Rope", credits: 10 }],
    });
    expect(loaded?.attributes).toHaveLength(6);
    expect(loaded?.attributes[0]).toMatchObject({ attributeKey: "STR", value: 25 });
    expect(fixture.calls[0]).toMatchObject({ values: [9, 12, 2] });
    expect(fixture.calls[0]?.query).toMatch(
      /character\.player_user_id=\$3[\s\S]*from campaign_players membership/i,
    );
    expect(races.getRaceAggregate).toHaveBeenCalledWith(3);
  });

  it("creates and saves through native aggregate commands before reloading SQLite", async () => {
    const fixture = databaseFixture();
    const races = { getRaceAggregate: vi.fn(async () => selectedRace()) } as unknown as RaceRepository;
    const createInvoker = vi.fn(async () => 9);
    const saveInvoker = vi.fn(async () => 9);
    const repository = new TauriCharacterRepository(
      async () => fixture.database,
      races,
      createInvoker,
      saveInvoker,
    );
    const input = {
      characterId: 9, campaignId: 12, requestingUserId: 2, name: "Neris",
      completeCreation: false,
      profile: {
        raceId: 3, age: 24, sex: "Female", heightFeet: 5, heightInches: 7,
        weight: 65,
        skinColor: "Bronze", eyeColor: "Green", hairColor: "Black", deity: "",
        definingMarks: "", personality: "", goals: "", secrets: "", backstory: "",
        motivations: "", fame: 0, experience: 0, totalExperience: 0,
        quintessence: 0, totalQuintessence: 0,
      },
      attributes: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey) => ({
        attributeKey: attributeKey as "STR", value: 25,
      })),
      skillAllocations: [],
      items: [],
    } satisfies SaveCharacterAggregate;

    await expect(repository.createCharacterAggregate(12, 2)).resolves.toMatchObject({
      character: { id: 9 },
    });
    expect(createInvoker).toHaveBeenCalledWith(12, 2);
    await expect(repository.saveCharacterAggregate(input)).resolves.toMatchObject({
      character: { id: 9 },
    });
    expect(saveInvoker).toHaveBeenCalledWith(input);
  });
});
