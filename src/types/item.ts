export type ItemCatalogView =
  | "weapons"
  | "armor"
  | "general-equipment"
  | "inventory";

export type Item = {
  id: number;
  name: string;
  catalogSection: string;
  timelineTag: string;
  costCredits: number | null;
  category: string;
  subtype: string;
  weight: number | null;
  effectDescription: string;
  narrativeVariantNotes: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemCoreDraft = Omit<Item, "id" | "createdAt" | "updatedAt">;

export type ItemWeaponProfile = {
  id: number;
  itemId: number;
  weaponRole: string;
  weaponCategory: string;
  handedness: string;
  damageType: string;
  rangeType: string;
  rangeText: string;
  damage: number | null;
  weaponEffectDescription: string;
  weaponNarrativeNotes: string;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemWeaponProfileDraft = Omit<
  ItemWeaponProfile,
  "id" | "itemId" | "createdAt" | "updatedAt"
>;

export type ItemArmorProfile = {
  id: number;
  itemId: number;
  areaCovered: string;
  soak: number | null;
  armorCategory: string;
  armorType: string;
  encumbrancePenalty: number | null;
  armorEffectDescription: string;
  armorNarrativeNotes: string;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemArmorProfileDraft = Omit<
  ItemArmorProfile,
  "id" | "itemId" | "createdAt" | "updatedAt"
>;

export type ItemCreatureLinkSummary = {
  creatureId: number;
  creatureName: string;
  relationship: string;
  notes: string;
};

export type ItemAlias = {
  id: number;
  itemId: number;
  alias: string;
  sortOrder: number;
  notes: string;
  sourceReference: string;
  createdAt: string;
  updatedAt: string;
};

export type ItemAliasDraft = Pick<ItemAlias, "alias" | "notes" | "sourceReference">;

export type ItemAggregate = {
  item: Item;
  genreTags: string[];
  aliases: ItemAlias[];
  weaponProfile: ItemWeaponProfile | null;
  armorProfile: ItemArmorProfile | null;
  creatureLinks: ItemCreatureLinkSummary[];
};

export type SaveItemAggregate = {
  id?: number;
  core: ItemCoreDraft;
  genreTags: string[];
  aliases: ItemAliasDraft[];
  weaponProfile: ItemWeaponProfileDraft | null;
  armorProfile: ItemArmorProfileDraft | null;
};

export type ItemSummary = Pick<
  Item,
  | "id"
  | "name"
  | "catalogSection"
  | "timelineTag"
  | "costCredits"
  | "category"
  | "subtype"
  | "weight"
  | "updatedAt"
> & {
  genreTags: string[];
  weaponRole: string | null;
  weaponCategory: string | null;
  damageType: string | null;
  armorCategory: string | null;
  armorType: string | null;
  hasWeaponProfile: boolean;
  hasArmorProfile: boolean;
  hasPurchaseCreatureLink: boolean;
};

export type ItemLibraryFilters = {
  view: ItemCatalogView;
  search?: string;
  category?: string;
  subtype?: string;
  type?: string;
  genre?: string;
  includeImprovised?: boolean;
  purchasableCreaturesOnly?: boolean;
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

export type ItemLibraryOptions = {
  categories: string[];
  subtypes: string[];
  types: string[];
  genres: string[];
};
