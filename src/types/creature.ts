import type { Size } from "../data/sizeOptions";

export type CreatureCrImpact = "None" | "Minor" | "Moderate" | "Major" | "Extreme";

export type Creature = {
  id: number;
  canonicalId: string;
  canonicalName: string;
  family: string;
  creatureType: string;
  size: Size;
  challengeRating: number | null;
  killXp: number | null;
  parentCreatureId: number | null;
  parentCreatureName: string | null;
  calculatedChallengeRating: number | null;
  challengeRatingAdjustment: number;
  challengeRatingAdjustmentReason: string;
  description: string;
  typicalBehavior: string;
  habitatEcology: string;
  notes: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatureCoreDraft = Omit<Creature, "id" | "createdAt" | "updatedAt">;

export type CreatureAttributeDraft = {
  attributeKey: string;
  value: number | null;
  notes: string;
  sortOrder: number;
};

export type CreatureMovementDraft = {
  movementMode: string;
  movementValue: number | null;
  initiative: number | null;
  requirements: string;
  notes: string;
  sortOrder: number;
};

export type CreatureHpPoolDraft = {
  canonicalId: string;
  poolName: string;
  hpPercentage: number | null;
  notes: string;
  sortOrder: number;
};

export type CreatureHitLocationDraft = {
  hitLocationNumber: number;
  locationName: string;
  bodyPartsIncluded: string;
  hpPoolCanonicalId: string | null;
  naturalArmor: number | null;
  soak: number | null;
  locationEffect: string;
  notes: string;
  sortOrder: number;
};

export type CreatureAttackDraft = {
  canonicalId: string;
  attackName: string;
  attackPercentage: number | null;
  damage: string | null;
  damageType: string;
  rangeReach: string;
  requiredAnatomy: string;
  requirements: string;
  usesRecharge: string;
  specialEffect: string;
  notes: string;
  sortOrder: number;
};

export type CreatureSkillLinkDraft = {
  skillId: number;
  skillName: string;
  skillClassification: string;
  rank: string | null;
  notes: string;
  sortOrder: number;
};

export type CreatureAbilityDraft = {
  canonicalId: string;
  abilityName: string;
  abilityType: string;
  activation: string;
  requirements: string;
  usesRecharge: string;
  description: string;
  mechanicalEffect: string;
  notes: string;
  sortOrder: number;
  crImpact: CreatureCrImpact;
};

export type CreatureDefenseDraft = {
  seedIdentity: string | null;
  defenseType: string;
  against: string;
  value: string | null;
  notes: string;
  sortOrder: number;
  crImpact: CreatureCrImpact;
};

export type CreatureUseDraft = {
  seedIdentity: string | null;
  useName: string;
  notes: string;
  sortOrder: number;
};

export type SaveCreatureAggregate = {
  id?: number;
  core: CreatureCoreDraft;
  attributes: CreatureAttributeDraft[];
  movement: CreatureMovementDraft[];
  hpPools: CreatureHpPoolDraft[];
  hitLocations: CreatureHitLocationDraft[];
  attacks: CreatureAttackDraft[];
  skillLinks: CreatureSkillLinkDraft[];
  abilities: CreatureAbilityDraft[];
  defenses: CreatureDefenseDraft[];
  uses: CreatureUseDraft[];
  derivedCreatures: CreatureLineageSummary[];
};

export type CreatureAggregate = SaveCreatureAggregate & {
  id: number;
  core: Creature;
};

export type CreatureLineageSummary = Pick<
  Creature,
  "id" | "canonicalId" | "canonicalName" | "size" | "challengeRating" | "killXp"
>;

export type CreatureSummary = Pick<
  Creature,
  "id" | "canonicalId" | "canonicalName" | "family" | "creatureType" | "size" | "challengeRating" | "killXp" | "updatedAt"
>;

export type CreatureLibraryFilters = {
  search?: string;
  family?: string;
  creatureType?: string;
  size?: Size;
  challengeRating?: number;
  page: number;
  pageSize: number;
};

export type CreatureLibraryPage = {
  items: CreatureSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CreatureLibraryFacets = {
  families: string[];
  creatureTypes: string[];
};

export type ChallengeRatingReference = {
  challengeRating: number;
  threatBand: string;
  attackTargetGuidance: string;
  damageGuidance: string;
  initiativeGuidance: string;
  soakGuidance: string;
  hpToughnessGuidance: string;
  killXp: number | null;
  currentCreatureExample: string;
  exampleNotes: string;
};

export type ChallengeRatingBreakdown = {
  accuracyRating: number | null;
  damageRating: number | null;
  offenseRating: number;
  defenseRating: number;
  initiativeRating: number | null;
  mobilityBonus: number;
  specialImpact: number;
  calculatedRating: number;
  adjustment: number;
  finalRating: number;
  killXp: number;
};

export type CreatureSkillCandidate = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};
