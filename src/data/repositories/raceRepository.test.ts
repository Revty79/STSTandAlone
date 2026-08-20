import { describe, expect, it, vi } from "vitest";
import type { SaveRaceAggregate } from "../../types/race";
import { TauriRaceRepository, type RaceDatabase } from "./raceRepository";

describe("TauriRaceRepository", () => {
  it("uses bounded lightweight Race library queries", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: RaceDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        if (/count\(\*\) as count from races/i.test(query)) return [{ count: 1 }] as T;
        return [{
          id: 7, name: "Mer-Folk", size: "Medium", age_range_text: "20-200",
          base_magic: 2, updated_at: "2026-08-20T00:00:00Z", attribute_cap_count: 6,
          movement_mode_count: 2, skill_link_count: 3,
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriRaceRepository(async () => database);
    const page = await repository.listRaces({ search: "mer", size: "Medium", page: 1, pageSize: 40 });
    expect(page.items[0]).toMatchObject({ name: "Mer-Folk", movementModeCount: 2 });
    expect(calls[1]?.query).toMatch(/limit \$3 offset \$4/i);
    expect(calls[1]?.query).not.toMatch(/legacy_description|physical_description|cultural_mindset/i);
    expect(calls[1]?.values).toEqual(["mer", "Medium", 40, 0]);
  });

  it("bounds the searchable Skill picker to current Skill identities", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: RaceDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{ id: 12, name: "Shift Forms", classification: "special ability", tier: null }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriRaceRepository(async () => database);
    await expect(repository.listSkillCandidates("shift")).resolves.toEqual([
      { id: 12, name: "Shift Forms", classification: "special ability", tier: null },
    ]);
    expect(calls[0]?.query).toMatch(/from skills[\s\S]*limit 30/i);
    expect(calls[0]?.values).toEqual(["shift"]);
  });

  it("restricts granted-ability searches to Special Ability Skills", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: RaceDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriRaceRepository(async () => database);
    await repository.listSkillCandidates("vision", "special ability");
    expect(calls[0]?.query).toMatch(/classification = \$2 collate nocase/i);
    expect(calls[0]?.query).toMatch(/limit 30/i);
    expect(calls[0]?.values).toEqual(["vision", "special ability"]);
  });

  it("loads the full normalized aggregate and resolves live Skill names", async () => {
    const database: RaceDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/from races where/i.test(query)) return [{
          id: 4, name: "Lupine", legacy_description: "Lore", physical_characteristics: "Fur",
          physical_description: "Wolf-like", age_range_text: "15-90", age_min: 15, age_max: 90,
          size: "Medium", base_magic: 1, racial_quirk_name: "Pack Bond",
          quirk_success_effect: "Aid", quirk_failure_effect: "Distracted",
          common_languages_known: "Common", common_archetypes: "Scout", genre_examples: "Fantasy",
          cultural_mindset: "Collective", outlook_on_magic: "Instinctive", created_by_user_id: 1,
          source_system: null, source_external_id: null, created_at: "now", updated_at: "now",
        }] as T;
        if (/race_attribute_caps/i.test(query)) return [{ id: 1, race_id: 4, attribute_key: "STR", max_value: 55, sort_order: 0, created_at: "now", updated_at: "now" }] as T;
        if (/race_movement_modes/i.test(query)) return [{ id: 2, race_id: 4, movement_mode: "Land", base_value: 4, notes: "", sort_order: 0, created_at: "now", updated_at: "now" }] as T;
        return [{ id: 3, race_id: 4, skill_id: 9, skill_name: "Shift Forms Revised", skill_classification: "special ability", link_type: "granted", value: null, sort_order: 0, created_at: "now", updated_at: "now" }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriRaceRepository(async () => database);
    const aggregate = await repository.getRaceAggregate(4);
    expect(aggregate?.attributeCaps[0]).toMatchObject({ attributeKey: "STR", maxValue: 55 });
    expect(aggregate?.movementModes[0]).toMatchObject({ movementMode: "Land", baseValue: 4 });
    expect(aggregate?.skillLinks[0]).toMatchObject({ skillName: "Shift Forms Revised", linkType: "granted" });
  });

  it("uses the native aggregate command and reloads its committed result", async () => {
    const draft = { id: 8 } as SaveRaceAggregate;
    const invoker = vi.fn(async () => 8);
    const database: RaceDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/from races where/i.test(query)) return [{
          id: 8, name: "Saved", legacy_description: "", physical_characteristics: "",
          physical_description: "", age_range_text: "", age_min: null, age_max: null,
          size: "", base_magic: null, racial_quirk_name: "", quirk_success_effect: "",
          quirk_failure_effect: "", common_languages_known: "", common_archetypes: "",
          genre_examples: "", cultural_mindset: "", outlook_on_magic: "", created_by_user_id: 1,
          source_system: null, source_external_id: null, created_at: "now", updated_at: "now",
        }] as T;
        return [] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriRaceRepository(async () => database, invoker);
    await expect(repository.saveRaceAggregate(draft)).resolves.toMatchObject({ race: { id: 8, name: "Saved" } });
    expect(invoker).toHaveBeenCalledWith(draft);
  });
});
