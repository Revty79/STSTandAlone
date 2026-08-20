import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RaceOverviewEditor } from "../components/races/RaceOverviewEditor";
import { RACE_SIZE_OPTIONS, STANDARD_RACE_ATTRIBUTES } from "../data/raceOptions";
import { newRaceDraft } from "./RacesPage";

describe("Race editor defaults", () => {
  it("starts a new Race with removable standard attribute rows", () => {
    const draft = newRaceDraft(7);
    expect(draft.attributeCaps.map(({ attributeKey }) => attributeKey)).toEqual(
      STANDARD_RACE_ATTRIBUTES,
    );
    expect(draft.attributeCaps.every(({ maxValue }) => maxValue === 50)).toBe(true);
  });

  it("offers the approved Size choices as a dropdown", () => {
    const markup = renderToStaticMarkup(
      <RaceOverviewEditor core={newRaceDraft(7).core} onChange={vi.fn()} />,
    );
    expect(markup).toContain("<select");
    for (const size of RACE_SIZE_OPTIONS) expect(markup).toContain(size);
  });
});
