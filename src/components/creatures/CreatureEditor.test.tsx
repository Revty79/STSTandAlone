import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { newCreatureDraft } from "../../pages/CreaturesPage";
import { CreatureEditor } from "./CreatureEditor";

describe("CreatureEditor", () => {
  it("exposes the complete nine-tab aggregate workspace", () => {
    const markup = renderToStaticMarkup(
      <CreatureEditor
        draft={newCreatureDraft(1)}
        saving={false}
        dirty={false}
        feedback={null}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        findSkills={vi.fn(async () => [])}
        findItems={vi.fn(async () => [])}
      />,
    );
    for (const label of [
      "Overview",
      "Attributes &amp; Movement",
      "Health &amp; Defense",
      "Attacks",
      "Skills &amp; Abilities",
      "Behavior &amp; Ecology",
      "Variants &amp; Uses",
      "Purchase / Inventory",
      "Preview",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Save Creature");
    expect(markup).not.toContain("NPC");
    expect(markup).not.toContain("Price");
  });
});
