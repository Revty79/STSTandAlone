import { describe, expect, it } from "vitest";
import type { CampaignRepository } from "../data/repositories/campaignRepository";
import type {
  CampaignAggregate,
  CampaignCharacterReference,
  CampaignNpcReference,
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
  memberships: Array<{ campaignId: number; userId: number }> = [];
  characters: CampaignCharacterReference[] = [];
  npcs: CampaignNpcReference[] = [];

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
  async listCampaignNpcs(campaignId: number): Promise<CampaignNpcReference[]> {
    return this.npcs.filter((npc) => npc.campaignId === campaignId);
  }
  async listCampaignsForPlayerMembership(
    playerUserId: number,
  ): Promise<PlayerCampaignReference[]> {
    const campaignIds = new Set(
      this.memberships
        .filter((membership) => membership.userId === playerUserId)
        .map((membership) => membership.campaignId),
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
         family: "Gear", category: "Gear", catalogScope: "inventory",
         equipmentGroup: null, tags: [],
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
      fatePointMethod: "Assigned", assignedFatePoints: 3,
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
    const noAssignedFate = draft(); noAssignedFate.core.assignedFatePoints = null;
    await expect(service.saveCampaign(noAssignedFate)).rejects.toThrow(/Assigned Fate Points/i);
    const invalidFateMethod = draft(); invalidFateMethod.core.fatePointMethod = "Chosen" as never;
    await expect(service.saveCampaign(invalidFateMethod)).rejects.toThrow(/Assigned or Rolled/i);
    expect(repository.saved).toBeNull();
  });

  it("removes Derived Currency rows when a Campaign uses Credits", async () => {
    const repository = new RecordingCampaignRepository();
    const input = draft();
    input.core.currencySystem = "Credits";
    await new CampaignService(repository).saveCampaign(input);
    expect(repository.saved?.derivedCurrencies).toEqual([]);
  });

  it("does not store an Assigned value when each player rolls Fate Points", async () => {
    const repository = new RecordingCampaignRepository();
    const input = draft();
    input.core.fatePointMethod = "Rolled";
    input.core.assignedFatePoints = 99;
    await new CampaignService(repository).saveCampaign(input);
    expect(repository.saved?.core).toMatchObject({
      fatePointMethod: "Rolled",
      assignedFatePoints: null,
    });
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

  it("lists every Campaign membership, including Campaigns without Characters", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    repository.memberships.push(
      { campaignId: 12, userId: 2 },
      { campaignId: 13, userId: 2 },
      { campaignId: 14, userId: 3 },
    );

    await expect(service.listPlayerCampaigns(2)).resolves.toEqual([
      { id: 12, name: "Campaign 12" },
      { id: 13, name: "Campaign 13" },
    ]);
    await expect(service.listPlayerCampaigns(0)).rejects.toThrow(/Player Profile/i);
  });

  it("lists the Campaign-scoped NPC master records", async () => {
    const repository = new RecordingCampaignRepository();
    const service = new CampaignService(repository);
    repository.npcs.push(
      {
        id: 31, campaignId: 12, name: "Harbormaster Vey",
        createdAt: "created", updatedAt: "updated", creationCompletedAt: null,
      },
      {
        id: 32, campaignId: 13, name: "The Other Captain",
        createdAt: "created", updatedAt: "updated", creationCompletedAt: null,
      },
    );

    await expect(service.listNpcs(12)).resolves.toEqual([
      expect.objectContaining({ id: 31, name: "Harbormaster Vey" }),
    ]);
    await expect(service.listNpcs(0)).rejects.toThrow(/Campaign/i);
  });
});
