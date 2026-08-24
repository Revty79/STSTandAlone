import { useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CampaignInformationPanel } from "../components/CampaignInformationPanel";
import { CampaignCharacterPanel } from "../components/CampaignCharacterPanel";
import { CampaignPlayerPanel } from "../components/CampaignPlayerPanel";
import {
  PortalActionCard,
  type PortalActionDefinition,
} from "../components/PortalActionCard";
import type { AuthSession } from "../types/user";
import {
  HEAVENS_CORE_TOOLS,
  getHeavensToolDestination,
} from "./heavensDashboardTools";
import { campaignService } from "../services/campaignService";
import { characterService } from "../services/characterService";
import type {
  CampaignAggregate,
  CampaignCharacterReference,
  CampaignPlayerReference,
  CampaignProfileReference,
  CampaignSummary,
} from "../types/campaign";
import "../styles/heavens-dashboard.css";

type HeavensDashboardPageProps = {
  session: AuthSession;
  onCreateCampaign: () => void;
  onEditCampaign: (campaignId: number) => void;
  onOpenRaces: () => void;
  onOpenSkills: () => void;
  onOpenCreatures: () => void;
  onOpenEquipment: () => void;
  onOpenInventory: () => void;
  onOpenNpcs: () => void;
  onOpenCharacter: (campaignId: number, characterId: number) => void;
  onReturn: () => void;
  onLogout: () => void;
};

const CONTROL_PLACEHOLDERS = {
  campaign: "No Campaign Selected",
  player: "No Player Selected",
  character: "No Character Selected",
} as const;

export function HeavensDashboardPage({
  session,
  onCreateCampaign,
  onEditCampaign,
  onOpenRaces,
  onOpenSkills,
  onOpenCreatures,
  onOpenEquipment,
  onOpenInventory,
  onOpenNpcs,
  onOpenCharacter,
  onReturn,
  onLogout,
}: HeavensDashboardPageProps) {
  const [notice, setNotice] = useState("");
  const [isCampaignInformationOpen, setIsCampaignInformationOpen] =
    useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignListError, setCampaignListError] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignAggregate | null>(null);
  const [campaignInformationLoading, setCampaignInformationLoading] = useState(false);
  const [campaignInformationError, setCampaignInformationError] = useState("");
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [profiles, setProfiles] = useState<CampaignProfileReference[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState("");
  const [addingProfileId, setAddingProfileId] = useState<number | null>(null);
  const [addPlayerMessage, setAddPlayerMessage] = useState("");
  const [campaignPlayers, setCampaignPlayers] = useState<CampaignPlayerReference[]>([]);
  const [campaignPlayersLoading, setCampaignPlayersLoading] = useState(false);
  const [campaignPlayersError, setCampaignPlayersError] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isCharacterPanelOpen, setIsCharacterPanelOpen] = useState(false);
  const [campaignCharacters, setCampaignCharacters] = useState<CampaignCharacterReference[]>([]);
  const [campaignCharactersLoading, setCampaignCharactersLoading] = useState(false);
  const [campaignCharactersError, setCampaignCharactersError] = useState("");
  const [characterSaving, setCharacterSaving] = useState(false);
  const [characterMessage, setCharacterMessage] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");

  useEffect(() => {
    let active = true;
    campaignService.listCampaigns()
      .then((savedCampaigns) => {
        if (active) setCampaigns(savedCampaigns);
      })
      .catch(() => {
        if (active) setCampaignListError("Saved Campaigns could not be read from the local archive.");
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
    setCampaignPlayers([]);
    setSelectedPlayerId("");
    setCampaignPlayersError("");
    if (!selectedCampaignId) {
      setCampaignPlayersLoading(false);
      return () => {
        active = false;
      };
    }

    setCampaignPlayersLoading(true);
    campaignService.listCampaignPlayers(Number(selectedCampaignId))
      .then((players) => {
        if (active) setCampaignPlayers(players);
      })
      .catch(() => {
        if (active) setCampaignPlayersError("Campaign Players could not be read from the local archive.");
      })
      .finally(() => {
        if (active) setCampaignPlayersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    let active = true;
    setProfiles([]);
    setProfilesError("");
    setAddPlayerMessage("");
    if (!isAddPlayerOpen || !selectedCampaignId) {
      setProfilesLoading(false);
      return () => {
        active = false;
      };
    }

    setProfilesLoading(true);
    campaignService.listProfilesForCampaign(Number(selectedCampaignId))
      .then((availableProfiles) => {
        if (active) setProfiles(availableProfiles);
      })
      .catch(() => {
        if (active) setProfilesError("Local profiles could not be read for this Campaign.");
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAddPlayerOpen, selectedCampaignId]);

  useEffect(() => {
    let active = true;
    setCampaignCharacters([]);
    setSelectedCharacterId("");
    setCampaignCharactersError("");
    setCharacterMessage("");
    if (!selectedCampaignId || !selectedPlayerId) {
      setCampaignCharactersLoading(false);
      return () => {
        active = false;
      };
    }

    setCampaignCharactersLoading(true);
    campaignService.listCharacters(
      Number(selectedCampaignId),
      Number(selectedPlayerId),
    )
      .then((characters) => {
        if (active) setCampaignCharacters(characters);
      })
      .catch(() => {
        if (active) {
          setCampaignCharactersError(
            "Characters for this Campaign Player could not be read from the local archive.",
          );
        }
      })
      .finally(() => {
        if (active) setCampaignCharactersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCampaignId, selectedPlayerId]);

  async function viewCampaign() {
    setIsAddPlayerOpen(false);
    setIsCharacterPanelOpen(false);
    setIsCampaignInformationOpen(true);
    setSelectedCampaign(null);
    setCampaignInformationError("");
    if (!selectedCampaignId) return;

    setCampaignInformationLoading(true);
    try {
      const savedCampaign = await campaignService.getCampaign(Number(selectedCampaignId));
      if (!savedCampaign) {
        setCampaignInformationError("That Campaign is no longer available in the local archive.");
        return;
      }
      setSelectedCampaign(savedCampaign);
    } catch {
      setCampaignInformationError("The Campaign and its linked records could not be loaded.");
    } finally {
      setCampaignInformationLoading(false);
    }
  }

  async function addPlayer(profileId: number) {
    if (!selectedCampaignId) return;
    setAddingProfileId(profileId);
    setProfilesError("");
    setAddPlayerMessage("");
    try {
      const players = await campaignService.addPlayer(Number(selectedCampaignId), profileId);
      const addedProfile = profiles.find((profile) => profile.id === profileId);
      setCampaignPlayers(players);
      setSelectedPlayerId(String(profileId));
      setProfiles((current) => current.map((profile) =>
        profile.id === profileId ? { ...profile, isCampaignPlayer: true } : profile,
      ));
      setAddPlayerMessage(
        `${addedProfile?.username ?? "The profile"} is now a Player in this Campaign.`,
      );
    } catch {
      setProfilesError("That profile could not be added as a Player in this Campaign.");
    } finally {
      setAddingProfileId(null);
    }
  }

  async function createNewCharacter() {
    if (!selectedCampaignId || !selectedPlayerId) return;
    setIsCampaignInformationOpen(false);
    setIsAddPlayerOpen(false);
    setIsCharacterPanelOpen(true);
    setCharacterSaving(true);
    setCampaignCharactersError("");
    setCharacterMessage("");
    try {
      const characterAggregate = await characterService.createCharacter(
        Number(selectedCampaignId),
        Number(selectedPlayerId),
      );
      const characters = await campaignService.listCharacters(
        Number(selectedCampaignId),
        Number(selectedPlayerId),
      );
      setCampaignCharacters(characters);
      setSelectedCharacterId(String(characterAggregate.character.id));
      setCharacterMessage(
        "New Character is saved and linked to this Player and Campaign.",
      );
    } catch {
      setCampaignCharactersError(
        "New Character could not be created for this Campaign Player.",
      );
    } finally {
      setCharacterSaving(false);
    }
  }

  function showComingSoon(label: string) {
    setNotice(`${label} is coming soon.`);
  }

  function selectTool(tool: PortalActionDefinition) {
    const destination = getHeavensToolDestination(tool.id);
    if (destination === "races") {
      onOpenRaces();
      return;
    }
    if (destination === "skills") {
      onOpenSkills();
      return;
    }
    if (destination === "creatures") {
      onOpenCreatures();
      return;
    }
    if (destination === "equipment") {
      onOpenEquipment();
      return;
    }
    if (destination === "inventory") {
      onOpenInventory();
      return;
    }
    if (destination === "npcs") {
      onOpenNpcs();
      return;
    }
    showComingSoon(tool.title);
  }

  return (
    <main className="heavens-dashboard-page">
      <div className="heavens-dashboard-page__texture" aria-hidden="true" />

      <div className="heavens-dashboard">
        <header className="heavens-dashboard__header">
          <div className="heavens-dashboard__brand">
            <BrandLogo />
          </div>
          <div className="heavens-dashboard__identity">
            <p className="heavens-dashboard__eyebrow">G.O.D. CREATION PORTAL</p>
            <h2>THE HEAVENS</h2>
            <p className="heavens-dashboard__welcome">
              Welcome, <strong>{session.username}</strong>
              <span aria-hidden="true"> — </span>G.O.D.
            </p>
          </div>
        </header>

        <section
          className="campaign-control"
          aria-labelledby="campaign-control-heading"
        >
          <div className="heavens-dashboard__section-heading">
            <p>WORKING CONTEXT</p>
            <h3 id="campaign-control-heading">Campaign Control</h3>
          </div>

          <div className="campaign-control__rows">
            <div className="campaign-control__row">
              <label htmlFor="campaign-select">Campaign</label>
              <select
                id="campaign-select"
                value={selectedCampaignId}
                disabled={campaignsLoading}
                onChange={(event) => {
                  setSelectedCampaignId(event.target.value);
                  setSelectedCampaign(null);
                  setCampaignInformationError("");
                  setIsCampaignInformationOpen(false);
                  setIsAddPlayerOpen(false);
                  setIsCharacterPanelOpen(false);
                }}
              >
                <option value="">
                  {campaignsLoading ? "Reading Campaigns…" : CONTROL_PLACEHOLDERS.campaign}
                </option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
              <div className="campaign-control__actions">
                <button
                  type="button"
                  aria-expanded={isCampaignInformationOpen}
                  aria-controls="campaign-information"
                  onClick={viewCampaign}
                >
                  View Campaign
                </button>
                <button
                  type="button"
                  onClick={onCreateCampaign}
                >
                  Create Campaign
                </button>
              </div>
            </div>

            <div className="campaign-control__row">
              <label htmlFor="player-select">Player</label>
              <select
                id="player-select"
                value={selectedPlayerId}
                disabled={!selectedCampaignId || campaignPlayersLoading}
                onChange={(event) => {
                  setSelectedPlayerId(event.target.value);
                  setIsCharacterPanelOpen(false);
                }}
              >
                <option value="">
                  {!selectedCampaignId
                    ? "Select a Campaign First"
                    : campaignPlayersLoading
                      ? "Reading Players…"
                      : campaignPlayers.length === 0
                        ? "No Players Added"
                        : CONTROL_PLACEHOLDERS.player}
                </option>
                {campaignPlayers.map((player) => (
                  <option key={player.id} value={player.id}>{player.username}</option>
                ))}
              </select>
              <div className="campaign-control__actions">
                <button
                  type="button"
                  aria-expanded={isAddPlayerOpen}
                  aria-controls="campaign-player-panel"
                  onClick={() => {
                    setIsCampaignInformationOpen(false);
                    setIsCharacterPanelOpen(false);
                    setIsAddPlayerOpen(true);
                  }}
                >
                  Add Player
                </button>
              </div>
            </div>

            <div className="campaign-control__row">
              <label htmlFor="character-select">Character</label>
              <select
                id="character-select"
                value={selectedCharacterId}
                disabled={!selectedPlayerId || campaignCharactersLoading}
                onChange={(event) => setSelectedCharacterId(event.target.value)}
              >
                <option value="">
                  {!selectedPlayerId
                    ? "Select a Player First"
                    : campaignCharactersLoading
                      ? "Reading Characters…"
                      : campaignCharacters.length === 0
                        ? "No Characters Created"
                        : CONTROL_PLACEHOLDERS.character}
                </option>
                {campaignCharacters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
              <div className="campaign-control__actions campaign-control__actions--character">
                <button
                  type="button"
                  disabled={!selectedCampaignId || !selectedPlayerId || characterSaving}
                  aria-expanded={isCharacterPanelOpen}
                  aria-controls="campaign-character-panel"
                  onClick={createNewCharacter}
                >
                  New Character
                </button>
                <button
                  type="button"
                  disabled={!selectedCharacterId}
                  onClick={() => onOpenCharacter(
                    Number(selectedCampaignId),
                    Number(selectedCharacterId),
                  )}
                >
                  Edit Character
                </button>
              </div>
            </div>
          </div>

          {isCampaignInformationOpen && (
            <CampaignInformationPanel
              campaign={selectedCampaign}
              loading={campaignInformationLoading}
              error={campaignInformationError}
              onEdit={() => selectedCampaign && onEditCampaign(selectedCampaign.campaign.id)}
              onClose={() => setIsCampaignInformationOpen(false)}
            />
          )}
          {isAddPlayerOpen ? (
            <CampaignPlayerPanel
              campaignName={campaigns.find(
                (campaign) => String(campaign.id) === selectedCampaignId,
              )?.name}
              profiles={profiles}
              loading={profilesLoading}
              error={profilesError}
              addingProfileId={addingProfileId}
              successMessage={addPlayerMessage}
              onAdd={addPlayer}
              onClose={() => setIsAddPlayerOpen(false)}
            />
          ) : null}
          {isCharacterPanelOpen ? (
            <CampaignCharacterPanel
              campaignName={campaigns.find(
                (campaign) => String(campaign.id) === selectedCampaignId,
              )?.name}
              playerName={campaignPlayers.find(
                (player) => String(player.id) === selectedPlayerId,
              )?.username}
              characters={campaignCharacters}
              loading={campaignCharactersLoading}
              saving={characterSaving}
              error={campaignCharactersError}
              successMessage={characterMessage}
              onCreate={createNewCharacter}
              onClose={() => setIsCharacterPanelOpen(false)}
            />
          ) : null}
          {campaignListError ? (
            <p className="campaign-information__message campaign-information__message--error" role="alert">
              {campaignListError}
            </p>
          ) : null}
          {campaignPlayersError ? (
            <p className="campaign-information__message campaign-information__message--error" role="alert">
              {campaignPlayersError}
            </p>
          ) : null}
          {!isCharacterPanelOpen && campaignCharactersError ? (
            <p className="campaign-information__message campaign-information__message--error" role="alert">
              {campaignCharactersError}
            </p>
          ) : null}
        </section>

        <section
          className="heavens-tools"
          aria-labelledby="heavens-tools-heading"
        >
          <div className="heavens-dashboard__section-heading heavens-dashboard__section-heading--tools">
            <p>CREATION LIBRARIES</p>
            <h3 id="heavens-tools-heading">Create & Manage Serrian Tide</h3>
          </div>

          <div className="heavens-tools__grid heavens-tools__grid--core">
            {HEAVENS_CORE_TOOLS.map((tool) => (
              <PortalActionCard
                key={tool.id}
                action={tool}
                variant="heavens"
                onSelect={selectTool}
              />
            ))}
          </div>

          <p
            className={`heavens-dashboard__notice${notice ? " is-visible" : ""}`}
            role="status"
            aria-live="polite"
          >
            {notice || "Select a library to continue shaping Serrian Tide."}
          </p>
        </section>

        <footer className="heavens-dashboard__footer">
          <button
            className="heavens-dashboard__return"
            type="button"
            onClick={onReturn}
          >
            Return to Paths
          </button>
          <button
            className="heavens-dashboard__logout"
            type="button"
            onClick={onLogout}
          >
            Log Out
          </button>
        </footer>
      </div>
    </main>
  );
}
