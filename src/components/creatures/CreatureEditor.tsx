import { useEffect, useState } from "react";
import { CREATURE_ABILITY_ACTIVATIONS, CREATURE_MOVEMENT_MODES } from "../../data/creatureOptions";
import { CREATURE_CR_IMPACTS } from "../../features/creatures/challengeRating";
import type {
  ChallengeRatingReference,
  CreatureAbilityDraft,
  CreatureAttackDraft,
  CreatureDefenseDraft,
  CreatureMovementDraft,
  CreatureSkillCandidate,
  CreatureUseDraft,
  SaveCreatureAggregate,
} from "../../types/creature";
import { CreatureCollectionEditor, type CreatureCollectionField } from "./CreatureCollectionEditor";
import { CreatureAttributesEditor } from "./CreatureAttributesEditor";
import { CreatureHpChartEditor } from "./CreatureHpChartEditor";
import { CreatureLineageEditor } from "./CreatureLineageEditor";
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
  onCreateVariant: (name: string) => void;
  findSkills: (search: string) => Promise<CreatureSkillCandidate[]>;
};

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "attributes", label: "Attributes" },
  { id: "movement", label: "Movement" }, { id: "hp", label: "HP & Hit Locations" },
  { id: "attacks", label: "Attacks" }, { id: "skills", label: "Skills" },
  { id: "abilities", label: "Abilities" }, { id: "defenses", label: "Defenses" },
  { id: "uses", label: "Uses" }, { id: "variants", label: "Variants" },
];

export function CreatureEditor({ draft, challengeRatings, saving, dirty, feedback, onChange, onSave, onDelete, onCreateVariant, findSkills }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setActiveTab("overview"); setConfirmDelete(false); }, [draft?.id]);
  if (!draft) return <section className="skill-editor skill-editor--empty creature-editor"><p>CREATURE EDITOR</p><h2>Select a Creature or begin a new one.</h2><span>Complete Creature aggregates load only when selected.</span></section>;

  const movementFields: CreatureCollectionField<CreatureMovementDraft>[] = [
    { key: "movementMode", label: "Movement Mode", type: "select", options: CREATURE_MOVEMENT_MODES.map((value) => ({ value, label: value })) },
    { key: "movementValue", label: "Base / Pre-Size Value", type: "number", step: 0.01 },
    { key: "initiative", label: "Initiative", type: "number", step: 0.01 },
    { key: "requirements", label: "Requirements", type: "text", wide: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const attackFields: CreatureCollectionField<CreatureAttackDraft>[] = [
    { key: "canonicalId", label: "Attack ID" }, { key: "attackName", label: "Attack Name" },
    { key: "attackPercentage", label: "Attack % (lower is better)", type: "number", step: 0.01 }, { key: "damage", label: "Damage", type: "nullableText" },
    { key: "damageType", label: "Damage Type" }, { key: "rangeReach", label: "Range / Reach" }, { key: "requiredAnatomy", label: "Source / Required Anatomy" },
    { key: "requirements", label: "Requirements", type: "textarea", wide: true }, { key: "usesRecharge", label: "Uses / Recharge", type: "textarea" },
    { key: "specialEffect", label: "Special Effect", type: "textarea" }, { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const abilityFields: CreatureCollectionField<CreatureAbilityDraft>[] = [
    { key: "canonicalId", label: "Ability ID" }, { key: "abilityName", label: "Ability Name" }, { key: "abilityType", label: "Ability Type" },
    { key: "activation", label: "Activation", type: "select", options: CREATURE_ABILITY_ACTIVATIONS.map((value) => ({ value, label: value })) },
    { key: "crImpact", label: "CR Impact", type: "select", options: CREATURE_CR_IMPACTS.map((value) => ({ value, label: value })) },
    { key: "requirements", label: "Requirements" }, { key: "usesRecharge", label: "Uses / Recharge" }, { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "mechanicalEffect", label: "Mechanical Effect", type: "textarea", wide: true }, { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const defenseFields: CreatureCollectionField<CreatureDefenseDraft>[] = [
    { key: "defenseType", label: "Defense Type" }, { key: "against", label: "Against" }, { key: "value", label: "Value", type: "nullableText" },
    { key: "crImpact", label: "CR Impact", type: "select", options: CREATURE_CR_IMPACTS.map((value) => ({ value, label: value })) },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ];
  const useFields: CreatureCollectionField<CreatureUseDraft>[] = [{ key: "useName", label: "Use" }, { key: "notes", label: "Notes", type: "textarea", wide: true }];

  return (
    <section className="skill-editor creature-editor">
      <header className="skill-editor__header"><div><p>{draft.id ? draft.core.canonicalId : "NEW CREATURE DRAFT"}</p><h2>{draft.core.canonicalName || "Untitled Creature"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Creature"}</button></div></header>
      {confirmDelete ? <div className="skill-editor__delete-confirm" role="alert"><div><strong>Delete {draft.core.canonicalName || "this Creature"}?</strong><span>All Creature-owned records and Variants will be removed. Skills remain untouched.</span></div><button className="skills-danger-button" type="button" onClick={onDelete}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
      {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      <nav className="skill-editor__tabs creature-editor__tabs" aria-label="Creature editor sections">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
      <div className="skill-editor__content">
        {activeTab === "overview" ? <CreatureOverviewEditor draft={draft} challengeRatings={challengeRatings} onChange={onChange} /> : null}
        {activeTab === "attributes" ? <CreatureAttributesEditor attributes={draft.attributes} onChange={(attributes) => onChange({ ...draft, attributes })} /> : null}
        {activeTab === "movement" ? <CreatureCollectionEditor eyebrow="MODE-SPECIFIC INITIATIVE" title="Movement" description="Movement and Initiative stay separate per movement mode and remain base / pre-Size values." rows={draft.movement} fields={movementFields} createRow={() => ({ movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: draft.movement.length })} onChange={(movement) => onChange({ ...draft, movement })} emptyMessage="No movement modes are assigned." addLabel="Add Movement" /> : null}
        {activeTab === "hp" ? <CreatureHpChartEditor hpPools={draft.hpPools} hitLocations={draft.hitLocations} onChange={(hpPools, hitLocations) => onChange({ ...draft, hpPools, hitLocations })} /> : null}
        {activeTab === "attacks" ? <CreatureCollectionEditor eyebrow="NATURAL OFFENSE" title="Attacks" description="Attacks use their own target percentage and do not require a Skill. Lower target % is better." rows={draft.attacks} fields={attackFields} createRow={() => ({ canonicalId: "", attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: draft.attacks.length })} onChange={(attacks) => onChange({ ...draft, attacks })} emptyMessage="No attacks are assigned." addLabel="Add Attack" /> : null}
        {activeTab === "skills" ? <CreatureSkillsEditor links={draft.skillLinks} onChange={(skillLinks) => onChange({ ...draft, skillLinks })} findSkills={findSkills} /> : null}
        {activeTab === "abilities" ? <CreatureCollectionEditor eyebrow="SPECIAL MECHANICS" title="Abilities" description="Assign CR Impact when an ability materially changes danger: Minor +1, Moderate +3, Major +6, or Extreme +10." rows={draft.abilities} fields={abilityFields} createRow={() => ({ canonicalId: "", abilityName: "", abilityType: "", activation: "Passive", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: draft.abilities.length, crImpact: "None" as const })} onChange={(abilities) => onChange({ ...draft, abilities })} emptyMessage="No abilities are assigned." addLabel="Add Ability" /> : null}
        {activeTab === "defenses" ? <CreatureCollectionEditor eyebrow="RESISTANCE & INTERACTION" title="Defenses" description="Exceptional defenses contribute the same CR Impact scale: Minor +1, Moderate +3, Major +6, or Extreme +10." rows={draft.defenses} fields={defenseFields} createRow={() => ({ seedIdentity: null, defenseType: "", against: "", value: null, notes: "", sortOrder: draft.defenses.length, crImpact: "None" as const })} onChange={(defenses) => onChange({ ...draft, defenses })} emptyMessage="No defenses are assigned." addLabel="Add Defense" /> : null}
        {activeTab === "uses" ? <CreatureCollectionEditor eyebrow="SUITABILITY, NOT COMMERCE" title="Uses" description="A Use such as Mount or Companion does not make a Creature trained or purchasable." rows={draft.uses} fields={useFields} createRow={() => ({ seedIdentity: null, useName: "", notes: "", sortOrder: draft.uses.length })} onChange={(uses) => onChange({ ...draft, uses })} emptyMessage="No uses are assigned." addLabel="Add Use" /> : null}
        {activeTab === "variants" ? <CreatureLineageEditor draft={draft} dirty={dirty} saving={saving} onCreateVariant={onCreateVariant} /> : null}
      </div>
    </section>
  );
}
