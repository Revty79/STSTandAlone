import { describe, expect, it } from "vitest";
import { newCreatureDraft } from "../../pages/CreaturesPage";
import type { ChallengeRatingReference } from "../../types/creature";
import { calculateCreatureChallengeRating } from "./challengeRating";

const references: ChallengeRatingReference[] = Array.from({ length: 50 }, (_, index) => {
  const challengeRating = index + 1;
  return {
    challengeRating,
    threatBand: "Test",
    attackTargetGuidance: `${101 - challengeRating} to ${96 - challengeRating}`,
    damageGuidance: `${challengeRating}–${challengeRating + 2}`,
    initiativeGuidance: `${challengeRating * 2}–${challengeRating * 2 + 4}`,
    soakGuidance: `${challengeRating - 1}–${challengeRating}`,
    hpToughnessGuidance: "Test",
    killXp: challengeRating * 2,
    currentCreatureExample: "",
    exampleNotes: "",
  };
});

describe("Creature Challenge Rating v1", () => {
  it("derives offense, final CR, and Kill XP from structured mechanics", () => {
    const creature = newCreatureDraft(1);
    creature.attacks.push({ canonicalId: "ATK-TEST", attackName: "Strike", attackPercentage: 91, damage: "10", damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: 0 });
    const result = calculateCreatureChallengeRating(creature, references);
    expect(result.accuracyRating).not.toBeNull();
    expect(result.damageRating).not.toBeNull();
    expect(result.finalRating).toBe(result.calculatedRating);
    expect(result.killXp).toBe(result.finalRating * 2);
  });

  it("includes explicit ability and defense impact without reading prose", () => {
    const creature = newCreatureDraft(1);
    creature.abilities.push({ canonicalId: "ABL-TEST", abilityName: "Reality Break", abilityType: "", activation: "Active", requirements: "", usesRecharge: "", description: "Arbitrary prose does not determine CR.", mechanicalEffect: "", notes: "", sortOrder: 0, crImpact: "Extreme" });
    creature.defenses.push({ seedIdentity: null, defenseType: "Immunity", against: "Mundane attacks", value: null, notes: "", sortOrder: 0, crImpact: "Major" });
    const result = calculateCreatureChallengeRating(creature, references);
    expect(result.specialImpact).toBe(16);
    expect(result.calculatedRating).toBe(17);
  });

  it("does not double-count Natural Armor and Soak on the same hit location", () => {
    const creature = newCreatureDraft(1);
    creature.hitLocations.push({
      hitLocationNumber: 0,
      locationName: "Body",
      bodyPartsIncluded: "Body",
      hpPoolCanonicalId: null,
      naturalArmor: 8,
      soak: 8,
      locationEffect: "",
      notes: "",
      sortOrder: 0,
    });
    const result = calculateCreatureChallengeRating(creature, references);
    expect(result.defenseRating).toBeLessThan(16);
  });

  it("supports a documented G.O.D. adjustment and caps the scale at 50", () => {
    const creature = newCreatureDraft(1);
    creature.core.challengeRatingAdjustment = 49;
    creature.core.challengeRatingAdjustmentReason = "Unique campaign-level threat.";
    const result = calculateCreatureChallengeRating(creature, references);
    expect(result.finalRating).toBe(50);
    expect(result.killXp).toBe(100);
  });
});
