import { describe, expect, it } from "vitest";
import { newItemDraft } from "../pages/ItemsPage";
import { ItemValidationError, normalizeItemAggregate } from "./itemService";

describe("ItemService permanent authoring contract", () => {
  it("leaves a new canonical Item ID blank for the native transaction to assign", () => {
    const draft = newItemDraft(7, "inventory");
    draft.core.name = " Water Flask ";
    draft.core.recordType = " Consumable ";
    draft.core.family = " Provisions ";
    draft.core.category = " Water ";
    const normalized = normalizeItemAggregate(draft);

    expect(normalized.core).toMatchObject({
      canonicalId: "",
      name: "Water Flask",
      catalogScope: "inventory",
      equipmentGroup: null,
      recordType: "Consumable",
    });
  });

  it("preserves text-capable weapon canon", () => {
    const draft = newItemDraft(7, "inventory");
    draft.core.name = "Ammunition";
    draft.core.recordType = "Ammunition";
    draft.core.family = "Cartridges";
    draft.core.category = "Ammunition";
    draft.weaponProfile = {
      profileRecordType: " Ammunition ", weaponType: " Cartridge ", handedness: "",
      damageSource: " Ammunition ", damage: " 8.0 ", damageType: " Piercing ",
      range: "", reach: "", ammunitionItemId: null, ammunitionItemName: null,
      compatibility: " Pistol; Rifle ", capacity: " 30 rounds ", fireModes: [" Single ", "Single"],
      rateOfFire: " 1 shot / Initiative ", reloadInitiative: " 1 per round ", rulesText: "",
    };

    expect(normalizeItemAggregate(draft).weaponProfile).toMatchObject({
      capacity: "30 rounds",
      reloadInitiative: "1 per round",
      damage: "8.0",
      fireModes: ["Single"],
    });
  });

  it("normalizes tags and rejects invalid aggregate rows", () => {
    const draft = newItemDraft(7, "equipment");
    draft.core.name = "Field Light";
    draft.core.recordType = "Item";
    draft.core.family = "Lights";
    draft.core.category = "Tools";
    draft.tags = [" Modern ", "Modern"];
    expect(normalizeItemAggregate(draft).tags).toEqual(["Modern"]);

    draft.core.durability = -1;
    expect(() => normalizeItemAggregate(draft)).toThrow(ItemValidationError);
  });
});
