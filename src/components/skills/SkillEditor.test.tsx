import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SaveSkillAggregate } from "../../types/skill";
import { SkillEditor } from "./SkillEditor";

function draftWithAttributes(): SaveSkillAggregate {
  return {
    core: {
      name: "New Skill",
      classification: "standard",
      tier: 2,
      primaryAttribute: "INT",
      secondaryAttribute: null,
      definition: "",
      createdByUserId: 1,
      sourceSystem: null,
      sourceExternalId: null,
    },
    relationships: [],
    extensions: [],
  };
}

describe("SkillEditor classification control", () => {
  it("renders a real enabled dropdown containing all catalog classifications", () => {
    const markup = renderToStaticMarkup(
      <SkillEditor
        draft={draftWithAttributes()}
        filterOptions={{
          classifications: ["standard", "spell", "sphere", "special ability"],
          tiers: [1, 2, 3],
          primaryAttributes: ["INT"],
          secondaryAttributes: [],
        }}
        saving={false}
        dirty={false}
        feedback={null}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        findCandidates={vi.fn().mockResolvedValue([])}
        findFrameworkSkills={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(markup).toContain('<select aria-label="Classification"');
    expect(markup).toContain('<option value="standard" selected="">Standard</option>');
    expect(markup).toContain('<option value="spell">Spell</option>');
    expect(markup).toContain('<option value="sphere">Sphere</option>');
    expect(markup).toContain(
      '<option value="special ability">Special Ability</option>',
    );
    expect(markup).not.toContain('list="skill-classifications"');
  });
});
