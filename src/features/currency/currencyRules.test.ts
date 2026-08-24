import { describe, expect, it } from "vitest";
import type { CampaignDerivedCurrencyRecord } from "../../types/campaign";
import {
  convertCreditsToDerivedUnits,
  formatCampaignMoney,
  getCanonicalCreditsFromHoldings,
  getCampaignMoneyBreakdown,
  getStoredCampaignMoneyBreakdown,
} from "./currencyRules";

const currencies: CampaignDerivedCurrencyRecord[] = [
  { id: 1, campaignId: 12, name: "Penny", description: "Copper coin", creditsPerUnit: 0.01, sortOrder: 0 },
  { id: 2, campaignId: 12, name: "Nickel", description: "Silver coin", creditsPerUnit: 0.05, sortOrder: 1 },
  { id: 3, campaignId: 12, name: "Dime", description: "Small silver coin", creditsPerUnit: 0.1, sortOrder: 2 },
  { id: 4, campaignId: 12, name: "Quarter", description: "Large silver coin", creditsPerUnit: 0.25, sortOrder: 3 },
  { id: 5, campaignId: 12, name: "Dollar", description: "One bill", creditsPerUnit: 1, sortOrder: 4 },
  { id: 6, campaignId: 12, name: "Five Dollar Bill", description: "Five bill", creditsPerUnit: 5, sortOrder: 5 },
];

describe("Campaign currency rules", () => {
  it("assigns a canonical balance into whole configured game denominations", () => {
    expect(getCampaignMoneyBreakdown(12.41, "Derived Currency", currencies)).toMatchObject({
      fullyRepresented: true,
      formatted: "2 Five Dollar Bill, 2 Dollar, 1 Quarter, 1 Dime, 1 Nickel, 1 Penny",
      entries: [
        { name: "Five Dollar Bill", quantity: 2 },
        { name: "Dollar", quantity: 2 },
        { name: "Quarter", quantity: 1 },
        { name: "Dime", quantity: 1 },
        { name: "Nickel", quantity: 1 },
        { name: "Penny", quantity: 1 },
      ],
    });
  });

  it("uses Credits only when Credits are the Campaign's actual currency", () => {
    expect(formatCampaignMoney(12.5, "Credits", [])).toBe("12.5 Credits");
    expect(convertCreditsToDerivedUnits(400, 5)).toBe(80);
  });

  it("reports when configured denominations cannot represent a price exactly", () => {
    const result = getCampaignMoneyBreakdown(0.03, "Derived Currency", currencies.slice(1));
    expect(result.fullyRepresented).toBe(false);
    expect(result.formatted).toContain("denomination gap");
    expect(result.formatted).not.toContain("Credits");
  });

  it("preserves exact held denominations instead of normalizing their total value", () => {
    const holdings = [{ currencyId: 5, quantity: 10 }];
    const purse = getStoredCampaignMoneyBreakdown(
      10,
      "Derived Currency",
      currencies,
      holdings,
    );

    expect(purse.formatted).toBe("10 Dollar");
    expect(purse.entries.find((entry) => entry.name === "Five Dollar Bill")?.quantity).toBe(0);
    expect(purse.entries.find((entry) => entry.name === "Dollar")?.quantity).toBe(10);
    expect(getCanonicalCreditsFromHoldings(currencies, holdings)).toBe(10);
  });
});
