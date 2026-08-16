export const SKILL_EXTENSION_TYPE = {
  SPELL_CONSTRUCTION: "spell-construction",
} as const;

export type SkillExtensionType =
  | (typeof SKILL_EXTENSION_TYPE)[keyof typeof SKILL_EXTENSION_TYPE]
  | (string & {});

export type Skill = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  definition: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillSummary = Pick<
  Skill,
  | "id"
  | "name"
  | "classification"
  | "tier"
  | "primaryAttribute"
  | "secondaryAttribute"
  | "updatedAt"
> & {
  relationshipCount: number;
  parentNames: string[];
  hasSpellConstruction: boolean;
};

export type SkillRelationship = {
  id: number;
  skillId: number;
  relatedSkillId: number;
  relatedSkillName: string;
  relationshipType: string;
  sortOrder: number;
  createdAt: string;
};

export type SkillRelationshipDraft = {
  relatedSkillId: number;
  relatedSkillName?: string;
  relationshipType: string;
  sortOrder: number;
};

export type SkillRelationshipCandidateContext = Pick<
  SkillCoreDraft,
  "tier" | "primaryAttribute" | "secondaryAttribute"
>;

export type SkillRelationshipCandidateFilters = {
  search: string;
  excludeId?: number;
  tier: number;
  attributes: string[];
};

export type SkillExtension<TData = unknown> = {
  id: number;
  skillId: number;
  extensionType: SkillExtensionType;
  schemaVersion: number;
  data: TData;
  createdAt: string;
  updatedAt: string;
};

export type SkillExtensionDraft<TData = unknown> = {
  extensionType: SkillExtensionType;
  schemaVersion: number;
  data: TData;
};

export type SkillAggregate = {
  skill: Skill;
  relationships: SkillRelationship[];
  extensions: SkillExtension[];
};

export type SkillCoreDraft = {
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  definition: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  sourceExternalId: string | null;
};

export type SaveSkillAggregate = {
  id?: number;
  core: SkillCoreDraft;
  relationships: SkillRelationshipDraft[];
  extensions: SkillExtensionDraft[];
};

export type SkillLibraryFilters = {
  search?: string;
  classification?: string;
  tier?: number | null;
  primaryAttribute?: string;
  secondaryAttribute?: string;
  page: number;
  pageSize: number;
};

export type SkillRelationshipEdge = {
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
};

export type SkillLibraryPage = {
  items: SkillSummary[];
  relationships: SkillRelationshipEdge[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SkillFilterOptions = {
  classifications: string[];
  tiers: number[];
  primaryAttributes: string[];
  secondaryAttributes: string[];
};

export type SpellFrameworkSkill = Pick<
  Skill,
  "id" | "name" | "classification" | "tier"
>;
