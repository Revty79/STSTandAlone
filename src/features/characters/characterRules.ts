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

export const CHARACTER_SPELL_ACCESS_LEVELS = [
  { name: "Apprentice", minimumMana: 1, midpointMana: 6, twoSpellUnlockMana: 12 },
  { name: "Novice", minimumMana: 12, midpointMana: 16, twoSpellUnlockMana: 32 },
  { name: "Master", minimumMana: 32, midpointMana: 36, twoSpellUnlockMana: 72 },
  { name: "High Master", minimumMana: 72, midpointMana: 71, twoSpellUnlockMana: 142 },
  { name: "Grand Master", minimumMana: 142, midpointMana: null, twoSpellUnlockMana: null },
] as const;

export type CharacterSpellAccessLevel = (typeof CHARACTER_SPELL_ACCESS_LEVELS)[number]["name"];
export type CharacterMagicSystem =
  | "Spellcraft"
  | "Talismanism"
  | "Faith"
  | "Psyonics"
  | "Bardic Resonance";

export type CharacterManaProfile = {
  system: CharacterMagicSystem;
  sourceSkillName: string;
  sourceSkillPoints: number;
  baseMagic: number;
  manaPool: number;
  spellAccessLevel: CharacterSpellAccessLevel | null;
  nextLevel: CharacterSpellAccessLevel | null;
  nextRequiredMana: number | null;
};

const MAGIC_SYSTEM_MANA_SKILLS: Record<CharacterMagicSystem, string> = {
  Spellcraft: "Channeling",
  Talismanism: "Channeling",
  Faith: "Devotion",
  Psyonics: "Psionic Channeling",
  "Bardic Resonance": "Resonance Attunement",
};

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

export type CharacterHpPoolKey =
  | "head"
  | "rightArm"
  | "leftArm"
  | "rightLeg"
  | "leftLeg"
  | "torso";

export const CHARACTER_HUMANOID_HP_POOLS = [
  { key: "head", name: "Head", percentage: 10 },
  { key: "rightArm", name: "Right Arm", percentage: 15 },
  { key: "leftArm", name: "Left Arm", percentage: 15 },
  { key: "rightLeg", name: "Right Leg", percentage: 15 },
  { key: "leftLeg", name: "Left Leg", percentage: 15 },
  { key: "torso", name: "Torso", percentage: 30 },
] as const satisfies ReadonlyArray<{
  key: CharacterHpPoolKey;
  name: string;
  percentage: number;
}>;

export const CHARACTER_HUMANOID_HIT_LOCATIONS = [
  { result: 0, name: "Head", poolKey: "head" },
  { result: 1, name: "Right Arm", poolKey: "rightArm" },
  { result: 2, name: "Left Arm", poolKey: "leftArm" },
  { result: 3, name: "Right Lower Leg", poolKey: "rightLeg" },
  { result: 4, name: "Right Upper Leg", poolKey: "rightLeg" },
  { result: 5, name: "Left Lower Leg", poolKey: "leftLeg" },
  { result: 6, name: "Left Upper Leg", poolKey: "leftLeg" },
  { result: 7, name: "Groin", poolKey: "torso" },
  { result: 8, name: "Stomach", poolKey: "torso" },
  { result: 9, name: "Chest", poolKey: "torso" },
] as const satisfies ReadonlyArray<{
  result: number;
  name: string;
  poolKey: CharacterHpPoolKey;
}>;

export type CharacterHpBreakdown = {
  totalHp: number;
  pools: Array<{
    key: CharacterHpPoolKey;
    name: string;
    percentage: number;
    hp: number;
  }>;
  locations: Array<{
    result: number;
    name: string;
    poolKey: CharacterHpPoolKey;
    poolName: string;
    hp: number;
  }>;
};

export function getCharacterHpBreakdown(totalHp: number): CharacterHpBreakdown {
  const normalizedTotal = Number.isFinite(totalHp) ? Math.max(0, totalHp) : 0;
  const pools = CHARACTER_HUMANOID_HP_POOLS.map((pool) => ({
    ...pool,
    hp: Math.ceil(normalizedTotal * pool.percentage / 100),
  }));
  const poolsByKey = new Map(pools.map((pool) => [pool.key, pool]));
  return {
    totalHp: normalizedTotal,
    pools,
    locations: CHARACTER_HUMANOID_HIT_LOCATIONS.map((location) => {
      const pool = poolsByKey.get(location.poolKey);
      if (!pool) throw new Error(`Missing Character HP Pool ${location.poolKey}.`);
      return {
        ...location,
        poolName: pool.name,
        hp: pool.hp,
      };
    }),
  };
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

export function isSpecialAbilitySkill(skill: CharacterSkillReference): boolean {
  const classification = skill.classification.trim().toLocaleLowerCase();
  return classification === "special ability" || classification === "special abilities";
}

export function isSpellSkill(skill: CharacterSkillReference): boolean {
  const classification = skill.classification.trim().toLocaleLowerCase();
  return classification === "spell"
    || classification === "psionic skill"
    || classification === "reverberation";
}

export function getRecordedSpellLevel(
  skill: CharacterSkillReference,
): CharacterSpellAccessLevel | null {
  const level = skill.spellLevel?.trim().toLocaleLowerCase();
  return CHARACTER_SPELL_ACCESS_LEVELS.find(
    (candidate) => candidate.name.toLocaleLowerCase() === level,
  )?.name ?? null;
}

export type CharacterSkillGroupKey = CharacterAttributeKey | "SPECIAL" | "OTHER";

export function getCharacterSkillGroupKey(
  skill: CharacterSkillReference,
): CharacterSkillGroupKey {
  if (isSpecialAbilitySkill(skill)) return "SPECIAL";
  return normalizeSkillAttributeKey(skill.primaryAttribute) ?? "OTHER";
}

function titleCaseSkillClassification(value: string): string {
  return value.trim().replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function getSkillTierLabel(skill: CharacterSkillReference): string {
  const classification = titleCaseSkillClassification(skill.classification);
  const spellLevel = getRecordedSpellLevel(skill);
  if (spellLevel) return `${spellLevel} ${classification || "Spell"} · Tier ${skill.tier ?? "—"}`;
  if (skill.tier === null) return classification || "Unclassified Skill";
  return skill.classification.trim().toLocaleLowerCase() === "standard"
    ? `Tier ${skill.tier}`
    : `${classification || "Skill"} · Tier ${skill.tier}`;
}

export function getSpellAccessLevelForManaPool(manaPool: number): CharacterSpellAccessLevel | null {
  let result: CharacterSpellAccessLevel | null = null;
  for (const level of CHARACTER_SPELL_ACCESS_LEVELS) {
    if (manaPool + EPSILON < level.minimumMana) break;
    result = level.name;
  }
  return result;
}

export function getCharacterMagicSystem(
  rootSkill: CharacterSkillReference,
): CharacterMagicSystem | null {
  const name = rootSkill.name.trim().toLocaleLowerCase();
  if (name === "spellcraft") return "Spellcraft";
  if (name === "talismanism") return "Talismanism";
  if (["faith", "prayer"].includes(name)) return "Faith";
  if (name === "psionic focus") return "Psyonics";
  if (name === "resonant performance") return "Bardic Resonance";
  return null;
}

export function canAccessSpellAtLevel(
  skill: CharacterSkillReference,
  spellAccessLevel: CharacterSpellAccessLevel | null,
): boolean {
  if (!isSpellSkill(skill)) return true;
  const spellLevel = getRecordedSpellLevel(skill);
  if (!spellLevel || !spellAccessLevel) return false;
  const spellIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex((level) => level.name === spellLevel);
  const accessIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex(
    (level) => level.name === spellAccessLevel,
  );
  return spellIndex >= 0 && accessIndex >= spellIndex;
}

export type RacialSkillGrant = {
  granted: boolean;
  minimum: number;
};

export function getRacialSkillGrant(
  race: RaceAggregate | null,
  skillId: number,
): RacialSkillGrant {
  const links = race?.skillLinks.filter((link) => link.skillId === skillId) ?? [];
  return {
    granted: links.length > 0,
    minimum: links.reduce((total, link) => total + Math.max(0, link.value ?? 0), 0),
  };
}

export function getEffectiveSkillPoints(
  purchasedPoints: number,
  race: RaceAggregate | null,
  skillId: number,
): number {
  return purchasedPoints + getRacialSkillGrant(race, skillId).minimum;
}

export function getCharacterManaProfiles(
  draft: CharacterDraft,
  skillCatalog: readonly CharacterSkillReference[],
  race: RaceAggregate | null,
): CharacterManaProfile[] {
  const baseMagic = Math.max(0, race?.race.baseMagic ?? 0);
  const effectivePointsForSkill = (skill: CharacterSkillReference): number =>
    draft.skillAllocations
      .filter((allocation) => allocation.skillId === skill.id)
      .reduce((maximum, allocation) => Math.max(
        maximum,
        getEffectiveSkillPoints(allocation.points, race, skill.id),
      ), getRacialSkillGrant(race, skill.id).minimum);

  return (Object.entries(MAGIC_SYSTEM_MANA_SKILLS) as Array<[
    CharacterMagicSystem,
    string,
  ]>).flatMap(([system, sourceSkillName]) => {
    const accessSkill = skillCatalog.find(
      (skill) => getCharacterMagicSystem(skill) === system,
    );
    if (!accessSkill || !hasSkillPoints(effectivePointsForSkill(accessSkill))) return [];

    const sourceSkill = skillCatalog.find(
      (skill) => skill.name.trim().toLocaleLowerCase() === sourceSkillName.toLocaleLowerCase(),
    );
    const sourceSkillPoints = sourceSkill
      ? effectivePointsForSkill(sourceSkill)
      : 0;
    const manaPool = sourceSkillPoints * baseMagic;
    const spellAccessLevel = getSpellAccessLevelForManaPool(manaPool);
    const next = CHARACTER_SPELL_ACCESS_LEVELS.find(
      (level) => level.minimumMana > manaPool + EPSILON,
    );
    return [{
      system,
      sourceSkillName,
      sourceSkillPoints,
      baseMagic,
      manaPool,
      spellAccessLevel,
      nextLevel: next?.name ?? null,
      nextRequiredMana: next?.minimumMana ?? null,
    }];
  });
}

export function getSpecialAbilityRollTarget(rank: number): number {
  return 100 - rank;
}

export function reconcileRacialSkillAnchors(
  allocations: readonly CharacterSkillAllocationDraft[],
  race: RaceAggregate | null,
  relationships: ReadonlyArray<CharacterAggregate["skillRelationships"][number]>,
  createDraftId: () => number,
): CharacterSkillAllocationDraft[] {
  let result = allocations.map((allocation) => ({ ...allocation }));
  const required = new Set<number>();
  const parentsBySkill = new Map<number, number[]>();
  for (const relationship of relationships) {
    if (relationship.relationshipType.trim().toLocaleLowerCase() !== "parent") continue;
    const parents = parentsBySkill.get(relationship.skillId) ?? [];
    if (!parents.includes(relationship.relatedSkillId)) parents.push(relationship.relatedSkillId);
    parentsBySkill.set(relationship.skillId, parents);
  }

  function ensurePath(skillId: number, visiting = new Set<number>()): CharacterSkillAllocationDraft | null {
    if (visiting.has(skillId)) return null;
    const parents = parentsBySkill.get(skillId) ?? [];
    if (parents.length > 1) return null;
    const nextVisiting = new Set(visiting).add(skillId);
    const parent = parents.length === 1
      ? ensurePath(parents[0], nextVisiting)
      : null;
    if (parents.length === 1 && !parent) return null;
    const parentDraftId = parent?.draftId ?? null;
    let allocation = result.find((candidate) =>
      candidate.skillId === skillId && candidate.parentDraftId === parentDraftId,
    );
    if (!allocation) {
      allocation = {
        draftId: createDraftId(),
        skillId,
        parentDraftId,
        points: 0,
      };
      result.push(allocation);
    }
    required.add(allocation.draftId);
    return allocation;
  }

  for (const link of race?.skillLinks ?? []) {
    if ((link.value ?? 0) > 0) ensurePath(link.skillId);
  }

  let removed = true;
  while (removed) {
    removed = false;
    const parentIds = new Set(result.map((allocation) => allocation.parentDraftId));
    const filtered = result.filter((allocation) => {
      const removable = allocation.points === 0
        && !required.has(allocation.draftId)
        && !parentIds.has(allocation.draftId);
      if (removable) removed = true;
      return !removable;
    });
    result = filtered;
  }
  return result;
}

export function getSkillRank(
  pointsInvested: number,
  attributeModifier: number,
  parentRank: number | null,
  tier: number | null,
): number {
  if (!hasSkillPoints(pointsInvested)) return 0;
  return tier !== null && tier > 1
    ? (parentRank ?? 0) + pointsInvested
    : pointsInvested + attributeModifier;
}

export function hasSkillPoints(points: number): boolean {
  return Number.isFinite(points) && points > EPSILON;
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
  if (isSpecialAbilitySkill(skill)) return ["Special Abilities"];
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

const ONE_POINT_UNLOCK_SYSTEMS = new Set<CampaignSystemOption>([
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Bardic Resonance",
]);

export function getSkillUnlockThreshold(
  rootSkill: CharacterSkillReference,
  campaignThreshold: number,
): number {
  const systems = rootSystems(rootSkill);
  return systems?.some((system) => ONE_POINT_UNLOCK_SYSTEMS.has(system))
    ? 1
    : campaignThreshold;
}

export function isSkillAllowedByCampaign(
  skill: CharacterSkillReference,
  rootSkill: CharacterSkillReference,
  allowedSystems: readonly CampaignSystemOption[],
  enforceCampaignTierLimits = true,
  raciallyGranted = false,
): boolean {
  if (raciallyGranted) return true;
  if (enforceCampaignTierLimits
    && skill.tier !== null
    && !allowedSystems.includes(`Tier ${skill.tier}` as CampaignSystemOption)) {
    return false;
  }
  const systems = rootSystems(rootSkill);
  return systems !== null
    && (systems.length === 0 || systems.some((system) => allowedSystems.includes(system)));
}

export function getCharacterSkillRanks(
  draft: CharacterDraft,
  skillCatalog: readonly CharacterSkillReference[],
  race: RaceAggregate | null = null,
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
      getEffectiveSkillPoints(allocation.points, race, allocation.skillId),
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
  for (const allocation of allocations) {
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
  storyComplete: boolean;
  equipmentComplete: boolean;
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
      && draft.profile.hairColor.trim()
      && draft.profile.deity.trim()
      && draft.profile.definingMarks.trim(),
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
  const manaProfiles = getCharacterManaProfiles(draft, aggregate.skillCatalog, race);
  const allocationMap = new Map(draft.skillAllocations.map((allocation) => [
    allocation.draftId,
    allocation,
  ]));
  const relationshipKeys = new Set(aggregate.skillRelationships
    .filter((relationship) => relationship.relationshipType.toLocaleLowerCase() === "parent")
    .map((relationship) => `${relationship.skillId}:${relationship.relatedSkillId}`));
  let skillRulesValid = true;
  const allocationPathKeys = new Set<string>();
  const childAllocationCounts = new Map<number, number>();
  for (const allocation of draft.skillAllocations) {
    if (allocation.parentDraftId !== null) {
      childAllocationCounts.set(
        allocation.parentDraftId,
        (childAllocationCounts.get(allocation.parentDraftId) ?? 0) + 1,
      );
    }
  }
  for (const allocation of draft.skillAllocations) {
    const skill = skillCatalog.get(allocation.skillId);
    const racialGrant = getRacialSkillGrant(race, allocation.skillId);
    const pathKey = `${allocation.parentDraftId ?? "root"}:${allocation.skillId}`;
    if (!skill
      || allocationPathKeys.has(pathKey)
      || allocation.points < 0
      || allocation.points > aggregate.campaign.maxStartingSkill + EPSILON
      || allocation.points > Math.max(
        0,
        aggregate.campaign.maxPointsInSkill - racialGrant.minimum,
      ) + EPSILON
      || (allocation.points <= EPSILON
        && !racialGrant.granted
        && !childAllocationCounts.has(allocation.draftId))) {
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
    const parentEdges: Array<{
      child: CharacterSkillAllocationDraft;
      parent: CharacterSkillAllocationDraft;
    }> = [];
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
      parentEdges.push({ child: cursor, parent });
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
    if (isSpellSkill(skill)) {
      const magicSystem = getCharacterMagicSystem(rootSkill);
      const spellAccessLevel = magicSystem
        ? manaProfiles.find((profile) => profile.system === magicSystem)?.spellAccessLevel ?? null
        : null;
      if (!magicSystem || !canAccessSpellAtLevel(skill, spellAccessLevel)) {
        skillRulesValid = false;
      }
    }
    const unlockThreshold = getSkillUnlockThreshold(
      rootSkill,
      aggregate.campaign.pointsToUnlockNextTier,
    );
    if (parentEdges.some(({ child, parent }) =>
      !getRacialSkillGrant(race, child.skillId).granted
        && getEffectiveSkillPoints(parent.points, race, parent.skillId) + EPSILON < unlockThreshold,
    )) {
      skillRulesValid = false;
    }
    if (!isSkillAllowedByCampaign(
      skill,
      rootSkill,
      aggregate.campaign.allowedSystems,
      true,
      racialGrant.granted,
    )) {
      skillRulesValid = false;
    }
  }
  const skillsComplete =
    Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) <= EPSILON && skillRulesValid;
  if (Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) > EPSILON) {
    issues.push("Allocate the exact Campaign Skill Point budget.");
  }
  if (!skillRulesValid) issues.push("One or more Skill allocations violate Campaign rules.");

  const storyComplete = Boolean(
    draft.profile.personality.trim()
      && draft.profile.goals.trim()
      && draft.profile.secrets.trim()
      && draft.profile.backstory.trim()
      && draft.profile.motivations.trim(),
  );
  if (!storyComplete) issues.push("Complete every Story & Personality field.");

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
  const equipmentComplete = equipmentRulesValid && draft.items.some((item) =>
    authorizedItems.get(item.itemId)?.catalogScope.toLocaleLowerCase() === "equipment",
  );
  if (!equipmentComplete) {
    issues.push("Purchase at least one Campaign-authorized Equipment item.");
  }

  return {
    ready: identityComplete && raceComplete && attributesComplete && skillsComplete
      && storyComplete && equipmentComplete,
    identityComplete,
    raceComplete,
    attributesComplete,
    skillsComplete,
    storyComplete,
    equipmentComplete,
    attributesUsed,
    skillPointsUsed,
    fundsRemaining,
    issues,
  };
}
