import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CreatureEditor } from "../components/creatures/CreatureEditor";
import { CreatureLibrary } from "../components/creatures/CreatureLibrary";
import { CREATURE_ATTRIBUTES } from "../data/creatureOptions";
import { CreatureValidationError, creatureService } from "../services/creatureService";
import type {
  ChallengeRatingReference,
  CreatureAggregate,
  CreatureLibraryFacets,
  CreatureLibraryFilters,
  CreatureLibraryPage,
  CreatureSummary,
  SaveCreatureAggregate,
} from "../types/creature";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/creatures-page.css";

type Props = { session: AuthSession; onBack: () => void; onLogout: () => void };
type PendingChange = { kind: "open"; creature: CreatureSummary } | { kind: "new" };
const EMPTY_PAGE: CreatureLibraryPage = { items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 };
const EMPTY_FACETS: CreatureLibraryFacets = { families: [], creatureTypes: [] };

export function creatureAggregateToDraft(aggregate: CreatureAggregate): SaveCreatureAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.core;
  return { ...aggregate, id: aggregate.id, core };
}

export function newCreatureDraft(userId: number): SaveCreatureAggregate {
  return {
    core: {
      canonicalId: "", canonicalName: "", family: "", creatureType: "", size: "Medium",
      challengeRating: 1, killXp: 1, parentCreatureId: null, parentCreatureName: null,
      calculatedChallengeRating: 1, challengeRatingAdjustment: 0, challengeRatingAdjustmentReason: "",
      description: "", typicalBehavior: "", habitatEcology: "", notes: "",
      createdByUserId: userId, sourceSystem: null,
    },
    attributes: CREATURE_ATTRIBUTES.map((attributeKey, sortOrder) => ({ attributeKey, value: null, notes: "", sortOrder })),
    movement: [], hpPools: [], hitLocations: [], attacks: [], skillLinks: [], abilities: [], defenses: [], uses: [], derivedCreatures: [],
  };
}

export function CreaturesPage({ session, onBack, onLogout }: Props) {
  const [filters, setFilters] = useState<CreatureLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState<CreatureLibraryPage>(EMPTY_PAGE);
  const [facets, setFacets] = useState<CreatureLibraryFacets>(EMPTY_FACETS);
  const [challengeRatings, setChallengeRatings] = useState<ChallengeRatingReference[]>([]);
  const [draft, setDraft] = useState<SaveCreatureAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const loadLibrary = useCallback(async (nextFilters: CreatureLibraryFilters) => {
    setLoadingLibrary(true);
    try { setLibrary(await creatureService.listCreatures(nextFilters)); }
    catch { setFeedback({ kind: "error", message: "The Creature Library could not be read from the local archive." }); }
    finally { setLoadingLibrary(false); }
  }, []);

  useEffect(() => {
    void Promise.all([creatureService.listFacets(), creatureService.listChallengeRatings()])
      .then(([nextFacets, references]) => { setFacets(nextFacets); setChallengeRatings(references); })
      .catch(() => setFeedback({ kind: "error", message: "Creature reference data could not be read." }));
  }, []);
  useEffect(() => { const timeout = window.setTimeout(() => void loadLibrary(filters), 180); return () => window.clearTimeout(timeout); }, [filters, loadLibrary]);

  async function openCreature(summary: CreatureSummary) {
    setLoadingEditor(true); setFeedback(null);
    try {
      const aggregate = await creatureService.getCreature(summary.id);
      if (!aggregate) throw new Error("Creature not found");
      setDraft(creatureAggregateToDraft(aggregate)); setDirty(false);
    } catch { setFeedback({ kind: "error", message: "That Creature could not be loaded." }); }
    finally { setLoadingEditor(false); }
  }
  function selectCreature(creature: CreatureSummary) { if (dirty) setPendingChange({ kind: "open", creature }); else void openCreature(creature); }
  function createCreature() { setDraft(newCreatureDraft(session.userId)); setDirty(false); setFeedback(null); }
  function beginCreature() { if (dirty) setPendingChange({ kind: "new" }); else createCreature(); }
  function discardAndContinue() { const pending = pendingChange; setPendingChange(null); if (pending?.kind === "new") createCreature(); else if (pending?.kind === "open") void openCreature(pending.creature); }

  async function saveCreature() {
    if (!draft) return;
    setSaving(true); setFeedback(null);
    try {
      const saved = await creatureService.saveCreature(draft);
      setDraft(creatureAggregateToDraft(saved)); setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.canonicalName} was saved.` });
      const [nextFacets] = await Promise.all([creatureService.listFacets(), loadLibrary(filters)]);
      setFacets(nextFacets);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof CreatureValidationError
          ? error.message
          : typeof error === "string" && error.trim()
            ? error
            : "The Creature could not be saved. Existing data was left intact.",
      });
    } finally { setSaving(false); }
  }
  async function deleteCreature() {
    if (!draft?.id) return;
    setSaving(true); setFeedback(null);
    try {
      const name = draft.core.canonicalName;
      await creatureService.deleteCreature(draft.id);
      setDraft(null); setDirty(false); setFeedback({ kind: "success", message: `${name} was deleted.` });
      const [nextFacets] = await Promise.all([creatureService.listFacets(), loadLibrary(filters)]);
      setFacets(nextFacets);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature could not be deleted." });
    }
    finally { setSaving(false); }
  }
  async function createVariant(variantName: string) {
    if (!draft?.id) return;
    setSaving(true); setFeedback(null);
    try {
      const saved = await creatureService.createVariant(draft.id, variantName, session.userId);
      setDraft(creatureAggregateToDraft(saved)); setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.canonicalName} was created from its parent Creature.` });
      const [nextFacets] = await Promise.all([creatureService.listFacets(), loadLibrary(filters)]);
      setFacets(nextFacets);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: typeof error === "string" && error.trim() ? error : "The derived Creature could not be created." });
    } finally { setSaving(false); }
  }
  const findSkills = useCallback((search: string) => creatureService.listSkillCandidates(search), []);

  return (
    <main className="skills-page creatures-page">
      <header className="skills-page__header"><div className="skills-page__brand"><BrandLogo /></div><div className="skills-page__title"><p>THE HEAVENS / CREATURES</p><h1>Creatures</h1><span>G.O.D. archive · {session.username}</span></div><div className="skills-page__navigation"><button type="button" onClick={onBack}>Back to The Heavens</button><button type="button" onClick={onLogout}>Log Out</button></div></header>
      <div className="skills-workspace creature-workspace">
        <CreatureLibrary page={library} facets={facets} filters={filters} selectedCreatureId={draft?.id} loading={loadingLibrary} onFiltersChange={setFilters} onSelect={selectCreature} onNewCreature={beginCreature} />
        {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING CREATURE</p></section> : <CreatureEditor draft={draft} challengeRatings={challengeRatings} saving={saving} dirty={dirty} feedback={feedback} onChange={(next) => { setDraft(next); setDirty(true); setFeedback(null); }} onSave={() => void saveCreature()} onDelete={() => void deleteCreature()} onCreateVariant={(name) => void createVariant(name)} findSkills={findSkills} />}
      </div>
      {pendingChange ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-creature-title"><div><p id="discard-creature-title">Unsaved changes</p><span>Leave this Creature draft and discard the changes you have not saved?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingChange(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
    </main>
  );
}
