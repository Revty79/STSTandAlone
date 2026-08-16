import { AtmosphericPage } from "./AtmosphericPage";
import { formatRoleAccess } from "../services/authorization";
import type { AuthSession } from "../types/user";
import "../styles/authenticated-pages.css";

type DestinationPlaceholderProps = {
  session: AuthSession;
  accessLabel: string;
  title: string;
  onReturn?: () => void;
  onLogout: () => void;
};

export function DestinationPlaceholder({
  session,
  accessLabel,
  title,
  onReturn,
  onLogout,
}: DestinationPlaceholderProps) {
  return (
    <AtmosphericPage className="destination-page">
      <section
        className="authenticated-page__panel destination-page__panel"
        aria-labelledby="destination-heading"
      >
        <p className="authenticated-page__access">{accessLabel}</p>
        <h2 id="destination-heading">{title}</h2>
        <p className="destination-page__welcome">Welcome, {session.username}</p>
        <p className="destination-page__roles">{formatRoleAccess(session)}</p>

        <div className="destination-page__actions">
          {onReturn && (
            <button
              className="destination-page__return-action"
              type="button"
              onClick={onReturn}
            >
              Return to Paths
            </button>
          )}
          <button
            className="authenticated-page__text-action"
            type="button"
            onClick={onLogout}
          >
            Log Out
          </button>
        </div>
      </section>
    </AtmosphericPage>
  );
}
