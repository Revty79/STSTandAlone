import { getDatabase } from "../database";
import { invoke } from "@tauri-apps/api/core";
import type {
  SaveSkillAggregate,
  Skill,
  SkillAggregate,
  SkillExtension,
  SkillFilterOptions,
  SkillLibraryFilters,
  SkillLibraryPage,
  SkillRelationship,
  SkillRelationshipCandidateFilters,
  SkillRelationshipEdge,
  SpellFrameworkSkill,
  SkillSummary,
} from "../../types/skill";

type ExecuteResult = {
  rowsAffected: number;
  lastInsertId?: number;
};

export interface SkillDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
}

type SkillRow = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primary_attribute: string | null;
  secondary_attribute: string | null;
  definition: string;
  created_by_user_id: number | null;
  source_system: string | null;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

type SkillSummaryRow = Pick<
  SkillRow,
  | "id"
  | "name"
  | "classification"
  | "tier"
  | "primary_attribute"
  | "secondary_attribute"
  | "updated_at"
> & {
  relationship_count: number | string;
  has_spell_construction: number | string;
};

type RelationshipRow = {
  id: number;
  skill_id: number;
  related_skill_id: number;
  related_skill_name: string;
  relationship_type: string;
  sort_order: number;
  created_at: string;
};

type RelationshipEdgeRow = {
  skill_id: number;
  related_skill_id: number;
  relationship_type: string;
  sort_order: number;
};

type ExtensionRow = {
  id: number;
  skill_id: number;
  extension_type: string;
  schema_version: number;
  data_json: string;
  created_at: string;
  updated_at: string;
};

type CountRow = { count: number | string };
type ValueRow = { value: string | number };
type ExistsRow = { found: number | string };
type SpellFrameworkRow = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

export interface SkillRepository {
  listSkills(filters: SkillLibraryFilters): Promise<SkillLibraryPage>;
  listFilterOptions(): Promise<SkillFilterOptions>;
  listRelationshipCandidates(
    filters: SkillRelationshipCandidateFilters,
  ): Promise<SkillSummary[]>;
  listSpellFrameworkSkills(
    parentSkillNames: readonly string[],
    tier?: number,
  ): Promise<SpellFrameworkSkill[]>;
  getSkillAggregate(id: number): Promise<SkillAggregate | null>;
  saveSkillAggregate(input: SaveSkillAggregate): Promise<SkillAggregate>;
  deleteSkill(id: number): Promise<void>;
  hasRelationshipPath(
    fromSkillId: number,
    toSkillId: number,
    relationshipType: string,
    excludeOutgoingSkillId?: number,
  ): Promise<boolean>;
}

function mapSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    classification: row.classification,
    tier: row.tier,
    primaryAttribute: row.primary_attribute,
    secondaryAttribute: row.secondary_attribute,
    definition: row.definition,
    createdByUserId: row.created_by_user_id,
    sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: SkillSummaryRow): SkillSummary {
  return {
    id: row.id,
    name: row.name,
    classification: row.classification,
    tier: row.tier,
    primaryAttribute: row.primary_attribute,
    secondaryAttribute: row.secondary_attribute,
    updatedAt: row.updated_at,
    relationshipCount: Number(row.relationship_count),
    hasSpellConstruction: Boolean(Number(row.has_spell_construction)),
  };
}

function mapRelationship(row: RelationshipRow): SkillRelationship {
  return {
    id: row.id,
    skillId: row.skill_id,
    relatedSkillId: row.related_skill_id,
    relatedSkillName: row.related_skill_name,
    relationshipType: row.relationship_type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapExtension(row: ExtensionRow): SkillExtension {
  let data: unknown;
  try {
    data = JSON.parse(row.data_json);
  } catch {
    throw new Error(
      `The ${row.extension_type} extension for skill ${row.skill_id} contains unreadable data.`,
    );
  }

  return {
    id: row.id,
    skillId: row.skill_id,
    extensionType: row.extension_type,
    schemaVersion: row.schema_version,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, index) => `$${index + startAt}`).join(", ");
}

export class TauriSkillRepository implements SkillRepository {
  constructor(
    private readonly databaseProvider: () => Promise<SkillDatabase> = getDatabase,
  ) {}

  async listSkills(filters: SkillLibraryFilters): Promise<SkillLibraryPage> {
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const conditions: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    const search = filters.search?.trim();
    if (search) {
      const parameter = bind(search);
      conditions.push(`instr(lower(s.name), lower(${parameter})) > 0`);
    }
    if (filters.classification?.trim()) {
      const parameter = bind(filters.classification.trim());
      conditions.push(`s.classification = ${parameter} COLLATE NOCASE`);
    }
    if (filters.tier !== undefined && filters.tier !== null) {
      conditions.push(`s.tier = ${bind(filters.tier)}`);
    }
    if (filters.primaryAttribute?.trim()) {
      const parameter = bind(filters.primaryAttribute.trim());
      conditions.push(`s.primary_attribute = ${parameter} COLLATE NOCASE`);
    }
    if (filters.secondaryAttribute?.trim()) {
      const parameter = bind(filters.secondaryAttribute.trim());
      conditions.push(`s.secondary_attribute = ${parameter} COLLATE NOCASE`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRows = await database.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM skills s ${where}`,
      values,
    );
    const total = Number(countRows[0]?.count ?? 0);
    const limitParameter = bind(pageSize);
    const offsetParameter = bind((page - 1) * pageSize);
    const rows = await database.select<SkillSummaryRow[]>(
      `SELECT
         s.id,
         s.name,
         s.classification,
         s.tier,
         s.primary_attribute,
         s.secondary_attribute,
         s.updated_at,
         (SELECT COUNT(*) FROM skill_relationships sr WHERE sr.skill_id = s.id)
           AS relationship_count,
         EXISTS(
           SELECT 1 FROM skill_extensions se
           WHERE se.skill_id = s.id AND se.extension_type = 'spell-construction'
         ) AS has_spell_construction
       FROM skills s
       ${where}
       ORDER BY s.name COLLATE NOCASE, s.id
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      values,
    );
    const items = rows.map(mapSummary);
    const relationships = await this.listRelationshipEdges(
      database,
      items.map(({ id }) => id),
    );

    return {
      items,
      relationships,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listFilterOptions(): Promise<SkillFilterOptions> {
    const database = await this.databaseProvider();
    const [classifications, tiers, primaryAttributes, secondaryAttributes] =
      await Promise.all([
        this.listDistinctText(database, "classification"),
        database.select<ValueRow[]>(
          "SELECT DISTINCT tier AS value FROM skills WHERE tier IS NOT NULL ORDER BY tier",
        ),
        this.listDistinctText(database, "primary_attribute"),
        this.listDistinctText(database, "secondary_attribute"),
      ]);

    return {
      classifications,
      tiers: tiers.map(({ value }) => Number(value)),
      primaryAttributes,
      secondaryAttributes,
    };
  }

  async listRelationshipCandidates(
    filters: SkillRelationshipCandidateFilters,
  ): Promise<SkillSummary[]> {
    if (filters.attributes.length === 0) return [];
    const database = await this.databaseProvider();
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const searchParameter = bind(filters.search.trim());
    const tierParameter = bind(filters.tier);
    const attributeList = filters.attributes.map(bind).join(", ");
    const exclusion = filters.excludeId === undefined
      ? ""
      : `AND s.id <> ${bind(filters.excludeId)}`;
    const rows = await database.select<SkillSummaryRow[]>(
      `SELECT
         s.id,
         s.name,
         s.classification,
         s.tier,
         s.primary_attribute,
         s.secondary_attribute,
         s.updated_at,
         0 AS relationship_count,
         EXISTS(
           SELECT 1 FROM skill_extensions se
           WHERE se.skill_id = s.id AND se.extension_type = 'spell-construction'
         ) AS has_spell_construction
       FROM skills s
       WHERE instr(lower(s.name), lower(${searchParameter})) > 0
         AND s.tier = ${tierParameter}
         AND (
           s.primary_attribute COLLATE NOCASE IN (${attributeList})
           OR s.secondary_attribute COLLATE NOCASE IN (${attributeList})
         )
         ${exclusion}
       ORDER BY s.name COLLATE NOCASE, s.id
       LIMIT 30`,
      values,
    );
    return rows.map(mapSummary);
  }

  async listSpellFrameworkSkills(
    parentSkillNames: readonly string[],
    tier?: number,
  ): Promise<SpellFrameworkSkill[]> {
    if (parentSkillNames.length === 0) return [];
    const database = await this.databaseProvider();
    const values: unknown[] = [...parentSkillNames];
    const parentParameters = placeholders(parentSkillNames.length);
    const tierCondition = tier === undefined
      ? ""
      : `AND child.tier = $${values.push(tier)}`;
    const rows = await database.select<SpellFrameworkRow[]>(
      `SELECT DISTINCT
         child.id, child.name, child.classification, child.tier
       FROM skills child
       JOIN skill_relationships relationship
         ON relationship.skill_id = child.id
       JOIN skills parent
         ON parent.id = relationship.related_skill_id
       WHERE relationship.relationship_type = 'parent' COLLATE NOCASE
         AND parent.name COLLATE NOCASE IN (${parentParameters})
         ${tierCondition}
       ORDER BY child.name COLLATE NOCASE, child.id`,
      values,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      classification: row.classification,
      tier: row.tier,
    }));
  }

  async getSkillAggregate(id: number): Promise<SkillAggregate | null> {
    const database = await this.databaseProvider();
    const skillRows = await database.select<SkillRow[]>(
      `SELECT
         id, name, classification, tier, primary_attribute,
         secondary_attribute, definition, created_by_user_id,
         source_system, source_external_id, created_at, updated_at
       FROM skills WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = skillRows[0];
    if (!row) return null;
    const [relationshipRows, extensionRows] = await Promise.all([
      database.select<RelationshipRow[]>(
        `SELECT
           sr.id, sr.skill_id, sr.related_skill_id,
           related.name AS related_skill_name,
           sr.relationship_type, sr.sort_order, sr.created_at
         FROM skill_relationships sr
         JOIN skills related ON related.id = sr.related_skill_id
         WHERE sr.skill_id = $1
         ORDER BY sr.sort_order, related.name COLLATE NOCASE, sr.id`,
        [id],
      ),
      database.select<ExtensionRow[]>(
        `SELECT
           id, skill_id, extension_type, schema_version,
           data_json, created_at, updated_at
         FROM skill_extensions
         WHERE skill_id = $1
         ORDER BY extension_type`,
        [id],
      ),
    ]);

    return {
      skill: mapSkill(row),
      relationships: relationshipRows.map(mapRelationship),
      extensions: extensionRows.map(mapExtension),
    };
  }

  async saveSkillAggregate(input: SaveSkillAggregate): Promise<SkillAggregate> {
    const skillId = await invoke<number>("save_skill_aggregate", {
      input: {
        id: input.id,
        core: input.core,
        relationships: input.relationships.map((relationship) => ({
          relatedSkillId: relationship.relatedSkillId,
          relationshipType: relationship.relationshipType,
          sortOrder: relationship.sortOrder,
        })),
        extensions: input.extensions.map((extension) => ({
          extensionType: extension.extensionType,
          schemaVersion: extension.schemaVersion,
          dataJson: JSON.stringify(extension.data),
        })),
      },
    });
    const saved = await this.getSkillAggregate(skillId);
    if (!saved) throw new Error("The saved Skill could not be reloaded.");
    return saved;
  }

  async deleteSkill(id: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute("DELETE FROM skills WHERE id = $1", [id]);
  }

  async hasRelationshipPath(
    fromSkillId: number,
    toSkillId: number,
    relationshipType: string,
    excludeOutgoingSkillId = -1,
  ): Promise<boolean> {
    const database = await this.databaseProvider();
    const rows = await database.select<ExistsRow[]>(
      `WITH RECURSIVE reachable(skill_id) AS (
         SELECT related_skill_id
         FROM skill_relationships
         WHERE skill_id = $1
           AND relationship_type = $3 COLLATE NOCASE
           AND skill_id <> $4
         UNION
         SELECT sr.related_skill_id
         FROM skill_relationships sr
         JOIN reachable current ON current.skill_id = sr.skill_id
         WHERE sr.relationship_type = $3 COLLATE NOCASE
           AND sr.skill_id <> $4
       )
       SELECT EXISTS(
         SELECT 1 FROM reachable WHERE skill_id = $2
       ) AS found`,
      [fromSkillId, toSkillId, relationshipType, excludeOutgoingSkillId],
    );
    return Boolean(Number(rows[0]?.found ?? 0));
  }

  private async listDistinctText(
    database: SkillDatabase,
    column: "classification" | "primary_attribute" | "secondary_attribute",
  ): Promise<string[]> {
    const rows = await database.select<ValueRow[]>(
      `SELECT DISTINCT ${column} AS value
       FROM skills
       WHERE ${column} IS NOT NULL AND length(trim(${column})) > 0
       ORDER BY ${column} COLLATE NOCASE
       LIMIT 250`,
    );
    return rows.map(({ value }) => String(value));
  }

  private async listRelationshipEdges(
    database: SkillDatabase,
    skillIds: number[],
  ): Promise<SkillRelationshipEdge[]> {
    if (skillIds.length === 0) return [];
    const rows = await database.select<RelationshipEdgeRow[]>(
      `SELECT skill_id, related_skill_id, relationship_type, sort_order
       FROM skill_relationships
       WHERE skill_id IN (${placeholders(skillIds.length)})
       ORDER BY skill_id, relationship_type, sort_order, id`,
      skillIds,
    );
    return rows.map((row) => ({
      skillId: row.skill_id,
      relatedSkillId: row.related_skill_id,
      relationshipType: row.relationship_type,
      sortOrder: row.sort_order,
    }));
  }

}

export const skillRepository: SkillRepository = new TauriSkillRepository();
