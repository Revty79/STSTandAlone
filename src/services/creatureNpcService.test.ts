import { describe, expect, it, vi } from "vitest";
import type { CharacterAuthorizedItem } from "../types/character";
import type { CreatureAggregate } from "../types/creature";
import type { CreatureNpcAggregate } from "../types/creatureNpc";
import type { CreatureNpcRepository } from "../data/repositories/creatureNpcRepository";
import {
  CreatureNpcService,
  CreatureNpcValidationError,
  creatureNpcAggregateToDraft,
  creatureTemplateSnapshot,
} from "./creatureNpcService";

function goblin(): CreatureAggregate {
  return {
    id: 7,
    core: {
      id: 7,
      canonicalId: "CREATURE-GOBLIN",
      canonicalName: "Goblin",
      family: "Goblinoid",
      creatureType: "Humanoid Creature",
      size: "Small",
      challengeRating: 2,
      killXp: 2,
      parentCreatureId: null,
      parentCreatureName: null,
      calculatedChallengeRating: 2,
      challengeRatingAdjustment: 0,
      challengeRatingAdjustmentReason: "",
      description: "A quick, sharp-eyed scavenger.",
      typicalBehavior: "Uses numbers and ambushes.",
      habitatEcology: "Ruins and cave networks.",
      notes: "Master notes",
      createdByUserId: 1,
      sourceSystem: "Serrian Tide",
      createdAt: "2026-08-24 00:00:00",
      updatedAt: "2026-08-24 00:00:00",
    },
    attributes: [{ attributeKey: "Strength", value: 7, notes: "", sortOrder: 0 }],
    movement: [{ movementMode: "Land", movementValue: 8, initiative: 12, requirements: "", notes: "", sortOrder: 0 }],
    hpPools: [{ canonicalId: "HP-TORSO", poolName: "Torso", hpPercentage: 40, notes: "", sortOrder: 0 }],
    hitLocations: [{ hitLocationNumber: 9, locationName: "Chest", bodyPartsIncluded: "Chest and torso", hpPoolCanonicalId: "HP-TORSO", naturalArmor: 1, soak: 2, locationEffect: "", notes: "", sortOrder: 0 }],
    attacks: [{ canonicalId: "ATK-KNIFE", attackName: "Jagged Knife", attackPercentage: 58, damage: "1d6", damageType: "Piercing", rangeReach: "Melee", requiredAnatomy: "Hand", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: 0 }],
    skillLinks: [{ skillId: 3, skillName: "Sneak", skillClassification: "standard", rank: "4", notes: "", sortOrder: 0 }],
    abilities: [{ canonicalId: "ABILITY-DARKSIGHT", abilityName: "Darksight", abilityType: "Natural", activation: "Passive", requirements: "", usesRecharge: "", description: "Sees in darkness.", mechanicalEffect: "", notes: "", sortOrder: 0, crImpact: "Minor" }],
    defenses: [{ seedIdentity: "DEF-GOBLIN", defenseType: "Soak", against: "Physical", value: "2", notes: "", sortOrder: 0, crImpact: "Minor" }],
    uses: [{ seedIdentity: "USE-GOBLIN", useName: "Skirmisher", notes: "", sortOrder: 0 }],
    derivedCreatures: [{ id: 8, canonicalId: "CREATURE-GOBLIN-SCOUT", canonicalName: "Goblin Scout", size: "Small", challengeRating: 3, killXp: 3 }],
  };
}

const sword: CharacterAuthorizedItem = {
  id: 11,
  canonicalId: "ITEM-SHORT-SWORD",
  name: "Short Sword",
  catalogScope: "Equipment",
  equipmentGroup: "Weapons",
  recordType: "Weapon",
  category: "Melee",
  credits: 25,
  priceBasis: "Each",
  description: "",
  weight: 2,
  weightUnit: "lb",
  size: "Small",
  durability: 10,
  weaponType: "Sword",
  handedness: "One-handed",
  damage: "1d8",
  damageType: "Slashing",
  rangeText: null,
  reachText: "Melee",
  weaponRulesText: null,
  armorType: null,
  coverage: null,
  baseSoak: null,
  armorDamageModifiers: null,
  armorRulesText: null,
};

function individual(): CreatureNpcAggregate {
  const snapshot = creatureTemplateSnapshot(goblin());
  return {
    core: {
      id: 41,
      campaignId: 5,
      campaignName: "The Broken Moon",
      controllerUserId: 1,
      name: "New Goblin NPC",
      creatureId: 7,
      creatureCanonicalId: "CREATURE-GOBLIN",
      creatureName: "Goblin",
      createdAt: "2026-08-24 00:00:00",
      updatedAt: "2026-08-24 00:00:00",
    },
    profile: {
      personality: "",
      instanceNotes: "",
      hpAdjustment: 0,
      baselineSnapshot: snapshot,
      currentSnapshot: snapshot,
    },
    items: [],
    authorizedItems: [sword],
  };
}

function repository(result: CreatureNpcAggregate) {
  return {
    getCreatureNpc: vi.fn().mockResolvedValue(result),
    createCreatureNpc: vi.fn().mockResolvedValue(result),
    saveCreatureNpc: vi.fn().mockResolvedValue(result),
  } satisfies CreatureNpcRepository;
}

describe("Creature NPC service", () => {
  it("copies the complete Creature baseline without retaining its child lineage", () => {
    const master = goblin();
    const snapshot = creatureTemplateSnapshot(master);

    expect(snapshot).toMatchObject({
      id: 7,
      core: { canonicalName: "Goblin" },
      attributes: [{ value: 7 }],
      movement: [{ movementMode: "Land" }],
      attacks: [{ attackName: "Jagged Knife" }],
      defenses: [{ defenseType: "Soak" }],
    });
    expect(snapshot.derivedCreatures).toEqual([]);

    snapshot.attributes[0]!.value = 20;
    snapshot.attacks[0]!.attackName = "Grik's Knife";
    expect(master.attributes[0]!.value).toBe(7);
    expect(master.attacks[0]!.attackName).toBe("Jagged Knife");
  });

  it("creates an individual from the selected master Creature snapshot", async () => {
    const result = individual();
    const mockRepository = repository(result);
    const service = new CreatureNpcService(mockRepository);

    await expect(service.createCreatureNpc(5, 1, goblin())).resolves.toBe(result);
    const input = mockRepository.createCreatureNpc.mock.calls[0]![0];
    const snapshot = JSON.parse(input.templateSnapshotJson);
    expect(input).toMatchObject({ campaignId: 5, requestingUserId: 1, creatureId: 7 });
    expect(snapshot).toMatchObject({
      core: { canonicalId: "CREATURE-GOBLIN", canonicalName: "Goblin" },
      movement: [{ initiative: 12 }],
      hitLocations: [{ locationName: "Chest", soak: 2 }],
      abilities: [{ abilityName: "Darksight" }],
    });
  });

  it("saves individual overrides and only Campaign-authorized possessions", async () => {
    const result = individual();
    const mockRepository = repository(result);
    const service = new CreatureNpcService(mockRepository);
    const draft = creatureNpcAggregateToDraft(result);
    draft.name = "Grik One-Eye";
    draft.personality = "Suspicious but loyal.";
    draft.hpAdjustment = 6;
    draft.creature.attributes[0]!.value = 9;
    draft.creature.attacks[0]!.attackName = "One-Eye's Knife";
    draft.items = [{ itemId: 11, quantity: 2 }];

    await service.saveCreatureNpc(result, draft, 1);
    const input = mockRepository.saveCreatureNpc.mock.calls[0]![0];
    const savedSnapshot = JSON.parse(input.currentSnapshotJson);
    expect(input).toMatchObject({
      characterId: 41,
      campaignId: 5,
      name: "Grik One-Eye",
      personality: "Suspicious but loyal.",
      hpAdjustment: 6,
      items: [{ itemId: 11, quantity: 2 }],
    });
    expect(savedSnapshot.core.canonicalName).toBe("Goblin");
    expect(savedSnapshot.attributes[0].value).toBe(9);
    expect(savedSnapshot.attacks[0].attackName).toBe("One-Eye's Knife");
    expect(result.profile.baselineSnapshot.attributes[0]!.value).toBe(7);
  });

  it("rejects changing the master identity or adding an unauthorized Item", async () => {
    const result = individual();
    const service = new CreatureNpcService(repository(result));
    const changedTemplate = creatureNpcAggregateToDraft(result);
    changedTemplate.creature.core.canonicalId = "CREATURE-DRAGON";
    await expect(service.saveCreatureNpc(result, changedTemplate, 1)).rejects.toThrow(CreatureNpcValidationError);

    const unauthorizedItem = creatureNpcAggregateToDraft(result);
    unauthorizedItem.items = [{ itemId: 99, quantity: 1 }];
    await expect(service.saveCreatureNpc(result, unauthorizedItem, 1)).rejects.toThrow(/Campaign-authorized/);
  });
});
