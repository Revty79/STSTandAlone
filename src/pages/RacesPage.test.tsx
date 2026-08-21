import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RaceLibrary } from "../components/races/RaceLibrary";
import { RaceOverviewEditor } from "../components/races/RaceOverviewEditor";
import { STANDARD_RACE_ATTRIBUTES } from "../data/raceOptions";
import { SIZE_OPTIONS } from "../data/sizeOptions";
import { newRaceDraft } from "./RacesPage";

const optionValues = (markup: string) =>
  [...markup.matchAll(/<option value="([^"]*)"/gu)].map((match) => match[1]);

describe("Race editor defaults", () => {
  it("starts a new Race with removable standard attribute rows", () => {
    const draft = newRaceDraft(7);
    expect(draft.attributeCaps.map(({ attributeKey }) => attributeKey)).toEqual(
      STANDARD_RACE_ATTRIBUTES,
    );
    expect(draft.attributeCaps.every(({ maxValue }) => maxValue === 50)).toBe(true);
  });

  it("offers only the canonical Size choices in the Race editor", () => {
    const markup = renderToStaticMarkup(
      <RaceOverviewEditor core={newRaceDraft(7).core} onChange={vi.fn()} />,
    );
    expect(optionValues(markup)).toEqual(["", ...SIZE_OPTIONS]);
  });

  it("uses the same canonical Size choices in the Race Library filter", () => {
    const markup = renderToStaticMarkup(
      <RaceLibrary
        page={{ items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 }}
        filters={{ page: 1, pageSize: 40 }}
        loading={false}
        onFiltersChange={vi.fn()}
        onSelect={vi.fn()}
        onNewRace={vi.fn()}
      />,
    );
    expect(optionValues(markup)).toEqual(["", ...SIZE_OPTIONS]);
  });
});
