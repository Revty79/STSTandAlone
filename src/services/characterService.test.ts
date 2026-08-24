import { describe, expect, it } from "vitest";
import type { CharacterRepository } from "../data/repositories/characterRepository";
import type {
  CharacterAggregate,
  CharacterDraft,
  AdvanceCharacterSkill,
  SaveCharacterAggregate,
} from "../types/character";
import type { RaceAggregate } from "../types/race";
import {
  CharacterService,
  CharacterValidationError,
  characterAggregateToDraft,
} from "./characterService";

function characterAggregate(): CharacterAggregate {
  return {
    character: {
      id: 9, campaignId: 12, playerUserId: 2, name: "New Character",
      campaignName: "Tidefall", playerUsername: "Mariner",
      createdAt: "created", updatedAt: "updated",
    },
    profile: {
      characterId: 9, raceId: null, age: null, sex: "",
      heightFeet: null, heightInches: null, weight: null,
      skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "",
      personality: "", goals: "", secrets: "", backstory: "", motivations: "",
      fame: 0, experience: 0, totalExperience: 0, quintessence: 0,
      totalQuintessence: 0, fatePoints: 3, creditsRemaining: 100,
      creationCompletedAt: null,
      createdAt: "created", updatedAt: "updated",
    },
    attributes: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey) => ({
      characterId: 9, attributeKey: attributeKey as "STR", value: 25,
    })),
    skillAllocations: [], items: [], currencyHoldings: [],
    campaign: {
      id: 12, name: "Tidefall", attributePoints: 150, skillPoints: 10,
      maxStartingSkill: 5, pointsToUnlockNextTier: 5, maxPointsInSkill: 75,
      startingCreditAmount: 100, currencySystem: "Credits",
      fatePointMethod: "Assigned", assignedFatePoints: 3,
      allowedSystems: ["Tier 1", "Tier 2"], derivedCurrencies: [],
    },
    allowedRaces: [{ id: 3, name: "Human" }], selectedRace: null,
    skillCatalog: [], skillRelationships: [], authorizedItems: [],
  };
}

class RecordingCharacterRepository implements CharacterRepository {
  aggregate = characterAggregate();
  createdWith: [number, number] | null = null;
  saved: SaveCharacterAggregate | null = null;
  readWith: [number, number, number, boolean] | null = null;
  advancedWith: AdvanceCharacterSkill | null = null;
  npcCreatedWith: [number, number] | null = null;

  async getCharacterAggregate(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    administrativeOverride = false,
  ): Promise<CharacterAggregate | null> {
    this.readWith = [characterId, campaignId, requestingUserId, administrativeOverride];
    return this.aggregate;
  }

  async createCharacterAggregate(
    campaignId: number,
    playerUserId: number,
  ): Promise<CharacterAggregate> {
    this.createdWith = [campaignId, playerUserId];
    return this.aggregate;
  }

  async createNpcAggregate(
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterAggregate> {
    this.npcCreatedWith = [campaignId, requestingUserId];
    return { ...this.aggregate, character: { ...this.aggregate.character, isNpc: true } };
  }

  async saveCharacterAggregate(input: SaveCharacterAggregate): Promise<CharacterAggregate> {
    this.saved = structuredClone(input);
    return this.aggregate;
  }

  async advanceCharacterSkill(input: AdvanceCharacterSkill): Promise<CharacterAggregate> {
    this.advancedWith = structuredClone(input);
    return this.aggregate;
  }

  async getAllowedRaceForCharacter(): Promise<RaceAggregate | null> {
    return null;
  }
}

describe("CharacterService", () => {
  it("creates and reads only saved Campaign, Character, and logged-in Player identities", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);

    await expect(service.createCharacter(12, 2)).resolves.toMatchObject({
      character: { id: 9, playerUserId: 2 },
    });
    expect(repository.createdWith).toEqual([12, 2]);
    await service.getCharacter(9, 12, 2);
    expect(repository.readWith).toEqual([9, 12, 2, false]);
    await expect(service.createCharacter(0, 2)).rejects.toBeInstanceOf(CharacterValidationError);
  });

  it("creates an NPC through the selected Campaign and G.O.D. profile", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);

    await expect(service.createNpc(12, 1)).resolves.toMatchObject({
      character: { id: 9, isNpc: true },
    });
    expect(repository.npcCreatedWith).toEqual([12, 1]);
    await expect(service.createNpc(0, 1)).rejects.toBeInstanceOf(CharacterValidationError);
    await expect(service.createNpc(12, 0)).rejects.toBeInstanceOf(CharacterValidationError);
  });

  it("normalizes one aggregate save and preserves self-referencing Skill branch context", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);
    const draft: CharacterDraft = {
      ...characterAggregateToDraft(repository.aggregate),
      name: "  Neris  ",
      skillAllocations: [
        { draftId: 1, skillId: 10, parentDraftId: null, points: 5 },
        { draftId: 2, skillId: 20, parentDraftId: 1, points: 3 },
        { draftId: 3, skillId: 30, parentDraftId: 2, points: 2 },
      ],
    };

    await service.saveCharacter(repository.aggregate, draft, 2);
    expect(repository.saved).toMatchObject({
      characterId: 9,
      campaignId: 12,
      requestingUserId: 2,
      administrativeOverride: false,
      completeCreation: false,
      name: "Neris",
      skillAllocations: [{
        skillId: 10,
        points: 5,
        children: [{
          skillId: 20,
          points: 3,
          children: [{ skillId: 30, points: 2, children: [] }],
        }],
      }],
    });
    await service.saveCharacter(repository.aggregate, draft, 2, true);
    expect(repository.saved?.completeCreation).toBe(true);
  });

  it("rejects a save when the logged-in Player does not own the Character", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);
    await expect(service.saveCharacter(
      repository.aggregate,
      characterAggregateToDraft(repository.aggregate),
      99,
    )).rejects.toThrow(/own Character/i);
    expect(repository.saved).toBeNull();
  });

  it("rejects ordinary creation saves after permanent completion", async () => {
    const repository = new RecordingCharacterRepository();
    repository.aggregate.profile.creationCompletedAt = "completed";
    const service = new CharacterService(repository);
    await expect(service.saveCharacter(
      repository.aggregate,
      characterAggregateToDraft(repository.aggregate),
      2,
    )).rejects.toThrow(/permanently locked/i);
    expect(repository.saved).toBeNull();
  });

  it("advances only the completed Character owned by the logged-in Player", async () => {
    const repository = new RecordingCharacterRepository();
    repository.aggregate.profile.creationCompletedAt = "completed";
    const service = new CharacterService(repository);

    await service.advanceSkill(repository.aggregate, 2, 17, 21);
    expect(repository.advancedWith).toEqual({
      characterId: 9,
      campaignId: 12,
      requestingUserId: 2,
      skillId: 17,
      parentAllocationId: 21,
      pointsToAdd: 1,
    });
    await expect(service.advanceSkill(repository.aggregate, 99, 17, null))
      .rejects.toThrow(/own Character/i);
  });

  it("does not allow Experience advancement before Character creation is complete", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);

    await expect(service.advanceSkill(repository.aggregate, 2, 17, null))
      .rejects.toThrow(/must be completed/i);
    expect(repository.advancedWith).toBeNull();
  });

  it("allows an explicit G.O.D. administrative save for another Player's completed Character", async () => {
    const repository = new RecordingCharacterRepository();
    repository.aggregate.profile.creationCompletedAt = "completed";
    const service = new CharacterService(repository);
    const draft = characterAggregateToDraft(repository.aggregate);
    draft.profile.experience = 25;
    draft.profile.quintessence = 7;
    draft.profile.creditsRemaining = 333;

    await service.saveCharacter(repository.aggregate, draft, 99, false, "god");

    expect(repository.saved).toMatchObject({
      requestingUserId: 99,
      administrativeOverride: true,
      profile: { experience: 25, quintessence: 7, creditsRemaining: 333 },
    });
  });

  it("keeps Assigned Fate Points fixed for players while allowing G.O.D. overrides", async () => {
    const repository = new RecordingCharacterRepository();
    const service = new CharacterService(repository);
    const playerDraft = characterAggregateToDraft(repository.aggregate);
    playerDraft.profile.fatePoints = 99;
    await service.saveCharacter(repository.aggregate, playerDraft, 2);
    expect(repository.saved?.profile.fatePoints).toBe(3);

    const godDraft = characterAggregateToDraft(repository.aggregate);
    godDraft.profile.fatePoints = 7;
    await service.saveCharacter(repository.aggregate, godDraft, 1, false, "god");
    expect(repository.saved?.profile.fatePoints).toBe(7);
  });

  it("preserves exact denominations while materializing legacy credit-only purses once", async () => {
    const repository = new RecordingCharacterRepository();
    repository.aggregate.campaign.currencySystem = "Derived Currency";
    repository.aggregate.campaign.derivedCurrencies = [
      {
        id: 1, campaignId: 12, name: "Gold", description: "A gold coin.",
        creditsPerUnit: 1, sortOrder: 0,
      },
      {
        id: 2, campaignId: 12, name: "Platinum", description: "A platinum coin.",
        creditsPerUnit: 5, sortOrder: 1,
      },
    ];
    repository.aggregate.profile.creditsRemaining = 10;

    const legacyDraft = characterAggregateToDraft(repository.aggregate);
    expect(legacyDraft.currencyHoldings).toEqual([
      { currencyId: 2, quantity: 2 },
      { currencyId: 1, quantity: 0 },
    ]);

    repository.aggregate.currencyHoldings = [
      { characterId: 9, currencyId: 1, quantity: 10 },
    ];
    const exactDraft = characterAggregateToDraft(repository.aggregate);
    await new CharacterService(repository).saveCharacter(
      repository.aggregate,
      exactDraft,
      1,
      false,
      "god",
    );
    expect(repository.saved?.currencyHoldings).toEqual([
      { currencyId: 1, quantity: 10 },
    ]);
  });
});
