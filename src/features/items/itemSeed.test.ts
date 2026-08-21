import { describe, expect, it } from "vitest";
import sourceJson from "../../../data/serrian-tide-item-sheet.json";
import seedJson from "../../../data/serrian-tide-item-seed.json";
import reportJson from "../../../data/serrian-tide-item-import-report.json";

const source = sourceJson as { tabs: Record<"Items" | "Weapons" | "Armor", unknown[][]> };
const seed = seedJson as unknown as {
  counts: {
    baseItems: number;
    weaponProfiles: number;
    primaryWeaponProfiles: number;
    improvisedWeaponProfiles: number;
    armorProfiles: number;
    genreTagRows: number;
  };
  records: Array<{
    item: {
      name: string;
      catalogScope: string;
      category: string;
      subtype: string;
      costCredits: number;
      weight: number;
      sourceExternalId: string;
    };
    genreTags: string[];
    weaponProfile: null | { weaponRole: string; damage: number; sourceExternalId: string };
    armorProfile: null | { soak: number; armorCategory: string; sourceExternalId: string };
  }>;
};
const report = reportJson as unknown as {
  sourceCounts: { items: number; weapons: number; armor: number; totalSourceRows: number };
  catalogScopePolicy: {
    appliedOverrides: Array<{
      name: string;
      category: string;
      subtype: string;
      catalogScope: string;
    }>;
  };
  reconciliation: {
    duplicatesWithinItems: unknown[];
    duplicatesWithinWeapons: unknown[];
    duplicatesWithinArmor: unknown[];
    crossTabExactNameCandidates: unknown[];
    mergedRecords: unknown[];
    ambiguousMergeCandidates: unknown[];
    conflictingSharedValues: unknown[];
  };
  validation: {
    invalidCosts: unknown[];
    invalidWeights: unknown[];
    invalidDamage: unknown[];
    invalidSoak: unknown[];
    invalidEncumbrance: unknown[];
    unknownCategories: unknown[];
    structuralSourceWarnings: unknown[];
  };
  accounting: { accountedSourceRowCount: number; unresolvedSourceRowCount: number; sourceRows: unknown[] };
};

const named = (name: string) => seed.records.filter(({ item }) => item.name === name);

describe("canonical Item seed", () => {
  it("accounts for every raw source row in one universal Item catalog", () => {
    expect(source.tabs.Items).toHaveLength(426);
    expect(source.tabs.Weapons).toHaveLength(207);
    expect(source.tabs.Armor).toHaveLength(190);
    expect(report.sourceCounts).toEqual({ items: 425, weapons: 206, armor: 189, totalSourceRows: 820 });
    expect(seed.counts).toEqual({
      baseItems: 817,
      weaponProfiles: 206,
      primaryWeaponProfiles: 161,
      improvisedWeaponProfiles: 45,
      armorProfiles: 189,
      genreTagRows: 1468,
    });
    expect(seed.records).toHaveLength(817);
    expect(report.accounting.accountedSourceRowCount).toBe(820);
    expect(report.accounting.sourceRows).toHaveLength(820);
    expect(report.accounting.unresolvedSourceRowCount).toBe(0);
    expect(new Set(seed.records.map(({ item }) => item.sourceExternalId)).size).toBe(817);
  });

  it("merges clear cross-tab objects without losing either profile", () => {
    expect(named("Crowbar")).toHaveLength(1);
    expect(named("Crowbar")[0]).toMatchObject({
      item: { catalogScope: "equipment", costCredits: 10, weight: 5 },
      weaponProfile: { weaponRole: "improvised", damage: 6 },
      armorProfile: null,
    });
    expect(named("Shovel")).toHaveLength(1);
    expect(named("Shovel")[0].weaponProfile).toMatchObject({ weaponRole: "improvised", damage: 8 });
    expect(named("Spiked Shield")).toHaveLength(1);
    expect(named("Spiked Shield")[0]).toMatchObject({
      weaponProfile: { weaponRole: "primary", damage: 8 },
      armorProfile: { armorCategory: "Shield", soak: 2 },
    });
    expect(report.reconciliation.crossTabExactNameCandidates).toHaveLength(3);
    expect(report.reconciliation.mergedRecords).toHaveLength(3);
    expect(report.reconciliation.ambiguousMergeCandidates).toEqual([]);
    expect(report.reconciliation.conflictingSharedValues).toHaveLength(3);
  });

  it("preserves representative Items, Weapons, Armor, duplicates, zero damage, and genres", () => {
    for (const name of [
      "Rope (50 ft)", "Medkit", "Inn Stay (Private Room)", "Car (Compact)",
      "Wooden Chair", "Shortsword", "Pistol", "Rifle", "Plasma Rifle",
      "Padded Gambeson", "Full Plate", "Full Plate Armor", "Phase Suit",
    ]) expect(named(name).length).toBeGreaterThan(0);
    expect(named("Medkit")[0].item.catalogScope).toBe("inventory");
    expect(named("Inn Stay (Private Room)")[0].item.catalogScope).toBe("inventory");
    expect(named("Smoke Bomb")[0].weaponProfile).toMatchObject({ weaponRole: "primary", damage: 0 });
    expect(named("Padded Gambeson")[0].armorProfile).toMatchObject({ armorCategory: "Light", soak: 2 });
    expect(named("Tower Shield")).toHaveLength(2);
    expect(report.reconciliation.duplicatesWithinItems).toEqual([]);
    expect(report.reconciliation.duplicatesWithinWeapons).toEqual([]);
    expect(report.reconciliation.duplicatesWithinArmor).toHaveLength(8);
    expect(seed.records.flatMap(({ genreTags }) => genreTags)).toHaveLength(1468);
  });

  it("places living purchase listings in Inventory without moving ordinary Tools", () => {
    const livingInventoryItems = [
      ["Horse", "Mount"],
      ["Camel", "Mount"],
      ["Dog (Trained)", "Animal"],
      ["Cat (Pet)", "Animal"],
      ["Falcon", "Animal"],
      ["Exotic Pet (Small)", "Pet"],
      ["Exotic Pet (Large)", "Pet"],
    ] as const;
    for (const [name, subtype] of livingInventoryItems) {
      expect(named(name)).toHaveLength(1);
      expect(named(name)[0].item).toMatchObject({
        catalogScope: "inventory",
        category: "Tool",
        subtype,
      });
    }
    expect(report.catalogScopePolicy.appliedOverrides.map(({ name }) => name)).toEqual(
      livingInventoryItems.map(([name]) => name),
    );

    for (const name of [
      "Crowbar", "Shovel", "Toolkit (Basic)", "Toolkit (Advanced)", "Flashlight",
    ]) {
      expect(named(name)).toHaveLength(1);
      expect(named(name)[0].item.catalogScope).toBe("equipment");
    }
  });

  it("contains no unresolved parsing or scope decisions", () => {
    for (const key of [
      "invalidCosts", "invalidWeights", "invalidDamage", "invalidSoak",
      "invalidEncumbrance", "unknownCategories",
    ] as const) expect(report.validation[key]).toEqual([]);
    expect(report.validation.structuralSourceWarnings).toHaveLength(8);
  });
});
