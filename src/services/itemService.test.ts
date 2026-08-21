import { describe, expect, it } from "vitest";
import type { ItemRepository } from "../data/repositories/itemRepository";
import type {
  ItemAggregate,
  ItemLibraryFilters,
  SaveItemAggregate,
} from "../types/item";
import { ItemService, ItemValidationError } from "./itemService";

const clone = <T>(value: T): T => structuredClone(value);

class MemoryItemRepository implements ItemRepository {
  private records = new Map<number, ItemAggregate>();
  private nextId = 1;

  async listItems(filters: ItemLibraryFilters) {
    const matching = [...this.records.values()].filter(({ item }) =>
      item.name.toLocaleLowerCase().includes(filters.search?.toLocaleLowerCase() ?? ""),
    );
    return {
      items: matching.map(({ item, genreTags, weaponProfile, armorProfile }) => ({
        id: item.id, name: item.name, catalogScope: item.catalogScope,
        timelineTag: item.timelineTag, costCredits: item.costCredits,
        category: item.category, subtype: item.subtype, weight: item.weight,
        updatedAt: item.updatedAt, genreTags,
        weaponRole: weaponProfile?.weaponRole ?? null,
        weaponCategory: weaponProfile?.weaponCategory ?? null,
        damageType: weaponProfile?.damageType ?? null,
        armorCategory: armorProfile?.armorCategory ?? null,
        armorType: armorProfile?.armorType ?? null,
        hasWeaponProfile: Boolean(weaponProfile), hasArmorProfile: Boolean(armorProfile),
      })),
      total: matching.length, page: 1, pageSize: filters.pageSize, pageCount: 1,
    };
  }
  async listOptions() { return { categories: [], subtypes: [], types: [], genres: [] }; }
  async getItemAggregate(id: number) { return this.records.has(id) ? clone(this.records.get(id)!) : null; }
  async saveItemAggregate(input: SaveItemAggregate) {
    const id = input.id ?? this.nextId++;
    const now = new Date().toISOString();
    const existing = this.records.get(id);
    const aggregate: ItemAggregate = {
      item: { id, ...clone(input.core), createdAt: existing?.item.createdAt ?? now, updatedAt: now },
      genreTags: [...input.genreTags],
      weaponProfile: input.weaponProfile ? { id: 1, itemId: id, ...clone(input.weaponProfile), createdAt: now, updatedAt: now } : null,
      armorProfile: input.armorProfile ? { id: 1, itemId: id, ...clone(input.armorProfile), createdAt: now, updatedAt: now } : null,
    };
    this.records.set(id, aggregate);
    return clone(aggregate);
  }
  async deleteItem(id: number) { this.records.delete(id); }
}

function draft(name = "Field Kit"): SaveItemAggregate {
  return {
    core: {
      name, catalogScope: " equipment ", timelineTag: " Universal ", costCredits: 25,
      category: " Tool ", subtype: " Utility ", weight: 5,
      effectDescription: " Useful ", narrativeVariantNotes: " Durable ",
      createdByUserId: 1, sourceSystem: null, sourceExternalId: null,
    },
    genreTags: [" Universal ", "Post-Apoc", "universal"],
    weaponProfile: {
      weaponRole: " improvised ", weaponCategory: " Club ", handedness: " 1h ",
      damageType: " Bludgeoning ", rangeType: " Melee ", rangeText: " Close ", damage: 6,
      weaponEffectDescription: " Strike ", weaponNarrativeNotes: " Heavy ",
      sourceSystem: null, sourceExternalId: null,
    },
    armorProfile: {
      areaCovered: " Arms ", soak: 2, armorCategory: " Shield ", armorType: " Steel ",
      encumbrancePenalty: -1, armorEffectDescription: " Block ", armorNarrativeNotes: " Guard ",
      sourceSystem: null, sourceExternalId: null,
    },
  };
}

describe("ItemService", () => {
  it("creates, edits, searches, removes profiles, and deletes a universal Item", async () => {
    const service = new ItemService(new MemoryItemRepository());
    const created = await service.saveItem(draft());
    expect(created.item).toMatchObject({ name: "Field Kit", catalogScope: "equipment", category: "Tool" });
    expect(created.genreTags).toEqual(["Universal", "Post-Apoc"]);
    expect(created.weaponProfile).toMatchObject({ weaponRole: "improvised", damage: 6 });
    expect(created.armorProfile).toMatchObject({ armorCategory: "Shield", encumbrancePenalty: -1 });

    const update = draft("Revised Field Kit");
    update.id = created.item.id;
    update.core.catalogScope = "inventory";
    update.weaponProfile = null;
    const saved = await service.saveItem(update);
    expect(saved.weaponProfile).toBeNull();
    expect(saved.armorProfile).not.toBeNull();
    await expect(service.listItems({ view: "inventory", search: "revised", page: 1, pageSize: 40 })).resolves.toMatchObject({ total: 1 });
    await service.deleteItem(created.item.id);
    await expect(service.getItem(created.item.id)).resolves.toBeNull();
  });

  it("allows duplicate Item names because source identity is not display identity", async () => {
    const service = new ItemService(new MemoryItemRepository());
    const first = await service.saveItem(draft("Variant"));
    const second = await service.saveItem(draft("Variant"));
    expect(first.item.id).not.toBe(second.item.id);
    await expect(service.listItems({ view: "general-equipment", search: "Variant", page: 1, pageSize: 40 })).resolves.toMatchObject({ total: 2 });
  });

  it("rejects invalid aggregate data before persistence", async () => {
    const service = new ItemService(new MemoryItemRepository());
    await expect(service.saveItem(draft("   "))).rejects.toBeInstanceOf(ItemValidationError);
    const cost = draft(); cost.core.costCredits = -1;
    await expect(service.saveItem(cost)).rejects.toThrow(/Cost/i);
    const role = draft(); role.weaponProfile!.weaponRole = "";
    await expect(service.saveItem(role)).rejects.toThrow(/Weapon Role/i);
    const damage = draft(); damage.weaponProfile!.damage = -1;
    await expect(service.saveItem(damage)).rejects.toThrow(/Damage/i);
    const source = draft(); source.core.sourceSystem = "canonical";
    await expect(service.saveItem(source)).rejects.toThrow(/source system and external identity/i);
  });
});
