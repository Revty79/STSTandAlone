import { describe, expect, it } from "vitest";
import type { SkillRepository } from "../data/repositories/skillRepository";
import { createEmptySpell } from "../features/spell-construction/utilities/spellFactory";
import { serrianTideRules } from "../features/spell-construction/data/spellRules";
import {
  SKILL_EXTENSION_TYPE,
  type SaveSkillAggregate,
  type SkillAggregate,
  type SkillFilterOptions,
  type SkillLibraryFilters,
  type SkillLibraryPage,
  type SkillRelationshipCandidateFilters,
  type SpellFrameworkSkill,
  type SkillSummary,
} from "../types/skill";
import { SkillService, SkillValidationError } from "./skillService";
import { updateSkillAttribute } from "./skillRules";

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemorySkillRepository implements SkillRepository {
  private nextSkillId = 1;
  private nextRelationshipId = 1;
  private nextExtensionId = 1;
  private readonly records = new Map<number, SkillAggregate>();

  async listSkills(filters: SkillLibraryFilters): Promise<SkillLibraryPage> {
    const search = filters.search?.trim().toLowerCase() ?? "";
    const matching = [...this.records.values()]
      .map(({ skill, relationships, extensions }) => ({
        id: skill.id,
        name: skill.name,
        classification: skill.classification,
        tier: skill.tier,
        primaryAttribute: skill.primaryAttribute,
        secondaryAttribute: skill.secondaryAttribute,
        updatedAt: skill.updatedAt,
        relationshipCount: relationships.length,
        hasSpellConstruction: extensions.some(
          ({ extensionType }) =>
            extensionType === SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION,
        ),
      }))
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(search) &&
          (!filters.classification ||
            skill.classification.toLowerCase() === filters.classification.toLowerCase()) &&
          (filters.tier === undefined || skill.tier === filters.tier) &&
          (!filters.primaryAttribute ||
            skill.primaryAttribute?.toLowerCase() === filters.primaryAttribute.toLowerCase()) &&
          (!filters.secondaryAttribute ||
            skill.secondaryAttribute?.toLowerCase() === filters.secondaryAttribute.toLowerCase()),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    const pageSize = Math.min(100, Math.max(1, filters.pageSize));
    const page = Math.max(1, filters.page);
    const items = matching.slice((page - 1) * pageSize, page * pageSize);
    return {
      items,
      relationships: items.flatMap(({ id }) =>
        (this.records.get(id)?.relationships ?? []).map((relationship) => ({
          skillId: id,
          relatedSkillId: relationship.relatedSkillId,
          relationshipType: relationship.relationshipType,
          sortOrder: relationship.sortOrder,
        }))),
      total: matching.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(matching.length / pageSize)),
    };
  }

  async listFilterOptions(): Promise<SkillFilterOptions> {
    const values = [...this.records.values()].map(({ skill }) => skill);
    const text = (field: "classification" | "primaryAttribute" | "secondaryAttribute") =>
      [...new Set(values.map((skill) => skill[field]).filter((value): value is string => Boolean(value)))].sort();
    return {
      classifications: text("classification"),
      tiers: [...new Set(values.map(({ tier }) => tier).filter((tier): tier is number => tier !== null))].sort((a, b) => a - b),
      primaryAttributes: text("primaryAttribute"),
      secondaryAttributes: text("secondaryAttribute"),
    };
  }

  async listRelationshipCandidates(
    filters: SkillRelationshipCandidateFilters,
  ): Promise<SkillSummary[]> {
    const attributes = filters.attributes.map((attribute) => attribute.toLowerCase());
    return (await this.listSkills({ search: filters.search, page: 1, pageSize: 100 })).items.filter(
      ({ id, tier, primaryAttribute, secondaryAttribute }) =>
        id !== filters.excludeId &&
        tier === filters.tier &&
        [primaryAttribute, secondaryAttribute].some(
          (attribute) => attribute && attributes.includes(attribute.toLowerCase()),
        ),
    );
  }

  async listSpellFrameworkSkills(
    parentSkillNames: readonly string[],
    tier?: number,
  ): Promise<SpellFrameworkSkill[]> {
    const parentIds = new Set(
      [...this.records.values()]
        .filter(({ skill }) =>
          parentSkillNames.some(
            (name) => name.toLowerCase() === skill.name.toLowerCase(),
          ),
        )
        .map(({ skill }) => skill.id),
    );
    return [...this.records.values()]
      .filter(
        ({ skill, relationships }) =>
          (tier === undefined || skill.tier === tier) &&
          relationships.some(
            (relationship) =>
              relationship.relationshipType.toLowerCase() === "parent" &&
              parentIds.has(relationship.relatedSkillId),
          ),
      )
      .map(({ skill }) => ({
        id: skill.id,
        name: skill.name,
        classification: skill.classification,
        tier: skill.tier,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getSkillAggregate(id: number): Promise<SkillAggregate | null> {
    const aggregate = this.records.get(id);
    return aggregate ? clone(aggregate) : null;
  }

  async saveSkillAggregate(input: SaveSkillAggregate): Promise<SkillAggregate> {
    const now = new Date().toISOString();
    const id = input.id ?? this.nextSkillId++;
    const existing = this.records.get(id);
    const aggregate: SkillAggregate = {
      skill: {
        id,
        ...input.core,
        createdAt: existing?.skill.createdAt ?? now,
        updatedAt: now,
      },
      relationships: input.relationships.map((relationship) => ({
        id: this.nextRelationshipId++,
        skillId: id,
        relatedSkillId: relationship.relatedSkillId,
        relatedSkillName:
          this.records.get(relationship.relatedSkillId)?.skill.name ??
          relationship.relatedSkillName ??
          `Skill ${relationship.relatedSkillId}`,
        relationshipType: relationship.relationshipType,
        sortOrder: relationship.sortOrder,
        createdAt: now,
      })),
      extensions: input.extensions.map((extension) => ({
        id: this.nextExtensionId++,
        skillId: id,
        ...clone(extension),
        createdAt: now,
        updatedAt: now,
      })),
    };
    this.records.set(id, aggregate);
    return clone(aggregate);
  }

  async deleteSkill(id: number): Promise<void> {
    this.records.delete(id);
    for (const [skillId, aggregate] of this.records) {
      this.records.set(skillId, {
        ...aggregate,
        relationships: aggregate.relationships.filter(
          ({ relatedSkillId }) => relatedSkillId !== id,
        ),
      });
    }
  }

  async hasRelationshipPath(
    fromSkillId: number,
    toSkillId: number,
    relationshipType: string,
    excludeOutgoingSkillId = -1,
  ): Promise<boolean> {
    const visited = new Set<number>();
    const visit = (id: number): boolean => {
      if (id === toSkillId) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      if (id === excludeOutgoingSkillId) return false;
      return (this.records.get(id)?.relationships ?? [])
        .filter(
          (relationship) =>
            relationship.relationshipType.toLowerCase() === relationshipType.toLowerCase(),
        )
        .some(({ relatedSkillId }) => visit(relatedSkillId));
    };
    return visit(fromSkillId);
  }
}

function ordinarySkill(name: string): SaveSkillAggregate {
  return {
    core: {
      name,
      classification: "standard",
      tier: null,
      primaryAttribute: null,
      secondaryAttribute: null,
      definition: "",
      createdByUserId: 1,
      sourceSystem: null,
      sourceExternalId: null,
    },
    relationships: [],
    extensions: [],
  };
}

function tieredSkill(
  name: string,
  tier: number,
  primaryAttribute: string,
  secondaryAttribute: string | null = null,
): SaveSkillAggregate {
  return {
    ...ordinarySkill(name),
    core: {
      ...ordinarySkill(name).core,
      tier,
      primaryAttribute,
      secondaryAttribute,
    },
  };
}

describe("SkillService", () => {
  it("offers only one-tier-lower Skills sharing at least one attribute", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    await service.saveSkill(tieredSkill("Intellect Root", 1, "INT"));
    await service.saveSkill(tieredSkill("Wisdom Root", 1, "WIS"));
    await service.saveSkill(tieredSkill("Dexterity Root", 1, "DEX"));
    await service.saveSkill(tieredSkill("Arcane Branch", 2, "INT", "WIS"));
    await service.saveSkill(tieredSkill("Strength Branch", 2, "STR"));

    await expect(
      service.listRelationshipCandidates("", {
        tier: 2,
        primaryAttribute: "INT",
        secondaryAttribute: "WIS",
      }),
    ).resolves.toMatchObject([
      { name: "Intellect Root", tier: 1 },
      { name: "Wisdom Root", tier: 1 },
    ]);
    await expect(
      service.listRelationshipCandidates("", {
        tier: 3,
        primaryAttribute: "WIS",
        secondaryAttribute: null,
      }),
    ).resolves.toMatchObject([
      { name: "Arcane Branch", tier: 2 },
    ]);
    await expect(
      service.listRelationshipCandidates("", {
        tier: 1,
        primaryAttribute: "INT",
        secondaryAttribute: null,
      }),
    ).resolves.toEqual([]);
  });

  it("derives each spell framework pool from the correct Skill parents", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const roots = new Map<string, SkillAggregate>();
    for (const name of [
      "Spellcraft",
      "Talismanism",
      "Faith",
      "Psionic Focus",
      "Resonant Performance",
    ]) {
      roots.set(name, await service.saveSkill(ordinarySkill(name)));
    }
    const child = async (name: string, parentName: string, tier: number) =>
      service.saveSkill({
        ...ordinarySkill(name),
        core: {
          ...ordinarySkill(name).core,
          primaryAttribute: "INT",
          tier,
        },
        relationships: [{
          relatedSkillId: roots.get(parentName)!.skill.id,
          relatedSkillName: parentName,
          relationshipType: "parent",
          sortOrder: 0,
        }],
      });

    await child("Charm", "Spellcraft", 2);
    await child("Warding", "Talismanism", 2);
    await child("Grace", "Faith", 2);
    await child("Deep Sphere", "Faith", 3);
    await child("Telepathy", "Psionic Focus", 2);
    await child("Anger", "Resonant Performance", 2);

    await expect(
      service.listSpellFrameworkSkills("Spellcraft/Talismanism/Faith"),
    ).resolves.toMatchObject([
      { name: "Charm", tier: 2 },
      { name: "Grace", tier: 2 },
      { name: "Warding", tier: 2 },
    ]);
    await expect(service.listSpellFrameworkSkills("Psionics")).resolves.toMatchObject([
      { name: "Telepathy" },
    ]);
    await expect(
      service.listSpellFrameworkSkills("Bardic Resonance"),
    ).resolves.toMatchObject([{ name: "Anger" }]);
  });

  it("creates, reloads, updates, searches, and deletes ordinary Skills", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const created = await service.saveSkill({
      ...ordinarySkill("  Athletics  "),
      core: {
        ...ordinarySkill("Athletics").core,
        name: "  Athletics  ",
        classification: " physical ",
        tier: 2,
        primaryAttribute: " Strength ",
        definition: "  Running, climbing, and leaping.  ",
      },
    });

    expect(created.skill.name).toBe("Athletics");
    expect(created.skill.classification).toBe("physical");
    expect(created.skill.primaryAttribute).toBe("Strength");
    expect((await service.getSkill(created.skill.id))?.skill.definition).toBe(
      "Running, climbing, and leaping.",
    );

    const updated = await service.saveSkill({
      ...ordinarySkill("Athletics Mastery"),
      id: created.skill.id,
      core: {
        ...ordinarySkill("Athletics Mastery").core,
        definition: "Updated definition.",
      },
    });
    expect(updated.skill.name).toBe("Athletics Mastery");
    expect((await service.listSkills({ search: "mastery", page: 1, pageSize: 40 })).total).toBe(1);

    await service.deleteSkill(created.skill.id);
    expect(await service.getSkill(created.skill.id)).toBeNull();
  });

  it("permits duplicate names and persists normalized ordered relationships", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const parent = await service.saveSkill(ordinarySkill("Athletics"));
    await service.saveSkill(ordinarySkill("Athletics"));
    const child = await service.saveSkill({
      ...ordinarySkill("Acrobatics"),
      relationships: [
        {
          relatedSkillId: parent.skill.id,
          relatedSkillName: parent.skill.name,
          relationshipType: " prerequisite ",
          sortOrder: 77,
        },
      ],
    });

    expect((await service.listSkills({ page: 1, pageSize: 40 })).total).toBe(3);
    expect(child.relationships).toMatchObject([
      {
        relatedSkillId: parent.skill.id,
        relationshipType: "prerequisite",
        sortOrder: 0,
      },
    ]);
  });

  it("prevents self, duplicate, and circular relationships", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const root = await service.saveSkill(ordinarySkill("Root"));
    const child = await service.saveSkill({
      ...ordinarySkill("Child"),
      relationships: [
        {
          relatedSkillId: root.skill.id,
          relatedSkillName: "Root",
          relationshipType: "parent",
          sortOrder: 0,
        },
      ],
    });

    await expect(
      service.saveSkill({
        ...ordinarySkill("Root"),
        id: root.skill.id,
        relationships: [
          {
            relatedSkillId: root.skill.id,
            relatedSkillName: "Root",
            relationshipType: "parent",
            sortOrder: 0,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SkillValidationError);

    await expect(
      service.saveSkill({
        ...ordinarySkill("Root"),
        id: root.skill.id,
        relationships: [
          {
            relatedSkillId: child.skill.id,
            relatedSkillName: "Child",
            relationshipType: "parent",
            sortOrder: 0,
          },
          {
            relatedSkillId: child.skill.id,
            relatedSkillName: "Child",
            relationshipType: "parent",
            sortOrder: 1,
          },
        ],
      }),
    ).rejects.toThrow(/cannot be added twice/i);

    await expect(
      service.saveSkill({
        ...ordinarySkill("Root"),
        id: root.skill.id,
        relationships: [
          {
            relatedSkillId: child.skill.id,
            relatedSkillName: "Child",
            relationshipType: "parent",
            sortOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow(/circular path/i);
  });

  it("saves and reloads a spell extension while keeping Skill identity authoritative", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const spell = createEmptySpell();
    spell.name = "Stale Embedded Name";
    spell.sphere = "Charm";
    spell.containers[0]!.effects = [
      { id: "damage", ruleId: "damage", quantity: 3, description: "" },
    ];
    const saved = await service.saveSkill({
      ...ordinarySkill("Tide Bolt"),
      extensions: [
        {
          extensionType: SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION,
          schemaVersion: spell.schemaVersion,
          data: spell,
        },
      ],
    });

    const reloaded = await service.getSkill(saved.skill.id);
    const document = reloaded?.extensions[0]?.data as ReturnType<typeof createEmptySpell>;
    expect(document.name).toBe("Tide Bolt");
    expect(document.calculation?.ruleProfileVersion).toBe(serrianTideRules.version);

    await service.deleteSkill(saved.skill.id);
    expect(await service.getSkill(saved.skill.id)).toBeNull();
  });

  it("rejects invalid core and future extension data without partial persistence", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    await expect(service.saveSkill(ordinarySkill("   "))).rejects.toThrow(/name is required/i);
    await expect(
      service.saveSkill({
        ...ordinarySkill("Bad Tier"),
        core: {
          ...ordinarySkill("Bad Tier").core,
          primaryAttribute: "STR",
          tier: 0,
        },
      }),
    ).rejects.toThrow(/positive whole number/i);
    await expect(
      service.saveSkill({
        ...ordinarySkill("Future Spell"),
        extensions: [
          {
            extensionType: SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION,
            schemaVersion: 999,
            data: { ...createEmptySpell(), schemaVersion: 999 },
          },
        ],
      }),
    ).rejects.toThrow(/newer than this application supports/i);
    expect((await service.listSkills({ page: 1, pageSize: 40 })).total).toBe(0);
  });

  it("treats an attribute-free Skill as a tierless Special Ability", async () => {
    const repository = new MemorySkillRepository();
    const service = new SkillService(repository);
    const saved = await service.saveSkill({
      ...ordinarySkill("Tide Sense"),
      core: {
        ...ordinarySkill("Tide Sense").core,
        classification: "standard",
        tier: 3,
      },
    });

    expect(saved.skill.classification).toBe("special ability");
    expect(saved.skill.tier).toBeNull();
  });

  it("restores an editable standard classification when an attribute is selected", () => {
    const attributeFree = {
      ...ordinarySkill("Athletics").core,
      classification: "special ability",
    };

    const withAttribute = updateSkillAttribute(
      attributeFree,
      "primaryAttribute",
      "STR",
    );
    expect(withAttribute.primaryAttribute).toBe("STR");
    expect(withAttribute.classification).toBe("standard");

    const deliberatelySpecial = updateSkillAttribute(
      { ...withAttribute, classification: "special ability" },
      "secondaryAttribute",
      "DEX",
    );
    expect(deliberatelySpecial.classification).toBe("special ability");
  });
});
