import { useEffect, useState } from "react";
import type { SaveCreatureAggregate } from "../../types/creature";

type Props = {
  draft: SaveCreatureAggregate;
  dirty: boolean;
  saving: boolean;
  onCreateVariant: (name: string) => void;
};

export function CreatureLineageEditor({ draft, dirty, saving, onCreateVariant }: Props) {
  const [variantName, setVariantName] = useState("");
  useEffect(() => setVariantName(""), [draft.id]);

  const canCreate = Boolean(draft.id && variantName.trim() && !dirty && !saving);

  return (
    <section className="creature-section creature-lineage">
      <div className="creature-section__heading">
        <div><p>COMPLETE DERIVED CREATURES</p><h3>Variants &amp; Lineage</h3></div>
      </div>
      <p className="creature-section__description">
        A Variant is a complete copy with its own system-generated ID. It keeps a permanent
        link to its parent and stays in the same family, but all Creature data can be edited independently.
      </p>

      {draft.core.parentCreatureId ? (
        <div className="creature-lineage__parent">
          <span>Derived From</span>
          <strong>{draft.core.parentCreatureName ?? `Creature ${draft.core.parentCreatureId}`}</strong>
          <small>This lineage link and family cannot be changed.</small>
        </div>
      ) : (
        <div className="creature-lineage__parent">
          <span>Lineage Root</span>
          <strong>{draft.core.canonicalName || "Unsaved Creature"}</strong>
          <small>This Creature has no parent.</small>
        </div>
      )}

      <div className="creature-lineage__creator">
        <label>
          <span>New Variant Name</span>
          <input
            value={variantName}
            placeholder="Example: Ember Horse"
            onChange={(event) => setVariantName(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => {
            onCreateVariant(variantName.trim());
            setVariantName("");
          }}
        >
          Create Variant
        </button>
      </div>
      {!draft.id ? <p className="creature-lineage__notice">Save this Creature before creating a Variant.</p> : null}
      {dirty ? <p className="creature-lineage__notice">Save current changes first so the Variant copies the latest Creature data.</p> : null}

      <div className="creature-lineage__children">
        <h4>Derived Creatures</h4>
        {draft.derivedCreatures.length ? draft.derivedCreatures.map((creature) => (
          <article key={creature.id}>
            <div><strong>{creature.canonicalName}</strong><span>{creature.canonicalId}</span></div>
            <div><span>{creature.size}</span><b>CR {creature.challengeRating}</b><small>{creature.killXp} Kill XP</small></div>
          </article>
        )) : <p className="race-empty-row">No Creatures have been derived from this one.</p>}
      </div>
    </section>
  );
}

