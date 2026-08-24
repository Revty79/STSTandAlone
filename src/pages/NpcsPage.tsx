import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { campaignService } from "../services/campaignService";
import { characterService } from "../services/characterService";
import { creatureService } from "../services/creatureService";
import { creatureNpcService } from "../services/creatureNpcService";
import type { CampaignNpcReference, CampaignSummary } from "../types/campaign";
import type { CreatureSummary } from "../types/creature";
import type { AuthSession } from "../types/user";
import "../styles/npcs-page.css";

type NpcsPageProps = {
  session: AuthSession;
  onOpenNpc: (campaignId: number, npcId: number, npcKind: "race" | "creature") => void;
  onBack: () => void;
  onLogout: () => void;
};

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function NpcsPage({ session, onOpenNpc, onBack, onLogout }: NpcsPageProps) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [npcs, setNpcs] = useState<CampaignNpcReference[]>([]);
  const [npcsLoading, setNpcsLoading] = useState(false);
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [isCreatureCreatorOpen, setIsCreatureCreatorOpen] = useState(false);
  const [creatureSearch, setCreatureSearch] = useState("");
  const [creatures, setCreatures] = useState<CreatureSummary[]>([]);
  const [creaturesLoading, setCreaturesLoading] = useState(false);
  const [selectedCreatureId, setSelectedCreatureId] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    campaignService.listCampaigns()
      .then((records) => {
        if (active) setCampaigns(records);
      })
      .catch(() => {
        if (active) setFeedback({ kind: "error", message: "Campaigns could not be read from the local archive." });
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setNpcs([]);
    setSelectedNpcId("");
    setSearch("");
    setFeedback(null);
    if (!selectedCampaignId) {
      setNpcsLoading(false);
      return () => {
        active = false;
      };
    }
    setNpcsLoading(true);
    campaignService.listNpcs(Number(selectedCampaignId))
      .then((records) => {
        if (active) setNpcs(records);
      })
      .catch(() => {
        if (active) setFeedback({ kind: "error", message: "NPCs for this Campaign could not be read from the local archive." });
      })
      .finally(() => {
        if (active) setNpcsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    let active = true;
    if (!isCreatureCreatorOpen) {
      setCreatures([]);
      setSelectedCreatureId("");
      setCreaturesLoading(false);
      return () => {
        active = false;
      };
    }
    setCreaturesLoading(true);
    const timeout = window.setTimeout(() => {
      creatureService.listCreatures({
        search: creatureSearch,
        page: 1,
        pageSize: 100,
      }).then((page) => {
        if (active) setCreatures(page.items);
      }).catch(() => {
        if (active) setFeedback({ kind: "error", message: "The master Creature catalog could not be read." });
      }).finally(() => {
        if (active) setCreaturesLoading(false);
      });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [creatureSearch, isCreatureCreatorOpen]);

  const visibleNpcs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? npcs.filter((npc) => npc.name.toLocaleLowerCase().includes(query))
      : npcs;
  }, [npcs, search]);
  const selectedCampaign = campaigns.find(
    (campaign) => String(campaign.id) === selectedCampaignId,
  );
  const selectedNpc = npcs.find((npc) => String(npc.id) === selectedNpcId);

  async function createRaceNpc() {
    if (!selectedCampaignId || creating) return;
    setCreating(true);
    setFeedback(null);
    try {
      const created = await characterService.createNpc(
        Number(selectedCampaignId),
        session.userId,
      );
      const records = await campaignService.listNpcs(Number(selectedCampaignId));
      setNpcs(records);
      setSelectedNpcId(String(created.character.id));
      setFeedback({
        kind: "success",
        message: "New NPC was added to the Campaign master sheet. Select Edit Full Sheet when you are ready.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The NPC could not be created.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function createCreatureNpc() {
    if (!selectedCampaignId || !selectedCreatureId || creating) return;
    setCreating(true);
    setFeedback(null);
    try {
      const template = await creatureService.getCreature(Number(selectedCreatureId));
      if (!template) throw new Error("That master Creature is no longer available.");
      const created = await creatureNpcService.createCreatureNpc(
        Number(selectedCampaignId),
        session.userId,
        template,
      );
      const records = await campaignService.listNpcs(Number(selectedCampaignId));
      setNpcs(records);
      setSelectedNpcId(String(created.core.id));
      setIsCreatureCreatorOpen(false);
      setFeedback({
        kind: "success",
        message: `${created.core.name} was created from ${created.core.creatureName}. The master Creature was not changed.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Creature NPC could not be created.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="npcs-page">
      <div className="npcs-page__texture" aria-hidden="true" />
      <header className="npcs-header">
        <div className="npcs-header__brand"><BrandLogo /></div>
        <div className="npcs-header__title">
          <p>THE HEAVENS · CAMPAIGN CHARACTERS</p>
          <h1>NPC Master Sheet</h1>
          <span>Create, find, and open every non-player character from one Campaign archive.</span>
        </div>
        <div className="npcs-header__actions">
          <button type="button" onClick={onBack}>Return to Heavens</button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>

      <div className="npcs-workspace">
        <section className="npcs-control" aria-labelledby="npcs-control-heading">
          <div>
            <p>CAMPAIGN CONTEXT</p>
            <h2 id="npcs-control-heading">Choose the NPC archive</h2>
          </div>
          <label>
            <span>Campaign</span>
            <select
              value={selectedCampaignId}
              disabled={campaignsLoading}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
            >
              <option value="">{campaignsLoading ? "Reading Campaigns…" : "No Campaign Selected"}</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <div className="npcs-control__creation-actions">
            <button type="button" disabled={!selectedCampaignId || creating} onClick={createRaceNpc}>
              {creating ? "Creating NPC…" : "Create Race NPC"}
            </button>
            <button type="button" disabled={!selectedCampaignId || creating} onClick={() => setIsCreatureCreatorOpen(true)}>
              Create Creature NPC
            </button>
          </div>
        </section>

        {isCreatureCreatorOpen ? (
          <section className="npcs-creature-creator" aria-labelledby="creature-npc-creator-heading">
            <header>
              <div><p>SECOND NPC CREATION PATH</p><h2 id="creature-npc-creator-heading">Create from Master Creature</h2><span>Selecting a template creates an individual NPC copy. The master Creature remains unchanged.</span></div>
              <button type="button" onClick={() => setIsCreatureCreatorOpen(false)}>Close</button>
            </header>
            <label><span>Search Creature Catalog</span><input value={creatureSearch} onChange={(event) => setCreatureSearch(event.target.value)} placeholder="Goblin, animal, undead…" /></label>
            <div className="npcs-creature-creator__catalog">
              {creaturesLoading ? <p>Reading Creature catalog…</p> : creatures.length === 0 ? <p>No matching Creatures.</p> : creatures.map((creature) => (
                <button type="button" key={creature.id} className={selectedCreatureId === String(creature.id) ? "is-selected" : ""} onClick={() => setSelectedCreatureId(String(creature.id))}>
                  <strong>{creature.canonicalName}</strong>
                  <span>{creature.canonicalId} · {creature.creatureType || creature.family || "Creature"}</span>
                  <small>{creature.size}{creature.challengeRating === null ? "" : ` · CR ${creature.challengeRating}`}</small>
                </button>
              ))}
            </div>
            <footer><span>{selectedCreatureId ? `${creatures.find((creature) => String(creature.id) === selectedCreatureId)?.canonicalName} selected` : "Choose one master Creature."}</span><button type="button" disabled={!selectedCreatureId || creating} onClick={() => void createCreatureNpc()}>{creating ? "Creating Creature NPC…" : "Create Individual NPC"}</button></footer>
          </section>
        ) : null}

        {feedback ? (
          <p className={`npcs-feedback npcs-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>
        ) : null}

        <section className="npcs-master" aria-labelledby="npcs-master-heading">
          <div className="npcs-master__heading">
            <div>
              <p>MASTER NPC INDEX</p>
              <h2 id="npcs-master-heading">{selectedCampaign?.name ?? "Select a Campaign"}</h2>
              <span>{selectedCampaignId ? `${npcs.length} NPC ${npcs.length === 1 ? "record" : "records"}` : "NPCs are stored inside their Campaign."}</span>
            </div>
            <label>
              <span>Search NPCs</span>
              <input value={search} disabled={!selectedCampaignId} onChange={(event) => setSearch(event.target.value)} placeholder="NPC name" />
            </label>
          </div>

          {!selectedCampaignId ? (
            <div className="npcs-master__empty"><strong>No Campaign Selected</strong><span>Choose a Campaign to open its NPC master sheet.</span></div>
          ) : npcsLoading ? (
            <div className="npcs-master__empty"><strong>Reading NPCs…</strong><span>Opening the Campaign archive.</span></div>
          ) : visibleNpcs.length === 0 ? (
            <div className="npcs-master__empty"><strong>{search ? "No Matching NPCs" : "No NPCs Yet"}</strong><span>{search ? "Try a different name." : "Create the first NPC for this Campaign."}</span></div>
          ) : (
            <div className="npcs-master__grid">
              {visibleNpcs.map((npc) => (
                <button
                  type="button"
                  key={npc.id}
                  className={selectedNpcId === String(npc.id) ? "is-selected" : ""}
                  onClick={() => setSelectedNpcId(String(npc.id))}
                >
                  <span className="npcs-master__record-id">NPC-{String(npc.id).padStart(4, "0")}</span>
                  <strong>{npc.name}</strong>
                  <span>{npc.npcKind === "creature" ? `Creature NPC · ${npc.creatureTemplateName ?? "Unknown template"}` : npc.creationCompletedAt ? "Completed Race NPC Sheet" : "Race NPC · Open G.O.D. Record"}</span>
                  <small>Updated {displayDate(npc.updatedAt)}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className={`npcs-selection${selectedNpc ? " is-active" : ""}`} aria-live="polite">
          <div>
            <span>SELECTED NPC</span>
            <strong>{selectedNpc?.name ?? "No NPC Selected"}</strong>
            <small>{selectedNpc ? `NPC-${String(selectedNpc.id).padStart(4, "0")} · ${selectedCampaign?.name}` : "Choose an NPC from the master sheet."}</small>
          </div>
          <button
            type="button"
            disabled={!selectedNpc || !selectedCampaignId}
            onClick={() => selectedNpc && onOpenNpc(Number(selectedCampaignId), selectedNpc.id, selectedNpc.npcKind)}
          >
            Edit Full Sheet
          </button>
        </aside>
      </div>
    </main>
  );
}
