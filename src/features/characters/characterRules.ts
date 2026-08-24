import type { CampaignSystemOption } from "../../types/campaign";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterSkillAllocationDraft,
  type CharacterSkillAllocationInput,
  type CharacterSkillReference,
} from "../../types/character";
import type { RaceAggregate } from "../../types/race";

const EPSILON = 0.000_001;

export function getAttributeModifier(score: number): number {
  if (score <= 1) return -5;
  if (score <= 5) return -4;
  if (score <= 10) return -3;
  if (score <= 15) return -2;
  if (score <= 20) return -1;
  if (score <= 29) return 0;
  return 1 + Math.floor((score - 30) / 5);
}

export function getAttributeRollTarget(score: number): number {
  return 100 - score;
}

export function getCharacterHp(constitution: number): number {
  return constitution * 2 + getAttributeModifier(constitution);
}

export function getBaseInitiative(dexterity: number): number {
  return dexterity < 5 ? 1 : 1 + Math.floor(dexterity / 5);
}

export function getMovementInitiative(
  dexterity: number,
  movementModeBaseValue: number,
): number {
  return getBaseInitiative(dexterity) * movementModeBaseValue;
}

export function normalizeSkillAttributeKey(
  value: string | null,
): CharacterAttributeKey | null {
  const key = value?.trim().toUpperCase();
  if (key === "CHA") return "CHR";
  return CHARACTER_ATTRIBUTE_KEYS.includes(key as CharacterAttributeKey)
    ? key as CharacterAttributeKey
    : null;
}

export function getSkillRank(
  pointsInvested: number,
  attributeModifier: number,
  parentRank: number | null,
  tier: number | null,
): number {
  return tier !== null && tier > 1
    ? (parentRank ?? 0) + pointsInvested
    : pointsInvested + attributeModifier;
}

export function getSkillRollTarget(
  attributeScore: number,
  skillRank: number,
): number {
  return 100 - (attributeScore + skillRank);
}

export function getAttributePointsUsed(draft: CharacterDraft): number {
  return CHARACTER_ATTRIBUTE_KEYS.reduce(
    (total, key) => total + draft.attributes[key],
    0,
  );
}

export function getSkillPointsUsed(draft: CharacterDraft): number {
  return draft.skillAllocations.reduce((total, allocation) => total + allocation.points, 0);
}

export function getStartingFundsSpent(draft: CharacterDraft): number {
  return draft.items.reduce(
    (total, item) => total + item.quantity * item.unitCostCredits,
    0,
  );
}

export function getStartingFundsRemaining(
  draft: CharacterDraft,
  startingCredits: number,
): number {
  return Math.max(0, startingCredits - getStartingFundsSpent(draft));
}

export function getRaceAttributeCap(
  race: RaceAggregate | null,
  key: CharacterAttributeKey,
): number | null {
  return race?.attributeCaps.find((cap) => cap.attributeKey === key)?.maxValue ?? null;
}

function rootSystems(skill: CharacterSkillReference): CampaignSystemOption[] | null {
  const name = skill.name.trim().toLocaleLowerCase();
  const classification = skill.classification.trim().toLocaleLowerCase();
  if (classification === "standard") return [];
  if (classification === "special ability") return ["Special Abilities"];
  if (name === "spellcraft") return ["Spellcraft"];
  if (name === "talismanism") return ["Talismanism"];
  if (["faith", "prayer", "devotion"].includes(name)) return ["Faith"];
  if (["psionic focus", "psionic meditation", "psionic channeling"].includes(name)) {
    return ["Psyonics"];
  }
  if (["resonant performance", "resonance attunement", "harmonic awareness"].includes(name)) {
    return ["Bardic Resonance"];
  }
  if (["channeling", "meditation"].includes(name)) {
    return ["Spellcraft", "Talismanism"];
  }
  return null;
}

export function isSkillAllowedByCampaign(
  skill: CharacterSkillReference,
  rootSkill: CharacterSkillReference,
  allowedSystems: readonly CampaignSystemOption[],
): boolean {
  if (skill.tier !== null && !allowedSystems.includes(`Tier ${skill.tier}` as CampaignSystemOption)) {
    return false;
  }
  const systems = rootSystems(rootSkill);
  return systems !== null
    && (systems.length === 0 || systems.some((system) => allowedSystems.includes(system)));
}

export function getCharacterSkillRanks(
  draft: CharacterDraft,
  skillCatalog: readonly CharacterSkillReference[],
): Map<number, number> {
  const skills = new Map(skillCatalog.map((skill) => [skill.id, skill]));
  const allocations = new Map(draft.skillAllocations.map((allocation) => [
    allocation.draftId,
    allocation,
  ]));
  const ranks = new Map<number, number>();
  const visiting = new Set<number>();

  function resolve(allocation: CharacterSkillAllocationDraft): number {
    const existing = ranks.get(allocation.draftId);
    if (existing !== undefined) return existing;
    if (visiting.has(allocation.draftId)) return 0;
    visiting.add(allocation.draftId);
    const skill = skills.get(allocation.skillId);
    if (!skill) {
      visiting.delete(allocation.draftId);
      return 0;
    }
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
    const parent = allocation.parentDraftId === null
      ? null
      : allocations.get(allocation.parentDraftId) ?? null;
    const parentRank = parent ? resolve(parent) : null;
    const rank = getSkillRank(
      allocation.points,
      attributeKey ? getAttributeModifier(attributeScore) : 0,
      parentRank,
      skill.tier,
    );
    visiting.delete(allocation.draftId);
    ranks.set(allocation.draftId, rank);
    return rank;
  }

  for (const allocation of draft.skillAllocations) resolve(allocation);
  return ranks;
}

export function buildSkillAllocationTree(
  allocations: readonly CharacterSkillAllocationDraft[],
): CharacterSkillAllocationInput[] {
  const children = new Map<number | null, CharacterSkillAllocationDraft[]>();
  for (const allocation of allocations.filter((row) => row.points > 0)) {
    const siblings = children.get(allocation.parentDraftId) ?? [];
    siblings.push(allocation);
    children.set(allocation.parentDraftId, siblings);
  }
  const build = (parentDraftId: number | null): CharacterSkillAllocationInput[] =>
    (children.get(parentDraftId) ?? [])
      .sort((left, right) => left.draftId - right.draftId)
      .map((allocation) => ({
        skillId: allocation.skillId,
        points: allocation.points,
        children: build(allocation.draftId),
      }));
  return build(null);
}

export type CharacterReadiness = {
  ready: boolean;
  identityComplete: boolean;
  raceComplete: boolean;
  attributesComplete: boolean;
  skillsComplete: boolean;
  attributesUsed: number;
  skillPointsUsed: number;
  fundsRemaining: number;
  issues: string[];
};

export function evaluateCharacterReadiness(
  draft: CharacterDraft,
  aggregate: CharacterAggregate,
  race: RaceAggregate | null,
): CharacterReadiness {
  const issues: string[] = [];
  const identityComplete = Boolean(
    draft.name.trim()
      && draft.name.trim().toLocaleLowerCase() !== "new character"
      && draft.profile.age !== null
      && draft.profile.age >= 0
      && draft.profile.sex.trim()
      && (draft.profile.heightFeet ?? 0) * 12 + (draft.profile.heightInches ?? 0) > 0
      && draft.profile.weight !== null
      && draft.profile.weight > 0
      && draft.profile.skinColor.trim()
      && draft.profile.eyeColor.trim()
      && draft.profile.hairColor.trim(),
  );
  if (!identityComplete) issues.push("Required Identity fields are incomplete.");
  const raceComplete = draft.profile.raceId !== null && race !== null;
  if (!raceComplete) issues.push("Choose a Campaign-allowed Race.");

  const attributesUsed = getAttributePointsUsed(draft);
  let capsValid = true;
  if (race) {
    for (const key of CHARACTER_ATTRIBUTE_KEYS) {
      const cap = getRaceAttributeCap(race, key);
      if (cap !== null && draft.attributes[key] > cap + EPSILON) capsValid = false;
    }
  }
  const attributesComplete =
    Math.abs(attributesUsed - aggregate.campaign.attributePoints) <= EPSILON && capsValid;
  if (Math.abs(attributesUsed - aggregate.campaign.attributePoints) > EPSILON) {
    issues.push("Allocate the exact Campaign Attribute Point budget.");
  }
  if (!capsValid) issues.push("One or more Attributes exceed the selected Race cap.");

  const skillPointsUsed = getSkillPointsUsed(draft);
  const skillCatalog = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
  const allocationMap = new Map(draft.skillAllocations.map((allocation) => [
    allocation.draftId,
    allocation,
  ]));
  const relationshipKeys = new Set(aggregate.skillRelationships
    .filter((relationship) => relationship.relationshipType.toLocaleLowerCase() === "parent")
    .map((relationship) => `${relationship.skillId}:${relationship.relatedSkillId}`));
  let skillRulesValid = true;
  const allocationPathKeys = new Set<string>();
  for (const allocation of draft.skillAllocations) {
    const skill = skillCatalog.get(allocation.skillId);
    const pathKey = `${allocation.parentDraftId ?? "root"}:${allocation.skillId}`;
    if (!skill
      || allocationPathKeys.has(pathKey)
      || allocation.points < 0
      || allocation.points > aggregate.campaign.maxStartingSkill + EPSILON
      || allocation.points > aggregate.campaign.maxPointsInSkill + EPSILON) {
      skillRulesValid = false;
      continue;
    }
    allocationPathKeys.add(pathKey);
    if (allocation.parentDraftId === null
      && skill.tier !== null
      && skill.tier !== 1) {
      skillRulesValid = false;
    }
    let rootSkill = skill;
    let cursor = allocation;
    const visited = new Set<number>();
    while (cursor.parentDraftId !== null) {
      if (visited.has(cursor.draftId)) {
        skillRulesValid = false;
        break;
      }
      visited.add(cursor.draftId);
      const parent = allocationMap.get(cursor.parentDraftId);
      if (!parent || !relationshipKeys.has(`${cursor.skillId}:${parent.skillId}`)) {
        skillRulesValid = false;
        break;
      }
      if (parent.points + EPSILON < aggregate.campaign.pointsToUnlockNextTier) {
        skillRulesValid = false;
      }
      const parentSkill = skillCatalog.get(parent.skillId);
      const cursorSkill = skillCatalog.get(cursor.skillId);
      if (parentSkill?.tier !== null
        && parentSkill?.tier !== undefined
        && cursorSkill?.tier !== null
        && cursorSkill?.tier !== undefined
        && cursorSkill.tier !== parentSkill.tier + 1) {
        skillRulesValid = false;
      }
      cursor = parent;
      rootSkill = skillCatalog.get(parent.skillId) ?? rootSkill;
    }
    if (!isSkillAllowedByCampaign(skill, rootSkill, aggregate.campaign.allowedSystems)) {
      skillRulesValid = false;
    }
  }
  const skillsComplete =
    Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) <= EPSILON && skillRulesValid;
  if (Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) > EPSILON) {
    issues.push("Allocate the exact Campaign Skill Point budget.");
  }
  if (!skillRulesValid) issues.push("One or more Skill allocations violate Campaign rules.");

  const fundsRemaining = getStartingFundsRemaining(
    draft,
    aggregate.campaign.startingCreditAmount,
  );
  if (getStartingFundsSpent(draft) > aggregate.campaign.startingCreditAmount + EPSILON) {
    issues.push("Starting purchases exceed available funds.");
  }
  const authorizedItems = new Map(aggregate.authorizedItems.map((item) => [item.id, item]));
  const itemIds = new Set<number>();
  const equipmentRulesValid = draft.items.every((item) => {
    const catalogItem = authorizedItems.get(item.itemId);
    if (!catalogItem
      || catalogItem.credits === null
      || itemIds.has(item.itemId)
      || !Number.isInteger(item.quantity)
      || item.quantity <= 0
      || Math.abs(catalogItem.credits - item.unitCostCredits) > EPSILON) {
      return false;
    }
    itemIds.add(item.itemId);
    return true;
  }) && getStartingFundsSpent(draft) <= aggregate.campaign.startingCreditAmount + EPSILON;
  if (!equipmentRulesValid) {
    issues.push("Starting possessions must be priced and authorized by this Campaign.");
  }

  return {
    ready: identityComplete && raceComplete && attributesComplete && skillsComplete
      && equipmentRulesValid,
    identityComplete,
    raceComplete,
    attributesComplete,
    skillsComplete,
    attributesUsed,
    skillPointsUsed,
    fundsRemaining,
    issues,
  };
}
