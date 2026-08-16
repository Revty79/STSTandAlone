import {
  skillRepository,
  type SkillRepository,
} from "../data/repositories/skillRepository";
import { SPELL_SCHEMA_VERSION } from "../features/spell-construction/models/spell";
import type { Tradition } from "../features/spell-construction/models/spell";
import { SPELL_IDENTITY_BY_TRADITION } from "../features/spell-construction/data/spellIdentity";
import { parseSpellDocument } from "../features/spell-construction/spellDocumentCodec";
import { withCalculationSnapshot } from "../features/spell-construction/utilities/spellFactory";
import {
  SKILL_EXTENSION_TYPE,
  type SaveSkillAggregate,
  type SkillAggregate,
  type SkillExtensionDraft,
  type SkillFilterOptions,
  type SkillLibraryFilters,
  type SkillLibraryPage,
  type SkillRelationshipCandidateContext,
  type SkillRelationshipDraft,
  type SpellFrameworkSkill,
  type SkillSummary,
} from "../types/skill";
import { applySkillAttributeRules } from "./skillRules";

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

function optionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeRelationships(
  skillId: number | undefined,
  relationships: SkillRelationshipDraft[],
): SkillRelationshipDraft[] {
  const seen = new Set<string>();
  return relationships.map((relationship, index) => {
    const relationshipType = relationship.relationshipType.trim() || "parent";
    if (relationship.relatedSkillId === skillId) {
      throw new SkillValidationError("A skill cannot relate to itself.");
    }
    const key = `${relationship.relatedSkillId}:${relationshipType.toLowerCase()}`;
    if (seen.has(key)) {
      throw new SkillValidationError(
        "The same skill relationship cannot be added twice.",
      );
    }
    seen.add(key);
    return {
      relatedSkillId: relationship.relatedSkillId,
      relatedSkillName: relationship.relatedSkillName,
      relationshipType,
      sortOrder: index,
    };
  });
}

function normalizeExtensions(
  extensions: SkillExtensionDraft[],
  skillName: string,
): SkillExtensionDraft[] {
  const seen = new Set<string>();
  return extensions.map((extension) => {
    const extensionType = extension.extensionType.trim();
    if (!extensionType) {
      throw new SkillValidationError("Skill extension type is required.");
    }
    if (seen.has(extensionType)) {
      throw new SkillValidationError(
        `Only one ${extensionType} extension may be attached to a skill.`,
      );
    }
    seen.add(extensionType);
    if (!Number.isInteger(extension.schemaVersion) || extension.schemaVersion < 1) {
      throw new SkillValidationError("Skill extension schema version is invalid.");
    }

    if (extensionType === SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION) {
      const document = withCalculationSnapshot({
        ...parseSpellDocument(extension.data),
        // The Skill record is the master identity. Keep the embedded spell
        // document synchronized so a rename cannot leave two competing names.
        name: skillName,
      });
      return {
        extensionType,
        schemaVersion: SPELL_SCHEMA_VERSION,
        data: document,
      };
    }

    try {
      JSON.stringify(extension.data);
    } catch {
      throw new SkillValidationError(
        `The ${extensionType} extension cannot be serialized.`,
      );
    }
    return { ...extension, extensionType };
  });
}

export class SkillService {
  constructor(private readonly repository: SkillRepository) {}

  listSkills(filters: SkillLibraryFilters): Promise<SkillLibraryPage> {
    return this.repository.listSkills(filters);
  }

  listFilterOptions(): Promise<SkillFilterOptions> {
    return this.repository.listFilterOptions();
  }

  listRelationshipCandidates(
    search: string,
    context: SkillRelationshipCandidateContext,
    excludeId?: number,
  ): Promise<SkillSummary[]> {
    const attributes = [context.primaryAttribute, context.secondaryAttribute]
      .map((attribute) => attribute?.trim() ?? "")
      .filter(
        (attribute, index, all) =>
          Boolean(attribute) &&
          attribute.toLocaleUpperCase() !== "N/A" &&
          all.findIndex(
            (candidate) =>
              candidate.toLocaleUpperCase() === attribute.toLocaleUpperCase(),
          ) === index,
      );
    if (context.tier === null || context.tier <= 1 || attributes.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository.listRelationshipCandidates({
      search,
      excludeId,
      tier: context.tier - 1,
      attributes,
    });
  }

  listSpellFrameworkSkills(tradition: Tradition): Promise<SpellFrameworkSkill[]> {
    const identity = SPELL_IDENTITY_BY_TRADITION[tradition];
    return this.repository.listSpellFrameworkSkills(
      identity.parentSkillNames,
      identity.tier,
    );
  }

  async getSkill(id: number): Promise<SkillAggregate | null> {
    const aggregate = await this.repository.getSkillAggregate(id);
    if (!aggregate) return null;
    return {
      ...aggregate,
      extensions: aggregate.extensions.map((extension) =>
        extension.extensionType === SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION
          ? { ...extension, data: parseSpellDocument(extension.data) }
          : extension,
      ),
    };
  }

  async saveSkill(input: SaveSkillAggregate): Promise<SkillAggregate> {
    const name = input.core.name.trim();
    if (!name) throw new SkillValidationError("Name is required before saving.");
    const classification = input.core.classification.trim() || "standard";
    const core = applySkillAttributeRules({
      ...input.core,
      name,
      classification,
      primaryAttribute: optionalText(input.core.primaryAttribute),
      secondaryAttribute: optionalText(input.core.secondaryAttribute),
      definition: input.core.definition.trim(),
      sourceSystem: optionalText(input.core.sourceSystem),
      sourceExternalId: optionalText(input.core.sourceExternalId),
    });
    if (
      core.tier !== null &&
      (!Number.isInteger(core.tier) || core.tier < 1)
    ) {
      throw new SkillValidationError("Tier must be a positive whole number or N/A.");
    }

    const relationships = normalizeRelationships(input.id, input.relationships);
    for (const relationship of relationships) {
      if (
        input.id !== undefined &&
        (await this.repository.hasRelationshipPath(
          relationship.relatedSkillId,
          input.id,
          relationship.relationshipType,
          input.id,
        ))
      ) {
        throw new SkillValidationError(
          `Adding ${relationship.relatedSkillName ?? "that relationship"} would create a circular path.`,
        );
      }
    }

    const extensions = normalizeExtensions(input.extensions, name);
    for (const extension of extensions) {
      if (extension.extensionType !== SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION) continue;
      const document = extension.data as ReturnType<typeof parseSpellDocument>;
      if (!document.frameworkSkillId) continue;
      const eligibleFrameworks = await this.listSpellFrameworkSkills(document.tradition);
      if (!eligibleFrameworks.some(({ id }) => id === document.frameworkSkillId)) {
        const identity = SPELL_IDENTITY_BY_TRADITION[document.tradition];
        throw new SkillValidationError(
          `The selected ${identity.label} is no longer attached to the required Skill tree.`,
        );
      }
    }

    return this.repository.saveSkillAggregate({
      id: input.id,
      core,
      relationships,
      extensions,
    });
  }

  deleteSkill(id: number): Promise<void> {
    return this.repository.deleteSkill(id);
  }
}

export const skillService = new SkillService(skillRepository);
