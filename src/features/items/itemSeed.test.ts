import { describe, expect, it } from "vitest";
import seedSource from "../../../data/serrian-tide-item-seed.json";

type SeedItem = {
  core: {
    canonicalId: string;
    name: string;
    catalogScope: "equipment" | "inventory";
    equipmentGroup: "weapon" | "armor" | "general" | null;
    recordType: string;
  };
  weaponProfile: null | {
    profileRecordType: string;
    capacity: string;
    reloadInitiative: string;
    ammunitionCanonicalId: string | null;
  };
  armorProfile: null | {
    damageModifiers: Array<{ modifierText: string; damageType: string; modifier: string; notes: string }>;
    coveredBodyLocationKeys: string[];
  };
  properties: Array<{ relatedItemCanonicalId: string | null; relatedCreatureCanonicalId: string | null }>;
  tags: string[];
};

const seed = seedSource as unknown as {
  counts: Record<string, number>;
  bodyLocations: Array<{ key: string; label: string }>;
  tags: Array<{ canonicalId: string; name: string }>;
  rules: unknown[];
  items: SeedItem[];
};

describe("canonical G.O.D. Item seed", () => {
  it("reconciles every normalized workbook count", () => {
    expect(seed.counts).toEqual({
      items: 1007,
      equipment: 494,
      inventory: 513,
      weaponProfiles: 221,
      armorProfiles: 47,
      properties: 252,
      tags: 8,
      tagLinks: 1242,
      armorLocations: 204,
      armorDamageModifiers: 128,
      rules: 16,
    });
  });

  it("keeps ammunition in Inventory while retaining Weapon Profile data", () => {
    const ammunition = seed.items.filter((item) => item.core.recordType === "Ammunition");
    expect(ammunition).toHaveLength(17);
    expect(ammunition.every((item) => item.core.catalogScope === "inventory")).toBe(true);
    expect(ammunition.every((item) => item.weaponProfile?.profileRecordType === "Ammunition")).toBe(true);
  });

  it("does not confuse a Weapon Profile with the Equipment browse group", () => {
    const fireAxe = seed.items.find((item) => item.core.name === "Fire Axe");
    expect(fireAxe).toMatchObject({
      core: { catalogScope: "equipment", equipmentGroup: "general", recordType: "Item" },
      weaponProfile: { profileRecordType: "Weapon" },
    });
  });

  it("preserves text weapon values, normalized armor mechanics, and canonical references", () => {
    expect(seed.items.some((item) => /round|charge|shell|arrow|bolt|stone|dart|cartridge/u.test(item.weaponProfile?.capacity ?? ""))).toBe(true);
    expect(seed.items.some((item) => /per round|per shell/u.test(item.weaponProfile?.reloadInitiative ?? ""))).toBe(true);
    expect(seed.bodyLocations.map((row) => row.label)).toEqual([
      "Head", "Right Arm", "Left Arm", "Right Shin", "Right Thigh",
      "Left Shin", "Left Thigh", "Groin", "Stomach", "Chest",
    ]);
    expect(seed.items.flatMap((item) => item.armorProfile?.damageModifiers ?? [])).toContainEqual(expect.objectContaining({
      damageType: "Rule", modifier: "Special",
    }));
  });

  it("resolves Item and Creature relationships without duplicating runtime state", () => {
    const itemIds = new Set(seed.items.map((item) => item.core.canonicalId));
    const relatedItems = seed.items.flatMap((item) => item.properties).map((row) => row.relatedItemCanonicalId).filter(Boolean) as string[];
    const relatedCreatures = seed.items.flatMap((item) => item.properties).map((row) => row.relatedCreatureCanonicalId).filter(Boolean) as string[];
    expect(relatedItems).toHaveLength(4);
    expect(relatedItems.every((canonicalId) => itemIds.has(canonicalId))).toBe(true);
    expect(new Set(relatedCreatures)).toEqual(new Set(["CR-CAMEL", "CR-CAT", "CR-DOG", "CR-FALCON", "CR-HORSE"]));
    for (const item of seed.items) {
      for (const forbidden of ["ownerId", "quantityOwned", "currentDurability", "equipped", "characterId"]) {
        expect(forbidden in item.core).toBe(false);
      }
    }
  });

  it("hydrates canonical Tags through normalized links", () => {
    expect(seed.tags.map((tag) => tag.name)).toEqual([
      "Universal", "Fantasy", "Historical", "Modern", "Horror",
      "Post-Apocalyptic", "Sci-Fi", "Black Market",
    ]);
    expect(seed.items.reduce((sum, item) => sum + item.tags.length, 0)).toBe(1242);
  });
});
