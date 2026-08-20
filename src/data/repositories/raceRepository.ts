import { invoke } from "@tauri-apps/api/core";
import type {
  Race,
  RaceAggregate,
  RaceAttributeCap,
  RaceLibraryFilters,
  RaceLibraryPage,
  RaceMovementMode,
  RaceSkillCandidate,
  RaceSkillLink,
  RaceSummary,
  SaveRaceAggregate,
} from "../../types/race";
import { getDatabase } from "../database";

type ExecuteResult = { rowsAffected: number; lastInsertId?: number };

export interface RaceDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
}

type RaceRow = {
  id: number;
  name: string;
  legacy_description: string;
  physical_characteristics: string;
  physical_description: string;
  age_range_text: string;
  age_min: number | null;
  age_max: number | null;
  size: string;
  base_magic: number | null;
  racial_quirk_name: string;
  quirk_success_effect: string;
  quirk_failure_effect: string;
  common_languages_known: string;
  common_archetypes: string;
  genre_examples: string;
  cultural_mindset: string;
  outlook_on_magic: string;
  created_by_user_id: number | null;
  source_system: string | null;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

type RaceSummaryRow = Pick<
  RaceRow,
  "id" | "name" | "size" | "age_range_text" | "base_magic" | "updated_at"
> & {
  attribute_cap_count: number | string;
  movement_mode_count: number | string;
  skill_link_count: number | string;
};

type AttributeCapRow = {
  id: number;
  race_id: number;
  attribute_key: string;
  max_value: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type MovementModeRow = {
  id: number;
  race_id: number;
  movement_mode: string;
  base_value: number;
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SkillLinkRow = {
  id: number;
  race_id: number;
  skill_id: number;
  skill_name: string;
  skill_classification: string;
  link_type: string;
  value: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SkillCandidateRow = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

type CountRow = { count: number | string };
type ValueRow = { value: string };

export interface RaceRepository {
  listRaces(filters: RaceLibraryFilters): Promise<RaceLibraryPage>;
  listSizes(): Promise<string[]>;
  listSkillCandidates(search: string, classification?: string): Promise<RaceSkillCandidate[]>;
  getRaceAggregate(id: number): Promise<RaceAggregate | null>;
  saveRaceAggregate(input: SaveRaceAggregate): Promise<RaceAggregate>;
  deleteRace(id: number): Promise<void>;
}

function mapRace(row: RaceRow): Race {
  return {
    id: row.id,
    name: row.name,
    legacyDescription: row.legacy_description,
    physicalCharacteristics: row.physical_characteristics,
    physicalDescription: row.physical_description,
    ageRangeText: row.age_range_text,
    ageMin: row.age_min,
    ageMax: row.age_max,
    size: row.size,
    baseMagic: row.base_magic,
    racialQuirkName: row.racial_quirk_name,
    quirkSuccessEffect: row.quirk_success_effect,
    quirkFailureEffect: row.quirk_failure_effect,
    commonLanguagesKnown: row.common_languages_known,
    commonArchetypes: row.common_archetypes,
    genreExamples: row.genre_examples,
    culturalMindset: row.cultural_mindset,
    outlookOnMagic: row.outlook_on_magic,
    createdByUserId: row.created_by_user_id,
    sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: RaceSummaryRow): RaceSummary {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    ageRangeText: row.age_range_text,
    baseMagic: row.base_magic,
    updatedAt: row.updated_at,
    attributeCapCount: Number(row.attribute_cap_count),
    movementModeCount: Number(row.movement_mode_count),
    skillLinkCount: Number(row.skill_link_count),
  };
}

export class TauriRaceRepository implements RaceRepository {
  constructor(
    private readonly databaseProvider: () => Promise<RaceDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveRaceAggregate) => Promise<number> =
      (input) => invoke<number>("save_race_aggregate", { input }),
  ) {}

  async listRaces(filters: RaceLibraryFilters): Promise<RaceLibraryPage> {
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const conditions: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.search?.trim()) {
      conditions.push(`instr(lower(r.name), lower(${bind(filters.search.trim())})) > 0`);
    }
    if (filters.size?.trim()) {
      conditions.push(`r.size = ${bind(filters.size.trim())} COLLATE NOCASE`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await database.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM races r ${where}`,
      values,
    );
    const total = Number(count[0]?.count ?? 0);
    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const rows = await database.select<RaceSummaryRow[]>(
      `SELECT r.id, r.name, r.size, r.age_range_text, r.base_magic, r.updated_at,
         (SELECT COUNT(*) FROM race_attribute_caps cap WHERE cap.race_id = r.id) AS attribute_cap_count,
         (SELECT COUNT(*) FROM race_movement_modes movement WHERE movement.race_id = r.id) AS movement_mode_count,
         (SELECT COUNT(*) FROM race_skill_links link WHERE link.race_id = r.id) AS skill_link_count
       FROM races r ${where}
       ORDER BY r.name COLLATE NOCASE, r.id
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: rows.map(mapSummary),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listSizes(): Promise<string[]> {
    const database = await this.databaseProvider();
    const rows = await database.select<ValueRow[]>(
      `SELECT DISTINCT size AS value FROM races
       WHERE length(trim(size)) > 0
       ORDER BY size COLLATE NOCASE LIMIT 250`,
    );
    return rows.map(({ value }) => value);
  }

  async listSkillCandidates(search: string, classification?: string): Promise<RaceSkillCandidate[]> {
    const database = await this.databaseProvider();
    const values: unknown[] = [search.trim()];
    const classificationFilter = classification?.trim()
      ? `AND classification = $${values.push(classification.trim())} COLLATE NOCASE`
      : "";
    const rows = await database.select<SkillCandidateRow[]>(
      `SELECT id, name, classification, tier
       FROM skills
       WHERE instr(lower(name), lower($1)) > 0
       ${classificationFilter}
       ORDER BY name COLLATE NOCASE, id
       LIMIT 30`,
      values,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      classification: row.classification,
      tier: row.tier,
    }));
  }

  async getRaceAggregate(id: number): Promise<RaceAggregate | null> {
    const database = await this.databaseProvider();
    const races = await database.select<RaceRow[]>(
      `SELECT id, name, legacy_description, physical_characteristics,
         physical_description, age_range_text, age_min, age_max, size, base_magic,
         racial_quirk_name, quirk_success_effect, quirk_failure_effect,
         common_languages_known, common_archetypes, genre_examples, cultural_mindset,
         outlook_on_magic, created_by_user_id, source_system, source_external_id,
         created_at, updated_at
       FROM races WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!races[0]) return null;
    const [caps, movements, links] = await Promise.all([
      database.select<AttributeCapRow[]>(
        `SELECT id, race_id, attribute_key, max_value, sort_order, created_at, updated_at
         FROM race_attribute_caps WHERE race_id = $1 ORDER BY sort_order, id`,
        [id],
      ),
      database.select<MovementModeRow[]>(
        `SELECT id, race_id, movement_mode, base_value, notes, sort_order, created_at, updated_at
         FROM race_movement_modes WHERE race_id = $1 ORDER BY sort_order, id`,
        [id],
      ),
      database.select<SkillLinkRow[]>(
        `SELECT link.id, link.race_id, link.skill_id, skill.name AS skill_name,
           skill.classification AS skill_classification, link.link_type, link.value,
           link.sort_order, link.created_at, link.updated_at
         FROM race_skill_links link
         JOIN skills skill ON skill.id = link.skill_id
         WHERE link.race_id = $1
         ORDER BY link.link_type, link.sort_order, skill.name COLLATE NOCASE, link.id`,
        [id],
      ),
    ]);
    return {
      race: mapRace(races[0]),
      attributeCaps: caps.map((row): RaceAttributeCap => ({
        id: row.id,
        raceId: row.race_id,
        attributeKey: row.attribute_key,
        maxValue: row.max_value,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      movementModes: movements.map((row): RaceMovementMode => ({
        id: row.id,
        raceId: row.race_id,
        movementMode: row.movement_mode,
        baseValue: row.base_value,
        notes: row.notes,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      skillLinks: links.map((row): RaceSkillLink => ({
        id: row.id,
        raceId: row.race_id,
        skillId: row.skill_id,
        skillName: row.skill_name,
        skillClassification: row.skill_classification,
        linkType: row.link_type,
        value: row.value,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  async saveRaceAggregate(input: SaveRaceAggregate): Promise<RaceAggregate> {
    const id = await this.saveInvoker(input);
    const aggregate = await this.getRaceAggregate(id);
    if (!aggregate) throw new Error("The saved Race could not be reloaded.");
    return aggregate;
  }

  async deleteRace(id: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute("DELETE FROM races WHERE id = $1", [id]);
  }
}

export const raceRepository: RaceRepository = new TauriRaceRepository();
