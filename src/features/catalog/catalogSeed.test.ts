import { describe, expect, it } from "vitest";
import itemCatalogJson from "../../../data/serrian-tide-item-catalog.json";
import creatureCatalogJson from "../../../data/serrian-tide-creature-catalog.json";
import purchaseLinksJson from "../../../data/serrian-tide-item-creature-links.json";
import reportJson from "../../../data/serrian-tide-catalog-import-report.json";
import manifestJson from "../../../data/serrian-tide-catalog-source-manifest.json";

type ItemRecord = {
  key: string;
  item: {
    name: string;
    catalogSection: string;
    category: string;
    subtype: string;
    costCredits: number | null;
    weight: number | null;
    sourceExternalId: string;
  };
  genreTags: string[];
  weaponProfile: null | { weaponRole: string; weaponCategory: string; damage: number | null };
  armorProfile: null | { soak: number | null; encumbrancePenalty: number | null };
  provenance: Array<{ sourceEntryId: string }>;
};

const items = (itemCatalogJson as unknown as { records: ItemRecord[] }).records;
const creatures = (creatureCatalogJson as unknown as { records: Array<{ key: string; creature: { name: string; hpTotal: number | null; initiative: number | null; armorSoak: number | null }; attributes: unknown[]; attacks: unknown[] }> }).records;
const links = (purchaseLinksJson as unknown as { records: Array<{ itemKey: string; creatureKey: string; relationship: string }> }).records;
const report = reportJson as unknown as {
  sourceCounts: { structuredItemsRows: number; structuredWeaponsRows: number; structuredArmorRows: number; genreDocumentEntries: number; typeDocumentEntries: number; totalEntries: number };
  normalizedCounts: Record<string, number>;
  sourceAccounting: Array<{ sourceEntryId: string; source: string; status: string; profile?: string }>;
  reconciliation: { exactSemanticMerges: Array<{ canonicalName: string }>; unresolvedEntries: unknown[]; skippedEntries: unknown[]; recordsMissingMechanicalDetail: unknown[] };
  creatureReview: { creatureLikeItemsIntentionallyUnlinked: unknown[]; genericPurchaseEntries: Array<{ name: string }>; fantasyAmbiguousCandidates: Array<{ name: string }> };
  validationErrors: unknown[];
};

describe("normalized Item and Creature source artifacts", () => {
  it("accounts for every raw entry and every structured profile row", () => {
    expect(report.sourceCounts).toMatchObject({
      structuredItemsRows: 425,
      structuredWeaponsRows: 206,
      structuredArmorRows: 189,
      genreDocumentEntries: 4806,
      typeDocumentEntries: 1155,
      totalEntries: 6781,
    });
    expect(report.sourceAccounting).toHaveLength(6781);
    expect(new Set(report.sourceAccounting.map(({ sourceEntryId }) => sourceEntryId)).size).toBe(6781);
    expect(report.sourceAccounting.filter(({ sourceEntryId }) => sourceEntryId.startsWith("structured-sheet:Weapons:"))).toHaveLength(206);
    expect(report.sourceAccounting.filter(({ sourceEntryId }) => sourceEntryId.startsWith("structured-sheet:Armor:"))).toHaveLength(189);
    expect(report.sourceAccounting.every(({ status }) => ["Imported", "Merged", "Unresolved", "Skipped"].includes(status))).toBe(true);
    expect(report.validationErrors).toEqual([]);
  });

  it("contains deterministic normalized counts and unique source identities", () => {
    expect(items).toHaveLength(5274);
    expect(report.normalizedCounts).toMatchObject({
      uniqueBaseItems: 5274,
      equipmentItems: 2177,
      inventoryItems: 3097,
      weaponProfiles: 206,
      primaryWeaponProfiles: 161,
      improvisedWeaponProfiles: 45,
      armorProfiles: 189,
      dualProfileItems: 1,
      ammunitionItems: 275,
      safeCreatureShells: 36,
      purchaseRelationships: 121,
      unresolvedSourceEntries: 623,
      skippedSourceEntries: 0,
      recordsMissingMechanicalDetail: 4457,
    });
    expect(new Set(items.map(({ key }) => key)).size).toBe(items.length);
    expect(new Set(items.map(({ item }) => item.sourceExternalId)).size).toBe(items.length);
  });

  it("preserves the explicitly approved physical-object merges", () => {
    const named = (name: string) => items.filter(({ item }) => item.name === name);
    const crowbar = named("Crowbar");
    const shovel = named("Shovel");
    const shield = named("Spiked Shield");
    expect(crowbar).toHaveLength(1);
    expect(crowbar[0]).toMatchObject({ item: { catalogSection: "Equipment", category: "Tool" }, weaponProfile: { weaponRole: "Improvised" } });
    expect(shovel).toHaveLength(1);
    expect(shovel[0].weaponProfile?.weaponRole).toBe("Improvised");
    expect(shield).toHaveLength(1);
    expect(shield[0].weaponProfile).not.toBeNull();
    expect(shield[0].armorProfile).not.toBeNull();
    expect(report.reconciliation.exactSemanticMerges.map(({ canonicalName }) => canonicalName)).toEqual(["Crowbar", "Shovel", "Spiked Shield"]);
  });

  it("covers representative catalog families without replacing unknowns with zero", () => {
    expect(items.some(({ weaponProfile }) => weaponProfile?.weaponRole === "Primary")).toBe(true);
    expect(items.some(({ weaponProfile }) => weaponProfile?.weaponCategory === "Firearm")).toBe(true);
    expect(items.some(({ item, weaponProfile }) => item.name === "Laser Cannon" && weaponProfile !== null)).toBe(true);
    expect(items.some(({ armorProfile }) => armorProfile !== null)).toBe(true);
    for (const category of ["Clothing", "Ammunition", "Consumable", "Tool", "Vehicle", "Document", "Currency", "Crafting Material", "Service"]) {
      expect(items.some(({ item }) => item.category === category), category).toBe(true);
    }
    const docOnly = items.find(({ key }) => key === "abacus-for-calculations-renaissance-technology-device");
    expect(docOnly?.item).toMatchObject({ costCredits: null, weight: null });
  });

  it("creates only empty safe Creature shells and explicit Purchase relationships", () => {
    expect(creatures).toHaveLength(36);
    expect(links).toHaveLength(121);
    expect(links.every(({ relationship }) => relationship === "Purchase")).toBe(true);
    expect(creatures.every(({ creature, attributes, attacks }) => creature.hpTotal === null && creature.initiative === null && creature.armorSoak === null && attributes.length === 0 && attacks.length === 0)).toBe(true);
    expect(links.filter(({ creatureKey }) => creatureKey === "horse").map(({ itemKey }) => itemKey)).toEqual(expect.arrayContaining(["horse", "racing-horse", "war-horse"]));
    expect(links.filter(({ creatureKey }) => creatureKey === "domestic-dog").map(({ itemKey }) => itemKey)).toContain("dog-trained");
    expect(report.creatureReview.genericPurchaseEntries.map(({ name }) => name)).toEqual(expect.arrayContaining(["Exotic Pet (Small)", "Exotic Pet (Large)"]));
    expect(report.creatureReview.fantasyAmbiguousCandidates.map(({ name }) => name)).toEqual(expect.arrayContaining(["Dragon", "Giant Wolf"]));
  });

  it("records all three read-only Google sources in the manifest", () => {
    const sources = (manifestJson as unknown as { capturedFromGoogleReadOnly: boolean; sources: Array<{ title: string }> });
    expect(sources.capturedFromGoogleReadOnly).toBe(true);
    expect(sources.sources.map(({ title }) => title)).toEqual([
      "inventories for the program",
      "Lists to be sorted...",
      "items by type still some sorting and adding subtracting",
    ]);
  });
});
