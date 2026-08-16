import { AtmosphericPage } from "../components/AtmosphericPage";
import { formatRoleAccess } from "../services/authorization";
import type { AuthSession } from "../types/user";
import "../styles/authenticated-pages.css";

type AccessChoicePageProps = {
  session: AuthSession;
  onEnterHeavens: () => void;
  onEnterRealms: () => void;
  onLogout: () => void;
};

export function AccessChoicePage({
  session,
  onEnterHeavens,
  onEnterRealms,
  onLogout,
}: AccessChoicePageProps) {
  return (
    <AtmosphericPage className="access-choice-page">
      <section
        className="authenticated-page__panel access-choice-page__panel"
        aria-labelledby="access-choice-heading"
      >
        <header className="authenticated-page__header">
          <p className="authenticated-page__access">
            {formatRoleAccess(session)}
          </p>
          <h2 id="access-choice-heading">Welcome, {session.username}</h2>
          <p>Choose the path you wish to enter.</p>
        </header>

        <div className="access-choice-page__choices">
          <button type="button" onClick={onEnterHeavens}>
            <span className="access-choice-page__choice-title">
              Enter The Heavens
            </span>
            <span className="access-choice-page__choice-note">G.O.D. ACCESS</span>
          </button>
          <button type="button" onClick={onEnterRealms}>
            <span className="access-choice-page__choice-title">
              Enter The Realms
            </span>
            <span className="access-choice-page__choice-note">PLAYER ACCESS</span>
          </button>
        </div>

        <button
          className="authenticated-page__text-action"
          type="button"
          onClick={onLogout}
        >
          Log Out
        </button>
      </section>
    </AtmosphericPage>
  );
}
