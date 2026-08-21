import { describe, expect, it } from "vitest";
import { TauriItemRepository, type ItemDatabase } from "./itemRepository";

function databaseWithCalls(calls: Array<{ query: string; values: unknown[] }>): ItemDatabase {
  return {
    async select<T>(query: string, values: unknown[] = []): Promise<T> {
      calls.push({ query, values });
      if (/select count\(\*\) as count/i.test(query)) return [{ count: 1 }] as T;
      return [{
        id: 1, name: "Crowbar", catalog_section: "Equipment", timeline_tag: "Modern",
        cost_credits: 12, category: "Tool", subtype: "Utility", weight: 2,
        updated_at: "now", genre_tags: "Modern", weapon_role: "Improvised",
        weapon_category: "Tool", damage_type: "Bludgeoning", armor_category: null,
        armor_type: null, has_weapon_profile: 1, has_armor_profile: 0,
        has_purchase_creature_link: 0,
      }] as T;
    },
    async execute() { return { rowsAffected: 0 }; },
  };
}

describe("TauriItemRepository library queries", () => {
  it("keeps default Weapons bounded and excludes Improvised profiles", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const repository = new TauriItemRepository(async () => databaseWithCalls(calls));
    const page = await repository.listItems({ view: "weapons", search: "bow", page: 1, pageSize: 40 });
    expect(page).toMatchObject({ total: 1, pageSize: 40, items: [{ name: "Crowbar" }] });
    expect(calls[0]?.query).toMatch(/weapon_role <> 'Improvised'/i);
    expect(calls[0]?.query).toMatch(/item_aliases[\s\S]*search_alias\.alias/i);
    expect(calls[1]?.query).toMatch(/limit \$2 offset \$3/i);
    expect(calls[1]?.values).toEqual(["bow", 40, 0]);
  });

  it("shows Improvised profiles only when explicitly requested", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const repository = new TauriItemRepository(async () => databaseWithCalls(calls));
    await repository.listItems({ view: "weapons", includeImprovised: true, page: 1, pageSize: 500 });
    expect(calls[0]?.query).not.toMatch(/weapon_role <> 'Improvised'/i);
    expect(calls[1]?.values).toEqual([100, 0]);
  });

  it("uses explicit placement and relationship-based Inventory filtering", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const repository = new TauriItemRepository(async () => databaseWithCalls(calls));
    await repository.listItems({ view: "inventory", purchasableCreaturesOnly: true, category: "Animal", page: 2, pageSize: 25 });
    expect(calls[0]?.query).toMatch(/catalog_section = 'Inventory'/i);
    expect(calls[0]?.query).toMatch(/item_creature_links[\s\S]*relationship = 'Purchase'/i);
    expect(calls[1]?.values).toEqual(["Animal", 25, 25]);
  });

  it("keeps primary Weapons and Armor out of General Equipment but retains Improvised tools", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const repository = new TauriItemRepository(async () => databaseWithCalls(calls));
    await repository.listItems({ view: "general-equipment", page: 1, pageSize: 40 });
    expect(calls[0]?.query).toMatch(/catalog_section = 'Equipment'/i);
    expect(calls[0]?.query).toMatch(/weapon_role <> 'Improvised'/i);
    expect(calls[0]?.query).toMatch(/not exists[\s\S]*item_armor_profiles/i);
  });
});
