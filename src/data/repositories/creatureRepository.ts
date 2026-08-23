import { invoke } from "@tauri-apps/api/core";
import type {
  ChallengeRatingReference,
  Creature,
  CreatureAggregate,
  CreatureLibraryFacets,
  CreatureLibraryFilters,
  CreatureLibraryPage,
  CreatureSkillCandidate,
  CreatureSummary,
  SaveCreatureAggregate,
} from "../../types/creature";
import { getDatabase } from "../database";
import { isSize } from "../sizeOptions";

type ExecuteResult = { rowsAffected: number; lastInsertId?: number };
export interface CreatureDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
}

type CountRow = { count: number | string };
type TextRow = { value: string };
const FACET_COLLATOR = new Intl.Collator("en-US", {
  sensitivity: "base",
  numeric: true,
});

export function normalizeCreatureFacetValues(rows: TextRow[]): string[] {
  const values = new Map<string, string>();
  for (const row of rows) {
    const value = row.value.trim();
    if (value) values.set(value.toLocaleLowerCase("en-US"), value);
  }
  return [...values.values()].sort(FACET_COLLATOR.compare);
}

export interface CreatureRepository {
  listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage>;
  listFacets(): Promise<CreatureLibraryFacets>;
  listChallengeRatings(): Promise<ChallengeRatingReference[]>;
  listSkillCandidates(search: string): Promise<CreatureSkillCandidate[]>;
  getCreatureAggregate(id: number): Promise<CreatureAggregate | null>;
  saveCreatureAggregate(input: SaveCreatureAggregate): Promise<CreatureAggregate>;
  createVariant(parentCreatureId: number, variantName: string, userId: number): Promise<CreatureAggregate>;
  deleteCreature(id: number): Promise<void>;
}

function requireStoredSize<T extends { size: string; canonicalName: string }>(row: T): T & { size: Creature["size"] } {
  if (!isSize(row.size)) throw new Error(`${row.canonicalName} has unsupported Size ${JSON.stringify(row.size)}.`);
  return { ...row, size: row.size };
}

export class TauriCreatureRepository implements CreatureRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CreatureDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveCreatureAggregate) => Promise<number> =
      (input) => invoke<number>("save_creature_aggregate", { input }),
    private readonly cloneInvoker: (parentCreatureId: number, variantName: string, userId: number) => Promise<number> =
      (parentCreatureId, variantName, userId) => invoke<number>("clone_creature_as_variant", { parentCreatureId, variantName, userId }),
  ) {}

  async listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage> {
    if (filters.size && !isSize(filters.size)) throw new Error(`Unsupported Creature Size ${JSON.stringify(filters.size)}.`);
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const conditions: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (filters.search?.trim()) conditions.push(`instr(lower(c.canonical_name), lower(${bind(filters.search.trim())})) > 0`);
    if (filters.family?.trim()) conditions.push(`c.family = ${bind(filters.family.trim())} COLLATE NOCASE`);
    if (filters.creatureType?.trim()) conditions.push(`c.creature_type = ${bind(filters.creatureType.trim())} COLLATE NOCASE`);
    if (filters.size) conditions.push(`c.size = ${bind(filters.size)} COLLATE NOCASE`);
    if (filters.challengeRating !== undefined) conditions.push(`c.challenge_rating = ${bind(filters.challengeRating)}`);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await database.select<CountRow[]>(`SELECT COUNT(*) AS count FROM creatures c ${where}`, values);
    const total = Number(count[0]?.count ?? 0);
    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const rows = await database.select<Array<Omit<CreatureSummary, "size"> & { size: string }>>(
      `SELECT c.id, c.canonical_id AS canonicalId, c.canonical_name AS canonicalName,
         c.family, c.creature_type AS creatureType, c.size,
         c.challenge_rating AS challengeRating, c.kill_xp AS killXp, c.updated_at AS updatedAt
       FROM creatures c ${where}
       ORDER BY c.canonical_name COLLATE NOCASE, c.id
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: rows.map((row) => requireStoredSize(row)),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listFacets(): Promise<CreatureLibraryFacets> {
    const database = await this.databaseProvider();
    const [families, creatureTypes] = await Promise.all([
      database.select<TextRow[]>("SELECT DISTINCT trim(family) AS value FROM creatures WHERE length(trim(family)) > 0"),
      database.select<TextRow[]>("SELECT DISTINCT trim(creature_type) AS value FROM creatures WHERE length(trim(creature_type)) > 0"),
    ]);
    return {
      families: normalizeCreatureFacetValues(families),
      creatureTypes: normalizeCreatureFacetValues(creatureTypes),
    };
  }

  async listChallengeRatings(): Promise<ChallengeRatingReference[]> {
    const database = await this.databaseProvider();
    return database.select<ChallengeRatingReference[]>(
      `SELECT challenge_rating AS challengeRating, threat_band AS threatBand,
         attack_target_guidance AS attackTargetGuidance, damage_guidance AS damageGuidance,
         initiative_guidance AS initiativeGuidance, soak_guidance AS soakGuidance,
         hp_toughness_guidance AS hpToughnessGuidance, kill_xp AS killXp,
         current_creature_example AS currentCreatureExample, example_notes AS exampleNotes
       FROM challenge_rating_reference ORDER BY challenge_rating`,
    );
  }

  async listSkillCandidates(search: string): Promise<CreatureSkillCandidate[]> {
    const database = await this.databaseProvider();
    return database.select<CreatureSkillCandidate[]>(
      `SELECT id, name, classification, tier FROM skills
       WHERE source_system = 'serrian-tide-core'
         AND instr(lower(name), lower($1)) > 0
       ORDER BY name COLLATE NOCASE, id LIMIT 30`,
      [search.trim()],
    );
  }

  async getCreatureAggregate(id: number): Promise<CreatureAggregate | null> {
    const database = await this.databaseProvider();
    const creatures = await database.select<Array<Omit<Creature, "size"> & { size: string }>>(
      `SELECT creature.id, creature.canonical_id AS canonicalId, creature.canonical_name AS canonicalName, creature.family,
         creature.creature_type AS creatureType, creature.size,
         creature.challenge_rating AS challengeRating,
         creature.kill_xp AS killXp, creature.parent_creature_id AS parentCreatureId,
         parent.canonical_name AS parentCreatureName,
         creature.calculated_challenge_rating AS calculatedChallengeRating,
         creature.challenge_rating_adjustment AS challengeRatingAdjustment,
         creature.challenge_rating_adjustment_reason AS challengeRatingAdjustmentReason,
         creature.description, creature.typical_behavior AS typicalBehavior,
         creature.habitat_ecology AS habitatEcology, creature.notes,
         creature.created_by_user_id AS createdByUserId,
         creature.source_system AS sourceSystem, creature.created_at AS createdAt,
         creature.updated_at AS updatedAt
       FROM creatures creature
       LEFT JOIN creatures parent ON parent.id = creature.parent_creature_id
       WHERE creature.id = $1 LIMIT 1`,
      [id],
    );
    if (!creatures[0]) return null;
    const [attributes, movement, hpPools, hitLocations, attacks, skillLinks, abilities, defenses, uses, derivedCreatures] = await Promise.all([
      database.select<CreatureAggregate["attributes"]>(`SELECT child.attribute_key AS attributeKey, child.value, child.notes, child.sort_order AS sortOrder FROM creature_attributes child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["movement"]>(`SELECT child.movement_mode AS movementMode, child.movement_value AS movementValue, child.initiative, child.requirements, child.notes, child.sort_order AS sortOrder FROM creature_movement child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["hpPools"]>(`SELECT child.canonical_id AS canonicalId, child.pool_name AS poolName, child.hp_percentage AS hpPercentage, child.notes, child.sort_order AS sortOrder FROM creature_hp_pools child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["hitLocations"]>(`SELECT child.hit_location_number AS hitLocationNumber, child.location_name AS locationName, child.body_parts_included AS bodyPartsIncluded, pool.canonical_id AS hpPoolCanonicalId, child.natural_armor AS naturalArmor, child.soak, child.location_effect AS locationEffect, child.notes, child.sort_order AS sortOrder FROM creature_hit_locations child LEFT JOIN creature_hp_pools pool ON pool.id = child.hp_pool_id WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["attacks"]>(`SELECT child.canonical_id AS canonicalId, child.attack_name AS attackName, child.attack_percentage AS attackPercentage, child.damage, child.damage_type AS damageType, child.range_reach AS rangeReach, child.required_anatomy AS requiredAnatomy, child.requirements, child.uses_recharge AS usesRecharge, child.special_effect AS specialEffect, child.notes, child.sort_order AS sortOrder FROM creature_attacks child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["skillLinks"]>(`SELECT child.skill_id AS skillId, skill.name AS skillName, skill.classification AS skillClassification, child.rank, child.notes, child.sort_order AS sortOrder FROM creature_skill_links child JOIN skills skill ON skill.id = child.skill_id WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["abilities"]>(`SELECT child.canonical_id AS canonicalId, child.ability_name AS abilityName, child.ability_type AS abilityType, child.activation, child.requirements, child.uses_recharge AS usesRecharge, child.description, child.mechanical_effect AS mechanicalEffect, child.notes, child.sort_order AS sortOrder, child.cr_impact AS crImpact FROM creature_abilities child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["defenses"]>(`SELECT child.seed_identity AS seedIdentity, child.defense_type AS defenseType, child.against, child.value, child.notes, child.sort_order AS sortOrder, child.cr_impact AS crImpact FROM creature_defenses child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["uses"]>(`SELECT child.seed_identity AS seedIdentity, child.use_name AS useName, child.notes, child.sort_order AS sortOrder FROM creature_uses child WHERE child.creature_id = $1 AND child.variant_id IS NULL ORDER BY child.sort_order, child.id`, [id]),
      database.select<CreatureAggregate["derivedCreatures"]>(`SELECT id, canonical_id AS canonicalId, canonical_name AS canonicalName, size, challenge_rating AS challengeRating, kill_xp AS killXp FROM creatures WHERE parent_creature_id = $1 ORDER BY canonical_name COLLATE NOCASE, id`, [id]),
    ]);
    const core = requireStoredSize(creatures[0]);
    return {
      id,
      core,
      attributes,
      movement,
      hpPools,
      hitLocations,
      attacks,
      skillLinks,
      abilities,
      defenses,
      uses,
      derivedCreatures: derivedCreatures.map((row) => requireStoredSize(row)),
    };
  }

  async saveCreatureAggregate(input: SaveCreatureAggregate): Promise<CreatureAggregate> {
    const id = await this.saveInvoker(input);
    const saved = await this.getCreatureAggregate(id);
    if (!saved) throw new Error("The saved Creature could not be reloaded.");
    return saved;
  }

  async createVariant(parentCreatureId: number, variantName: string, userId: number): Promise<CreatureAggregate> {
    const id = await this.cloneInvoker(parentCreatureId, variantName, userId);
    const saved = await this.getCreatureAggregate(id);
    if (!saved) throw new Error("The derived Creature could not be reloaded.");
    return saved;
  }

  async deleteCreature(id: number): Promise<void> {
    const database = await this.databaseProvider();
    const children = await database.select<CountRow[]>(
      "SELECT COUNT(*) AS count FROM creatures WHERE parent_creature_id = $1",
      [id],
    );
    if (Number(children[0]?.count ?? 0) > 0) {
      throw new Error("This Creature cannot be deleted while derived Creatures still link to it.");
    }
    await database.execute("DELETE FROM creatures WHERE id = $1", [id]);
  }
}

export const creatureRepository: CreatureRepository = new TauriCreatureRepository();
