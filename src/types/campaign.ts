import type { UserRole } from "./user";

export const CAMPAIGN_SYSTEM_OPTIONS = [
  "Tier 1",
  "Tier 2",
  "Tier 3",
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Special Abilities",
  "Bardic Resonance",
] as const;

export type CampaignSystemOption = (typeof CAMPAIGN_SYSTEM_OPTIONS)[number];
export type CampaignCurrencySystem = "Credits" | "Derived Currency";
export type CampaignFatePointMethod = "Assigned" | "Rolled";

export type CampaignCore = {
  id: number;
  name: string;
  attributePoints: number;
  skillPoints: number;
  maxStartingSkill: number;
  pointsToUnlockNextTier: number;
  maxPointsInSkill: number;
  startingCreditAmount: number;
  currencySystem: CampaignCurrencySystem;
  fatePointMethod: CampaignFatePointMethod;
  assignedFatePoints: number | null;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignDerivedCurrencyRecord = {
  id: number;
  campaignId: number;
  name: string;
  description: string;
  creditsPerUnit: number;
  sortOrder: number;
};

export type CampaignRaceReference = {
  id: number;
  name: string;
};

export type CampaignInventoryGenreReference = {
  id: number;
  name: string;
  tagGroup: string;
  description: string;
};

export type CampaignInventoryItemReference = {
  id: number;
  canonicalId: string;
  name: string;
  recordType: string;
  family: string;
  category: string;
  catalogScope: "equipment" | "inventory";
  equipmentGroup: "general" | "weapon" | "armor" | null;
  tags: string[];
};

export type CampaignProfileReference = {
  id: number;
  username: string;
  roles: UserRole[];
  isCampaignPlayer: boolean;
};

export type CampaignPlayerReference = {
  id: number;
  username: string;
  addedAt: string;
};

export type CampaignCharacterReference = {
  id: number;
  campaignId: number;
  playerUserId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  creationCompletedAt?: string | null;
};

export type CampaignNpcReference = {
  id: number;
  campaignId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  creationCompletedAt: string | null;
};

export type PlayerCampaignReference = Pick<CampaignCore, "id" | "name">;

export type CampaignAggregate = {
  campaign: CampaignCore;
  derivedCurrencies: CampaignDerivedCurrencyRecord[];
  allowedSystems: CampaignSystemOption[];
  allowedRaces: CampaignRaceReference[];
  inventoryGenres: CampaignInventoryGenreReference[];
  inventoryItems: CampaignInventoryItemReference[];
};

export type CampaignSummary = Pick<
  CampaignCore,
  "id" | "name" | "currencySystem" | "updatedAt"
>;

export type SaveCampaignAggregate = {
  id?: number;
  core: Omit<CampaignCore, "id" | "createdAt" | "updatedAt">;
  derivedCurrencies: Array<{
    name: string;
    description: string;
    creditsPerUnit: number;
  }>;
  allowedSystems: CampaignSystemOption[];
  allowedRaceIds: number[];
  inventoryGenreNames: string[];
  inventoryItemIds: number[];
};
