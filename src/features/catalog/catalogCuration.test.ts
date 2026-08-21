import { describe, expect, it } from "vitest";
import curatedJson from "../../../data/serrian-tide-curated-item-catalog.json";
import decisionsJson from "../../../data/serrian-tide-catalog-curation-decisions.json";
import reportJson from "../../../data/serrian-tide-catalog-curation-report.json";
import linksJson from "../../../data/serrian-tide-item-creature-links.json";
import { validateCanonicalItemCompleteness, type CanonicalItemForCompleteness } from "./itemCompleteness";

type CuratedRecord = CanonicalItemForCompleteness & {
  aliases: string[];
  provenance: Array<{ sourceEntryId: string }>;
  item: CanonicalItemForCompleteness["item"] & { sourceExternalId: string; narrativeVariantNotes: string };
  weaponProfile: null | Record<string, unknown>;
  armorProfile: null | Record<string, unknown>;
};

const records = (curatedJson as unknown as { records: CuratedRecord[] }).records;
const report = reportJson as unknown as {
  before: Record<string, number>;
  after: Record<string, number>;
  duplicateAudit: Array<{ classification: string; recordKeys: string[] }>;
  sourceAccounting: Array<{ sourceEntryId: string; status: string }>;
  missingRequired: unknown[];
};
const decisions = (decisionsJson as unknown as { allowedBases: string[]; records: Array<{ itemKey: string; field: string; oldValue: unknown; newValue: unknown; basis: string; referenceItems: string[]; confidence: string; notes: string }> });

const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

describe("second-pass canonical Item curation", () => {
  it("accounts for every source entry and resolves the full review queue", () => {
    expect(report.before).toMatchObject({ itemRecords: 5274, firstPassWeaponProfiles: 206, firstPassArmorProfiles: 189, unresolvedSourceEntries: 623, rawSourceEntries: 6781 });
    expect(report.after).toMatchObject({ itemRecords: records.length, unresolvedSourceEntries: 0, missingRequiredFields: 0, rawSourceEntriesAccounted: 6781 });
    expect(report.sourceAccounting).toHaveLength(6781);
    expect(new Set(report.sourceAccounting.map(({ sourceEntryId }) => sourceEntryId)).size).toBe(6781);
    expect(report.sourceAccounting.every(({ status }) => ["Imported", "Merged", "Skipped"].includes(status))).toBe(true);
  });

  it("has no missing category-aware required fields or non-finite profile values", () => {
    expect(validateCanonicalItemCompleteness(records)).toEqual([]);
    expect(report.missingRequired).toEqual([]);
    for (const record of records) {
      for (const value of [record.item.costCredits, record.item.weight, record.weaponProfile?.damage, record.armorProfile?.soak, record.armorProfile?.encumbrancePenalty]) {
        expect(value === null || value === undefined || Number.isFinite(value as number), `${record.item.name} has a non-finite value`).toBe(true);
      }
    }
  });

  it("keeps one canonical physical object per normalized name and records reviewed outcomes", () => {
    const names = records.map(({ item }) => normalized(item.name));
    expect(new Set(names).size).toBe(names.length);
    expect(report.duplicateAudit.some(({ classification }) => classification === "same")).toBe(true);
    expect(report.duplicateAudit.some(({ classification }) => classification === "different")).toBe(true);
    expect(report.duplicateAudit.every(({ recordKeys }) => recordKeys.length > 1)).toBe(true);
  });

  it("preserves the approved multi-profile objects and expands genuine profile coverage", () => {
    const named = (name: string) => records.find(({ item }) => item.name === name);
    expect(named("Crowbar")?.weaponProfile).toMatchObject({ weaponRole: "Improvised" });
    expect(named("Shovel")?.weaponProfile).toMatchObject({ weaponRole: "Improvised" });
    expect(named("Spiked Shield")?.weaponProfile).not.toBeNull();
    expect(named("Spiked Shield")?.armorProfile).not.toBeNull();
    expect(report.after.weaponProfiles).toBeGreaterThan(206);
    expect(report.after.armorProfiles).toBeGreaterThan(189);
    expect(records.filter(({ item }) => item.category === "Weapon").every(({ weaponProfile }) => weaponProfile !== null)).toBe(true);
    expect(records.filter(({ item }) => item.category === "Armor").every(({ armorProfile }) => armorProfile !== null)).toBe(true);
  });

  it("records every field derivation with an approved basis", () => {
    expect(decisions.records.length).toBeGreaterThan(20_000);
    const itemKeys = new Set(records.map(({ key }) => key));
    for (const row of decisions.records) {
      expect(row.itemKey).toBeTruthy(); expect(row.field).toBeTruthy(); expect(row.newValue).not.toBeUndefined();
      expect(itemKeys.has(row.itemKey), `Unknown decision Item key ${row.itemKey}`).toBe(true);
      expect(decisions.allowedBases).toContain(row.basis); expect(Array.isArray(row.referenceItems)).toBe(true);
      expect(["high", "medium", "low"]).toContain(row.confidence); expect(row.notes).toBeTruthy();
    }
  });

  it("adds useful aliases while retaining the safe Creature purchase policy", () => {
    expect(report.after.aliases).toBeGreaterThan(0);
    expect(records.some(({ aliases }) => aliases.length > 0)).toBe(true);
    const originalLinks = (linksJson as unknown as { records: Array<{ itemKey: string }> }).records;
    expect(originalLinks.map(({ itemKey }) => itemKey)).toEqual(expect.arrayContaining(["horse", "camel", "dog-trained", "cat-pet", "falcon"]));
    expect(originalLinks.map(({ itemKey }) => itemKey)).not.toEqual(expect.arrayContaining(["exotic-pet-small", "exotic-pet-large"]));
    for (const name of ["Horse", "Camel"]) expect(records.find(({ item }) => item.name === name)?.item).toMatchObject({ catalogSection: "Inventory", category: "Mount", weight: null });
    for (const name of ["Dog (Trained)", "Cat (Pet)", "Falcon", "Exotic Pet (Small)", "Exotic Pet (Large)"]) expect(records.find(({ item }) => item.name === name)?.item).toMatchObject({ catalogSection: "Inventory", category: "Animal", weight: null });
  });
});
