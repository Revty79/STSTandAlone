import { describe, expect, it } from "vitest";
import {
  TauriSkillRepository,
  type SkillDatabase,
} from "./skillRepository";

describe("TauriSkillRepository spell frameworks", () => {
  it("returns saved parent names with paged library rows", async () => {
    let selectCall = 0;
    const database: SkillDatabase = {
      async select<T>(): Promise<T> {
        selectCall += 1;
        if (selectCall === 1) return [{ count: 1 }] as T;
        if (selectCall === 2) {
          return [{
            id: 665,
            name: "Charm",
            classification: "sphere",
            tier: 2,
            primary_attribute: "INT",
            secondary_attribute: "WIS",
            updated_at: "2026-08-16T00:00:00.000Z",
            relationship_count: 2,
            parent_names: `Spellcraft\u001fFaith`,
            has_spell_construction: 0,
          }] as T;
        }
        return [] as T;
      },
      async execute() {
        return { rowsAffected: 0 };
      },
    };
    const repository = new TauriSkillRepository(async () => database);

    const page = await repository.listSkills({ page: 1, pageSize: 40 });

    expect(page.items[0]?.parentNames).toEqual(["Spellcraft", "Faith"]);
    expect(page.items[0]?.relationshipCount).toBe(2);
  });

  it("bounds relationship candidates by prior tier and shared attributes", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: SkillDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [] as T;
      },
      async execute() {
        return { rowsAffected: 0 };
      },
    };
    const repository = new TauriSkillRepository(async () => database);

    await repository.listRelationshipCandidates({
      search: "focus",
      excludeId: 42,
      tier: 2,
      attributes: ["INT", "WIS"],
    });

    expect(calls[0]?.values).toEqual(["focus", 2, "INT", "WIS", 42]);
    expect(calls[0]?.query).toMatch(/s\.tier = \$2/i);
    expect(calls[0]?.query).toMatch(/primary_attribute[\s\S]*in \(\$3, \$4\)/i);
    expect(calls[0]?.query).toMatch(/secondary_attribute[\s\S]*in \(\$3, \$4\)/i);
    expect(calls[0]?.query).toMatch(/s\.id <> \$5/i);
    expect(calls[0]?.query).toMatch(/limit 30/i);
  });

  it("queries direct parent relationships and applies the optional tier", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: SkillDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [
          { id: 7, name: "Charm", classification: "sphere", tier: 2 },
        ] as T;
      },
      async execute() {
        return { rowsAffected: 0 };
      },
    };
    const repository = new TauriSkillRepository(async () => database);

    await expect(
      repository.listSpellFrameworkSkills(
        ["Spellcraft", "Talismanism", "Faith"],
        2,
      ),
    ).resolves.toEqual([
      { id: 7, name: "Charm", classification: "sphere", tier: 2 },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual(["Spellcraft", "Talismanism", "Faith", 2]);
    expect(calls[0]?.query).toMatch(/relationship_type = 'parent'/i);
    expect(calls[0]?.query).toMatch(/parent\.name[\s\S]*in \(\$1, \$2, \$3\)/i);
    expect(calls[0]?.query).toMatch(/child\.tier = \$4/i);
  });

  it("does not open the database for an empty parent definition", async () => {
    let opened = false;
    const repository = new TauriSkillRepository(async () => {
      opened = true;
      throw new Error("not expected");
    });

    await expect(repository.listSpellFrameworkSkills([])).resolves.toEqual([]);
    expect(opened).toBe(false);
  });
});
