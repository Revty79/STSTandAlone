import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import {
  PortalActionCard,
  type PortalActionDefinition,
} from "../components/PortalActionCard";
import type { AuthSession } from "../types/user";
import { REALMS_DASHBOARD_ACTIONS } from "./realmsDashboardActions";
import "../styles/realms-dashboard.css";

type RealmsDashboardPageProps = {
  session: AuthSession;
  onReturn?: () => void;
  onLogout: () => void;
};

export function RealmsDashboardPage({
  session,
  onReturn,
  onLogout,
}: RealmsDashboardPageProps) {
  const [notice, setNotice] = useState("");

  function showComingSoon(label: string) {
    setNotice(`${label} is coming soon.`);
  }

  function selectAction(action: PortalActionDefinition) {
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
              <select id="realm-campaign-select" defaultValue="">
                <option value="">No Campaign Selected</option>
              </select>
            </div>

            <div className="realm-control__row">
              <label htmlFor="realm-character-select">Character</label>
              <select id="realm-character-select" defaultValue="">
                <option value="">No Character Selected</option>
              </select>
              <button
                className="realm-control__create"
                type="button"
                onClick={() => showComingSoon("Create Character")}
              >
                Create Character
              </button>
            </div>
          </div>
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
