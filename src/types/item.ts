export type ItemCatalogScope = "equipment" | "inventory";
export type EquipmentCatalogGroup = "weapon" | "armor" | "general";

export type ItemCore = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: ItemCatalogScope;
  equipmentGroup: EquipmentCatalogGroup | null;
  recordType: string;
  family: string;
  category: string;
  subtype: string;
  description: string;
  weight: number | null;
  weightUnit: string;
  size: string;
  durability: number | null;
  credits: number | null;
  priceBasis: string;
  parentItemId: number | null;
  parentItemName: string | null;
  createdByUserId: number | null;
  sourceSystem: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemCoreDraft = Omit<ItemCore, "id" | "createdAt" | "updatedAt">;

export type ItemPropertyDraft = {
  propertyName: string;
  value: string;
  unit: string;
  quantity: number | null;
  relationKind: "none" | "item" | "creature";
  relatedItemId: number | null;
  relatedItemName: string | null;
  relatedCreatureCanonicalId: string | null;
  relatedCreatureName: string | null;
  notes: string;
  sortOrder: number;
};

export type ItemWeaponProfileDraft = {
  profileRecordType: string;
  weaponType: string;
  handedness: string;
  damageSource: string;
  damage: string;
  damageType: string;
  range: string;
  reach: string;
  ammunitionItemId: number | null;
  ammunitionItemName: string | null;
  compatibility: string;
  capacity: string;
  fireModes: string[];
  rateOfFire: string;
  reloadInitiative: string;
  rulesText: string;
};

export type ItemDamageModifierDraft = {
  modifierText: string;
  damageType: string;
  modifier: string;
  notes: string;
  sortOrder: number;
};

export type ItemArmorProfileDraft = {
  armorType: string;
  coverage: string;
  baseSoak: number | null;
  damageModifiersSourceText: string;
  damageModifiers: ItemDamageModifierDraft[];
  coveredBodyLocationKeys: string[];
  rulesText: string;
};

export type ItemLineageSummary = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: ItemCatalogScope;
};

export type SaveItemAggregate = {
  id?: number;
  core: ItemCoreDraft;
  properties: ItemPropertyDraft[];
  weaponProfile: ItemWeaponProfileDraft | null;
  armorProfile: ItemArmorProfileDraft | null;
  tags: string[];
  variants: ItemLineageSummary[];
};

export type ItemAggregate = SaveItemAggregate & {
  id: number;
  core: ItemCore;
};

export type ItemSummary = Pick<
  ItemCore,
  | "id"
  | "canonicalId"
  | "name"
  | "catalogScope"
  | "equipmentGroup"
  | "recordType"
  | "family"
  | "category"
  | "updatedAt"
> & {
  tags: string[];
  hasWeaponProfile: boolean;
  hasArmorProfile: boolean;
};

export type ItemLibraryFilters = {
  catalogScope: ItemCatalogScope;
  search?: string;
  equipmentGroup?: EquipmentCatalogGroup;
  recordType?: string;
  category?: string;
  tag?: string;
  page: number;
  pageSize: number;
};

export type ItemLibraryPage = {
  items: ItemSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ItemLibraryFacets = {
  recordTypes: string[];
  categories: string[];
  tags: string[];
};

export type RelatedItemCandidate = {
  id: number;
  canonicalId: string;
  name: string;
  recordType: string;
};

export type RelatedCreatureCandidate = {
  canonicalId: string;
  name: string;
  family: string;
  creatureType: string;
};

export type ItemAuthoringReferences = {
  tags: string[];
  armorBodyLocations: { key: string; label: string }[];
};
