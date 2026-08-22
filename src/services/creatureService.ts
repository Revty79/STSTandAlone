import { creatureRepository, type CreatureRepository } from "../data/repositories/creatureRepository";
import { isSize, SIZE_OPTIONS, type Size } from "../data/sizeOptions";
import type {
  ChallengeRatingReference,
  CreatureAggregate,
  CreatureLibraryFacets,
  CreatureLibraryFilters,
  CreatureLibraryPage,
  CreatureSkillCandidate,
  SaveCreatureAggregate,
} from "../types/creature";

const ATTRIBUTE_NAMES = new Set(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]);

export class CreatureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatureValidationError";
  }
}

const clean = (value: string) => value.trim();
const optionalText = (value: string | null) => value?.trim() || null;

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new CreatureValidationError(`${label} is required.`);
  return result;
}

function optionalNumber(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new CreatureValidationError(`${label} must be a number or left blank.`);
  return value;
}

function wholeNumber(value: number, label: string, minimum: number, maximum?: number): number {
  if (!Number.isInteger(value) || value < minimum || (maximum !== undefined && value > maximum)) {
    throw new CreatureValidationError(`${label} must be a whole number from ${minimum}${maximum === undefined ? " upward" : ` through ${maximum}`}.`);
  }
  return value;
}

function normalizeSize(value: string, label: string): Size {
  const size = value.trim();
  if (!isSize(size)) throw new CreatureValidationError(`${label} must be one of: ${SIZE_OPTIONS.join(", ")}.`);
  return size;
}

function identity(variantCanonicalId: string | null, value: string | number): string {
  return `${variantCanonicalId?.toLocaleLowerCase("en-US") ?? "<base>"}\u0000${String(value).toLocaleLowerCase("en-US")}`;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new CreatureValidationError(`${label} ${JSON.stringify(value)} is duplicated.`);
    seen.add(key);
  }
}

export function normalizeCreatureAggregate(input: SaveCreatureAggregate): SaveCreatureAggregate {
  const canonicalId = required(input.core.canonicalId, "Creature ID");
  const canonicalName = required(input.core.canonicalName, "Canonical Name");
  const variants = input.variants.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "Variant ID"),
    variantName: required(row.variantName, "Variant Name"),
    variantType: clean(row.variantType),
    sizeOverride: row.sizeOverride === null ? null : normalizeSize(row.sizeOverride, `${row.variantName || "Variant"} Size Override`),
    challengeRatingOverride: row.challengeRatingOverride === null ? null : wholeNumber(row.challengeRatingOverride, `${row.variantName || "Variant"} Challenge Rating Override`, 1, 50),
    killXpOverride: row.killXpOverride === null ? null : wholeNumber(row.killXpOverride, `${row.variantName || "Variant"} Kill XP Override`, 0),
    description: clean(row.description),
    notes: clean(row.notes),
    sortOrder,
  }));
  ensureUnique(variants.map((row) => row.canonicalId), "Variant ID");
  const variantIds = new Set(variants.map((row) => row.canonicalId.toLocaleLowerCase("en-US")));
  const variant = (value: string | null, label: string) => {
    const result = optionalText(value);
    if (result && !variantIds.has(result.toLocaleLowerCase("en-US"))) {
      throw new CreatureValidationError(`${label} references missing Variant ${JSON.stringify(result)}.`);
    }
    return result;
  };

  const attributes = input.attributes.map((row, sortOrder) => {
    const attributeKey = required(row.attributeKey, "Attribute");
    if (!ATTRIBUTE_NAMES.has(attributeKey)) throw new CreatureValidationError(`${attributeKey} is not a canonical Creature Attribute.`);
    return { variantCanonicalId: variant(row.variantCanonicalId, `${attributeKey} Attribute`), attributeKey, value: optionalNumber(row.value, `${attributeKey} Value`), notes: clean(row.notes), sortOrder };
  });
  ensureUnique(attributes.map((row) => identity(row.variantCanonicalId, row.attributeKey)), "Attribute assignment");

  const movement = input.movement.map((row, sortOrder) => {
    const movementMode = required(row.movementMode, "Movement Mode");
    return { variantCanonicalId: variant(row.variantCanonicalId, `${movementMode} Movement`), movementMode, movementValue: optionalNumber(row.movementValue, `${movementMode} Movement Value`), initiative: optionalNumber(row.initiative, `${movementMode} Initiative`), requirements: clean(row.requirements), notes: clean(row.notes), sortOrder };
  });
  ensureUnique(movement.map((row) => identity(row.variantCanonicalId, row.movementMode)), "Movement assignment");

  const hpPools = input.hpPools.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "HP Pool ID"),
    variantCanonicalId: variant(row.variantCanonicalId, `${row.poolName || "HP Pool"}`),
    poolName: required(row.poolName, "HP Pool Name"),
    hpPercentage: optionalNumber(row.hpPercentage, `${row.poolName || "HP Pool"} HP %`),
    notes: clean(row.notes),
    sortOrder,
  }));
  ensureUnique(hpPools.map((row) => row.canonicalId), "HP Pool ID");
  const hpPoolById = new Map(hpPools.map((row) => [row.canonicalId.toLocaleLowerCase("en-US"), row]));

  const hitLocations = input.hitLocations.map((row, sortOrder) => {
    const variantCanonicalId = variant(row.variantCanonicalId, `Hit Location ${row.hitLocationNumber}`);
    const hpPoolCanonicalId = optionalText(row.hpPoolCanonicalId);
    if (hpPoolCanonicalId) {
      const pool = hpPoolById.get(hpPoolCanonicalId.toLocaleLowerCase("en-US"));
      if (!pool) throw new CreatureValidationError(`Hit Location ${row.hitLocationNumber} references missing HP Pool ${JSON.stringify(hpPoolCanonicalId)}.`);
      if ((pool.variantCanonicalId ?? "").toLocaleLowerCase("en-US") !== (variantCanonicalId ?? "").toLocaleLowerCase("en-US")) {
        throw new CreatureValidationError(`Hit Location ${row.hitLocationNumber} and HP Pool ${hpPoolCanonicalId} must belong to the same base Creature or Variant.`);
      }
    }
    return { variantCanonicalId, hitLocationNumber: wholeNumber(row.hitLocationNumber, "Hit Location #", 0, 9), locationName: clean(row.locationName), bodyPartsIncluded: clean(row.bodyPartsIncluded), hpPoolCanonicalId, naturalArmor: optionalNumber(row.naturalArmor, `Hit Location ${row.hitLocationNumber} Natural Armor`), soak: optionalNumber(row.soak, `Hit Location ${row.hitLocationNumber} Soak`), locationEffect: clean(row.locationEffect), notes: clean(row.notes), sortOrder };
  });
  ensureUnique(hitLocations.map((row) => identity(row.variantCanonicalId, row.hitLocationNumber)), "Hit Location");

  const attacks = input.attacks.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "Attack ID"), variantCanonicalId: variant(row.variantCanonicalId, `${row.attackName || "Attack"}`),
    attackName: required(row.attackName, "Attack Name"), attackPercentage: optionalNumber(row.attackPercentage, `${row.attackName || "Attack"} Attack %`),
    damage: optionalText(row.damage), damageType: clean(row.damageType), rangeReach: clean(row.rangeReach), requiredAnatomy: clean(row.requiredAnatomy),
    requirements: clean(row.requirements), usesRecharge: clean(row.usesRecharge), specialEffect: clean(row.specialEffect), notes: clean(row.notes), sortOrder,
  }));
  ensureUnique(attacks.map((row) => row.canonicalId), "Attack ID");

  const skillLinks = input.skillLinks.map((row, sortOrder) => {
    if (!Number.isInteger(row.skillId) || row.skillId <= 0) throw new CreatureValidationError("Every Creature Skill must reference an existing canonical Skill.");
    return { variantCanonicalId: variant(row.variantCanonicalId, `${row.skillName || "Creature Skill"}`), skillId: row.skillId, skillName: clean(row.skillName), skillClassification: clean(row.skillClassification), rank: optionalText(row.rank), notes: clean(row.notes), sortOrder };
  });
  ensureUnique(skillLinks.map((row) => identity(row.variantCanonicalId, row.skillId)), "Creature Skill assignment");

  const abilities = input.abilities.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "Ability ID"), variantCanonicalId: variant(row.variantCanonicalId, `${row.abilityName || "Ability"}`),
    abilityName: required(row.abilityName, "Ability Name"), abilityType: clean(row.abilityType), activation: clean(row.activation), requirements: clean(row.requirements),
    usesRecharge: clean(row.usesRecharge), description: clean(row.description), mechanicalEffect: clean(row.mechanicalEffect), notes: clean(row.notes), sortOrder,
  }));
  ensureUnique(abilities.map((row) => row.canonicalId), "Ability ID");

  const defenses = input.defenses.map((row, sortOrder) => ({ seedIdentity: optionalText(row.seedIdentity), variantCanonicalId: variant(row.variantCanonicalId, `${row.defenseType || "Defense"}`), defenseType: required(row.defenseType, "Defense Type"), against: clean(row.against), value: optionalText(row.value), notes: clean(row.notes), sortOrder }));
  const uses = input.uses.map((row, sortOrder) => ({ seedIdentity: optionalText(row.seedIdentity), variantCanonicalId: variant(row.variantCanonicalId, `${row.useName || "Use"}`), useName: required(row.useName, "Creature Use"), notes: clean(row.notes), sortOrder }));

  return {
    id: input.id,
    core: {
      ...input.core,
      canonicalId,
      canonicalName,
      family: clean(input.core.family),
      creatureType: clean(input.core.creatureType),
      size: normalizeSize(input.core.size, "Creature Size"),
      challengeRating: input.core.challengeRating === null ? null : wholeNumber(input.core.challengeRating, "Challenge Rating", 1, 50),
      killXp: input.core.killXp === null ? null : wholeNumber(input.core.killXp, "Kill XP", 0),
      description: clean(input.core.description),
      typicalBehavior: clean(input.core.typicalBehavior),
      habitatEcology: clean(input.core.habitatEcology),
      notes: clean(input.core.notes),
      sourceSystem: optionalText(input.core.sourceSystem),
    },
    attributes,
    movement,
    hpPools,
    hitLocations,
    attacks,
    skillLinks,
    abilities,
    defenses,
    uses,
    variants,
  };
}

export class CreatureService {
  constructor(private readonly repository: CreatureRepository = creatureRepository) {}
  listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage> { return this.repository.listCreatures(filters); }
  listFacets(): Promise<CreatureLibraryFacets> { return this.repository.listFacets(); }
  listChallengeRatings(): Promise<ChallengeRatingReference[]> { return this.repository.listChallengeRatings(); }
  listSkillCandidates(search: string): Promise<CreatureSkillCandidate[]> { return this.repository.listSkillCandidates(search); }
  getCreature(id: number): Promise<CreatureAggregate | null> { return this.repository.getCreatureAggregate(id); }
  saveCreature(input: SaveCreatureAggregate): Promise<CreatureAggregate> { return this.repository.saveCreatureAggregate(normalizeCreatureAggregate(input)); }
  deleteCreature(id: number): Promise<void> { return this.repository.deleteCreature(id); }
}

export const creatureService = new CreatureService();
