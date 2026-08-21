export type Creature = {
  id: number;
  name: string;
  challengeRating: number | null;
  encounterScale: string;
  type: string;
  role: string;
  size: string;
  descriptionShort: string;
  hpTotal: number | null;
  initiative: number | null;
  armorSoak: number | null;
  magicResonanceInteraction: string;
  behaviorTactics: string;
  habitat: string;
  diet: string;
  lootHarvest: string;
  storyHooks: string;
  notes: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatureCoreDraft = Omit<Creature, "id" | "createdAt" | "updatedAt">;

export type CreatureAltName = { id: number; creatureId: number; altName: string; sortOrder: number; createdAt: string };
export type CreatureGenreTag = { id: number; creatureId: number; genreTag: string; sortOrder: number; createdAt: string };
export type CreatureAttribute = { id: number; creatureId: number; attributeKey: string; value: number; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureMovementMode = { id: number; creatureId: number; movementMode: string; baseValue: number; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureHpLocation = { id: number; creatureId: number; locationName: string; hpValue: number; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureAttack = { id: number; creatureId: number; name: string; damage: number | null; rangeText: string; effect: string; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureSkillLink = { id: number; creatureId: number; skillId: number; skillName: string; skillClassification: string; linkType: string; value: number | null; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureUse = { id: number; creatureId: number; useType: string; notes: string; sortOrder: number; createdAt: string; updatedAt: string };
export type CreatureVariant = { id: number; creatureId: number; name: string; description: string; notes: string; sortOrder: number; createdAt: string; updatedAt: string };

export type CreaturePurchaseItemLink = {
  id: number;
  creatureId: number;
  itemId: number;
  itemName: string;
  costCredits: number | null;
  category: string;
  subtype: string;
  genreTags: string[];
  relationship: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatureAltNameDraft = Pick<CreatureAltName, "altName" | "sortOrder">;
export type CreatureGenreTagDraft = Pick<CreatureGenreTag, "genreTag" | "sortOrder">;
export type CreatureAttributeDraft = Pick<CreatureAttribute, "attributeKey" | "value" | "notes" | "sortOrder">;
export type CreatureMovementModeDraft = Pick<CreatureMovementMode, "movementMode" | "baseValue" | "notes" | "sortOrder">;
export type CreatureHpLocationDraft = Pick<CreatureHpLocation, "locationName" | "hpValue" | "notes" | "sortOrder">;
export type CreatureAttackDraft = Pick<CreatureAttack, "name" | "damage" | "rangeText" | "effect" | "notes" | "sortOrder">;
export type CreatureSkillLinkDraft = Pick<CreatureSkillLink, "skillId" | "skillName" | "skillClassification" | "linkType" | "value" | "notes" | "sortOrder">;
export type CreatureUseDraft = Pick<CreatureUse, "useType" | "notes" | "sortOrder">;
export type CreatureVariantDraft = Pick<CreatureVariant, "name" | "description" | "notes" | "sortOrder">;
export type CreaturePurchaseItemLinkDraft = Pick<CreaturePurchaseItemLink, "itemId" | "itemName" | "costCredits" | "category" | "subtype" | "genreTags" | "relationship" | "notes">;

export type CreatureAggregate = {
  creature: Creature;
  altNames: CreatureAltName[];
  genreTags: CreatureGenreTag[];
  attributes: CreatureAttribute[];
  movementModes: CreatureMovementMode[];
  hpLocations: CreatureHpLocation[];
  attacks: CreatureAttack[];
  skillLinks: CreatureSkillLink[];
  uses: CreatureUse[];
  variants: CreatureVariant[];
  purchaseItemLinks: CreaturePurchaseItemLink[];
};

export type SaveCreatureAggregate = {
  id?: number;
  core: CreatureCoreDraft;
  altNames: CreatureAltNameDraft[];
  genreTags: CreatureGenreTagDraft[];
  attributes: CreatureAttributeDraft[];
  movementModes: CreatureMovementModeDraft[];
  hpLocations: CreatureHpLocationDraft[];
  attacks: CreatureAttackDraft[];
  skillLinks: CreatureSkillLinkDraft[];
  uses: CreatureUseDraft[];
  variants: CreatureVariantDraft[];
  purchaseItemLinks: CreaturePurchaseItemLinkDraft[];
};

export type CreatureSummary = Pick<Creature, "id" | "name" | "type" | "role" | "size" | "challengeRating" | "updatedAt"> & {
  genreTags: string[];
  attackCount: number;
  skillLinkCount: number;
  purchaseItemCount: number;
};

export type CreatureLibraryFilters = {
  search?: string;
  type?: string;
  role?: string;
  size?: string;
  genre?: string;
  page: number;
  pageSize: number;
};

export type CreatureLibraryPage = { items: CreatureSummary[]; total: number; page: number; pageSize: number; pageCount: number };
export type CreatureLibraryOptions = { types: string[]; roles: string[]; sizes: string[]; genres: string[] };
export type CreatureSkillCandidate = { id: number; name: string; classification: string; tier: number | null };
export type CreatureItemCandidate = { id: number; name: string; costCredits: number | null; category: string; subtype: string; genreTags: string[] };
