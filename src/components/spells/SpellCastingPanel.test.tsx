import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEmptySpell } from "../../features/spell-construction/utilities/spellFactory";
import { SpellCastingPanel } from "./SpellCastingPanel";

describe("SpellCastingPanel", () => {
  it("locks a Spellbook entry to the Character's caster level and Have Spell cost", () => {
    const markup = renderToStaticMarkup(
      <SpellCastingPanel
        spell={{ ...createEmptySpell(), name: "Tidal Light" }}
        practitionerLevel="Master"
        castingSystem="Spellcraft"
        manaPool={32}
        automaticKnownSpell
      />,
    );

    expect(markup).toContain("Known Spell Cost");
    expect(markup).toContain("Spellcraft");
    expect(markup).toContain("Master");
    expect(markup).toContain("I Have the Spell");
    expect(markup).not.toContain("Raw Casting Circumstance");
    expect(markup).not.toContain("Not Set");
  });
});
