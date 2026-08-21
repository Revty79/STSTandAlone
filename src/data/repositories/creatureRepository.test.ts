import { describe, expect, it } from "vitest";
import { TauriCreatureRepository, type CreatureDatabase } from "./creatureRepository";

describe("TauriCreatureRepository bounded queries", () => {
  it("searches a lightweight paginated library with all requested filters", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CreatureDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        if (/count\(\*\) as count/i.test(query)) return [{ count: 1 }] as T;
        return [{ id: 2, name: "Horse", challenge_rating: null, type: "Animal", role: "", size: "Large", updated_at: "now", genre_tags: "Fantasy", attack_count: 0, skill_link_count: 0, purchase_item_count: 4 }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCreatureRepository(async () => database);
    const page = await repository.listCreatures({ search: "horse", type: "Animal", role: "Mount", size: "Large", genre: "Fantasy", page: 2, pageSize: 20 });
    expect(page.items[0]).toMatchObject({ name: "Horse", purchaseItemCount: 4 });
    expect(calls[0]?.query).toMatch(/creature_alt_names/i);
    expect(calls[0]?.query).toMatch(/creature_genre_tags/i);
    expect(calls[1]?.query).toMatch(/limit \$6 offset \$7/i);
    expect(calls[1]?.query).not.toMatch(/behavior_tactics|magic_resonance_interaction|loot_harvest/i);
    expect(calls[1]?.values).toEqual(["horse", "Animal", "Mount", "Large", "Fantasy", 20, 20]);
  });

  it("bounds Skill searches and restricts Granted candidates by classification", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CreatureDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{ id: 8, name: "Keen Scent", classification: "special ability", tier: null }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCreatureRepository(async () => database);
    await expect(repository.listSkillCandidates("scent", "special ability")).resolves.toEqual([{ id: 8, name: "Keen Scent", classification: "special ability", tier: null }]);
    expect(calls[0]?.query).toMatch(/classification = \$2 collate nocase/i);
    expect(calls[0]?.query).toMatch(/limit 30/i);
    expect(calls[0]?.values).toEqual(["scent", "special ability"]);
  });

  it("bounds purchase candidates to Inventory Items", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CreatureDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{ id: 12, name: "Riding Horse", cost_credits: 500, category: "Mount", subtype: "", genre_tags: "Fantasy" }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCreatureRepository(async () => database);
    await expect(repository.listItemCandidates("horse")).resolves.toEqual([{ id: 12, name: "Riding Horse", costCredits: 500, category: "Mount", subtype: "", genreTags: ["Fantasy"] }]);
    expect(calls[0]?.query).toMatch(/catalog_section = 'Inventory'/i);
    expect(calls[0]?.query).toMatch(/limit 30/i);
  });
});
