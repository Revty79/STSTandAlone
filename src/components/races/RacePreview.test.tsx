import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SaveRaceAggregate } from "../../types/race";
import { RacePreview } from "./RacePreview";

describe("RacePreview", () => {
  it("presents the complete Race aggregate and current linked Skill names", () => {
    const draft: SaveRaceAggregate = {
      core: {
        name: "Mer-Folk", legacyDescription: "Ocean legacy", physicalCharacteristics: "Fins",
        physicalDescription: "Aquatic humanoid", ageRangeText: "20-200", ageMin: 20, ageMax: 200,
        size: "Medium", baseMagic: 2, racialQuirkName: "Tidal Memory",
        quirkSuccessEffect: "Recall the current", quirkFailureEffect: "Lose the thread",
        commonLanguagesKnown: "Common; Pelagic", commonArchetypes: "Navigator",
        genreExamples: "Fantasy and science fiction", culturalMindset: "Communal",
        outlookOnMagic: "Magic moves like water", createdByUserId: 1,
        sourceSystem: null, sourceExternalId: null,
      },
      attributeCaps: [{ attributeKey: "Energon", maxValue: 60, sortOrder: 0 }],
      movementModes: [
        { movementMode: "Land", baseValue: 2, notes: "", sortOrder: 0 },
        { movementMode: "Swim", baseValue: 4, notes: "Underwater", sortOrder: 1 },
      ],
      skillLinks: [
        { skillId: 1, skillName: "Navigation", skillClassification: "standard", linkType: "bonus", value: 4, sortOrder: 0 },
        { skillId: 2, skillName: "Shift Forms", skillClassification: "special ability", linkType: "granted", value: 3, sortOrder: 0 },
      ],
    };
    const markup = renderToStaticMarkup(<RacePreview draft={draft} />);
    for (const expected of [
      "Mer-Folk", "Ocean legacy", "Fins", "Aquatic humanoid", "20-200", "Medium",
      "Energon", "Land", "Swim", "Tidal Memory", "Recall the current", "Lose the thread",
      "Navigation", "Shift Forms", "Common; Pelagic", "Navigator",
      "Fantasy and science fiction", "Communal", "Magic moves like water",
    ]) expect(markup).toContain(expected);
  });
});
