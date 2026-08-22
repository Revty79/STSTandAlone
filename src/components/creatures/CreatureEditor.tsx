import { useEffect, useMemo, useState } from "react";
import { CREATURE_ABILITY_ACTIVATIONS, CREATURE_MOVEMENT_MODES } from "../../data/creatureOptions";
import { SIZE_OPTIONS } from "../../data/sizeOptions";
import type {
  ChallengeRatingReference,
  CreatureAbilityDraft,
  CreatureAttackDraft,
  CreatureDefenseDraft,
  CreatureMovementDraft,
  CreatureSkillCandidate,
  CreatureUseDraft,
  CreatureVariantDraft,
  SaveCreatureAggregate,
} from "../../types/creature";
import { CreatureCollectionEditor, type CreatureCollectionField } from "./CreatureCollectionEditor";
import { CreatureAttributesEditor } from "./CreatureAttributesEditor";
import { CreatureHpChartEditor } from "./CreatureHpChartEditor";
import { CreatureOverviewEditor } from "./CreatureOverviewEditor";
import { CreatureSkillsEditor } from "./CreatureSkillsEditor";

type Tab = "overview" | "attributes" | "movement" | "hp" | "attacks" | "skills" | "abilities" | "defenses" | "uses" | "variants";
type Props = {
  draft: SaveCreatureAggregate | null;
  challengeRatings: ChallengeRatingReference[];
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SaveCreatureAggregate) => void;
  onSave: () => void;
  onDelete: () => void;
  findSkills: (search: string) => Promise<CreatureSkillCandidate[]>;
};

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "attributes", label: "Attributes" },
  { id: "movement", label: "Movement" }, { id: "hp", label: "HP & Hit Locations" },
  { id: "attacks", label: "Attacks" }, { id: "skills", label: "Skills" },
  { id: "abilities", label: "Abilities" }, { id: "defenses", label: "Defenses" },
  { id: "uses", label: "Uses" }, { id: "variants", label: "Variants" },
];

export function CreatureEditor({ draft, challengeRatings, saving, dirty, feedback, onChange, onSave, onDelete, findSkills }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setActiveTab("overview"); setConfirmDelete(false); }, [draft?.id]);
  const variantOptions = useMemo(() => [
    { value: "", label: "Base creature" },
    ...(draft?.variants ?? []).filter((variant) => variant.canonicalId).map((variant) => ({ value: variant.canonicalId, label: variant.variantName || variant.canonicalId })),
  ], [draft?.variants]);
  const variantField = <Row extends object>(): CreatureCollectionField<Row> => ({ key: "variantCanonicalId" as keyof Row & string, label: "Applies To", type: "nullableSelect", options: variantOptions });

  if (!draft) return <section className="skill-editor skill-editor--empty creature-editor"><p>CREATURE EDITOR</p><h2>Select a Creature or begin a new one.</h2><span>Complete Creature aggregates load only when selected.</span></section>;
  const reference = challengeRatings.find((row) => row.challengeRating === draft.core.challengeRating);
  const sizeOverrideOptions = [{ value: "", label: "Inherit base Size" }, ...SIZE_OPTIONS.map((size) => ({ value: size, label: size }))];

  const movementFields: CreatureCollectionField<CreatureMovementDraft>[] = [
    variantField(),
    { key: "movementMode", label: "Movement Mode", type: "select", options: CREATURE_MOVEMENT_MODES.map((value) => ({ value, label: value })) },
    { key: "movementValue", label: "Base / Pre-Size Value", type: "number", step: 0.01 },
    { key: "initiative", label: "Initiative", type: "number", step: 0.01 },
    { key: "requirements", label: "Requirements", type: "text", wide: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const attackFields: CreatureCollectionField<CreatureAttackDraft>[] = [
    variantField(), { key: "canonicalId", label: "Attack ID" }, { key: "attackName", label: "Attack Name" },
    { key: "attackPercentage", label: "Attack % (lower is better)", type: "number", step: 0.01 }, { key: "damage", label: "Damage", type: "nullableText" },
    { key: "damageType", label: "Damage Type" }, { key: "rangeReach", label: "Range / Reach" }, { key: "requiredAnatomy", label: "Source / Required Anatomy" },
    { key: "requirements", label: "Requirements", type: "textarea", wide: true }, { key: "usesRecharge", label: "Uses / Recharge", type: "textarea" },
    { key: "specialEffect", label: "Special Effect", type: "textarea" }, { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const abilityFields: CreatureCollectionField<CreatureAbilityDraft>[] = [
    variantField(), { key: "canonicalId", label: "Ability ID" }, { key: "abilityName", label: "Ability Name" }, { key: "abilityType", label: "Ability Type" },
    { key: "activation", label: "Activation", type: "select", options: CREATURE_ABILITY_ACTIVATIONS.map((value) => ({ value, label: value })) },
    { key: "requirements", label: "Requirements" }, { key: "usesRecharge", label: "Uses / Recharge" }, { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "mechanicalEffect", label: "Mechanical Effect", type: "textarea", wide: true }, { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const defenseFields: CreatureCollectionField<CreatureDefenseDraft>[] = [
    variantField(), { key: "defenseType", label: "Defense Type" }, { key: "against", label: "Against" }, { key: "value", label: "Value", type: "nullableText" },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const useFields: CreatureCollectionField<CreatureUseDraft>[] = [variantField(), { key: "useName", label: "Use" }, { key: "notes", label: "Notes", type: "textarea", wide: true }];
  const variantFields: CreatureCollectionField<CreatureVariantDraft>[] = [
    { key: "canonicalId", label: "Variant ID" }, { key: "variantName", label: "Variant Name" }, { key: "variantType", label: "Variant Type" },
    { key: "sizeOverride", label: "Size Override", type: "nullableSelect", options: sizeOverrideOptions },
    { key: "challengeRatingOverride", label: "CR Override", type: "number", min: 1, max: 50, step: 1 },
    { key: "killXpOverride", label: "Kill XP Override", type: "number", min: 0, step: 1 },
    { key: "description", label: "Description", type: "textarea", wide: true }, { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];

  return (
    <section className="skill-editor creature-editor">
      <header className="skill-editor__header"><div><p>{draft.id ? draft.core.canonicalId : "NEW CREATURE DRAFT"}</p><h2>{draft.core.canonicalName || "Untitled Creature"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Creature"}</button></div></header>
      {confirmDelete ? <div className="skill-editor__delete-confirm" role="alert"><div><strong>Delete {draft.core.canonicalName || "this Creature"}?</strong><span>All Creature-owned records and Variants will be removed. Skills remain untouched.</span></div><button className="skills-danger-button" type="button" onClick={onDelete}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
      {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      <nav className="skill-editor__tabs creature-editor__tabs" aria-label="Creature editor sections">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
      <div className="skill-editor__content">
        {activeTab === "overview" ? <CreatureOverviewEditor draft={draft} challengeReference={reference} onChange={onChange} /> : null}
        {activeTab === "attributes" ? <CreatureAttributesEditor attributes={draft.attributes} variants={draft.variants} onChange={(attributes) => onChange({ ...draft, attributes })} /> : null}
        {activeTab === "movement" ? <CreatureCollectionEditor eyebrow="MODE-SPECIFIC INITIATIVE" title="Movement" description="Movement and Initiative stay separate per movement mode and remain base / pre-Size values." rows={draft.movement} fields={movementFields} createRow={() => ({ variantCanonicalId: null, movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: draft.movement.length })} onChange={(movement) => onChange({ ...draft, movement })} emptyMessage="No movement modes are assigned." addLabel="Add Movement" /> : null}
        {activeTab === "hp" ? <CreatureHpChartEditor hpPools={draft.hpPools} hitLocations={draft.hitLocations} variants={draft.variants} onChange={(hpPools, hitLocations) => onChange({ ...draft, hpPools, hitLocations })} /> : null}
        {activeTab === "attacks" ? <CreatureCollectionEditor eyebrow="NATURAL OFFENSE" title="Attacks" description="Attacks use their own target percentage and do not require a Skill. Lower target % is better; blank Damage remains unresolved." rows={draft.attacks} fields={attackFields} createRow={() => ({ canonicalId: "", variantCanonicalId: null, attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: draft.attacks.length })} onChange={(attacks) => onChange({ ...draft, attacks })} emptyMessage="No attacks are assigned." addLabel="Add Attack" /> : null}
        {activeTab === "skills" ? <CreatureSkillsEditor links={draft.skillLinks} variants={draft.variants} onChange={(skillLinks) => onChange({ ...draft, skillLinks })} findSkills={findSkills} /> : null}
        {activeTab === "abilities" ? <CreatureCollectionEditor eyebrow="SPECIAL MECHANICS" title="Abilities" description="Notes and unresolved mechanical text remain visible and editable." rows={draft.abilities} fields={abilityFields} createRow={() => ({ canonicalId: "", variantCanonicalId: null, abilityName: "", abilityType: "", activation: "Passive", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: draft.abilities.length })} onChange={(abilities) => onChange({ ...draft, abilities })} emptyMessage="No abilities are assigned." addLabel="Add Ability" /> : null}
        {activeTab === "defenses" ? <CreatureCollectionEditor eyebrow="RESISTANCE & INTERACTION" title="Defenses" rows={draft.defenses} fields={defenseFields} createRow={() => ({ seedIdentity: null, variantCanonicalId: null, defenseType: "", against: "", value: null, notes: "", sortOrder: draft.defenses.length })} onChange={(defenses) => onChange({ ...draft, defenses })} emptyMessage="No defenses are assigned." addLabel="Add Defense" /> : null}
        {activeTab === "uses" ? <CreatureCollectionEditor eyebrow="SUITABILITY, NOT COMMERCE" title="Uses" description="A Use such as Mount or Companion does not make a Creature trained or purchasable." rows={draft.uses} fields={useFields} createRow={() => ({ seedIdentity: null, variantCanonicalId: null, useName: "", notes: "", sortOrder: draft.uses.length })} onChange={(uses) => onChange({ ...draft, uses })} emptyMessage="No uses are assigned." addLabel="Add Use" /> : null}
        {activeTab === "variants" ? <CreatureCollectionEditor eyebrow="INTRINSIC DIFFERENCES" title="Variants" description="Blank Size, CR, and XP overrides inherit the base Creature. Training is not a Variant." rows={draft.variants} fields={variantFields} createRow={() => ({ canonicalId: "", variantName: "", variantType: "", sizeOverride: null, challengeRatingOverride: null, killXpOverride: null, description: "", notes: "", sortOrder: draft.variants.length })} onChange={(variants) => onChange({ ...draft, variants })} emptyMessage="No intrinsic Variants are assigned. Base data uses a blank Variant ID rather than a fake Base Variant." addLabel="Add Variant" /> : null}
      </div>
    </section>
  );
}
