import {
  campaignRepository,
  type CampaignRepository,
} from "../data/repositories/campaignRepository";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  type CampaignAggregate,
  type CampaignCharacterReference,
  type CampaignPlayerReference,
  type CampaignProfileReference,
  type CampaignSummary,
  type CampaignSystemOption,
  type SaveCampaignAggregate,
} from "../types/campaign";

export class CampaignValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignValidationError";
  }
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new CampaignValidationError(`${label} is required.`);
  return result;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new CampaignValidationError(`${label} must be a number zero or greater.`);
  }
  return value;
}

function uniqueNumbers(values: readonly number[], label: string): number[] {
  if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new CampaignValidationError(`${label} must reference saved records.`);
  }
  return [...new Set(values)];
}

function savedId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CampaignValidationError(`${label} must reference a saved record.`);
  }
  return value;
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of values) {
    const value = candidate.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export function normalizeCampaignAggregate(
  input: SaveCampaignAggregate,
): SaveCampaignAggregate {
  if (!Number.isInteger(input.core.createdByUserId) || input.core.createdByUserId <= 0) {
    throw new CampaignValidationError("Campaign creator must reference a saved profile.");
  }
  const allowedSystems = uniqueText(input.allowedSystems);
  if (allowedSystems.some((system) =>
    !CAMPAIGN_SYSTEM_OPTIONS.includes(system as CampaignSystemOption))) {
    throw new CampaignValidationError("Campaign includes an unsupported Allowed System.");
  }
  const derivedCurrencies = input.core.currencySystem === "Derived Currency"
    ? input.derivedCurrencies.map((currency, index) => ({
        name: required(currency.name, `Currency ${index + 1} Name`),
        description: required(currency.description, `Currency ${index + 1} Description`),
        creditsPerUnit: (() => {
          if (!Number.isFinite(currency.creditsPerUnit) || currency.creditsPerUnit <= 0) {
            throw new CampaignValidationError(
              `Currency ${index + 1} Credit Value must be greater than zero.`,
            );
          }
          return currency.creditsPerUnit;
        })(),
      }))
    : [];
  if (input.core.currencySystem === "Derived Currency" && derivedCurrencies.length === 0) {
    throw new CampaignValidationError("Derived Currency requires at least one currency entry.");
  }
  const currencyNames = new Set<string>();
  for (const currency of derivedCurrencies) {
    const key = currency.name.toLocaleLowerCase();
    if (currencyNames.has(key)) {
      throw new CampaignValidationError(`Currency ${currency.name} cannot be added twice.`);
    }
    currencyNames.add(key);
  }

  return {
    id: input.id,
    core: {
      ...input.core,
      name: required(input.core.name, "Campaign Name"),
      attributePoints: nonNegative(input.core.attributePoints, "Attribute Points"),
      skillPoints: nonNegative(input.core.skillPoints, "Skill Points"),
      maxStartingSkill: nonNegative(input.core.maxStartingSkill, "Max Starting Skill"),
      pointsToUnlockNextTier: nonNegative(
        input.core.pointsToUnlockNextTier,
        "Needed to Unlock Next Tier",
      ),
      maxPointsInSkill: nonNegative(input.core.maxPointsInSkill, "Max Points in a Skill"),
      startingCreditAmount: nonNegative(
        input.core.startingCreditAmount,
        "Starting Credit Amount",
      ),
    },
    derivedCurrencies,
    allowedSystems: allowedSystems as CampaignSystemOption[],
    allowedRaceIds: uniqueNumbers(input.allowedRaceIds, "Allowed Races"),
    inventoryGenreNames: uniqueText(input.inventoryGenreNames),
    inventoryItemIds: uniqueNumbers(input.inventoryItemIds, "Campaign Inventory Items"),
  };
}

export class CampaignService {
  constructor(private readonly repository: CampaignRepository = campaignRepository) {}

  listCampaigns(): Promise<CampaignSummary[]> {
    return this.repository.listCampaigns();
  }

  getCampaign(id: number): Promise<CampaignAggregate | null> {
    return this.repository.getCampaignAggregate(id);
  }

  async saveCampaign(input: SaveCampaignAggregate): Promise<CampaignAggregate> {
    return this.repository.saveCampaignAggregate(normalizeCampaignAggregate(input));
  }

  listProfilesForCampaign(campaignId: number): Promise<CampaignProfileReference[]> {
    return this.repository.listProfilesForCampaign(savedId(campaignId, "Campaign"));
  }

  listCampaignPlayers(campaignId: number): Promise<CampaignPlayerReference[]> {
    return this.repository.listCampaignPlayers(savedId(campaignId, "Campaign"));
  }

  async addPlayer(campaignId: number, profileId: number): Promise<CampaignPlayerReference[]> {
    const savedCampaignId = savedId(campaignId, "Campaign");
    const savedProfileId = savedId(profileId, "Profile");
    await this.repository.addCampaignPlayer(savedCampaignId, savedProfileId);
    return this.repository.listCampaignPlayers(savedCampaignId);
  }

  async listCharacters(
    campaignId: number,
    playerProfileId: number,
  ): Promise<CampaignCharacterReference[]> {
    return this.repository.listCampaignCharacters(
      savedId(campaignId, "Campaign"),
      savedId(playerProfileId, "Player Profile"),
    );
  }

  async createCharacter(
    campaignId: number,
    playerProfileId: number,
  ): Promise<CampaignCharacterReference> {
    return this.repository.createCampaignCharacter(
      savedId(campaignId, "Campaign"),
      savedId(playerProfileId, "Player Profile"),
    );
  }
}

export const campaignService = new CampaignService();
