import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { RaceEditor } from "../components/races/RaceEditor";
import { RaceLibrary } from "../components/races/RaceLibrary";
import { RaceValidationError, raceService } from "../services/raceService";
import { STANDARD_RACE_ATTRIBUTES } from "../data/raceOptions";
import type {
  RaceAggregate,
  RaceLibraryFilters,
  RaceLibraryPage,
  RaceSummary,
  SaveRaceAggregate,
} from "../types/race";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/races-page.css";

type Props = { session: AuthSession; onBack: () => void; onLogout: () => void };
type PendingChange = { kind: "open"; race: RaceSummary } | { kind: "new" };

const EMPTY_PAGE: RaceLibraryPage = { items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 };

export function raceAggregateToDraft(aggregate: RaceAggregate): SaveRaceAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.race;
  return {
    id: aggregate.race.id,
    core,
    attributeCaps: aggregate.attributeCaps.map(({ attributeKey, maxValue, sortOrder }) => ({ attributeKey, maxValue, sortOrder })),
    movementModes: aggregate.movementModes.map(({ movementMode, baseValue, notes, sortOrder }) => ({ movementMode, baseValue, notes, sortOrder })),
    skillLinks: aggregate.skillLinks.map(({ skillId, skillName, skillClassification, linkType, value, sortOrder }) => ({ skillId, skillName, skillClassification, linkType, value, sortOrder })),
  };
}

export function newRaceDraft(userId: number): SaveRaceAggregate {
  return {
    core: {
      name: "", legacyDescription: "", physicalCharacteristics: "", physicalDescription: "",
      ageRangeText: "", ageMin: null, ageMax: null, size: "", baseMagic: null,
      racialQuirkName: "", quirkSuccessEffect: "", quirkFailureEffect: "",
      commonLanguagesKnown: "", commonArchetypes: "", genreExamples: "",
      culturalMindset: "", outlookOnMagic: "", createdByUserId: userId,
      sourceSystem: null, sourceExternalId: null,
    },
    attributeCaps: STANDARD_RACE_ATTRIBUTES.map((attributeKey, sortOrder) => ({
      attributeKey,
      maxValue: 50,
      sortOrder,
    })),
    movementModes: [], skillLinks: [],
  };
}

export function RacesPage({ session, onBack, onLogout }: Props) {
  const [filters, setFilters] = useState<RaceLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState<RaceLibraryPage>(EMPTY_PAGE);
  const [sizes, setSizes] = useState<string[]>([]);
  const [draft, setDraft] = useState<SaveRaceAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const loadLibrary = useCallback(async (nextFilters: RaceLibraryFilters) => {
    setLoadingLibrary(true);
    try { setLibrary(await raceService.listRaces(nextFilters)); }
    catch { setFeedback({ kind: "error", message: "The Race Library could not be read from the local archive." }); }
    finally { setLoadingLibrary(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadLibrary]);
  useEffect(() => { raceService.listSizes().then(setSizes).catch(() => undefined); }, []);

  async function openRace(summary: RaceSummary) {
    setLoadingEditor(true); setFeedback(null);
    try {
      const aggregate = await raceService.getRace(summary.id);
      if (!aggregate) throw new Error("Race not found");
      setDraft(raceAggregateToDraft(aggregate)); setDirty(false);
    } catch { setFeedback({ kind: "error", message: "That Race could not be loaded." }); }
    finally { setLoadingEditor(false); }
  }

  function selectRace(race: RaceSummary) {
    if (dirty) { setPendingChange({ kind: "open", race }); return; }
    void openRace(race);
  }
  function createRace() { setDraft(newRaceDraft(session.userId)); setDirty(false); setFeedback(null); }
  function beginRace() { if (dirty) setPendingChange({ kind: "new" }); else createRace(); }
  function discardAndContinue() {
    const pending = pendingChange; setPendingChange(null);
    if (pending?.kind === "new") createRace();
    else if (pending?.kind === "open") void openRace(pending.race);
  }

  async function saveRace() {
    if (!draft) return;
    setSaving(true); setFeedback(null);
    try {
      const saved = await raceService.saveRace(draft);
      setDraft(raceAggregateToDraft(saved)); setDirty(false);
      setFeedback({ kind: "success", message: `${saved.race.name} was saved.` });
      await Promise.all([loadLibrary(filters), raceService.listSizes().then(setSizes)]);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: error instanceof RaceValidationError ? error.message : "The Race could not be saved. Existing data was left intact." });
    } finally { setSaving(false); }
  }

  async function deleteRace() {
    if (!draft?.id) return;
    setSaving(true); setFeedback(null);
    try {
      const name = draft.core.name;
      await raceService.deleteRace(draft.id);
      setDraft(null); setDirty(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await Promise.all([loadLibrary(filters), raceService.listSizes().then(setSizes)]);
    } catch { setFeedback({ kind: "error", message: "The Race could not be deleted." }); }
    finally { setSaving(false); }
  }

  const findSkills = useCallback(
    (search: string, classification?: string) =>
      raceService.listSkillCandidates(search, classification),
    [],
  );

  return (
    <main className="skills-page races-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><BrandLogo /></div>
        <div className="skills-page__title"><p>THE HEAVENS / RACES</p><h1>Races</h1><span>G.O.D. archive · {session.username}</span></div>
        <div className="skills-page__navigation"><button type="button" onClick={onBack}>Back to The Heavens</button><button type="button" onClick={onLogout}>Log Out</button></div>
      </header>
      <div className="skills-workspace races-workspace">
        <RaceLibrary page={library} filters={filters} sizes={sizes} selectedRaceId={draft?.id} loading={loadingLibrary} onFiltersChange={setFilters} onSelect={selectRace} onNewRace={beginRace} />
        {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING RACE</p></section> : <RaceEditor draft={draft} saving={saving} dirty={dirty} feedback={feedback} onChange={(next) => { setDraft(next); setDirty(true); setFeedback(null); }} onSave={() => void saveRace()} onDelete={() => void deleteRace()} findSkills={findSkills} />}
      </div>
      {pendingChange && <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-race-title">
        <div><p id="discard-race-title">Unsaved changes</p><span>Leave this Race draft and discard the changes you have not saved?</span></div>
        <div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingChange(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div>
      </div>}
    </main>
  );
}
