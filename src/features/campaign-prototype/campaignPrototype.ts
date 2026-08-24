import {
  CAMPAIGN_SYSTEM_OPTIONS,
  type CampaignCurrencySystem,
  type CampaignSystemOption,
} from "../../types/campaign";

export { CAMPAIGN_SYSTEM_OPTIONS };
export type { CampaignCurrencySystem, CampaignSystemOption };

export type CampaignRaceOption = {
  id: number;
  name: string;
};

export type CampaignInventoryItem = {
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

export type CampaignDerivedCurrencyDraft = {
  name: string;
  description: string;
  creditsPerUnit: string;
};

export type CampaignDerivedCurrency = {
  name: string;
  description: string;
  creditsPerUnit: number;
};

export type CampaignPrototypeDraft = {
  name: string;
  attributePoints: string;
  skillPoints: string;
  maxStartingSkill: string;
  pointsToUnlockNextTier: string;
  maxPointsInSkill: string;
  startingCreditAmount: string;
  currencySystem: CampaignCurrencySystem | "";
  derivedCurrencies: CampaignDerivedCurrencyDraft[];
  allowedSystems: CampaignSystemOption[];
  allowedRaceIds: number[];
  inventoryGenres: string[];
  inventoryItems: CampaignInventoryItem[];
};

export type CampaignPrototypeSnapshot = {
  name: string;
  attributePoints: number;
  skillPoints: number;
  maxStartingSkill: number;
  pointsToUnlockNextTier: number;
  maxPointsInSkill: number;
  startingCreditAmount: number;
  currencySystem: CampaignCurrencySystem;
  derivedCurrencies: CampaignDerivedCurrency[];
  allowedSystems: CampaignSystemOption[];
  allowedRaces: CampaignRaceOption[];
  inventoryGenres: string[];
  inventoryItems: CampaignInventoryItem[];
};

type NumericDraftField =
  | "attributePoints"
  | "skillPoints"
  | "maxStartingSkill"
  | "pointsToUnlockNextTier"
  | "maxPointsInSkill"
  | "startingCreditAmount";

type CampaignPrototypeFieldErrors = Partial<
  Record<keyof CampaignPrototypeDraft, string>
>;

export type CampaignPrototypeErrors = CampaignPrototypeFieldErrors & {
  derivedCurrencyRows?: Array<
    Partial<Record<keyof CampaignDerivedCurrencyDraft, string>>
  >;
};

export type CampaignPrototypeCompletion =
  | { ok: true; snapshot: CampaignPrototypeSnapshot; errors: CampaignPrototypeErrors }
  | { ok: false; snapshot: null; errors: CampaignPrototypeErrors };

const NUMERIC_FIELDS: readonly [NumericDraftField, string][] = [
  ["attributePoints", "Attribute Points"],
  ["skillPoints", "Skill Points"],
  ["maxStartingSkill", "Max Starting Points Spent per Skill"],
  ["pointsToUnlockNextTier", "Needed to Unlock Next Tier"],
  ["maxPointsInSkill", "Max Points in a Standard Skill"],
  ["startingCreditAmount", "Starting Credit Amount"],
];

export function createEmptyCampaignPrototypeDraft(): CampaignPrototypeDraft {
  return {
    name: "",
    attributePoints: "",
    skillPoints: "",
    maxStartingSkill: "",
    pointsToUnlockNextTier: "",
    maxPointsInSkill: "",
    startingCreditAmount: "",
    currencySystem: "",
    derivedCurrencies: [],
    allowedSystems: [],
    allowedRaceIds: [],
    inventoryGenres: [],
    inventoryItems: [],
  };
}

export function createEmptyDerivedCurrencyDraft(): CampaignDerivedCurrencyDraft {
  return { name: "", description: "", creditsPerUnit: "" };
}

export function deduplicateCampaignInventoryItems(
  items: readonly CampaignInventoryItem[],
): CampaignInventoryItem[] {
  const itemsById = new Map<number, CampaignInventoryItem>();
  for (const item of items) itemsById.set(item.id, item);
  return [...itemsById.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

export function completeCampaignPrototype(
  draft: CampaignPrototypeDraft,
  raceOptions: readonly CampaignRaceOption[],
): CampaignPrototypeCompletion {
  const errors: CampaignPrototypeErrors = {};
  const numericValues = {} as Record<NumericDraftField, number>;

  if (!draft.name.trim()) errors.name = "Campaign Name is required.";

  for (const [field, label] of NUMERIC_FIELDS) {
    const text = draft[field].trim();
    if (!text) {
      errors[field] = `${label} is required.`;
      continue;
    }

    const value = Number(text);
    if (!Number.isFinite(value)) {
      errors[field] = `${label} must be a valid number.`;
      continue;
    }
    if (value < 0) {
      errors[field] = `${label} cannot be negative.`;
      continue;
    }
    numericValues[field] = value;
  }

  if (!draft.currencySystem) {
    errors.currencySystem = "Choose Credits or Derived Currency.";
  }

  const derivedCurrencies: CampaignDerivedCurrency[] = [];
  if (draft.currencySystem === "Derived Currency") {
    if (draft.derivedCurrencies.length === 0) {
      errors.derivedCurrencies = "Add at least one Derived Currency entry.";
    } else {
      const rowErrors = draft.derivedCurrencies.map((currency, index) => {
        const entryErrors: NonNullable<CampaignPrototypeErrors["derivedCurrencyRows"]>[number] = {};
        const name = currency.name.trim();
        const description = currency.description.trim();
        const creditValueText = currency.creditsPerUnit.trim();
        const creditsPerUnit = Number(creditValueText);

        if (!name) entryErrors.name = `Currency ${index + 1} Name is required.`;
        if (!description) {
          entryErrors.description = `Currency ${index + 1} Description is required.`;
        }
        if (!creditValueText || !Number.isFinite(creditsPerUnit) || creditsPerUnit <= 0) {
          entryErrors.creditsPerUnit =
            `Currency ${index + 1} Credit Value must be greater than zero.`;
        }

        if (
          name &&
          description &&
          Number.isFinite(creditsPerUnit) &&
          creditsPerUnit > 0
        ) {
          derivedCurrencies.push({ name, description, creditsPerUnit });
        }
        return entryErrors;
      });

      if (rowErrors.some((row) => Object.keys(row).length > 0)) {
        errors.derivedCurrencyRows = rowErrors;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, snapshot: null, errors };
  }

  const selectedRaceIds = new Set(draft.allowedRaceIds);
  return {
    ok: true,
    errors: {},
    snapshot: {
      name: draft.name.trim(),
      attributePoints: numericValues.attributePoints,
      skillPoints: numericValues.skillPoints,
      maxStartingSkill: numericValues.maxStartingSkill,
      pointsToUnlockNextTier: numericValues.pointsToUnlockNextTier,
      maxPointsInSkill: numericValues.maxPointsInSkill,
      startingCreditAmount: numericValues.startingCreditAmount,
      currencySystem: draft.currencySystem as CampaignCurrencySystem,
      derivedCurrencies,
      allowedSystems: [...draft.allowedSystems],
      allowedRaces: raceOptions.filter((race) => selectedRaceIds.has(race.id)),
      inventoryGenres: [...draft.inventoryGenres],
      inventoryItems: [...draft.inventoryItems],
    },
  };
}
export { convertCreditsToDerivedUnits } from "../currency/currencyRules";
