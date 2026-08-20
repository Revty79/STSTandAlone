import { useEffect, useState } from "react";
import type { RaceSkillCandidate, SaveRaceAggregate } from "../../types/race";
import { RaceAttributesEditor } from "./RaceAttributesEditor";
import { RaceCultureEditor } from "./RaceCultureEditor";
import { RaceOverviewEditor } from "./RaceOverviewEditor";
import { RacePreview } from "./RacePreview";
import { RaceQuirkEditor } from "./RaceQuirkEditor";
import { RaceSkillsEditor } from "./RaceSkillsEditor";

type Tab = "overview" | "mechanics" | "quirk" | "skills" | "culture" | "preview";
type Props = {
  draft: SaveRaceAggregate | null;
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SaveRaceAggregate) => void;
  onSave: () => void;
  onDelete: () => void;
  findSkills: (search: string, classification?: string) => Promise<RaceSkillCandidate[]>;
};

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mechanics", label: "Attributes & Movement" },
  { id: "quirk", label: "Quirk" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "culture", label: "Culture & Play" },
  { id: "preview", label: "Preview" },
];

export function RaceEditor({ draft, saving, dirty, feedback, onChange, onSave, onDelete, findSkills }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setActiveTab("overview"); setConfirmDelete(false); }, [draft?.id]);

  if (!draft) return (
    <section className="skill-editor skill-editor--empty race-editor">
      <p>RACE EDITOR</p><h2>Select a Race or begin a new one.</h2>
      <span>The library stays lightweight; complete Race aggregates open only here.</span>
    </section>
  );

  return (
    <section className="skill-editor race-editor">
      <header className="skill-editor__header">
        <div><p>{draft.id ? `RACE ${draft.id}` : "NEW RACE DRAFT"}</p><h2>{draft.core.name || "Untitled Race"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div>
        <div className="skill-editor__actions">
          {draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}
          <button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Race"}</button>
        </div>
      </header>
      {confirmDelete && <div className="skill-editor__delete-confirm" role="alert">
        <div><strong>Delete {draft.core.name || "this Race"}?</strong><span>Race-owned caps, movement, and Skill links will be removed. Skills will remain.</span></div>
        <button className="skills-danger-button" type="button" onClick={onDelete}>Confirm Delete</button>
        <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>}
      {feedback && <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p>}
      <nav className="skill-editor__tabs" aria-label="Race editor sections">
        {TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>
      <div className="skill-editor__content">
        {activeTab === "overview" && <RaceOverviewEditor core={draft.core} onChange={(core) => onChange({ ...draft, core })} />}
        {activeTab === "mechanics" && <RaceAttributesEditor core={draft.core} attributeCaps={draft.attributeCaps} movementModes={draft.movementModes} onCoreChange={(core) => onChange({ ...draft, core })} onAttributeCapsChange={(attributeCaps) => onChange({ ...draft, attributeCaps })} onMovementModesChange={(movementModes) => onChange({ ...draft, movementModes })} />}
        {activeTab === "quirk" && <RaceQuirkEditor core={draft.core} onChange={(core) => onChange({ ...draft, core })} />}
        {activeTab === "skills" && <RaceSkillsEditor links={draft.skillLinks} onChange={(skillLinks) => onChange({ ...draft, skillLinks })} findSkills={findSkills} />}
        {activeTab === "culture" && <RaceCultureEditor core={draft.core} onChange={(core) => onChange({ ...draft, core })} />}
        {activeTab === "preview" && <RacePreview draft={draft} />}
      </div>
    </section>
  );
}
