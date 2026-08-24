import { describe, expect, it } from "vitest";
import {
  getExperienceFromQuintessence,
  getQuintessenceCost,
} from "./characterQuintessenceRules";

describe("Quintessence advancement costs", () => {
  it("charges five per Attribute point and ten per Fate Point", () => {
    expect(getQuintessenceCost("attribute", 3)).toBe(15);
    expect(getQuintessenceCost("fatePoints", 2)).toBe(20);
  });

  it("converts each spent Quintessence into ten Experience", () => {
    expect(getQuintessenceCost("experience", 4)).toBe(4);
    expect(getExperienceFromQuintessence(4)).toBe(40);
  });

  it("rejects zero, negative, and fractional quantities", () => {
    expect(getQuintessenceCost("attribute", 0)).toBe(Number.POSITIVE_INFINITY);
    expect(getQuintessenceCost("fatePoints", -1)).toBe(Number.POSITIVE_INFINITY);
    expect(getQuintessenceCost("experience", 1.5)).toBe(Number.POSITIVE_INFINITY);
  });
});
