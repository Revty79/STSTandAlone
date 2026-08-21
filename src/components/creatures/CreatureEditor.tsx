import { useEffect, useState } from "react";
import type {
  CreatureItemCandidate,
  CreatureSkillCandidate,
  SaveCreatureAggregate,
} from "../../types/creature";
import {
  CreatureAttacksEditor,
  CreatureBehaviorEditor,
  CreatureHealthEditor,
  CreatureMechanicsEditor,
  CreatureOverviewEditor,
  CreaturePreview,
  CreaturePurchaseEditor,
  CreatureSkillsEditor,
  CreatureVariantsEditor,
} from "./CreatureTabEditors";

type CreatureTab =
  | "overview"
  | "mechanics"
  | "health"
  | "attacks"
  | "skills"
  | "behavior"
  | "variants"
  | "purchase"
  | "preview";

const TABS: { id: CreatureTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mechanics", label: "Attributes & Movement" },
  { id: "health", label: "Health & Defense" },
  { id: "attacks", label: "Attacks" },
  { id: "skills", label: "Skills & Abilities" },
  { id: "behavior", label: "Behavior & Ecology" },
  { id: "variants", label: "Variants & Uses" },
  { id: "purchase", label: "Purchase / Inventory" },
  { id: "preview", label: "Preview" },
];

type Props = {
  draft: SaveCreatureAggregate | null;
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SaveCreatureAggregate) => void;
  onSave: () => void;
  onDelete: () => void;
  findSkills: (
    search: string,
    classification?: string,
  ) => Promise<CreatureSkillCandidate[]>;
  findItems: (search: string) => Promise<CreatureItemCandidate[]>;
};

export function CreatureEditor({
  draft,
  saving,
  dirty,
  feedback,
  onChange,
  onSave,
  onDelete,
  findSkills,
  findItems,
}: Props) {
  const [tab, setTab] = useState<CreatureTab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTab("overview");
    setConfirmDelete(false);
  }, [draft?.id]);

  if (!draft) {
    return (
      <section className="skill-editor skill-editor--empty">
        <p>CREATURE EDITOR</p>
        <h2>Select a Creature or begin a new one.</h2>
        <span>Only the selected Creature aggregate is loaded.</span>
      </section>
    );
  }

  return (
    <section className="skill-editor creature-editor">
      <header className="skill-editor__header">
        <div>
          <p>{draft.id ? `CREATURE ${draft.id}` : "NEW CREATURE DRAFT"}</p>
          <h2>{draft.core.name || "Untitled Creature"}</h2>
          <span>
            {dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}
          </span>
        </div>
        <div className="skill-editor__actions">
          {draft.id && !confirmDelete && (
            <button
              className="skills-danger-button"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
          <button
            className="skills-primary-button"
            type="button"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save Creature"}
          </button>
        </div>
      </header>

      {confirmDelete && (
        <div className="skill-editor__delete-confirm" role="alert">
          <div>
            <strong>Delete {draft.core.name || "this Creature"}?</strong>
            <span>
              Creature details and links will be removed. Purchase Items remain.
            </span>
          </div>
          <button className="skills-danger-button" type="button" onClick={onDelete}>
            Confirm Delete
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}

      {feedback && (
        <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">
          {feedback.message}
        </p>
      )}

      <nav className="skill-editor__tabs" aria-label="Creature editor sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? "is-active" : ""}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="skill-editor__content">
        {tab === "overview" && (
          <CreatureOverviewEditor draft={draft} onChange={onChange} />
        )}
        {tab === "mechanics" && (
          <CreatureMechanicsEditor draft={draft} onChange={onChange} />
        )}
        {tab === "health" && (
          <CreatureHealthEditor draft={draft} onChange={onChange} />
        )}
        {tab === "attacks" && (
          <CreatureAttacksEditor draft={draft} onChange={onChange} />
        )}
        {tab === "skills" && (
          <CreatureSkillsEditor
            draft={draft}
            onChange={onChange}
            findSkills={findSkills}
          />
        )}
        {tab === "behavior" && (
          <CreatureBehaviorEditor draft={draft} onChange={onChange} />
        )}
        {tab === "variants" && (
          <CreatureVariantsEditor draft={draft} onChange={onChange} />
        )}
        {tab === "purchase" && (
          <CreaturePurchaseEditor
            draft={draft}
            onChange={onChange}
            findItems={findItems}
          />
        )}
        {tab === "preview" && <CreaturePreview draft={draft} />}
      </div>
    </section>
  );
}
