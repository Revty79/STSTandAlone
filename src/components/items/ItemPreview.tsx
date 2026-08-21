import type { SaveItemAggregate } from "../../types/item";

type Props = { draft: SaveItemAggregate };

export function ItemPreview({ draft }: Props) {
  const weapon = draft.weaponProfile;
  const armor = draft.armorProfile;
  return (
    <article className="skill-preview item-preview">
      <header>
        <p>{draft.core.catalogScope.toLocaleUpperCase()} CATALOG</p>
        <h3>{draft.core.name || "Untitled Item"}</h3>
        <span>{draft.genreTags.filter(Boolean).join(" · ") || "No Genre Tags"}</span>
      </header>
      <dl className="skill-preview__facts">
        <div><dt>Timeline</dt><dd>{draft.core.timelineTag || "—"}</dd></div>
        <div><dt>Cost</dt><dd>{draft.core.costCredits.toLocaleString()} Credits</dd></div>
        <div><dt>Weight</dt><dd>{draft.core.weight.toLocaleString()}</dd></div>
        <div><dt>Category</dt><dd>{draft.core.category || "—"}</dd></div>
        <div><dt>Subtype</dt><dd>{draft.core.subtype || "—"}</dd></div>
      </dl>
      <section><h4>Effect</h4><p>{draft.core.effectDescription || "No mechanical effect recorded."}</p></section>
      <section><h4>Narrative / Variant Notes</h4><p>{draft.core.narrativeVariantNotes || "No narrative notes recorded."}</p></section>
      {weapon && <section>
        <h4>Weapon Profile · {weapon.weaponRole}</h4>
        <dl className="skill-preview__facts">
          <div><dt>Category</dt><dd>{weapon.weaponCategory || "—"}</dd></div>
          <div><dt>Handedness</dt><dd>{weapon.handedness || "—"}</dd></div>
          <div><dt>Damage Type</dt><dd>{weapon.damageType || "—"}</dd></div>
          <div><dt>Damage</dt><dd>{weapon.damage}</dd></div>
          <div><dt>Range Type</dt><dd>{weapon.rangeType || "—"}</dd></div>
          <div><dt>Range</dt><dd>{weapon.rangeText || "—"}</dd></div>
        </dl>
        <p>{weapon.weaponEffectDescription || "No Weapon effect recorded."}</p>
        {weapon.weaponNarrativeNotes && <p>{weapon.weaponNarrativeNotes}</p>}
      </section>}
      {armor && <section>
        <h4>Armor Profile</h4>
        <dl className="skill-preview__facts">
          <div><dt>Area Covered</dt><dd>{armor.areaCovered || "—"}</dd></div>
          <div><dt>Soak</dt><dd>{armor.soak}</dd></div>
          <div><dt>Category</dt><dd>{armor.armorCategory || "—"}</dd></div>
          <div><dt>Type</dt><dd>{armor.armorType || "—"}</dd></div>
          <div><dt>Encumbrance</dt><dd>{armor.encumbrancePenalty}</dd></div>
        </dl>
        <p>{armor.armorEffectDescription || "No Armor effect recorded."}</p>
        {armor.armorNarrativeNotes && <p>{armor.armorNarrativeNotes}</p>}
      </section>}
    </article>
  );
}
