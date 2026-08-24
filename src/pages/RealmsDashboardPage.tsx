import { useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import {
  PortalActionCard,
  type PortalActionDefinition,
} from "../components/PortalActionCard";
import type { AuthSession } from "../types/user";
import type {
  CampaignCharacterReference,
  PlayerCampaignReference,
} from "../types/campaign";
import { campaignService } from "../services/campaignService";
import {
  REALMS_DASHBOARD_ACTIONS,
  canOpenCharacterCreation,
} from "./realmsDashboardActions";
import "../styles/realms-dashboard.css";

type RealmsDashboardPageProps = {
  session: AuthSession;
  onReturn?: () => void;
  onLogout: () => void;
  onOpenCharacter?: (campaignId: number, characterId: number) => void;
};

export function RealmsDashboardPage({
  session,
  onReturn,
  onLogout,
  onOpenCharacter,
}: RealmsDashboardPageProps) {
  const [notice, setNotice] = useState("");
  const [campaigns, setCampaigns] = useState<PlayerCampaignReference[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [characters, setCharacters] = useState<CampaignCharacterReference[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const selectedCharacter = characters.find(
    (character) => String(character.id) === selectedCharacterId,
  );

  useEffect(() => {
    let active = true;
    campaignService.listPlayerCampaigns(session.userId)
      .then((playerCampaigns) => {
        if (active) setCampaigns(playerCampaigns);
      })
      .catch(() => {
        if (active) {
          setCampaignsError(
            "Your Campaigns could not be read from the local archive.",
          );
        }
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.userId]);

  useEffect(() => {
    let active = true;
    setCharacters([]);
    setSelectedCharacterId("");
    setCharactersError("");
    if (!selectedCampaignId) {
      setCharactersLoading(false);
      return () => {
        active = false;
      };
    }

    setCharactersLoading(true);
    campaignService.listCharacters(Number(selectedCampaignId), session.userId)
      .then((playerCharacters) => {
        if (active) setCharacters(playerCharacters);
      })
      .catch(() => {
        if (active) {
          setCharactersError(
            "Your Characters in this Campaign could not be read from the local archive.",
          );
        }
      })
      .finally(() => {
        if (active) setCharactersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCampaignId, session.userId]);

  function showComingSoon(label: string) {
    setNotice(`${label} is coming soon.`);
  }

  function selectAction(action: PortalActionDefinition) {
    if (action.id === "character-sheet" && selectedCampaignId && selectedCharacterId) {
      onOpenCharacter?.(Number(selectedCampaignId), Number(selectedCharacterId));
      return;
    }
    showComingSoon(action.title);
  }

  return (
    <main className="realms-dashboard-page">
      <div className="realms-dashboard-page__texture" aria-hidden="true" />

      <div className="realms-dashboard">
        <header className="realms-dashboard__header">
          <div className="realms-dashboard__brand">
            <BrandLogo />
          </div>
          <div className="realms-dashboard__identity">
            <p className="realms-dashboard__eyebrow">PLAYER PORTAL</p>
            <h2>THE REALMS</h2>
            <p className="realms-dashboard__welcome">
              Welcome, <strong>{session.username}</strong>
            </p>
          </div>
        </header>

        <section className="realm-control" aria-labelledby="realm-control-heading">
          <div className="realms-dashboard__section-heading">
            <p>ADVENTURING CONTEXT</p>
            <h3 id="realm-control-heading">Your Realm</h3>
          </div>

          <div className="realm-control__rows">
            <div className="realm-control__row">
              <label htmlFor="realm-campaign-select">Campaign</label>
              <select
                id="realm-campaign-select"
                value={selectedCampaignId}
                disabled={campaignsLoading}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
              >
                <option value="">
                  {campaignsLoading
                    ? "Reading Campaigns…"
                    : campaigns.length === 0
                      ? "No Campaign Memberships"
                      : "No Campaign Selected"}
                </option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </div>

            <div className="realm-control__row">
              <label htmlFor="realm-character-select">Character</label>
              <select
                id="realm-character-select"
                value={selectedCharacterId}
                disabled={!selectedCampaignId || charactersLoading}
                onChange={(event) => setSelectedCharacterId(event.target.value)}
              >
                <option value="">
                  {!selectedCampaignId
                    ? "Select a Campaign First"
                    : charactersLoading
                      ? "Reading Characters…"
                      : "No Character Selected"}
                </option>
                {selectedCampaignId ? characters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                )) : null}
              </select>
              <button
                className="realm-control__create"
                type="button"
                disabled={!canOpenCharacterCreation(selectedCampaignId, selectedCharacter)}
                onClick={() => onOpenCharacter?.(
                  Number(selectedCampaignId),
                  Number(selectedCharacterId),
                )}
              >
                {selectedCharacter?.creationCompletedAt ? "Character Complete" : "Create Character"}
              </button>
            </div>
          </div>
          {campaignsError || charactersError ? (
            <p className="realm-control__error" role="alert">
              {campaignsError || charactersError}
            </p>
          ) : null}
        </section>

        <section className="realms-actions" aria-labelledby="realms-actions-heading">
          <div className="realms-dashboard__section-heading realms-dashboard__section-heading--actions">
            <p>CHARACTER ACTIONS</p>
            <h3 id="realms-actions-heading">Your Character</h3>
          </div>

          <div className="realms-actions__grid">
            {REALMS_DASHBOARD_ACTIONS.map((action) => (
              <PortalActionCard
                key={action.id}
                action={action}
                variant="realms"
                onSelect={selectAction}
              />
            ))}
          </div>

          <p
            className={`realms-dashboard__notice${notice ? " is-visible" : ""}`}
            role="status"
            aria-live="polite"
          >
            {notice || "Choose where your story continues."}
          </p>
        </section>

        <footer className="realms-dashboard__footer">
          {onReturn && (
            <button
              className="realms-dashboard__return"
              type="button"
              onClick={onReturn}
            >
              Return to Paths
            </button>
          )}
          <button
            className="realms-dashboard__logout"
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
