import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpellDocument } from "../../features/spell-construction/models/spell";
import {
  createContainer,
  createEmptySpell,
  createModifierSelection,
} from "../../features/spell-construction/utilities/spellFactory";
import {
  SKILL_EXTENSION_TYPE,
  type SaveSkillAggregate,
} from "../../types/skill";
import { SkillPreview } from "./SkillPreview";

function magicDraft(
  classification: string,
  spell?: SpellDocument,
): SaveSkillAggregate {
  return {
    core: {
      name: spell?.name ?? "Unconstructed Magic",
      classification,
      tier: 3,
      primaryAttribute: "WIS",
      secondaryAttribute: null,
      definition: "The Skill Library definition.",
      createdByUserId: 1,
      sourceSystem: null,
      sourceExternalId: null,
    },
    relationships: [
      {
        relatedSkillId: 42,
        relatedSkillName: "Psychokinesis",
        relationshipType: "parent",
        sortOrder: 0,
      },
    ],
    extensions: spell
      ? [
          {
            extensionType: SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION,
            schemaVersion: spell.schemaVersion,
            data: spell,
          },
        ]
      : [],
  };
}

function completePsionicSpell() {
  const spell = createEmptySpell();
  spell.name = "Kinetic Test";
  spell.tradition = "Psionics";
  spell.frameworkSkillId = 42;
  spell.sphere = "";
  spell.discipline = "Psychokinesis";
  spell.description = "Moves enemies with focused will.";
  spell.notes = "Requires a clear path.";
  spell.flavorLine = "The mind becomes the storm.";
  spell.containers = [
    {
      ...createContainer("target"),
      effects: [
        {
          id: "effect-damage",
          ruleId: "damage",
          quantity: 2,
          description: "Two points of kinetic damage.",
        },
      ],
      rangeRuleId: "medium",
      rangeDescription: "Across the chamber.",
      durations: [
        {
          id: "duration-round",
          ruleId: "combat-round",
          quantity: 0,
          description: "Persists for the round.",
        },
      ],
      multiTarget: {
        ruleId: "multi-target",
        additionalTargets: 2,
        description: "Two additional enemies.",
      },
      children: [
        {
          ...createContainer("control"),
          id: "container-control",
          effects: [
            {
              id: "effect-push",
              ruleId: "push",
              quantity: 1,
              description: "Pushes each affected enemy.",
            },
          ],
        },
      ],
    },
  ];
  spell.modifiers = [
    {
      ...createModifierSelection("concentration"),
      id: "modifier-concentration",
      description: "Maintained by focused thought.",
    },
    {
      ...createModifierSelection("progressive-spell"),
      id: "modifier-progressive",
    },
  ];
  spell.progressive.enabled = true;
  spell.progressive.milestones[0] = {
    ...spell.progressive.milestones[0]!,
    tierName: "First Motion",
    condition: "Learn Psychokinesis.",
    description: "Move one nearby target.",
    notes: "The base remains authoritative.",
    flavorLine: "A thought becomes motion.",
  };
  return spell;
}

describe("SkillPreview magic details", () => {
  it("shows the full saved construction and calculator result", () => {
    const markup = renderToStaticMarkup(
      <SkillPreview draft={magicDraft("psionic skill", completePsionicSpell())} />,
    );

    for (const expected of [
      "Psionics",
      "Discipline",
      "Psychokinesis",
      "Moves enemies with focused will.",
      "Requires a clear path.",
      "The mind becomes the storm.",
      "Base Construction",
      "Target",
      "Damage",
      "Damage points: 2",
      "Range: Medium (60 ft)",
      "Duration: Combat Round",
      "Multi-Target",
      "Control",
      "Push",
      "Spell-Wide Modifiers",
      "Concentration",
      "Progressive Spell",
      "Original-base casting",
      "First Motion",
      "Learn Psychokinesis.",
      "Validation Details",
      "Mana Breakdown",
    ]) {
      expect(markup).toContain(expected);
    }
  });

  it.each([
    ["spell", "Spellcraft/Talismanism/Faith", "Sphere", "Fire"],
    ["psionic skill", "Psionics", "Discipline", "Telepathy"],
    ["reverberation", "Bardic Resonance", "Resonance", "Joy"],
  ] as const)(
    "shows the correct identity for %s previews",
    (classification, tradition, identityLabel, identityName) => {
      const spell = createEmptySpell();
      spell.name = "Identity Test";
      spell.tradition = tradition;
      spell.frameworkSkillId = 4;
      spell.sphere = identityLabel === "Sphere" ? identityName : "";
      spell.discipline = identityLabel === "Discipline" ? identityName : "";
      spell.resonance = identityLabel === "Resonance" ? identityName : "";
      spell.containers[0]!.effects = [
        { id: "effect-test", ruleId: "damage", quantity: 1 },
      ];

      const markup = renderToStaticMarkup(
        <SkillPreview draft={magicDraft(classification, spell)} />,
      );
      expect(markup).toContain(tradition);
      expect(markup).toContain(`<dt>${identityLabel}</dt><dd>${identityName}</dd>`);
    },
  );

  it("states when a magic Skill has no construction document", () => {
    const markup = renderToStaticMarkup(
      <SkillPreview draft={magicDraft("reverberation")} />,
    );
    expect(markup).toContain(
      "No Spell Construction document is attached to this magic Skill yet.",
    );
  });
});
