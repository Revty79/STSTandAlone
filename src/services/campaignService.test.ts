import { describe, expect, it } from "vitest";
import type { CampaignRepository } from "../data/repositories/campaignRepository";
import type {
  CampaignAggregate,
  CampaignCharacterReference,
  CampaignPlayerReference,
  CampaignProfileReference,
  CampaignSummary,
  PlayerCampaignReference,
  SaveCampaignAggregate,
} from "../types/campaign";
import { CampaignService, CampaignValidationError } from "./campaignService";

class RecordingCampaignRepository implements CampaignRepository {
  saved: SaveCampaignAggregate | null = null;
  addedPlayer: { campaignId: number; userId: number } | null = null;
  characters: CampaignCharacterReference[] = [];

  async listCampaigns(): Promise<CampaignSummary[]> { return []; }
  async getCampaignAggregate(): Promise<CampaignAggregate | null> { return null; }
  async listProfilesForCampaign(): Promise<CampaignProfileReference[]> {
    return [{ id: 2, username: "Mariner", roles: ["player"], isCampaignPlayer: false }];
  }
  async listCampaignPlayers(): Promise<CampaignPlayerReference[]> {
    return this.addedPlayer
      ? [{ id: this.addedPlayer.userId, username: "Mariner", addedAt: "now" }]
      : [];
  }
  async addCampaignPlayer(campaignId: number, userId: number): Promise<void> {
    this.addedPlayer = { campaignId, userId };
  }
  async listCampaignCharacters(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference[]> {
    return this.characters.filter((character) =>
      character.campaignId === campaignId && character.playerUserId === playerUserId,
    );
  }
  async createCampaignCharacter(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference> {
    const character = {
      id: this.characters.length + 1,
      campaignId,
      playerUserId,
      name: "New Character",
      createdAt: "now",
      updatedAt: "now",
    };
    this.characters.push(character);
    return character;
  }
  async listCampaignsForPlayerWithCharacters(
    playerUserId: number,
  ): Promise<PlayerCampaignReference[]> {
    const campaignIds = new Set(
      this.characters
        .filter((character) => character.playerUserId === playerUserId)
        .map((character) => character.campaignId),
    );
    return [...campaignIds].map((id) => ({ id, name: `Campaign ${id}` }));
  }
  async saveCampaignAggregate(input: SaveCampaignAggregate): Promise<CampaignAggregate> {
    this.saved = structuredClone(input);
    return {
      campaign: {
        id: input.id ?? 1,
        ...input.core,
        createdAt: "created",
        updatedAt: "updated",
      },
      derivedCurrencies: input.derivedCurrencies.map((currency, index) => ({
        id: index + 1, campaignId: input.id ?? 1, ...currency, sortOrder: index,
      })),
      allowedSystems: [...input.allowedSystems],
      allowedRaces: input.allowedRaceIds.map((id) => ({ id, name: `Race ${id}` })),
      inventoryGenres: input.inventoryGenreNames.map((name, index) => ({
        id: index + 1, name, tagGroup: "Genre Pack", description: "",
      })),
      inventoryItems: input.inventoryItemIds.map((id) => ({
        id, canonicalId: `ITEM-${id}`, name: `Item ${id}`, recordType: "Item",
        family: "Gear", category: "Gear", tags: [],
      })),
    };
  }
}

function draft(): SaveCampaignAggregate {
  return {
    core: {
      name: "  Tidefall  ", attributePoints: 50, skillPoints: 100,
      maxStartingSkill: 35, pointsToUnlockNextTier: 25, maxPointsInSkill: 75,
      startingCreditAmount: 200, currencySystem: "Derived Currency", createdByUserId: 1,
    },
    derivedCurrencies: [{
      name: " Penny ", description: " A copper coin. ", creditsPerUnit: 0.01,
    }],
    allowedSystems: ["Tier 1", "Spellcraft", "Tier 1"],
    allowedRaceIds: [3, 3],
    inventoryGenreNames: [" Fantasy ", "fantasy", "Modern"],
    inventoryItemIds: [7, 7, 9],
  };
}

describe("CampaignService", () => {
  it("normalizes and saves the complete linked Campaign aggregate", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    const saved = await service.saveCampaign(draft());

    expect(repository.saved).toMatchObject({
      core: { name: "Tidefall", createdByUserId: 1 },
      derivedCurrencies: [{ name: "Penny", description: "A copper coin." }],
      allowedSystems: ["Tier 1", "Spellcraft"],
      allowedRaceIds: [3],
      inventoryGenreNames: ["Fantasy", "Modern"],
      inventoryItemIds: [7, 9],
    });
    expect(saved.campaign.id).toBe(1);
  });

  it("rejects invalid core, ownership, systems, and Derived Currency before persistence", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);

    const missingName = draft(); missingName.core.name = " ";
    await expect(service.saveCampaign(missingName)).rejects.toThrow(/Campaign Name is required/i);
    const invalidOwner = draft(); invalidOwner.core.createdByUserId = 0;
    await expect(service.saveCampaign(invalidOwner)).rejects.toThrow(/creator/i);
    const invalidNumber = draft(); invalidNumber.core.attributePoints = -1;
    await expect(service.saveCampaign(invalidNumber)).rejects.toThrow(/Attribute Points/i);
    const invalidSystem = draft(); invalidSystem.allowedSystems = ["Alchemy" as never];
    await expect(service.saveCampaign(invalidSystem)).rejects.toThrow(/unsupported/i);
    const noCurrency = draft(); noCurrency.derivedCurrencies = [];
    await expect(service.saveCampaign(noCurrency)).rejects.toThrow(/at least one/i);
    expect(repository.saved).toBeNull();
  });

  it("removes Derived Currency rows when a Campaign uses Credits", async () => {
    const repository = new RecordingCampaignRepository();
    const input = draft();
    input.core.currencySystem = "Credits";
    await new CampaignService(repository).saveCampaign(input);
    expect(repository.saved?.derivedCurrencies).toEqual([]);
  });

  it("uses a typed validation error", async () => {
    const input = draft(); input.core.name = "";
    await expect(new CampaignService(new RecordingCampaignRepository()).saveCampaign(input))
      .rejects.toBeInstanceOf(CampaignValidationError);
  });

  it("adds a saved profile as a Player in the selected Campaign and reloads the selector", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    await expect(service.listProfilesForCampaign(12)).resolves.toMatchObject([
      { id: 2, username: "Mariner", isCampaignPlayer: false },
    ]);
    await expect(service.addPlayer(12, 2)).resolves.toEqual([
      { id: 2, username: "Mariner", addedAt: "now" },
    ]);
    expect(repository.addedPlayer).toEqual({ campaignId: 12, userId: 2 });
    await expect(service.addPlayer(0, 2)).rejects.toThrow(/Campaign/i);
    await expect(service.addPlayer(12, -1)).rejects.toThrow(/Profile/i);
  });

  it("creates multiple New Character records for one Campaign Player", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    await expect(service.createCharacter(12, 2)).resolves.toMatchObject({
      id: 1, campaignId: 12, playerUserId: 2, name: "New Character",
    });
    await expect(service.createCharacter(12, 2)).resolves.toMatchObject({
      id: 2, campaignId: 12, playerUserId: 2, name: "New Character",
    });
    await expect(service.listCharacters(12, 2)).resolves.toHaveLength(2);
    await expect(service.createCharacter(0, 2)).rejects.toThrow(/Campaign/i);
  });

  it("lists only Campaigns represented by the logged-in Player's Characters", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    await service.createCharacter(12, 2);
    await service.createCharacter(13, 2);
    await service.createCharacter(14, 3);

    await expect(service.listPlayerCampaigns(2)).resolves.toEqual([
      { id: 12, name: "Campaign 12" },
      { id: 13, name: "Campaign 13" },
    ]);
    await expect(service.listPlayerCampaigns(0)).rejects.toThrow(/Player Profile/i);
  });
});
