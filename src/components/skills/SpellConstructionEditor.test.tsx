import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createEmptySpell } from "../../features/spell-construction/utilities/spellFactory";
import { SpellConstructionEditor } from "./SpellConstructionEditor";

describe("G.O.D. Spell Construction editor", () => {
  it("keeps spell-definition tools without caster-specific controls", () => {
    const markup = renderToStaticMarkup(
      <SpellConstructionEditor
        document={{ ...createEmptySpell(), practitionerLevel: "Master" }}
        onChange={vi.fn()}
        findFrameworkSkills={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(markup).toContain("Construction Identity");
    expect(markup).toContain("Base Construction");
    expect(markup).toContain("Base Mana");
    expect(markup).not.toContain("Practitioner Level");
    expect(markup).not.toContain("Raw Casting");
    expect(markup).not.toContain("CASTING CONTEXT");
  });
});
