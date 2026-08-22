import { useEffect, useState } from "react";
import { CREATURE_ATTRIBUTES } from "../../data/creatureOptions";
import type {
  CreatureAttributeDraft,
  CreatureVariantDraft,
} from "../../types/creature";

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
  variants: CreatureVariantDraft[];
  onChange: (attributes: CreatureAttributeDraft[]) => void;
};

export function CreatureAttributesEditor({ attributes, variants, onChange }: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (
      selectedVariantId &&
      !variants.some((variant) => variant.canonicalId === selectedVariantId)
    ) {
      setSelectedVariantId(null);
    }
  }, [selectedVariantId, variants]);

  function updateAttribute(
    attributeKey: (typeof CREATURE_ATTRIBUTES)[number],
    value: string,
  ) {
    const existingIndex = attributes.findIndex(
      (attribute) =>
        attribute.variantCanonicalId === selectedVariantId &&
        attribute.attributeKey === attributeKey,
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
        variantCanonicalId: selectedVariantId,
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
        {variants.length > 0 ? (
          <label className="creature-attributes__set">
            <span>Attribute Set</span>
            <select
              value={selectedVariantId ?? ""}
              onChange={(event) => setSelectedVariantId(event.target.value || null)}
            >
              <option value="">Base Creature</option>
              {variants.map((variant) => (
                <option key={variant.canonicalId} value={variant.canonicalId}>
                  {variant.variantName || variant.canonicalId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="creature-attributes__grid">
        {CREATURE_ATTRIBUTES.map((attributeKey) => {
          const row = attributes.find(
            (attribute) =>
              attribute.variantCanonicalId === selectedVariantId &&
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
