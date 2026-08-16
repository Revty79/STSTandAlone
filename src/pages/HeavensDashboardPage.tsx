import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CampaignInformationPanel } from "../components/CampaignInformationPanel";
import {
  PortalActionCard,
  type PortalActionDefinition,
} from "../components/PortalActionCard";
import type { AuthSession } from "../types/user";
import { HEAVENS_DASHBOARD_TOOLS } from "./heavensDashboardTools";
import "../styles/heavens-dashboard.css";

type HeavensDashboardPageProps = {
  session: AuthSession;
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
  onReturn,
  onLogout,
}: HeavensDashboardPageProps) {
  const [notice, setNotice] = useState("");
  const [isCampaignInformationOpen, setIsCampaignInformationOpen] =
    useState(false);

  function showComingSoon(label: string) {
    setNotice(`${label} is coming soon.`);
  }

  function selectTool(tool: PortalActionDefinition) {
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
              <select id="campaign-select" defaultValue="">
                <option value="">{CONTROL_PLACEHOLDERS.campaign}</option>
              </select>
              <div className="campaign-control__actions">
                <button
                  type="button"
                  aria-expanded={isCampaignInformationOpen}
                  aria-controls="campaign-information"
                  onClick={() => setIsCampaignInformationOpen(true)}
                >
                  View Campaign
                </button>
                <button
                  type="button"
                  onClick={() => showComingSoon("Create Campaign")}
                >
                  Create Campaign
                </button>
              </div>
            </div>

            <div className="campaign-control__row">
              <label htmlFor="player-select">Player</label>
              <select id="player-select" defaultValue="">
                <option value="">{CONTROL_PLACEHOLDERS.player}</option>
              </select>
              <div className="campaign-control__actions">
                <button
                  type="button"
                  onClick={() => showComingSoon("Add Player")}
                >
                  Add Player
                </button>
              </div>
            </div>

            <div className="campaign-control__row">
              <label htmlFor="character-select">Character</label>
              <select id="character-select" defaultValue="">
                <option value="">{CONTROL_PLACEHOLDERS.character}</option>
              </select>
              <div className="campaign-control__actions campaign-control__actions--character">
                <button
                  type="button"
                  onClick={() => showComingSoon("New Character")}
                >
                  New Character
                </button>
                <button
                  type="button"
                  onClick={() => showComingSoon("Edit Character")}
                >
                  Edit Character
                </button>
              </div>
            </div>
          </div>

          {isCampaignInformationOpen && (
            <CampaignInformationPanel
              onClose={() => setIsCampaignInformationOpen(false)}
            />
          )}
        </section>

        <section
          className="heavens-tools"
          aria-labelledby="heavens-tools-heading"
        >
          <div className="heavens-dashboard__section-heading heavens-dashboard__section-heading--tools">
            <p>CREATION LIBRARIES</p>
            <h3 id="heavens-tools-heading">Create & Manage Serrian Tide</h3>
          </div>

          <div className="heavens-tools__grid">
            {HEAVENS_DASHBOARD_TOOLS.map((tool) => (
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
