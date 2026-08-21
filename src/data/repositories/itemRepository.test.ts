import { describe, expect, it, vi } from "vitest";
import type { SaveItemAggregate } from "../../types/item";
import { TauriItemRepository, type ItemDatabase } from "./itemRepository";

const summaryRow = {
  id: 7, name: "Longsword", catalog_scope: "equipment", timeline_tag: "",
  cost_credits: 100, category: "", subtype: "", weight: 4, updated_at: "now",
  genre_tags: "Fantasy\u001fUniversal", weapon_role: "primary", weapon_category: "Sword",
  damage_type: "Slashing", armor_category: null, armor_type: null,
  has_weapon_profile: 1, has_armor_profile: 0,
};

describe("TauriItemRepository", () => {
  it("uses bounded database filtering and excludes improvised Weapons by default", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const database: ItemDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return (/count\(\*\) as count/i.test(query) ? [{ count: 1 }] : [summaryRow]) as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);
    const page = await repository.listItems({
      view: "weapons", search: "long", category: "Sword", type: "Slashing",
      genre: "Fantasy", page: 2, pageSize: 40,
    });
    expect(page.items[0]).toMatchObject({ name: "Longsword", genreTags: ["Fantasy", "Universal"] });
    expect(calls[0].query).toMatch(/weapon_role <> 'improvised'/i);
    expect(calls[1].query).toMatch(/limit \$5 offset \$6/i);
    expect(calls[1].values).toEqual(["long", "Sword", "Slashing", "Fantasy", 40, 40]);
    expect(calls[1].query).not.toMatch(/effect_description|narrative_variant_notes/i);
  });

  it("includes improvised profiles only when the filter explicitly allows them", async () => {
    const calls: string[] = [];
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> {
        calls.push(query);
        return (/count\(\*\) as count/i.test(query) ? [{ count: 0 }] : []) as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);
    await repository.listItems({ view: "weapons", includeImprovised: true, page: 1, pageSize: 40 });
    expect(calls[0]).toMatch(/item_weapon_profiles view_weapon/i);
    expect(calls[0]).not.toMatch(/weapon_role <> 'improvised'/i);
  });

  it("keeps ordinary improvised-profile Items in General Equipment", async () => {
    const calls: string[] = [];
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> {
        calls.push(query);
        return (/count\(\*\) as count/i.test(query) ? [{ count: 0 }] : []) as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);
    await repository.listItems({ view: "general-equipment", page: 1, pageSize: 40 });
    expect(calls[0]).toMatch(/catalog_scope = 'equipment'/i);
    expect(calls[0]).toMatch(/weapon_role = 'improvised'/i);
  });

  it("loads both optional profiles and uses the transactional native save command", async () => {
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/from items where/i.test(query)) return [{
          id: 4, name: "Spiked Shield", catalog_scope: "equipment", timeline_tag: "",
          cost_credits: 150, category: "", subtype: "", weight: 20,
          effect_description: "Block", narrative_variant_notes: "Spiked",
          created_by_user_id: null, source_system: "canonical", source_external_id: "item-4",
          created_at: "now", updated_at: "now",
        }] as T;
        if (/item_genre_tags/i.test(query)) return [{ genre_tag: "Fantasy" }] as T;
        if (/item_weapon_profiles/i.test(query)) return [{
          id: 1, item_id: 4, weapon_role: "primary", weapon_category: "Exotic",
          handedness: "1h", damage_type: "Piercing", range_type: "Melee", range_text: "Close",
          damage: 8, weapon_effect_description: "Strike", weapon_narrative_notes: "",
          source_system: "canonical", source_external_id: "weapon-4", created_at: "now", updated_at: "now",
        }] as T;
        return [{
          id: 2, item_id: 4, area_covered: "Arms", soak: 2, armor_category: "Shield",
          armor_type: "Steel", encumbrance_penalty: -2, armor_effect_description: "Block",
          armor_narrative_notes: "", source_system: "canonical", source_external_id: "armor-4",
          created_at: "now", updated_at: "now",
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const invoker = vi.fn(async () => 4);
    const repository = new TauriItemRepository(async () => database, invoker);
    const draft = { id: 4 } as SaveItemAggregate;
    const aggregate = await repository.saveItemAggregate(draft);
    expect(aggregate).toMatchObject({
      item: { name: "Spiked Shield" },
      weaponProfile: { weaponRole: "primary" },
      armorProfile: { armorCategory: "Shield" },
    });
    expect(invoker).toHaveBeenCalledWith(draft);
  });
});
