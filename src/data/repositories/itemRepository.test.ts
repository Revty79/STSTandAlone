import { describe, expect, it, vi } from "vitest";
import type { SaveItemAggregate } from "../../types/item";
import { TauriItemRepository, type ItemDatabase } from "./itemRepository";

describe("TauriItemRepository", () => {
  it("uses a bounded lightweight scope query for the Item library", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: ItemDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        if (/count\(\*\) as count/i.test(query)) return [{ count: 1 }] as T;
        return [{
          id: 4, canonicalId: "ITEM-0098", name: "Fire Axe", catalogScope: "equipment",
          equipmentGroup: "general", recordType: "Item", family: "Fire Axe", category: "Tool",
          updatedAt: "now", tagsText: "Historical\u001fModern", hasWeaponProfile: 1, hasArmorProfile: 0,
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);
    const page = await repository.listItems({ catalogScope: "equipment", equipmentGroup: "general", search: "axe", page: 1, pageSize: 40 });

    expect(page.items[0]).toMatchObject({ name: "Fire Axe", tags: ["Historical", "Modern"], hasWeaponProfile: true, hasArmorProfile: false });
    expect(calls[1]?.query).toMatch(/limit \$4 offset \$5/i);
    expect(calls[1]?.query).not.toMatch(/description|item_properties|damage_modifiers_source_text/i);
    expect(calls[1]?.values).toEqual(["equipment", "axe", "general", 40, 0]);
  });

  it("loads canonical Tag and Body Shot Bob authoring references from SQLite", async () => {
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/item_tags_catalog/i.test(query)) return [{ name: "Universal" }, { name: "Modern" }] as T;
        return [{ key: "0", label: "Head" }, { key: "9", label: "Chest" }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);
    await expect(repository.listAuthoringReferences()).resolves.toEqual({
      tags: ["Universal", "Modern"],
      armorBodyLocations: [{ key: "0", label: "Head" }, { key: "9", label: "Chest" }],
    });
  });

  it("reads grouped inventory Tags without changing catalog data", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: ItemDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{
          name: "Fantasy",
          tagGroup: "Genre Pack",
          description: "Fantasy inventory content.",
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database);

    await expect(repository.listTagReferences("inventory")).resolves.toEqual([{
      name: "Fantasy",
      tagGroup: "Genre Pack",
      description: "Fantasy inventory content.",
    }]);
    expect(calls[0]?.query).toMatch(/select distinct tag\.name, tag\.tag_group as tagGroup/i);
    expect(calls[0]?.values).toEqual(["inventory"]);
    expect(calls[0]?.query).not.toMatch(/insert|update|delete/i);
  });

  it("uses the native aggregate transaction and reloads its committed result", async () => {
    const draft = { id: 8 } as SaveItemAggregate;
    const invoker = vi.fn(async () => 8);
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> {
        if (/from items item left join items parent/i.test(query)) return [{
          id: 8, canonicalId: "ITEM-2003", name: "Saved Item", catalogScope: "inventory",
          equipmentGroup: null, recordType: "Item", family: "Test", category: "Test", subtype: "",
          description: "", weight: null, weightUnit: "", size: "", durability: null, credits: 1,
          priceBasis: "each", parentItemId: null, parentItemName: null, createdByUserId: 1,
          sourceSystem: null, createdAt: "now", updatedAt: "now",
        }] as T;
        return [] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const repository = new TauriItemRepository(async () => database, invoker);
    await expect(repository.saveItemAggregate(draft)).resolves.toMatchObject({ id: 8, core: { canonicalId: "ITEM-2003", name: "Saved Item" } });
    expect(invoker).toHaveBeenCalledWith(draft);
  });

  it("protects Item lineage before deletion", async () => {
    const execute = vi.fn();
    const database: ItemDatabase = {
      async select<T>(query: string): Promise<T> { return [{ count: /parent_item_id/i.test(query) ? 1 : 0 }] as T; },
      execute,
    };
    const repository = new TauriItemRepository(async () => database);
    await expect(repository.deleteItem(4)).rejects.toThrow(/Variants still link/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
