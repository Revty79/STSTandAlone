import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CreatureNpcEditor } from "../components/creature-npcs/CreatureNpcEditor";
import { creatureService } from "../services/creatureService";
import {
  CreatureNpcValidationError,
  creatureNpcAggregateToDraft,
  creatureNpcService,
} from "../services/creatureNpcService";
import type { CreatureNpcAggregate, CreatureNpcDraft } from "../types/creatureNpc";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/creatures-page.css";
import "../styles/creature-npc-page.css";

type Props = {
  session: AuthSession;
  campaignId: number;
  npcId: number;
  onBack: () => void;
  onLogout: () => void;
};

export function CreatureNpcPage({ session, campaignId, npcId, onBack, onLogout }: Props) {
  const [aggregate, setAggregate] = useState<CreatureNpcAggregate | null>(null);
  const [draft, setDraft] = useState<CreatureNpcDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingExit, setPendingExit] = useState<"back" | "logout" | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    creatureNpcService.getCreatureNpc(npcId, campaignId, session.userId)
      .then((record) => {
        if (!active) return;
        if (!record) {
          setFeedback({ kind: "error", message: "That Creature NPC is not available to this G.O.D. profile." });
          return;
        }
        setAggregate(record);
        setDraft(creatureNpcAggregateToDraft(record));
      })
      .catch((error) => {
        if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature NPC could not be loaded." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, npcId, session.userId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const findSkills = useCallback((search: string) => creatureService.listSkillCandidates(search), []);

  function changeDraft(next: CreatureNpcDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function save() {
    if (!aggregate || !draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await creatureNpcService.saveCreatureNpc(aggregate, draft, session.userId);
      setAggregate(saved);
      setDraft(creatureNpcAggregateToDraft(saved));
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was saved. The ${saved.core.creatureName} master record was not changed.` });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof CreatureNpcValidationError || error instanceof Error
          ? error.message
          : "The Creature NPC could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  function requestExit(destination: "back" | "logout") {
    if (dirty) setPendingExit(destination);
    else if (destination === "back") onBack();
    else onLogout();
  }

  function discardAndExit() {
    const destination = pendingExit;
    setPendingExit(null);
    if (destination === "back") onBack();
    else if (destination === "logout") onLogout();
  }

  return (
    <main className="skills-page creatures-page creature-npc-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><BrandLogo /></div>
        <div className="skills-page__title"><p>THE HEAVENS / NPCS / CREATURE INDIVIDUAL</p><h1>Creature NPC</h1><span>{aggregate?.core.campaignName ?? `Campaign ${campaignId}`} · {session.username}</span></div>
        <div className="skills-page__navigation"><button type="button" onClick={() => requestExit("back")}>Back to NPC Master Sheet</button><button type="button" onClick={() => requestExit("logout")}>Log Out</button></div>
      </header>
      <div className="creature-npc-workspace">
        {loading ? <section className="skill-editor skill-editor--empty"><p>LOADING CREATURE NPC</p><h2>Opening the individual record…</h2></section> : aggregate && draft ? <CreatureNpcEditor aggregate={aggregate} draft={draft} saving={saving} dirty={dirty} feedback={feedback} onChange={changeDraft} onSave={() => void save()} findSkills={findSkills} /> : <section className="skill-editor skill-editor--empty"><p>CREATURE NPC UNAVAILABLE</p><h2>{feedback?.message ?? "The individual record could not be opened."}</h2></section>}
      </div>
      {pendingExit ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-creature-npc-title"><div><p id="discard-creature-npc-title">Unsaved Creature NPC changes</p><span>Leave this individual and discard changes that have not been saved?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingExit(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndExit}>Discard Changes</button></div></div> : null}
    </main>
  );
}
