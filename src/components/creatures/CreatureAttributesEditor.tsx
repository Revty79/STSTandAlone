import { CREATURE_ATTRIBUTES } from "../../data/creatureOptions";
import type { CreatureAttributeDraft } from "../../types/creature";

const ATTRIBUTE_LABELS: Record<(typeof CREATURE_ATTRIBUTES)[number], string> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHR",
};

type Props = {
  attributes: CreatureAttributeDraft[];
  onChange: (attributes: CreatureAttributeDraft[]) => void;
};

export function CreatureAttributesEditor({ attributes, onChange }: Props) {
  function updateAttribute(
    attributeKey: (typeof CREATURE_ATTRIBUTES)[number],
    value: string,
  ) {
    const existingIndex = attributes.findIndex(
      (attribute) => attribute.attributeKey === attributeKey,
    );
    const numericValue = value === "" ? null : Number(value);
    if (existingIndex >= 0) {
      onChange(
        attributes.map((attribute, index) =>
          index === existingIndex
            ? { ...attribute, value: numericValue }
            : attribute,
        ),
      );
      return;
    }
    onChange([
      ...attributes,
      {
        attributeKey,
        value: numericValue,
        notes: "",
        sortOrder: attributes.length,
      },
    ]);
  }

  return (
    <section className="creature-section creature-attributes">
      <div className="creature-section__heading">
        <div>
          <p>BASE / PRE-SIZE</p>
          <h3>Attributes</h3>
        </div>
      </div>
      <div className="creature-attributes__grid">
        {CREATURE_ATTRIBUTES.map((attributeKey) => {
          const row = attributes.find(
            (attribute) =>
              attribute.attributeKey === attributeKey,
          );
          return (
            <label key={attributeKey}>
              <span>{ATTRIBUTE_LABELS[attributeKey]}</span>
              <input
                type="number"
                step={1}
                value={row?.value ?? ""}
                aria-label={`${ATTRIBUTE_LABELS[attributeKey]} value`}
                onChange={(event) =>
                  updateAttribute(attributeKey, event.target.value)
                }
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
