import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkillLibraryPage } from "../../types/skill";
import { SkillLibrary } from "./SkillLibrary";

describe("SkillLibrary relationship visibility", () => {
  it("shows an off-page parent in Tree View", () => {
    const page: SkillLibraryPage = {
      items: [{
        id: 665,
        name: "Charm",
        classification: "sphere",
        tier: 2,
        primaryAttribute: "INT",
        secondaryAttribute: "WIS",
        updatedAt: "2026-08-16T00:00:00.000Z",
        relationshipCount: 1,
        parentNames: ["Spellcraft"],
        hasSpellConstruction: false,
      }],
      relationships: [{
        skillId: 665,
        relatedSkillId: 650,
        relationshipType: "parent",
        sortOrder: 0,
      }],
      total: 1,
      page: 1,
      pageSize: 40,
      pageCount: 1,
    };

    const markup = renderToStaticMarkup(
      <SkillLibrary
        page={page}
        filters={{ page: 1, pageSize: 40 }}
        filterOptions={{
          classifications: [],
          tiers: [],
          primaryAttributes: [],
          secondaryAttributes: [],
        }}
        view="tree"
        loading={false}
        onViewChange={vi.fn()}
        onFiltersChange={vi.fn()}
        onSelect={vi.fn()}
        onNewSkill={vi.fn()}
      />,
    );

    expect(markup).toContain("Charm");
    expect(markup).toContain("Parent: Spellcraft");
  });
});
