import { calculateSpell } from "../../features/spell-construction/engine/calculateSpell";
import { validateSpell } from "../../features/spell-construction/engine/validateSpell";
import type { SpellDocument } from "../../features/spell-construction/models/spell";
import {
  SKILL_EXTENSION_TYPE,
  type SaveSkillAggregate,
} from "../../types/skill";

export function SkillPreview({ draft }: { draft: SaveSkillAggregate }) {
  const spellExtension = draft.extensions.find(
    ({ extensionType }) =>
      extensionType === SKILL_EXTENSION_TYPE.SPELL_CONSTRUCTION,
  );
  const spell = spellExtension?.data as SpellDocument | undefined;
  const calculation = spell ? calculateSpell(spell) : null;
  const validation = spell && calculation ? validateSpell(spell, undefined, calculation) : null;

  return (
    <article className="skill-preview">
      <header>
        <p>{draft.core.classification || "standard"}</p>
        <h3>{draft.core.name || "Untitled Skill"}</h3>
      </header>
      <dl className="skill-preview__facts">
        <div><dt>Tier</dt><dd>{draft.core.tier ?? "N/A"}</dd></div>
        <div><dt>Primary Attribute</dt><dd>{draft.core.primaryAttribute || "N/A"}</dd></div>
        <div><dt>Secondary Attribute</dt><dd>{draft.core.secondaryAttribute || "N/A"}</dd></div>
      </dl>
      <section>
        <h4>Definition</h4>
        <p>{draft.core.definition || "No definition has been written."}</p>
      </section>
      <section>
        <h4>Path Information</h4>
        {draft.relationships.length === 0 ? (
          <p>No parent or prerequisite relationships.</p>
        ) : (
          <ol>
            {draft.relationships.map((relationship) => (
              <li key={`${relationship.relatedSkillId}-${relationship.relationshipType}`}>
                {relationship.relatedSkillName ?? `Skill ${relationship.relatedSkillId}`}
                <span>{relationship.relationshipType}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {spell && calculation && validation ? (
        <section className="skill-preview__spell">
          <h4>Spell Construction</h4>
          <dl className="skill-preview__facts">
            <div><dt>Tradition</dt><dd>{spell.tradition}</dd></div>
            <div><dt>Base Mana</dt><dd>{calculation.baseSpellManaCost}</dd></div>
            <div><dt>Spell Mastery</dt><dd>{calculation.baseSpellMastery}</dd></div>
            <div><dt>Combat Casting</dt><dd>{calculation.baseCombatCastingTime} Initiative</dd></div>
            <div><dt>Validation</dt><dd>{validation.status}</dd></div>
          </dl>
        </section>
      ) : null}
    </article>
  );
}
