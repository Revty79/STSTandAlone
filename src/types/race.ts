export type Race = {
  id: number;
  name: string;
  legacyDescription: string;
  physicalCharacteristics: string;
  physicalDescription: string;
  ageRangeText: string;
  ageMin: number | null;
  ageMax: number | null;
  size: string;
  baseMagic: number | null;
  racialQuirkName: string;
  quirkSuccessEffect: string;
  quirkFailureEffect: string;
  commonLanguagesKnown: string;
  commonArchetypes: string;
  genreExamples: string;
  culturalMindset: string;
  outlookOnMagic: string;
  createdByUserId: number | null;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RaceCoreDraft = Omit<Race, "id" | "createdAt" | "updatedAt">;

export type RaceAttributeCap = {
  id: number;
  raceId: number;
  attributeKey: string;
  maxValue: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RaceAttributeCapDraft = Pick<
  RaceAttributeCap,
  "attributeKey" | "maxValue" | "sortOrder"
>;

export type RaceMovementMode = {
  id: number;
  raceId: number;
  movementMode: string;
  baseValue: number;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RaceMovementModeDraft = Pick<
  RaceMovementMode,
  "movementMode" | "baseValue" | "notes" | "sortOrder"
>;

export type RaceSkillLink = {
  id: number;
  raceId: number;
  skillId: number;
  skillName: string;
  skillClassification: string;
  linkType: string;
  value: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RaceSkillLinkDraft = Pick<
  RaceSkillLink,
  "skillId" | "skillName" | "skillClassification" | "linkType" | "value" | "sortOrder"
>;

export type RaceAggregate = {
  race: Race;
  attributeCaps: RaceAttributeCap[];
  movementModes: RaceMovementMode[];
  skillLinks: RaceSkillLink[];
};

export type SaveRaceAggregate = {
  id?: number;
  core: RaceCoreDraft;
  attributeCaps: RaceAttributeCapDraft[];
  movementModes: RaceMovementModeDraft[];
  skillLinks: RaceSkillLinkDraft[];
};

export type RaceSummary = Pick<
  Race,
  "id" | "name" | "size" | "ageRangeText" | "baseMagic" | "updatedAt"
> & {
  attributeCapCount: number;
  movementModeCount: number;
  skillLinkCount: number;
};

export type RaceLibraryFilters = {
  search?: string;
  size?: string;
  page: number;
  pageSize: number;
};

export type RaceLibraryPage = {
  items: RaceSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type RaceSkillCandidate = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};
