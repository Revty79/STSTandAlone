import type {
  CampaignCurrencySystem,
  CampaignDerivedCurrencyRecord,
} from "../../types/campaign";

type CurrencyDefinition = Pick<
  CampaignDerivedCurrencyRecord,
  "id" | "name" | "description" | "creditsPerUnit" | "sortOrder"
>;

export type CampaignMoneyEntry = CurrencyDefinition & {
  quantity: number;
};

export type CampaignMoneyBreakdown = {
  entries: CampaignMoneyEntry[];
  fullyRepresented: boolean;
  formatted: string;
};

const MAX_DECIMAL_PLACES = 6;

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) {
    const [coefficient, exponentText] = text.split("e-");
    const exponent = Number(exponentText);
    const coefficientDecimals = coefficient.split(".")[1]?.length ?? 0;
    return Math.min(MAX_DECIMAL_PLACES, exponent + coefficientDecimals);
  }
  return Math.min(MAX_DECIMAL_PLACES, text.split(".")[1]?.length ?? 0);
}

function numberLabel(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(MAX_DECIMAL_PLACES).replace(/0+$/, "").replace(/\.$/, "");
}

function formatEntries(entries: readonly CampaignMoneyEntry[]): string {
  const used = entries.filter((entry) => entry.quantity > 0);
  if (used.length > 0) {
    return used.map((entry) => `${numberLabel(entry.quantity)} ${entry.name}`).join(", ");
  }
  const smallest = entries[entries.length - 1];
  return smallest ? `0 ${smallest.name}` : "Currency not configured";
}

export function convertCreditsToDerivedUnits(
  credits: number,
  creditsPerUnit: number,
): number | null {
  if (!Number.isFinite(credits) || credits < 0) return null;
  if (!Number.isFinite(creditsPerUnit) || creditsPerUnit <= 0) return null;
  return credits / creditsPerUnit;
}

export function getCampaignMoneyBreakdown(
  canonicalCredits: number,
  currencySystem: CampaignCurrencySystem,
  currencies: readonly CurrencyDefinition[],
): CampaignMoneyBreakdown {
  if (!Number.isFinite(canonicalCredits) || canonicalCredits < 0) {
    return { entries: [], fullyRepresented: false, formatted: "Invalid amount" };
  }
  if (currencySystem === "Credits") {
    const entries = [{
      id: 0,
      name: "Credits",
      description: "Campaign Credits",
      creditsPerUnit: 1,
      sortOrder: 0,
      quantity: canonicalCredits,
    }];
    return { entries, fullyRepresented: true, formatted: formatEntries(entries) };
  }

  const validCurrencies = currencies
    .filter((currency) => Number.isFinite(currency.creditsPerUnit) && currency.creditsPerUnit > 0)
    .sort((left, right) => right.creditsPerUnit - left.creditsPerUnit
      || left.sortOrder - right.sortOrder
      || left.id - right.id);
  if (validCurrencies.length === 0) {
    return { entries: [], fullyRepresented: false, formatted: "Currency not configured" };
  }

  const precision = Math.max(
    decimalPlaces(canonicalCredits),
    ...validCurrencies.map((currency) => decimalPlaces(currency.creditsPerUnit)),
  );
  const scale = 10 ** precision;
  let remaining = Math.round(canonicalCredits * scale);
  const entries = validCurrencies.map((currency) => {
    const unitValue = Math.round(currency.creditsPerUnit * scale);
    const quantity = unitValue > 0 ? Math.floor(remaining / unitValue) : 0;
    remaining -= quantity * unitValue;
    return { ...currency, quantity };
  });
  const fullyRepresented = remaining === 0;
  return {
    entries,
    fullyRepresented,
    formatted: fullyRepresented
      ? formatEntries(entries)
      : `${formatEntries(entries)} · denomination gap`,
  };
}

export function formatCampaignMoney(
  canonicalCredits: number,
  currencySystem: CampaignCurrencySystem,
  currencies: readonly CurrencyDefinition[],
): string {
  return getCampaignMoneyBreakdown(
    canonicalCredits,
    currencySystem,
    currencies,
  ).formatted;
}
