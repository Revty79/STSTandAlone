import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreatureEditor } from "../components/creatures/CreatureEditor";
import { CreatureAttributesEditor } from "../components/creatures/CreatureAttributesEditor";
import { CreatureHpChartEditor } from "../components/creatures/CreatureHpChartEditor";
import { CreatureLibrary } from "../components/creatures/CreatureLibrary";
import { newCreatureDraft } from "./CreaturesPage";

describe("Creature management UI", () => {
  it("shows only Creature names in the Library result list", () => {
    const markup = renderToStaticMarkup(
      <CreatureLibrary
        page={{
          items: [{ id: 1, canonicalId: "CR-HORSE", canonicalName: "Horse", family: "Equine", creatureType: "Animal", size: "Large", challengeRating: 8, killXp: 3, updatedAt: "now" }],
          total: 1, page: 1, pageSize: 40, pageCount: 1,
        }}
        facets={{ families: [], creatureTypes: [] }}
        filters={{ page: 1, pageSize: 40 }}
        loading={false}
        onFiltersChange={vi.fn()}
        onSelect={vi.fn()}
        onNewCreature={vi.fn()}
      />,
    );
    const resultList = markup.slice(markup.indexOf('creature-library__results'));
    expect(resultList).toContain("skill-library__row");
    expect(resultList).toContain("skill-library__row-name");
    expect(resultList).toContain(">Horse<");
    expect(resultList).not.toContain("Equine");
    expect(resultList).not.toContain("Animal");
    expect(resultList).not.toContain("CR 8");
  });

  it("creates a neutral draft from shared Size and blank unresolved mechanics", () => {
    const draft = newCreatureDraft(7);
    expect(draft.core).toMatchObject({ size: "Medium", challengeRating: null, killXp: null, createdByUserId: 7 });
    expect(draft.attributes.map((row) => row.attributeKey)).toEqual(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]);
    expect(draft.attributes.every((row) => row.value === null)).toBe(true);
    expect(draft.variants).toEqual([]);
  });

  it("exposes every Creature section and visible CR guidance without hiding Notes", () => {
    const draft = newCreatureDraft(7);
    draft.core.canonicalId = "CR-TEST";
    draft.core.canonicalName = "Test Creature";
    draft.core.challengeRating = 8;
    draft.core.notes = "PROPOSED FOR REVIEW — exact mechanic unresolved.";
    const markup = renderToStaticMarkup(
      <CreatureEditor
        draft={draft}
        challengeRatings={[{ challengeRating: 8, threatBand: "Low", attackTargetGuidance: "78 to 73", damageGuidance: "2–6", initiativeGuidance: "12–36", soakGuidance: "0–5", hpToughnessGuidance: "Natural baseline", killXp: 3, currentCreatureExample: "Horse", exampleNotes: "Guidance only." }]}
        saving={false}
        dirty={false}
        feedback={null}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        findSkills={vi.fn(async () => [])}
      />,
    );
    for (const label of ["Overview", "Attributes", "Movement", "HP &amp; Hit Locations", "Attacks", "Skills", "Abilities", "Defenses", "Uses", "Variants"]) expect(markup).toContain(label);
    expect(markup).toContain("PROPOSED FOR REVIEW");
    expect(markup).toContain("Guidance only.");
    expect(markup).toContain("not an automatic stat formula");
    expect(markup).not.toContain("IP Provenance");
  });

  it("renders Attributes as a compact six-stat value grid", () => {
    const draft = newCreatureDraft(7);
    draft.attributes[0]!.value = 0;
    const markup = renderToStaticMarkup(
      <CreatureAttributesEditor
        attributes={draft.attributes}
        variants={[]}
        onChange={vi.fn()}
      />,
    );
    for (const label of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      expect(markup).toContain(`>${label}<`);
    }
    expect(markup).toContain('aria-label="STR value"');
    expect(markup).toContain('value="0"');
    expect(markup).not.toContain("Applies To");
    expect(markup).not.toContain(">Notes<");
  });

  it("renders HP and hit locations as compact linked charts", () => {
    const markup = renderToStaticMarkup(
      <CreatureHpChartEditor
        hpPools={[{ canonicalId: "HP-HORSE-TORSO", variantCanonicalId: null, poolName: "Torso", hpPercentage: 30, notes: "", sortOrder: 0 }]}
        hitLocations={[{ variantCanonicalId: null, hitLocationNumber: 6, locationName: "Chest", bodyPartsIncluded: "Torso — chest", hpPoolCanonicalId: "HP-HORSE-TORSO", naturalArmor: 0, soak: 0, locationEffect: "", notes: "Shares Torso HP", sortOrder: 0 }]}
        variants={[]}
        onChange={vi.fn()}
      />,
    );
    for (const label of ["HP Pools", "Hit Location Chart", "Result", "Location", "HP Pool", "HP %", "Relevance", "Armor", "Soak"]) expect(markup).toContain(label);
    expect(markup).toContain(">30%<");
    expect(markup).toContain("Torso — chest");
    expect(markup).not.toContain("creature-repeat-row");
  });
});
