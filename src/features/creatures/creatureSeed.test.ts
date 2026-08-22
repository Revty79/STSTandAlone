import { describe, expect, it } from "vitest";
import seedJson from "../../../data/serrian-tide-creature-seed.json";
import reportJson from "../../../data/serrian-tide-creature-import-report.json";
import { isSize, SIZE_OPTIONS } from "../../data/sizeOptions";

const seed = seedJson as unknown as {
  sourceSystem: string;
  counts: Record<string, number>;
  challengeReference: Array<{ challengeRating: number; killXp: number | null }>;
  creatures: Array<{
    core: { canonicalId: string; canonicalName: string; size: string; challengeRating: number; killXp: number; notes: string };
    attributes: Array<{ attributeKey: string; value: number | null; variantCanonicalId: string | null }>;
    movement: Array<{ movementMode: string; movementValue: number | null; initiative: number | null }>;
    hpPools: Array<{ canonicalId: string }>;
    hitLocations: Array<{ hitLocationNumber: number; hpPoolCanonicalId: string | null; naturalArmor: number | null; soak: number | null }>;
    attacks: Array<{ canonicalId: string; damage: string | null }>;
    skillLinks: Array<{ skillName: string; skillExternalId: string }>;
    abilities: Array<{ canonicalId: string; notes: string }>;
    variants: Array<{ canonicalId: string; sizeOverride: string | null; challengeRatingOverride: number | null; killXpOverride: number | null }>;
    provenance: { canonicalName: string };
  }>;
};
const report = reportJson as unknown as { validation: Record<string, number>; nullZeroAudit: Record<string, { null?: number; zero?: number }>; proposedForReviewRecordCount: number };

describe("canonical Creature seed", () => {
  it("preserves the complete normalized starter catalog and CR reference", () => {
    expect(seed.sourceSystem).toBe("serrian-tide-creature-canon");
    expect(seed.counts).toEqual({ creatures: 85, challengeRatings: 50, attributes: 510, movement: 124, hpPools: 528, hitLocations: 800, attacks: 158, skillLinks: 0, abilities: 45, defenses: 23, uses: 27, variants: 3, provenance: 85 });
    expect(seed.creatures).toHaveLength(85);
    expect(seed.challengeReference.map((row) => row.challengeRating)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(new Set(seed.creatures.map((row) => row.core.canonicalId)).size).toBe(85);
    expect(seed.creatures.every((row) => isSize(row.core.size))).toBe(true);
    expect(SIZE_OPTIONS).toEqual(["Minuscule", "Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"]);
    expect(Object.values(report.validation).every((count) => count === 0)).toBe(true);
  });

  it("keeps base values, mode-specific Initiative, and shared HP Pool relationships", () => {
    const horse = seed.creatures.find((row) => row.core.canonicalId === "CR-HORSE");
    expect(horse?.core).toMatchObject({ canonicalName: "Horse", size: "Large", challengeRating: 8, killXp: 3 });
    expect(horse?.attributes.find((row) => row.attributeKey === "Strength")).toMatchObject({ value: 45, variantCanonicalId: null });
    expect(horse?.movement).toContainEqual(expect.objectContaining({ movementMode: "Land", movementValue: 5, initiative: 35 }));
    expect(new Set(horse?.hitLocations.map((row) => row.hpPoolCanonicalId)).size).toBeLessThan(horse?.hitLocations.length ?? 0);
    expect(horse?.hitLocations.every((row) => row.hitLocationNumber >= 0 && row.hitLocationNumber <= 9)).toBe(true);
  });

  it("preserves blank numbers separately from explicit zero and keeps review notes", () => {
    expect(report.nullZeroAudit.naturalArmor).toEqual({ null: 30, zero: 500 });
    expect(report.nullZeroAudit.soak).toEqual({ null: 30, zero: 590 });
    expect(report.nullZeroAudit.movementValue).toEqual({ null: 0, zero: 1 });
    expect(report.nullZeroAudit.attackDamage).toEqual({ null: 13 });
    expect(report.proposedForReviewRecordCount).toBeGreaterThan(0);
    const airNeedleEquivalent = seed.creatures.flatMap((row) => row.attacks).find((row) => row.damage === null);
    expect(airNeedleEquivalent?.damage).toBeNull();
    expect(seed.creatures.some((row) => row.core.notes.includes("PROPOSED FOR REVIEW"))).toBe(true);
  });

  it("uses blank Variant IDs as base data and nullable override inheritance", () => {
    const attributes = seed.creatures.flatMap((row) => row.attributes);
    expect(attributes.every((row) => row.variantCanonicalId === null)).toBe(true);
    const variants = seed.creatures.flatMap((row) => row.variants);
    expect(variants).toHaveLength(3);
    expect(variants.every((row) => row.sizeOverride === null && row.challengeRatingOverride === null && row.killXpOverride === null)).toBe(true);
    expect(variants.map((row) => row.canonicalId)).toContain("VAR-HORSE-DRAFT");
  });

  it("does not invent Creature Skills while retaining the canonical Skill relationship slot", () => {
    expect(seed.creatures.flatMap((row) => row.skillLinks)).toEqual([]);
    expect(seed.counts.skillLinks).toBe(0);
  });
});
