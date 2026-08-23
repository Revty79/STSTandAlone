import { describe, expect, it, vi } from "vitest";
import { normalizeCreatureFacetValues, TauriCreatureRepository, type CreatureDatabase } from "./creatureRepository";

describe("TauriCreatureRepository", () => {
  it("normalizes and alphabetizes Creature facets consistently", () => {
    expect(normalizeCreatureFacetValues([
      { value: "  Water Horse " },
      { value: "canine" },
      { value: "Bear" },
      { value: "Canine" },
      { value: "Equine" },
    ])).toEqual(["Bear", "Canine", "Equine", "Water Horse"]);
  });
  it("keeps Creature Library queries bounded and separate from full aggregates", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CreatureDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        if (/count\(\*\) as count/i.test(query)) return [{ count: 1 }] as T;
        return [{ id: 1, canonicalId: "CR-HORSE", canonicalName: "Horse", family: "Equine", creatureType: "Animal", size: "Large", challengeRating: 8, killXp: 3, updatedAt: "now" }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriCreatureRepository(async () => database);
    const page = await repository.listCreatures({ search: "horse", family: "Equine", creatureType: "Animal", size: "Large", challengeRating: 8, page: 1, pageSize: 40 });
    expect(page.items[0]).toMatchObject({ canonicalId: "CR-HORSE", size: "Large" });
    expect(calls[1]?.query).toMatch(/limit \$6 offset \$7/i);
    expect(calls[1]?.query).not.toMatch(/description|typical_behavior|habitat_ecology|creature_attacks/i);
    expect(calls[1]?.values).toEqual(["horse", "Equine", "Animal", "Large", 8, 40, 0]);
  });

  it("rejects a noncanonical Size filter before SQLite", async () => {
    const select = vi.fn();
    const database: CreatureDatabase = { select, async execute() { return { rowsAffected: 0 }; } };
    const repository = new TauriCreatureRepository(async () => database);
    await expect(repository.listCreatures({ size: "Average", page: 1, pageSize: 40 } as never)).rejects.toThrow(/Unsupported Creature Size/i);
    expect(select).not.toHaveBeenCalled();
  });

  it("only offers existing canonical Serrian Tide Skills and never creates one", async () => {
    const calls: string[] = [];
    const database: CreatureDatabase = {
      async select<T>(query: string): Promise<T> { calls.push(query); return [{ id: 9, name: "Tracking", classification: "standard", tier: 2 }] as T; },
      async execute() { throw new Error("Creature Skill search must be read-only"); },
    };
    const repository = new TauriCreatureRepository(async () => database);
    await expect(repository.listSkillCandidates("track")).resolves.toEqual([{ id: 9, name: "Tracking", classification: "standard", tier: 2 }]);
    expect(calls[0]).toMatch(/source_system = 'serrian-tide-core'[\s\S]*limit 30/i);
  });

  it("protects parent Creatures while derived Creatures remain linked", async () => {
    const execute = vi.fn();
    const database: CreatureDatabase = {
      async select<T>(): Promise<T> { return [{ count: 1 }] as T; },
      execute,
    };
    const repository = new TauriCreatureRepository(async () => database);
    await expect(repository.deleteCreature(4)).rejects.toThrow(/derived Creatures still link/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
