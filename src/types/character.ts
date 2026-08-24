import type {
  CampaignCurrencySystem,
  CampaignDerivedCurrencyRecord,
  CampaignRaceReference,
  CampaignSystemOption,
} from "./campaign";
import type { RaceAggregate } from "./race";

export const CHARACTER_ATTRIBUTE_KEYS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHR",
] as const;

export type CharacterAttributeKey = (typeof CHARACTER_ATTRIBUTE_KEYS)[number];

export const CHARACTER_ATTRIBUTE_LABELS: Record<CharacterAttributeKey, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHR: "Charisma",
};

export type CharacterCore = {
  id: number;
  campaignId: number;
  playerUserId: number;
  name: string;
  campaignName: string;
  playerUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterProfile = {
  characterId: number;
  raceId: number | null;
  age: number | null;
  sex: string;
  heightFeet: number | null;
  heightInches: number | null;
  weight: number | null;
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  deity: string;
  definingMarks: string;
  personality: string;
  goals: string;
  secrets: string;
  backstory: string;
  motivations: string;
  fame: number;
  experience: number;
  totalExperience: number;
  quintessence: number;
  totalQuintessence: number;
  creditsRemaining: number;
  creationCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CharacterAttributeAllocation = {
  characterId: number;
  attributeKey: CharacterAttributeKey;
  value: number;
};

export type CharacterSkillAllocation = {
  id: number;
  characterId: number;
  skillId: number;
  skillName: string;
  skillClassification: string;
  skillTier: number | null;
  primaryAttribute: string | null;
  parentAllocationId: number | null;
  points: number;
  createdAt: string;
  updatedAt: string;
};

export type CharacterOwnedItem = {
  characterId: number;
  itemId: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  quantity: number;
  unitCostCredits: number;
  acquiredAt: string;
};

export type CharacterCampaignRules = {
  id: number;
  name: string;
  attributePoints: number;
  skillPoints: number;
  maxStartingSkill: number;
  pointsToUnlockNextTier: number;
  maxPointsInSkill: number;
  startingCreditAmount: number;
  currencySystem: CampaignCurrencySystem;
  allowedSystems: CampaignSystemOption[];
  derivedCurrencies: CampaignDerivedCurrencyRecord[];
};

export type CharacterSkillReference = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  definition: string;
};

export type CharacterSkillRelationship = {
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
};

export type CharacterAuthorizedItem = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  credits: number | null;
  priceBasis: string;
};

export type CharacterAggregate = {
  character: CharacterCore;
  profile: CharacterProfile;
  attributes: CharacterAttributeAllocation[];
  skillAllocations: CharacterSkillAllocation[];
  items: CharacterOwnedItem[];
  campaign: CharacterCampaignRules;
  allowedRaces: CampaignRaceReference[];
  selectedRace: RaceAggregate | null;
  skillCatalog: CharacterSkillReference[];
  skillRelationships: CharacterSkillRelationship[];
  authorizedItems: CharacterAuthorizedItem[];
};

export type CharacterProfileDraft = Omit<
  CharacterProfile,
  "characterId" | "creditsRemaining" | "creationCompletedAt" | "createdAt" | "updatedAt"
>;

export type CharacterSkillAllocationInput = {
  skillId: number;
  points: number;
  children: CharacterSkillAllocationInput[];
};

export type SaveCharacterAggregate = {
  characterId: number;
  campaignId: number;
  requestingUserId: number;
  completeCreation: boolean;
  name: string;
  profile: CharacterProfileDraft;
  attributes: Array<{
    attributeKey: CharacterAttributeKey;
    value: number;
  }>;
  skillAllocations: CharacterSkillAllocationInput[];
  items: Array<{
    itemId: number;
    quantity: number;
    unitCostCredits: number;
  }>;
};

export type CharacterSkillAllocationDraft = {
  draftId: number;
  skillId: number;
  parentDraftId: number | null;
  points: number;
};

export type CharacterDraft = {
  name: string;
  profile: CharacterProfileDraft;
  attributes: Record<CharacterAttributeKey, number>;
  skillAllocations: CharacterSkillAllocationDraft[];
  items: Array<{
    itemId: number;
    quantity: number;
    unitCostCredits: number;
  }>;
};
