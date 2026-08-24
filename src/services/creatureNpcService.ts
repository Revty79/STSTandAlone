import {
  creatureNpcRepository,
  type CreatureNpcRepository,
} from "../data/repositories/creatureNpcRepository";
import type { CreatureAggregate, SaveCreatureAggregate } from "../types/creature";
import type {
  CreatureNpcAggregate,
  CreatureNpcDraft,
  SaveCreatureNpc,
} from "../types/creatureNpc";

export class CreatureNpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatureNpcValidationError";
  }
}

function savedId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CreatureNpcValidationError(`${label} must reference a saved record.`);
  }
  return value;
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new CreatureNpcValidationError(`${label} is required.`);
  return result;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new CreatureNpcValidationError(`${label} must be a number.`);
  return value;
}

function cloneSnapshot(snapshot: SaveCreatureAggregate): SaveCreatureAggregate {
  return JSON.parse(JSON.stringify(snapshot)) as SaveCreatureAggregate;
}

export function creatureTemplateSnapshot(aggregate: CreatureAggregate): SaveCreatureAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.core;
  return cloneSnapshot({
    id: aggregate.id,
    core,
    attributes: aggregate.attributes,
    movement: aggregate.movement,
    hpPools: aggregate.hpPools,
    hitLocations: aggregate.hitLocations,
    attacks: aggregate.attacks,
    skillLinks: aggregate.skillLinks,
    abilities: aggregate.abilities,
    defenses: aggregate.defenses,
    uses: aggregate.uses,
    derivedCreatures: [],
  });
}

export function creatureNpcAggregateToDraft(aggregate: CreatureNpcAggregate): CreatureNpcDraft {
  return {
    name: aggregate.core.name,
    personality: aggregate.profile.personality,
    instanceNotes: aggregate.profile.instanceNotes,
    hpAdjustment: aggregate.profile.hpAdjustment,
    creature: cloneSnapshot(aggregate.profile.currentSnapshot),
    items: aggregate.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
  };
}

function normalizeSnapshot(
  snapshot: SaveCreatureAggregate,
  baseline: SaveCreatureAggregate,
): SaveCreatureAggregate {
  if (snapshot.core.canonicalId !== baseline.core.canonicalId) {
    throw new CreatureNpcValidationError("The Creature template identity cannot be changed on an NPC.");
  }
  const normalized = cloneSnapshot(snapshot);
  normalized.core = {
    ...normalized.core,
    canonicalId: baseline.core.canonicalId,
    canonicalName: baseline.core.canonicalName,
    parentCreatureId: baseline.core.parentCreatureId,
    parentCreatureName: baseline.core.parentCreatureName,
    createdByUserId: baseline.core.createdByUserId,
    sourceSystem: baseline.core.sourceSystem,
    family: normalized.core.family.trim(),
    creatureType: normalized.core.creatureType.trim(),
    description: normalized.core.description.trim(),
    typicalBehavior: normalized.core.typicalBehavior.trim(),
    habitatEcology: normalized.core.habitatEcology.trim(),
    notes: normalized.core.notes.trim(),
  };
  const unique = (values: string[], label: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      const key = required(value, label).toLocaleLowerCase();
      if (seen.has(key)) throw new CreatureNpcValidationError(`${label} cannot be duplicated.`);
      seen.add(key);
    }
  };
  unique(normalized.attributes.map((row) => row.attributeKey), "Attribute");
  unique(normalized.movement.map((row) => row.movementMode), "Movement Mode");
  unique(normalized.hpPools.map((row) => row.canonicalId), "HP Pool ID");
  unique(normalized.attacks.map((row) => row.canonicalId), "Attack ID");
  unique(normalized.abilities.map((row) => row.canonicalId), "Ability ID");
  normalized.attacks.forEach((row) => required(row.attackName, "Attack Name"));
  normalized.abilities.forEach((row) => required(row.abilityName, "Ability Name"));
  normalized.defenses.forEach((row) => required(row.defenseType, "Defense Type"));
  normalized.uses.forEach((row) => required(row.useName, "Use Name"));
  normalized.derivedCreatures = [];
  return normalized;
}

export class CreatureNpcService {
  constructor(private readonly repository: CreatureNpcRepository = creatureNpcRepository) {}

  getCreatureNpc(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CreatureNpcAggregate | null> {
    return this.repository.getCreatureNpc(
      savedId(characterId, "Creature NPC"),
      savedId(campaignId, "Campaign"),
      savedId(requestingUserId, "G.O.D. Profile"),
    );
  }

  async createCreatureNpc(
    campaignId: number,
    requestingUserId: number,
    creature: CreatureAggregate,
  ): Promise<CreatureNpcAggregate> {
    const snapshot = creatureTemplateSnapshot(creature);
    return this.repository.createCreatureNpc({
      campaignId: savedId(campaignId, "Campaign"),
      requestingUserId: savedId(requestingUserId, "G.O.D. Profile"),
      creatureId: savedId(creature.id, "Creature Template"),
      templateSnapshotJson: JSON.stringify(snapshot),
    });
  }

  async saveCreatureNpc(
    aggregate: CreatureNpcAggregate,
    draft: CreatureNpcDraft,
    requestingUserId: number,
  ): Promise<CreatureNpcAggregate> {
    const authorizedIds = new Set(aggregate.authorizedItems.map((item) => item.id));
    const seenItems = new Set<number>();
    const items = draft.items.map((item) => {
      const itemId = savedId(item.itemId, "Creature NPC Item");
      if (!authorizedIds.has(itemId)) {
        throw new CreatureNpcValidationError("Creature NPC inventory must use Campaign-authorized Items.");
      }
      if (seenItems.has(itemId)) {
        throw new CreatureNpcValidationError("An Item can only appear once in Creature NPC inventory.");
      }
      seenItems.add(itemId);
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new CreatureNpcValidationError("Creature NPC Item quantity must be a positive whole number.");
      }
      return { itemId, quantity: item.quantity };
    });
    const currentSnapshot = normalizeSnapshot(
      draft.creature,
      aggregate.profile.baselineSnapshot,
    );
    const input: SaveCreatureNpc = {
      characterId: savedId(aggregate.core.id, "Creature NPC"),
      campaignId: savedId(aggregate.core.campaignId, "Campaign"),
      requestingUserId: savedId(requestingUserId, "G.O.D. Profile"),
      name: required(draft.name, "Creature NPC Name"),
      personality: draft.personality.trim(),
      instanceNotes: draft.instanceNotes.trim(),
      hpAdjustment: finite(draft.hpAdjustment, "HP Adjustment"),
      currentSnapshotJson: JSON.stringify(currentSnapshot),
      items,
    };
    return this.repository.saveCreatureNpc(input);
  }
}

export const creatureNpcService = new CreatureNpcService();
