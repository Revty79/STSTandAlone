import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterHitLocationChart } from "./CharacterHitLocationChart";

describe("CharacterHitLocationChart", () => {
  it("renders the complete body target and identifies shared HP pools", () => {
    const markup = renderToStaticMarkup(<CharacterHitLocationChart totalHp={51} />);

    for (const label of [
      "Humanoid Hit Locations",
      "51 Total HP",
      "Head",
      "Right Arm",
      "Left Arm",
      "Right Lower Leg",
      "Right Upper Leg",
      "Left Lower Leg",
      "Left Upper Leg",
      "Groin",
      "Stomach",
      "Chest",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Right Leg</span><strong>8 HP");
    expect(markup).toContain("15% of total · one pool shared by results 3 + 4");
    expect(markup).toContain("15% of total · one pool shared by results 5 + 6");
    expect(markup).toContain("30% of total · one pool shared by results 7 + 8 + 9");
    expect(markup).toContain("Uses the one Right Leg pool");
    expect(markup).toContain("HP is assigned once to each complete body region");
  });
});
