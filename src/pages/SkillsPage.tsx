import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SkillEditor } from "../components/skills/SkillEditor";
import { SkillLibrary } from "../components/skills/SkillLibrary";
import { SkillValidationError, skillService } from "../services/skillService";
import { applySkillAttributeRules } from "../services/skillRules";
import type {
  SaveSkillAggregate,
  SkillAggregate,
  SkillFilterOptions,
  SkillLibraryFilters,
  SkillLibraryPage,
  SkillRelationshipCandidateContext,
  SkillSummary,
} from "../types/skill";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/spell-construction.css";

type SkillsPageProps = {
  session: AuthSession;
  onBack: () => void;
  onLogout: () => void;
};

type PendingEditorChange =
  | { kind: "open"; skill: SkillSummary }
  | { kind: "new" };

const EMPTY_PAGE: SkillLibraryPage = {
  items: [],
  relationships: [],
  total: 0,
  page: 1,
  pageSize: 40,
  pageCount: 1,
};

const EMPTY_FILTER_OPTIONS: SkillFilterOptions = {
  classifications: [],
  tiers: [],
  primaryAttributes: [],
  secondaryAttributes: [],
};

function aggregateToDraft(aggregate: SkillAggregate): SaveSkillAggregate {
  return {
    id: aggregate.skill.id,
    core: applySkillAttributeRules({
      name: aggregate.skill.name,
      classification: aggregate.skill.classification,
      tier: aggregate.skill.tier,
      primaryAttribute: aggregate.skill.primaryAttribute,
      secondaryAttribute: aggregate.skill.secondaryAttribute,
      definition: aggregate.skill.definition,
      createdByUserId: aggregate.skill.createdByUserId,
      sourceSystem: aggregate.skill.sourceSystem,
      sourceExternalId: aggregate.skill.sourceExternalId,
    }),
    relationships: aggregate.relationships.map((relationship) => ({
      relatedSkillId: relationship.relatedSkillId,
      relatedSkillName: relationship.relatedSkillName,
      relationshipType: relationship.relationshipType,
      sortOrder: relationship.sortOrder,
    })),
    extensions: aggregate.extensions.map((extension) => ({
      extensionType: extension.extensionType,
      schemaVersion: extension.schemaVersion,
      data: extension.data,
    })),
  };
}

function newSkillDraft(userId: number): SaveSkillAggregate {
  return {
    core: applySkillAttributeRules({
      name: "",
      classification: "standard",
      tier: null,
      primaryAttribute: null,
      secondaryAttribute: null,
      definition: "",
      createdByUserId: userId,
      sourceSystem: null,
      sourceExternalId: null,
    }),
    relationships: [],
    extensions: [],
  };
}

export function SkillsPage({ session, onBack, onLogout }: SkillsPageProps) {
  const [filters, setFilters] = useState<SkillLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState<SkillLibraryPage>(EMPTY_PAGE);
  const [filterOptions, setFilterOptions] =
    useState<SkillFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [view, setView] = useState<"list" | "tree">("list");
  const [draft, setDraft] = useState<SaveSkillAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingEditorChange, setPendingEditorChange] =
    useState<PendingEditorChange | null>(null);

  const loadLibrary = useCallback(async (nextFilters: SkillLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await skillService.listSkills(nextFilters));
    } catch {
      setFeedback({
        kind: "error",
        message: "The Skill Library could not be read from the local archive.",
      });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadLibrary]);

  useEffect(() => {
    skillService
      .listFilterOptions()
      .then(setFilterOptions)
      .catch(() => undefined);
  }, []);

  const findCandidates = useCallback(
    (
      search: string,
      context: SkillRelationshipCandidateContext,
      excludeId?: number,
    ) => skillService.listRelationshipCandidates(search, context, excludeId),
    [],
  );
  const findFrameworkSkills = useCallback(
    (tradition: Parameters<typeof skillService.listSpellFrameworkSkills>[0]) =>
      skillService.listSpellFrameworkSkills(tradition),
    [],
  );

  async function openSkill(summary: SkillSummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await skillService.getSkill(summary.id);
      if (!aggregate) throw new Error("Skill not found");
      setDraft(aggregateToDraft(aggregate));
      setDirty(false);
    } catch {
      setFeedback({ kind: "error", message: "That Skill could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function selectSkill(summary: SkillSummary) {
    if (dirty) {
      setPendingEditorChange({ kind: "open", skill: summary });
      return;
    }
    void openSkill(summary);
  }

  function createNewSkill() {
    setDraft(newSkillDraft(session.userId));
    setDirty(false);
    setFeedback(null);
  }

  function beginNewSkill() {
    if (dirty) {
      setPendingEditorChange({ kind: "new" });
      return;
    }
    createNewSkill();
  }

  function discardAndContinue() {
    const pending = pendingEditorChange;
    setPendingEditorChange(null);
    if (!pending) return;
    if (pending.kind === "new") {
      createNewSkill();
      return;
    }
    void openSkill(pending.skill);
  }

  async function saveSkill() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await skillService.saveSkill(draft);
      setDraft(aggregateToDraft(saved));
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.skill.name} was saved.` });
      await Promise.all([
        loadLibrary(filters),
        skillService.listFilterOptions().then(setFilterOptions),
      ]);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof SkillValidationError
            ? error.message
            : "The Skill could not be saved. Existing data was left intact.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSkill() {
    if (!draft?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await skillService.deleteSkill(draft.id);
      const deletedName = draft.core.name;
      setDraft(null);
      setDirty(false);
      setFeedback({ kind: "success", message: `${deletedName} was deleted.` });
      await Promise.all([
        loadLibrary(filters),
        skillService.listFilterOptions().then(setFilterOptions),
      ]);
    } catch {
      setFeedback({ kind: "error", message: "The Skill could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="skills-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><BrandLogo /></div>
        <div className="skills-page__title">
          <p>THE HEAVENS / SKILLS</p>
          <h1>Skills</h1>
          <span>G.O.D. archive · {session.username}</span>
        </div>
        <div className="skills-page__navigation">
          <button type="button" onClick={onBack}>Back to The Heavens</button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>

      <div className="skills-workspace">
        <SkillLibrary
          page={library}
          filters={filters}
          filterOptions={filterOptions}
          selectedSkillId={draft?.id}
          view={view}
          loading={loadingLibrary}
          onViewChange={setView}
          onFiltersChange={setFilters}
          onSelect={selectSkill}
          onNewSkill={beginNewSkill}
        />
        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty"><p>LOADING SKILL</p></section>
        ) : (
          <SkillEditor
            draft={draft}
            filterOptions={filterOptions}
            saving={saving}
            dirty={dirty}
            feedback={feedback}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
              setFeedback(null);
            }}
            onSave={() => void saveSkill()}
            onDelete={() => void deleteSkill()}
            findCandidates={findCandidates}
            findFrameworkSkills={findFrameworkSkills}
          />
        )}
      </div>
      {pendingEditorChange && (
        <div
          className="skills-page__discard-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="discard-changes-title"
        >
          <div>
            <p id="discard-changes-title">Unsaved changes</p>
            <span>Leave this draft and discard the changes you have not saved?</span>
          </div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingEditorChange(null)}>
              Keep Editing
            </button>
            <button
              className="skills-danger-button"
              type="button"
              onClick={discardAndContinue}
            >
              Discard Changes
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
