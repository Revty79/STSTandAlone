import { describe, expect, it } from "vitest";
import type { ChallengeRatingReference, SaveCreatureAggregate } from "../types/creature";
import { CreatureValidationError, normalizeCreatureAggregate } from "./creatureService";

function draft(): SaveCreatureAggregate {
  return {
    core: {
      canonicalId: " CR-TEST ", canonicalName: " Test Creature ", family: " Test ", creatureType: "Animal",
      size: "Medium", challengeRating: 1, killXp: 1, parentCreatureId: null, parentCreatureName: null,
      calculatedChallengeRating: 1, challengeRatingAdjustment: 0, challengeRatingAdjustmentReason: "",
      description: "", typicalBehavior: "", habitatEcology: "", notes: " Note ",
      createdByUserId: 1, sourceSystem: null,
    },
    attributes: [{ attributeKey: "Strength", value: 0, notes: "", sortOrder: 0 }],
    movement: [{ movementMode: "Land", movementValue: 0, initiative: null, requirements: "", notes: "", sortOrder: 0 }],
    hpPools: [{ canonicalId: "HP-TEST", poolName: "Body", hpPercentage: 100, notes: "", sortOrder: 0 }],
    hitLocations: [{ hitLocationNumber: 0, locationName: "Body", bodyPartsIncluded: "Body", hpPoolCanonicalId: "HP-TEST", naturalArmor: null, soak: 0, locationEffect: "", notes: "", sortOrder: 0 }],
    attacks: [{ canonicalId: "ATK-TEST", attackName: "Bite", attackPercentage: 90, damage: "1", damageType: "Piercing", rangeReach: "Short", requiredAnatomy: "Jaws", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: 0 }],
    skillLinks: [{ skillId: 7, skillName: "Tracking", skillClassification: "standard", rank: null, notes: "", sortOrder: 0 }],
    abilities: [], defenses: [], uses: [], derivedCreatures: [],
  };
}

const references: ChallengeRatingReference[] = Array.from({ length: 50 }, (_, index) => {
  const challengeRating = index + 1;
  return {
    challengeRating,
    threatBand: "Test",
    attackTargetGuidance: `${96 - challengeRating} to ${91 - challengeRating}`,
    damageGuidance: `${challengeRating} to ${challengeRating + 1}`,
    initiativeGuidance: `${challengeRating * 2} to ${challengeRating * 2 + 5}`,
    soakGuidance: `${Math.floor(challengeRating / 3)} to ${Math.floor(challengeRating / 3) + 1}`,
    hpToughnessGuidance: "Test",
    killXp: challengeRating,
    currentCreatureExample: "",
    exampleNotes: "",
  };
});
describe("CreatureService validation", () => {
  it("preserves null separately from explicit zero in optional mechanics", () => {
    const normalized = normalizeCreatureAggregate(draft());
    expect(normalized.attributes[0]?.value).toBe(0);
    expect(normalized.movement[0]).toMatchObject({ movementValue: 0, initiative: null });
    expect(normalized.hitLocations[0]).toMatchObject({ naturalArmor: null, soak: 0 });
    expect(normalized.core.notes).toBe("Note");
  });

  it("calculates CR and Kill XP from structured mechanics", () => {
    const normalized = normalizeCreatureAggregate(draft(), references);
    expect(normalized.core.calculatedChallengeRating).toBe(normalized.core.challengeRating);
    expect(normalized.core.killXp).toBe(normalized.core.challengeRating);
    expect(normalized.core.challengeRating).toBeGreaterThanOrEqual(1);
  });

  it("requires a reason for a G.O.D. CR adjustment", () => {
    const invalid = draft();
    invalid.core.challengeRatingAdjustment = 4;
    expect(() => normalizeCreatureAggregate(invalid, references)).toThrow(/requires a reason/i);
    invalid.core.challengeRatingAdjustmentReason = "Regenerates after apparent death.";
    expect(normalizeCreatureAggregate(invalid, references).core.challengeRating).toBeGreaterThan(1);
  });

  it("rejects competing Size values and out-of-range hit locations", () => {
    const invalidSize = draft();
    invalidSize.core.size = "Average" as never;
    expect(() => normalizeCreatureAggregate(invalidSize)).toThrow(/shared|must be one of|Creature Size/i);
    const invalidHit = draft();
    invalidHit.hitLocations[0]!.hitLocationNumber = 10;
    expect(() => normalizeCreatureAggregate(invalidHit)).toThrow(/0 through 9/i);
  });

  it("rejects missing HP Pools without inventing replacements", () => {
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
