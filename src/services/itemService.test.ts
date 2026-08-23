import { describe, expect, it } from "vitest";
import { TemporaryItemRepository } from "../data/repositories/itemRepository";
import { TEMPORARY_ITEM_CATALOG } from "../data/temporaryItemCatalog";
import { newItemDraft } from "../pages/ItemsPage";
import { ItemService, ItemValidationError } from "./itemService";

function service() {
  return new ItemService(new TemporaryItemRepository(TEMPORARY_ITEM_CATALOG, async (search) => search.toLowerCase().includes("dog") ? [{ canonicalId: "CR-DOG", name: "Dog", family: "Canine", creatureType: "Animal" }] : []));
}

describe("ItemService temporary authoring contract", () => {
  it("keeps Equipment and Inventory as separate catalog scopes", async () => {
    const items = service();
    const equipment = await items.listItems({ catalogScope: "equipment", page: 1, pageSize: 40 });
    const inventory = await items.listItems({ catalogScope: "inventory", page: 1, pageSize: 40 });

    expect(equipment.items.map((item) => item.name)).toEqual([
      "Field Backpack",
      "Longsword",
      "Shock Spanner",
      "Tactical Vest",
    ]);
    expect(inventory.items.map((item) => item.name)).toEqual([
      "9×19 mm Cartridge",
      "Trail Rations",
      "Trained Dog Listing",
    ]);
    expect(equipment.items.every((item) => item.catalogScope === "equipment")).toBe(true);
    expect(inventory.items.every((item) => item.catalogScope === "inventory")).toBe(true);
  });

  it("uses an explicit Equipment browse group instead of treating profiles as identity", async () => {
    const items = service();
    const general = await items.listItems({ catalogScope: "equipment", equipmentGroup: "general", page: 1, pageSize: 40 });

    expect(general.items.map((item) => item.name)).toEqual(["Field Backpack", "Shock Spanner"]);
    expect(general.items.find((item) => item.name === "Shock Spanner")?.hasWeaponProfile).toBe(true);
  });

  it("creates, edits, reloads, filters, and deletes temporary complete Items", async () => {
    const items = service();
    const draft = newItemDraft(7, "inventory");
    draft.core.canonicalId = "DEMO-INV-NEW";
    draft.core.name = "Water Flask";
    draft.core.recordType = "Consumable";
    draft.core.category = "Water";
    draft.tags = ["Universal"];
    const saved = await items.saveItem(draft);

    expect(saved.id).toBeGreaterThan(7);
    await expect(items.getItem(saved.id)).resolves.toMatchObject({ core: { name: "Water Flask" } });
    await expect(items.listItems({ catalogScope: "inventory", search: "flask", page: 1, pageSize: 40 })).resolves.toMatchObject({ total: 1 });

    saved.core.name = "Field Water Flask";
    const updated = await items.saveItem({ ...saved, core: { ...saved.core } });
    expect(updated.core.name).toBe("Field Water Flask");

    await items.deleteItem(saved.id);
    await expect(items.getItem(saved.id)).resolves.toBeNull();
  });

  it("creates a complete independent Variant with permanent lineage", async () => {
    const items = service();
    const variant = await items.createVariant(1, "Titanium Longsword", 7);

    expect(variant).toMatchObject({
      core: { name: "Titanium Longsword", parentItemId: 1, parentItemName: "Longsword", family: "Blades" },
      weaponProfile: { damage: "12" },
      variants: [],
    });
    variant.weaponProfile!.damage = "15";
    await items.saveItem({ ...variant, core: { ...variant.core } });
    expect((await items.getItem(1))?.weaponProfile?.damage).toBe("12");
    expect((await items.getItem(1))?.variants).toMatchObject([{ id: variant.id, name: "Titanium Longsword" }]);
  });

  it("supports canonical Item and Creature relationship lookup without copying Creature statistics", async () => {
    const items = service();
    await expect(items.findRelatedItems("ration")).resolves.toMatchObject([{ name: "Trail Rations", recordType: "Consumable" }]);
    await expect(items.findRelatedCreatures("dog")).resolves.toEqual([{ canonicalId: "CR-DOG", name: "Dog", family: "Canine", creatureType: "Animal" }]);
  });

  it("normalizes provisional fields and rejects invalid catalog records", async () => {
    const items = service();
    const draft = newItemDraft(7, "equipment");
    draft.core.canonicalId = "  DEMO-EQ-NEW  ";
    draft.core.name = "  Field Light  ";
    draft.core.recordType = "  Tool  ";
    draft.tags = [" Modern ", "Modern"];
    const saved = await items.saveItem(draft);
    expect(saved.core).toMatchObject({ canonicalId: "DEMO-EQ-NEW", name: "Field Light", recordType: "Tool", equipmentGroup: "general" });
    expect(saved.tags).toEqual(["Modern"]);

    const invalid = newItemDraft(7, "inventory");
    invalid.core.canonicalId = "DEMO-BAD";
    invalid.core.name = "Broken";
    invalid.core.recordType = "Item";
    invalid.core.durability = -1;
    await expect(items.saveItem(invalid)).rejects.toBeInstanceOf(ItemValidationError);
  });
});
