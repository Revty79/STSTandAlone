import type {
  CharacterAggregate,
  CharacterDraft,
  CharacterSkillAllocation,
  CharacterSkillReference,
} from "../../types/character";
import {
  canAccessSupernaturalSkillAtLevel,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillGroupKey,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getEffectiveSkillMaximum,
  getRacialSkillGrant,
  getSkillRollTarget,
  getSkillTierLabel,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  hasSkillPoints,
  isSkillAllowedByCampaign,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
  type CharacterSkillGroupKey,
} from "./characterRules";

const EPSILON = 0.000_001;

export type CharacterAdvancementSkill = {
  key: string;
  skill: CharacterSkillReference;
  rootSkill: CharacterSkillReference;
  allocationId: number | null;
  parentAllocationId: number | null;
  depth: number;
  group: CharacterSkillGroupKey;
  path: string[];
  tierLabel: string;
  purchasedPoints: number;
  racialPoints: number;
  effectivePoints: number;
  nextEffectivePoints: number;
  rank: number;
  rollTarget: number | null;
  experienceCost: number;
  maximumEffectivePoints: number;
  owned: boolean;
  atMaximum: boolean;
  canAfford: boolean;
};

export function getSkillAdvancementCost(
  effectivePoints: number,
  pointsToAdd = 1,
): number {
  if (!Number.isInteger(pointsToAdd) || pointsToAdd <= 0) return Number.POSITIVE_INFINITY;
  let cost = 0;
  let projectedPoints = effectivePoints;
  for (let point = 0; point < pointsToAdd; point += 1) {
    cost += projectedPoints > EPSILON ? projectedPoints : 10;
    projectedPoints += 1;
  }
  return cost;
}

export function getMaximumAffordableSkillPoints(
  effectivePoints: number,
  availableExperience: number,
  maximumPoints: number,
): number {
  const maximumIncreases = Math.max(0, Math.floor(maximumPoints - effectivePoints + EPSILON));
  let points = 0;
  let spent = 0;
  while (points < maximumIncreases) {
    const nextCost = getSkillAdvancementCost(effectivePoints + points);
    if (spent + nextCost > availableExperience + EPSILON) break;
    spent += nextCost;
    points += 1;
  }
  return points;
}

function aggregateDraft(aggregate: CharacterAggregate): CharacterDraft {
  return {
    name: aggregate.character.name,
    profile: {
      raceId: aggregate.profile.raceId,
      age: aggregate.profile.age,
      sex: aggregate.profile.sex,
      heightFeet: aggregate.profile.heightFeet,
      heightInches: aggregate.profile.heightInches,
      weight: aggregate.profile.weight,
      skinColor: aggregate.profile.skinColor,
      eyeColor: aggregate.profile.eyeColor,
      hairColor: aggregate.profile.hairColor,
      deity: aggregate.profile.deity,
      definingMarks: aggregate.profile.definingMarks,
      personality: aggregate.profile.personality,
      goals: aggregate.profile.goals,
      secrets: aggregate.profile.secrets,
      backstory: aggregate.profile.backstory,
      motivations: aggregate.profile.motivations,
      fame: aggregate.profile.fame,
      experience: aggregate.profile.experience,
      totalExperience: aggregate.profile.totalExperience,
      quintessence: aggregate.profile.quintessence,
      totalQuintessence: aggregate.profile.totalQuintessence,
      fatePoints: aggregate.profile.fatePoints,
      creditsRemaining: aggregate.profile.creditsRemaining,
    },
    attributes: Object.fromEntries(
      aggregate.attributes.map((attribute) => [attribute.attributeKey, attribute.value]),
    ) as CharacterDraft["attributes"],
    skillAllocations: aggregate.skillAllocations.map((allocation) => ({
      draftId: allocation.id,
      skillId: allocation.skillId,
      parentDraftId: allocation.parentAllocationId,
      points: allocation.points,
    })),
    items: aggregate.items.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      unitCostCredits: item.unitCostCredits,
    })),
    currencyHoldings: aggregate.currencyHoldings.map((holding) => ({
      currencyId: holding.currencyId,
      quantity: holding.quantity,
    })),
  };
}

function allocationFor(
  allocations: readonly CharacterSkillAllocation[],
  skillId: number,
  parentAllocationId: number | null,
): CharacterSkillAllocation | null {
  return allocations.find((allocation) =>
    allocation.skillId === skillId
      && allocation.parentAllocationId === parentAllocationId,
  ) ?? null;
}

export function buildCharacterAdvancementSkills(
  aggregate: CharacterAggregate,
): CharacterAdvancementSkill[] {
  const draft = aggregateDraft(aggregate);
  const race = aggregate.selectedRace;
  const catalog = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
  const ranks = getCharacterSkillRanks(draft, aggregate.skillCatalog, race);
  const manaProfiles = getCharacterManaProfiles(draft, aggregate.skillCatalog, race);
  const childrenByParent = new Map<number, CharacterSkillReference[]>();
  const childIds = new Set<number>();
  for (const relationship of aggregate.skillRelationships) {
    if (relationship.relationshipType.trim().toLocaleLowerCase() !== "parent") continue;
    const child = catalog.get(relationship.skillId);
    if (!child) continue;
    childIds.add(child.id);
    const siblings = childrenByParent.get(relationship.relatedSkillId) ?? [];
    if (!siblings.some((candidate) => candidate.id === child.id)) siblings.push(child);
    childrenByParent.set(relationship.relatedSkillId, siblings);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name));
  }
  const roots = aggregate.skillCatalog
    .filter((skill) => !childIds.has(skill.id) && (skill.tier === null || skill.tier === 1))
    .sort((left, right) => left.name.localeCompare(right.name));
  const result: CharacterAdvancementSkill[] = [];

  function visit(
    skill: CharacterSkillReference,
    rootSkill: CharacterSkillReference,
    parentAllocationId: number | null,
    parentPath: readonly string[],
    depth: number,
    visited: ReadonlySet<number>,
  ) {
    if (visited.has(skill.id)) return;
    const racialGrant = getRacialSkillGrant(race, skill.id);
    if (!isSkillAllowedByCampaign(
      skill,
      rootSkill,
      aggregate.campaign.allowedSystems,
      false,
      racialGrant.granted,
    )) return;
    const magicSystem = getCharacterMagicSystem(rootSkill);
    const spellAccessLevel = magicSystem
      ? manaProfiles.find((profile) => profile.system === magicSystem)?.spellAccessLevel ?? null
      : null;
    if (!canAccessSupernaturalSkillAtLevel(skill, rootSkill, spellAccessLevel)) return;

    const allocation = allocationFor(
      aggregate.skillAllocations,
      skill.id,
      parentAllocationId,
    );
    const purchasedPoints = allocation?.points ?? 0;
    const effectivePoints = getEffectiveSkillPoints(purchasedPoints, race, skill.id);
    const owned = hasSkillPoints(effectivePoints);
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const attributeScore = attributeKey
      ? draft.attributes[attributeKey]
      : 0;
    const rank = allocation
      ? ranks.get(allocation.id) ?? 0
      : 0;
    const rollTarget = !owned
      ? null
      : attributeKey
        ? getSkillRollTarget(attributeScore, rank)
        : isSpecialAbilitySkill(skill)
          ? getSpecialAbilityRollTarget(rank)
          : null;
    const path = [...parentPath, skill.name];
    const experienceCost = getSkillAdvancementCost(effectivePoints);
    const maximumEffectivePoints = getEffectiveSkillMaximum(
      skill,
      aggregate.campaign.maxPointsInSkill,
    );
    result.push({
      key: `${parentAllocationId ?? "root"}:${skill.id}`,
      skill,
      rootSkill,
      allocationId: allocation?.id ?? null,
      parentAllocationId,
      depth,
      // Advancement is browsed by complete Skill branches. Shared supernatural
      // Skills such as Spheres therefore follow the attribute of the access
      // path being advanced (Faith/WIS, Spellcraft/INT), not the canonical
      // Sphere record's primary attribute.
      group: getCharacterSkillGroupKey(rootSkill),
      path,
      tierLabel: getSkillTierLabel(skill),
      purchasedPoints,
      racialPoints: racialGrant.minimum,
      effectivePoints,
      nextEffectivePoints: effectivePoints + 1,
      rank,
      rollTarget,
      experienceCost,
      maximumEffectivePoints,
      owned,
      atMaximum: effectivePoints + 1 > maximumEffectivePoints + EPSILON,
      canAfford: aggregate.profile.experience + EPSILON >= experienceCost,
    });

    if (!allocation) return;
    const threshold = getSkillUnlockThreshold(
      rootSkill,
      aggregate.campaign.pointsToUnlockNextTier,
    );
    const nextVisited = new Set(visited).add(skill.id);
    for (const child of childrenByParent.get(skill.id) ?? []) {
      const childGrant = getRacialSkillGrant(race, child.id);
      if (effectivePoints + EPSILON < threshold && !childGrant.granted) continue;
      visit(child, rootSkill, allocation.id, path, depth + 1, nextVisited);
    }
  }

  for (const root of roots) visit(root, root, null, [], 0, new Set());
  return result;
}
