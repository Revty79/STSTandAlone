import { describe, expect, it } from "vitest";
import { compareSizes, isSize, SIZE_OPTIONS, SIZE_ORDER } from "./sizeOptions";

const EXPECTED_SIZE_SCALE = [
  "Minuscule",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;

describe("canonical Serrian Tide Size scale", () => {
  it("contains exactly the eight canonical Sizes in physical progression order", () => {
    expect(SIZE_OPTIONS).toEqual(EXPECTED_SIZE_SCALE);
    expect(SIZE_OPTIONS).toHaveLength(8);
    expect(new Set(SIZE_OPTIONS).size).toBe(8);
    expect(SIZE_OPTIONS.map((size) => SIZE_ORDER[size])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("provides shared validation and canonical-order comparison", () => {
    for (const size of EXPECTED_SIZE_SCALE) expect(isSize(size)).toBe(true);
    for (const value of ["", "Average", "Medium Small", "XLarge", "Human"]) {
      expect(isSize(value)).toBe(false);
    }
    expect([...SIZE_OPTIONS].sort(compareSizes)).toEqual(EXPECTED_SIZE_SCALE);
  });
});
