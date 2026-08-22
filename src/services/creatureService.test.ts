import { describe, expect, it } from "vitest";
import type { SaveCreatureAggregate } from "../types/creature";
import { CreatureValidationError, normalizeCreatureAggregate } from "./creatureService";

function draft(): SaveCreatureAggregate {
  return {
    core: { canonicalId: " CR-TEST ", canonicalName: " Test Creature ", family: " Test ", creatureType: "Animal", size: "Medium", challengeRating: null, killXp: 0, description: "", typicalBehavior: "", habitatEcology: "", notes: " PROPOSED ", createdByUserId: 1, sourceSystem: null },
    variants: [{ canonicalId: "VAR-TEST", variantName: "Form", variantType: "Biological", sizeOverride: null, challengeRatingOverride: null, killXpOverride: null, description: "", notes: "", sortOrder: 0 }],
    attributes: [{ variantCanonicalId: null, attributeKey: "Strength", value: 0, notes: "", sortOrder: 0 }],
    movement: [{ variantCanonicalId: null, movementMode: "Land", movementValue: 0, initiative: null, requirements: "", notes: "", sortOrder: 0 }],
    hpPools: [{ canonicalId: "HP-TEST", variantCanonicalId: null, poolName: "Body", hpPercentage: 100, notes: "", sortOrder: 0 }],
    hitLocations: [{ variantCanonicalId: null, hitLocationNumber: 0, locationName: "Body", bodyPartsIncluded: "Body", hpPoolCanonicalId: "HP-TEST", naturalArmor: null, soak: 0, locationEffect: "", notes: "", sortOrder: 0 }],
    attacks: [{ canonicalId: "ATK-TEST", variantCanonicalId: null, attackName: "Bite", attackPercentage: 50, damage: null, damageType: "Piercing", rangeReach: "Short", requiredAnatomy: "Jaws", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: 0 }],
    skillLinks: [{ variantCanonicalId: null, skillId: 7, skillName: "Tracking", skillClassification: "standard", rank: null, notes: "", sortOrder: 0 }],
    abilities: [], defenses: [], uses: [],
  };
}

describe("CreatureService validation", () => {
  it("preserves null separately from explicit zero throughout the aggregate", () => {
    const normalized = normalizeCreatureAggregate(draft());
    expect(normalized.core.challengeRating).toBeNull();
    expect(normalized.core.killXp).toBe(0);
    expect(normalized.attributes[0]?.value).toBe(0);
    expect(normalized.movement[0]).toMatchObject({ movementValue: 0, initiative: null });
    expect(normalized.hitLocations[0]).toMatchObject({ naturalArmor: null, soak: 0 });
    expect(normalized.attacks[0]?.damage).toBeNull();
    expect(normalized.core.notes).toBe("PROPOSED");
  });

  it("keeps blank Variant overrides as inheritance rather than copied base values", () => {
    expect(normalizeCreatureAggregate(draft()).variants[0]).toMatchObject({ sizeOverride: null, challengeRatingOverride: null, killXpOverride: null });
  });

  it("rejects competing Size values and out-of-range hit locations", () => {
    const invalidSize = draft();
    invalidSize.core.size = "Average" as never;
    expect(() => normalizeCreatureAggregate(invalidSize)).toThrow(/shared|must be one of|Creature Size/i);
    const invalidHit = draft();
    invalidHit.hitLocations[0]!.hitLocationNumber = 10;
    expect(() => normalizeCreatureAggregate(invalidHit)).toThrow(/0 through 9/i);
  });

  it("rejects orphan Variant and HP Pool references without inventing replacements", () => {
    const missingVariant = draft();
    missingVariant.attacks[0]!.variantCanonicalId = "VAR-MISSING";
    expect(() => normalizeCreatureAggregate(missingVariant)).toThrow(/missing Variant/i);
    const missingPool = draft();
    missingPool.hitLocations[0]!.hpPoolCanonicalId = "HP-MISSING";
    expect(() => normalizeCreatureAggregate(missingPool)).toThrow(/missing HP Pool/i);
  });

  it("requires Creature Skill links to point at saved Skill identities", () => {
    const invalid = draft();
    invalid.skillLinks[0]!.skillId = 0;
    expect(() => normalizeCreatureAggregate(invalid)).toThrow(CreatureValidationError);
  });
});
