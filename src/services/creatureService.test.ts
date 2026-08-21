import { describe, expect, it } from "vitest";
import type { SaveCreatureAggregate } from "../types/creature";
import { CreatureValidationError, normalizeCreature } from "./creatureService";

function draft(): SaveCreatureAggregate {
  return {
    core: {
      name: " Archive Beast ", challengeRating: null, encounterScale: " Small ", type: " Animal ", role: " Scout ", size: " Medium ", descriptionShort: " Shell ",
      hpTotal: null, initiative: 0, armorSoak: null, magicResonanceInteraction: " None ", behaviorTactics: " Observe ", habitat: " Plains ", diet: " Omnivore ",
      lootHarvest: " None ", storyHooks: " ", notes: " ", createdByUserId: 1, sourceSystem: null, sourceExternalId: null,
    },
    altNames: [{ altName: " Watcher ", sortOrder: 8 }],
    genreTags: [{ genreTag: " Fantasy ", sortOrder: 7 }],
    attributes: [{ attributeKey: " ENERGON ", value: 6, notes: " Module attribute ", sortOrder: 9 }],
    movementModes: [{ movementMode: " Hover ", baseValue: 0, notes: " Stationary ", sortOrder: 4 }],
    hpLocations: [{ locationName: " Core ", hpValue: 0, notes: " Explicit zero ", sortOrder: 4 }],
    attacks: [
      { name: " Unknown Bite ", damage: null, rangeText: " Melee ", effect: " ", notes: " ", sortOrder: 3 },
      { name: " Warning Tap ", damage: 0, rangeText: " Melee ", effect: " ", notes: " ", sortOrder: 5 },
    ],
    skillLinks: [
      { skillId: 1, skillName: " Tracking ", skillClassification: " standard ", linkType: " Skill ", value: null, notes: " ", sortOrder: 4 },
      { skillId: 2, skillName: " Keen Scent ", skillClassification: " special ability ", linkType: " Granted ", value: 0, notes: " ", sortOrder: 8 },
    ],
    uses: [{ useType: " Companion ", notes: " Not a purchase rule ", sortOrder: 4 }],
    variants: [{ name: " Pale ", description: " Pale coat ", notes: " ", sortOrder: 4 }],
    purchaseItemLinks: [{ itemId: 3, itemName: " Trained Listing ", costCredits: null, category: " Animal ", subtype: " ", genreTags: [], relationship: " Purchase ", notes: " " }],
  };
}

describe("Creature rules", () => {
  it("accepts flexible attributes and preserves nullable and explicit-zero mechanics", () => {
    const result = normalizeCreature(draft());
    expect(result.core).toMatchObject({ name: "Archive Beast", hpTotal: null, initiative: 0 });
    expect(result.attributes).toEqual([{ attributeKey: "ENERGON", value: 6, notes: "Module attribute", sortOrder: 0 }]);
    expect(result.movementModes[0]).toMatchObject({ movementMode: "Hover", baseValue: 0 });
    expect(result.attacks.map(({ damage }) => damage)).toEqual([null, 0]);
    expect(result.skillLinks.map(({ linkType, value }) => ({ linkType, value }))).toEqual([{ linkType: "Skill", value: null }, { linkType: "Granted", value: 0 }]);
  });

  it("rejects duplicate attributes and non-Special Ability Granted links", () => {
    const duplicate = draft(); duplicate.attributes.push({ attributeKey: "energon", value: 7, notes: "", sortOrder: 10 });
    expect(() => normalizeCreature(duplicate)).toThrow(CreatureValidationError);
    const invalidGrant = draft(); invalidGrant.skillLinks[1].skillClassification = "standard";
    expect(() => normalizeCreature(invalidGrant)).toThrow(/Special Ability/i);
  });

  it("does not treat Creature Uses as purchase availability", () => {
    const result = normalizeCreature(draft());
    result.purchaseItemLinks = [];
    expect(result.uses).toEqual([{ useType: "Companion", notes: "Not a purchase rule", sortOrder: 0 }]);
    expect(result.purchaseItemLinks).toEqual([]);
  });
});
