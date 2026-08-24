import { useMemo, useState } from "react";
import { CREATURE_ABILITY_ACTIVATIONS, CREATURE_MOVEMENT_MODES } from "../../data/creatureOptions";
import { SIZE_OPTIONS } from "../../data/sizeOptions";
import type {
  CreatureAbilityDraft,
  CreatureAttackDraft,
  CreatureDefenseDraft,
  CreatureMovementDraft,
  CreatureSkillCandidate,
  CreatureUseDraft,
} from "../../types/creature";
import type { CreatureNpcAggregate, CreatureNpcDraft } from "../../types/creatureNpc";
import { CreatureAttributesEditor } from "../creatures/CreatureAttributesEditor";
import { CreatureCollectionEditor, type CreatureCollectionField } from "../creatures/CreatureCollectionEditor";
import { CreatureHpChartEditor } from "../creatures/CreatureHpChartEditor";
import { CreatureSkillsEditor } from "../creatures/CreatureSkillsEditor";

type Tab = "overview" | "attributes" | "movement" | "hp" | "attacks" | "skills" | "abilities" | "defenses" | "uses" | "inventory";

type Props = {
  aggregate: CreatureNpcAggregate;
  draft: CreatureNpcDraft;
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: CreatureNpcDraft) => void;
  onSave: () => void;
  findSkills: (search: string) => Promise<CreatureSkillCandidate[]>;
};

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Individual" },
  { id: "attributes", label: "Attributes" },
  { id: "movement", label: "Movement" },
  { id: "hp", label: "HP & Hit Locations" },
  { id: "attacks", label: "Attacks" },
  { id: "skills", label: "Skills" },
  { id: "abilities", label: "Abilities" },
  { id: "defenses", label: "Defenses" },
  { id: "uses", label: "Uses" },
  { id: "inventory", label: "Inventory & Equipment" },
];

function localId(prefix: string): string {
  const identity = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${identity}`.toUpperCase();
}

export function CreatureNpcEditor({
  aggregate,
  draft,
  saving,
  dirty,
  feedback,
  onChange,
  onSave,
  findSkills,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [inventorySearch, setInventorySearch] = useState("");
  const creature = draft.creature;
  const updateCreature = (next: typeof creature) => onChange({ ...draft, creature: next });
  const updateCore = (patch: Partial<typeof creature.core>) => updateCreature({
    ...creature,
    core: { ...creature.core, ...patch },
  });

  const movementFields: CreatureCollectionField<CreatureMovementDraft>[] = [
    { key: "movementMode", label: "Movement Mode", type: "select", options: CREATURE_MOVEMENT_MODES.map((value) => ({ value, label: value })) },
    { key: "movementValue", label: "Movement Value", type: "number", step: 0.01 },
    { key: "initiative", label: "Initiative", type: "number", step: 0.01 },
    { key: "requirements", label: "Requirements", type: "text", wide: true },
    { key: "notes", label: "Individual Notes", type: "textarea", wide: true },
  ];
  const attackFields: CreatureCollectionField<CreatureAttackDraft>[] = [
    { key: "attackName", label: "Attack Name" },
    { key: "attackPercentage", label: "Attack % (lower is better)", type: "number", step: 0.01 },
    { key: "damage", label: "Damage", type: "nullableText" },
    { key: "damageType", label: "Damage Type" },
    { key: "rangeReach", label: "Range / Reach" },
    { key: "requiredAnatomy", label: "Source / Required Anatomy" },
    { key: "requirements", label: "Requirements", type: "textarea", wide: true },
    { key: "usesRecharge", label: "Uses / Recharge", type: "textarea" },
    { key: "specialEffect", label: "Special Effect", type: "textarea" },
    { key: "notes", label: "Individual Notes", type: "textarea", wide: true },
  ];
  const abilityFields: CreatureCollectionField<CreatureAbilityDraft>[] = [
    { key: "abilityName", label: "Ability Name" },
    { key: "abilityType", label: "Ability Type" },
    { key: "activation", label: "Activation", type: "select", options: CREATURE_ABILITY_ACTIVATIONS.map((value) => ({ value, label: value })) },
    { key: "requirements", label: "Requirements" },
    { key: "usesRecharge", label: "Uses / Recharge" },
    { key: "description", label: "Description", type: "textarea", wide: true },
    { key: "mechanicalEffect", label: "Mechanical Effect", type: "textarea", wide: true },
    { key: "notes", label: "Individual Notes", type: "textarea", wide: true },
  ];
  const defenseFields: CreatureCollectionField<CreatureDefenseDraft>[] = [
    { key: "defenseType", label: "Defense Type" },
    { key: "against", label: "Against" },
    { key: "value", label: "Value", type: "nullableText" },
    { key: "notes", label: "Individual Notes", type: "textarea", wide: true },
  ];
  const useFields: CreatureCollectionField<CreatureUseDraft>[] = [
    { key: "useName", label: "Use" },
    { key: "notes", label: "Individual Notes", type: "textarea", wide: true },
  ];

  const ownedIds = new Set(draft.items.map((item) => item.itemId));
  const availableItems = useMemo(() => {
    const query = inventorySearch.trim().toLocaleLowerCase();
    return aggregate.authorizedItems.filter((item) => !ownedIds.has(item.id)
      && (!query || `${item.name} ${item.canonicalId} ${item.category}`.toLocaleLowerCase().includes(query)));
  }, [aggregate.authorizedItems, draft.items, inventorySearch]);

  return (
    <section className="skill-editor creature-editor creature-npc-editor">
      <header className="skill-editor__header">
        <div><p>CREATURE NPC · {aggregate.core.creatureCanonicalId}</p><h2>{draft.name || "Unnamed Creature NPC"}</h2><span>{dirty ? "Unsaved individual changes" : `Saved from ${aggregate.core.creatureName}`}</span></div>
        <div className="skill-editor__actions"><button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Creature NPC"}</button></div>
      </header>
      <aside className="creature-npc-editor__template-note"><strong>Master template: {aggregate.core.creatureName}</strong><span>This NPC began as a complete copy of the Creature record. Changes here affect only this individual.</span></aside>
      {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      <nav className="skill-editor__tabs creature-editor__tabs" aria-label="Creature NPC editor sections">
        {TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>
      <div className="skill-editor__content">
        {activeTab === "overview" ? (
          <div className="creature-overview">
            <section className="creature-section">
              <div className="creature-section__heading"><div><p>INDIVIDUAL RECORD</p><h3>Identity & Adjustments</h3></div></div>
              <div className="creature-overview__grid creature-npc-editor__identity-grid">
                <label><span>NPC Name</span><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
                <label><span>Creature Template</span><input value={creature.core.canonicalName} readOnly /></label>
                <label><span>Family</span><input value={creature.core.family} readOnly /></label>
                <label><span>Creature Type</span><input value={creature.core.creatureType} readOnly /></label>
                <label><span>Individual Size</span><select value={creature.core.size} onChange={(event) => updateCore({ size: event.target.value as typeof creature.core.size })}>{SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label>
                <label><span>HP Adjustment</span><input type="number" step="1" value={draft.hpAdjustment} onChange={(event) => onChange({ ...draft, hpAdjustment: Number(event.target.value) || 0 })} /></label>
              </div>
              <p className="creature-section__description">HP Adjustment records this individual’s change from the template. No unrecorded base-HP formula is assumed.</p>
              <div className="creature-overview__long-fields">
                <label><span>Individual Description</span><textarea value={creature.core.description} onChange={(event) => updateCore({ description: event.target.value })} /></label>
                <label><span>Personality</span><textarea value={draft.personality} onChange={(event) => onChange({ ...draft, personality: event.target.value })} /></label>
                <label><span>Typical Behavior</span><textarea value={creature.core.typicalBehavior} onChange={(event) => updateCore({ typicalBehavior: event.target.value })} /></label>
                <label><span>Habitat / Ecology</span><textarea value={creature.core.habitatEcology} onChange={(event) => updateCore({ habitatEcology: event.target.value })} /></label>
                <label><span>Creature Notes</span><textarea value={creature.core.notes} onChange={(event) => updateCore({ notes: event.target.value })} /></label>
                <label><span>Individual NPC Notes</span><textarea value={draft.instanceNotes} onChange={(event) => onChange({ ...draft, instanceNotes: event.target.value })} /></label>
              </div>
            </section>
          </div>
        ) : null}
        {activeTab === "attributes" ? <CreatureAttributesEditor attributes={creature.attributes} onChange={(attributes) => updateCreature({ ...creature, attributes })} /> : null}
        {activeTab === "movement" ? <CreatureCollectionEditor eyebrow="INDIVIDUAL MOBILITY" title="Movement" description="The template movement modes were copied here and may be adjusted for this NPC." rows={creature.movement} fields={movementFields} createRow={() => ({ movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: creature.movement.length })} onChange={(movement) => updateCreature({ ...creature, movement })} emptyMessage="No movement modes are recorded." addLabel="Add Movement" /> : null}
        {activeTab === "hp" ? <CreatureHpChartEditor hpPools={creature.hpPools} hitLocations={creature.hitLocations} onChange={(hpPools, hitLocations) => updateCreature({ ...creature, hpPools, hitLocations })} /> : null}
        {activeTab === "attacks" ? <CreatureCollectionEditor eyebrow="INDIVIDUAL OFFENSE" title="Attacks" description="Template attacks may be adjusted, removed, or supplemented for this NPC." rows={creature.attacks} fields={attackFields} createRow={() => ({ canonicalId: localId("NPC-ATK"), attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: creature.attacks.length })} onChange={(attacks) => updateCreature({ ...creature, attacks })} emptyMessage="No attacks are recorded." addLabel="Add Attack" /> : null}
        {activeTab === "skills" ? <CreatureSkillsEditor links={creature.skillLinks} onChange={(skillLinks) => updateCreature({ ...creature, skillLinks })} findSkills={findSkills} /> : null}
        {activeTab === "abilities" ? <CreatureCollectionEditor eyebrow="INDIVIDUAL ABILITIES" title="Abilities" description="The Creature’s abilities were copied to this NPC and remain independent from the master catalog." rows={creature.abilities} fields={abilityFields} createRow={() => ({ canonicalId: localId("NPC-ABL"), abilityName: "", abilityType: "", activation: "Passive", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: creature.abilities.length, crImpact: "None" as const })} onChange={(abilities) => updateCreature({ ...creature, abilities })} emptyMessage="No abilities are recorded." addLabel="Add Ability" /> : null}
        {activeTab === "defenses" ? <CreatureCollectionEditor eyebrow="INDIVIDUAL PROTECTION" title="Defenses" description="Defenses and soak may be adjusted without changing the Creature template." rows={creature.defenses} fields={defenseFields} createRow={() => ({ seedIdentity: localId("NPC-DEF"), defenseType: "", against: "", value: null, notes: "", sortOrder: creature.defenses.length, crImpact: "None" as const })} onChange={(defenses) => updateCreature({ ...creature, defenses })} emptyMessage="No defenses are recorded." addLabel="Add Defense" /> : null}
        {activeTab === "uses" ? <CreatureCollectionEditor eyebrow="INDIVIDUAL SUITABILITY" title="Uses" description="Uses copied from the template may be adjusted for this individual." rows={creature.uses} fields={useFields} createRow={() => ({ seedIdentity: localId("NPC-USE"), useName: "", notes: "", sortOrder: creature.uses.length })} onChange={(uses) => updateCreature({ ...creature, uses })} emptyMessage="No uses are recorded." addLabel="Add Use" /> : null}
        {activeTab === "inventory" ? (
          <section className="creature-section creature-npc-inventory">
            <div className="creature-section__heading"><div><p>CAMPAIGN-AUTHORIZED POSSESSIONS</p><h3>Inventory & Equipment</h3></div></div>
            <label className="creature-npc-inventory__search"><span>Search Campaign Items</span><input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} /></label>
            <div className="creature-npc-inventory__columns">
              <div><h4>Available</h4>{availableItems.length ? availableItems.map((item) => <button type="button" key={item.id} onClick={() => onChange({ ...draft, items: [...draft.items, { itemId: item.id, quantity: 1 }] })}><strong>{item.name}</strong><span>{item.equipmentGroup || item.catalogScope} · {item.category}</span></button>) : <p>No matching Campaign Items.</p>}</div>
              <div><h4>Held by NPC</h4>{draft.items.length ? draft.items.map((owned) => {
                const item = aggregate.authorizedItems.find((candidate) => candidate.id === owned.itemId);
                return <div key={owned.itemId}><strong>{item?.name ?? `Item ${owned.itemId}`}</strong><label><span>Qty</span><input type="number" min="1" step="1" value={owned.quantity} onChange={(event) => onChange({ ...draft, items: draft.items.map((candidate) => candidate.itemId === owned.itemId ? { ...candidate, quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)) } : candidate) })} /></label><button type="button" onClick={() => onChange({ ...draft, items: draft.items.filter((candidate) => candidate.itemId !== owned.itemId) })}>Remove</button></div>;
              }) : <p>No inventory or equipment recorded.</p>}</div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
