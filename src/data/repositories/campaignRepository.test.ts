import { describe, expect, it, vi } from "vitest";
import type { SaveCampaignAggregate } from "../../types/campaign";
import {
  TauriCampaignRepository,
  type CampaignDatabase,
} from "./campaignRepository";

function savedCampaignInput(): SaveCampaignAggregate {
  return {
    core: {
      name: "Tidefall",
      attributePoints: 50,
      skillPoints: 100,
      maxStartingSkill: 35,
      pointsToUnlockNextTier: 25,
      maxPointsInSkill: 75,
      startingCreditAmount: 200,
      currencySystem: "Derived Currency",
      createdByUserId: 1,
    },
    derivedCurrencies: [{
      name: "Penny",
      description: "A copper coin.",
      creditsPerUnit: 0.01,
    }],
    allowedSystems: ["Tier 1", "Spellcraft"],
    allowedRaceIds: [3],
    inventoryGenreNames: ["Fantasy"],
    inventoryItemIds: [7],
  };
}

describe("TauriCampaignRepository", () => {
  it("loads every Campaign-owned link and resolves canonical Race, genre, and Item records", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CampaignDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        if (/from campaigns where/i.test(query)) return [{
          id: 12, name: "Tidefall", attributePoints: 50, skillPoints: 100,
          maxStartingSkill: 35, pointsToUnlockNextTier: 25, maxPointsInSkill: 75,
          startingCreditAmount: 200, currencySystem: "Derived Currency",
          createdByUserId: 1, createdAt: "created", updatedAt: "updated",
        }] as T;
        if (/campaign_derived_currencies/i.test(query)) return [{
          id: 20, campaignId: 12, name: "Penny", description: "A copper coin.",
          creditsPerUnit: 0.01, sortOrder: 0,
        }] as T;
        if (/campaign_allowed_systems/i.test(query)) return [
          { systemName: "Tier 1" }, { systemName: "Spellcraft" },
        ] as T;
        if (/campaign_allowed_races/i.test(query)) return [{ id: 3, name: "Human" }] as T;
        if (/campaign_inventory_tags/i.test(query)) return [{
          id: 5, name: "Fantasy", tagGroup: "Genre Pack", description: "Fantasy Items",
        }] as T;
        if (/campaign_inventory_items/i.test(query)) return [{
          id: 7, canonicalId: "ITEM-0007", name: "Travel Pack", recordType: "Item",
          family: "Pack", category: "Gear", tagsText: "Fantasy\u001fModern",
        }] as T;
        return [] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };

    const repository = new TauriCampaignRepository(async () => database);
    const aggregate = await repository.getCampaignAggregate(12);

    expect(aggregate).toMatchObject({
      campaign: { id: 12, name: "Tidefall", createdByUserId: 1 },
      derivedCurrencies: [{ name: "Penny", creditsPerUnit: 0.01 }],
      allowedSystems: ["Tier 1", "Spellcraft"],
      allowedRaces: [{ id: 3, name: "Human" }],
      inventoryGenres: [{ id: 5, name: "Fantasy" }],
      inventoryItems: [{ id: 7, tags: ["Fantasy", "Modern"] }],
    });
    expect(calls).toHaveLength(6);
    expect(calls.slice(1).every((call) => call.values[0] === 12)).toBe(true);
  });

  it("uses the native atomic command and reloads the committed aggregate", async () => {
    const input = savedCampaignInput();
    const invoker = vi.fn(async () => 12);
    const database: CampaignDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/from campaigns where/i.test(query)) return [{
          id: 12, ...input.core, createdAt: "created", updatedAt: "updated",
        }] as T;
        if (/campaign_derived_currencies/i.test(query)) return [{
          id: 20, campaignId: 12, ...input.derivedCurrencies[0], sortOrder: 0,
        }] as T;
        if (/campaign_allowed_systems/i.test(query)) return input.allowedSystems.map(
          (systemName) => ({ systemName }),
        ) as T;
        if (/campaign_allowed_races/i.test(query)) return [{ id: 3, name: "Human" }] as T;
        if (/campaign_inventory_tags/i.test(query)) return [{
          id: 5, name: "Fantasy", tagGroup: "Genre Pack", description: "Fantasy Items",
        }] as T;
        if (/campaign_inventory_items/i.test(query)) return [{
          id: 7, canonicalId: "ITEM-0007", name: "Travel Pack", recordType: "Item",
          family: "Pack", category: "Gear", tagsText: "Fantasy",
        }] as T;
        return [] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };

    const repository = new TauriCampaignRepository(async () => database, invoker);
    await expect(repository.saveCampaignAggregate(input)).resolves.toMatchObject({
      campaign: { id: 12, name: "Tidefall" },
      allowedRaces: [{ id: 3, name: "Human" }],
      inventoryItems: [{ id: 7, name: "Travel Pack" }],
    });
    expect(invoker).toHaveBeenCalledWith(input);
  });

  it("lists saved Campaign identities for the Heavens selector", async () => {
    const database: CampaignDatabase = {
      async select<T>(): Promise<T> {
        return [{
          id: 12, name: "Tidefall", currencySystem: "Credits", updatedAt: "updated",
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCampaignRepository(async () => database);
    await expect(repository.listCampaigns()).resolves.toEqual([{
      id: 12, name: "Tidefall", currencySystem: "Credits", updatedAt: "updated",
    }]);
  });

  it("lists all profiles, marks existing members, and permanently adds a Campaign Player", async () => {
    const execute = vi.fn(async () => ({ rowsAffected: 1 }));
    const database: CampaignDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        expect(values).toEqual([12]);
        if (/from users profile/i.test(query)) return [
          {
            id: 1, username: "Voyager", rolesText: "god\u001fplayer",
            isCampaignPlayer: 1,
          },
          {
            id: 2, username: "Mariner", rolesText: "player",
            isCampaignPlayer: 0,
          },
        ] as T;
        return [{ id: 1, username: "Voyager", addedAt: "now" }] as T;
      },
      execute,
    };
    const repository = new TauriCampaignRepository(async () => database);

    await expect(repository.listProfilesForCampaign(12)).resolves.toEqual([
      {
        id: 1, username: "Voyager", roles: ["god", "player"],
        isCampaignPlayer: true,
      },
      {
        id: 2, username: "Mariner", roles: ["player"],
        isCampaignPlayer: false,
      },
    ]);
    await repository.addCampaignPlayer(12, 2);
    expect(execute).toHaveBeenCalledWith(
      "INSERT INTO campaign_players (campaign_id,user_id) VALUES ($1,$2)",
      [12, 2],
    );
    await expect(repository.listCampaignPlayers(12)).resolves.toEqual([
      { id: 1, username: "Voyager", addedAt: "now" },
    ]);
  });

  it("creates program-ID New Character placeholders linked to one Campaign Player", async () => {
    const execute = vi.fn(async () => ({ rowsAffected: 1, lastInsertId: 31 }));
    const character = {
      id: 31, campaignId: 12, playerUserId: 2, name: "New Character",
      createdAt: "created", updatedAt: "updated",
    };
    const database: CampaignDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        if (/where id=\$1 limit 1/i.test(query)) {
          expect(values).toEqual([31]);
          return [character] as T;
        }
        expect(values).toEqual([12, 2]);
        return [character, { ...character, id: 32 }] as T;
      },
      execute,
    };
    const repository = new TauriCampaignRepository(async () => database);

    await expect(repository.createCampaignCharacter(12, 2)).resolves.toEqual(character);
    expect(execute).toHaveBeenCalledWith(
      "INSERT INTO campaign_characters (campaign_id,player_user_id) VALUES ($1,$2)",
      [12, 2],
    );
    await expect(repository.listCampaignCharacters(12, 2)).resolves.toHaveLength(2);
  });

  it("lists only Campaigns where the requested Player owns a Character", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CampaignDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{ id: 12, name: "Tidefall" }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCampaignRepository(async () => database);

    await expect(repository.listCampaignsForPlayerWithCharacters(2)).resolves.toEqual([
      { id: 12, name: "Tidefall" },
    ]);
    expect(calls[0]?.values).toEqual([2]);
    expect(calls[0]?.query).toMatch(
      /where exists[\s\S]*from campaign_characters[\s\S]*player_user_id=\$1/i,
    );
  });
});
