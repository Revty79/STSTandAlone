import type { CampaignCharacterReference } from "../types/campaign";

type CampaignCharacterPanelProps = {
  campaignName: string | undefined;
  playerName: string | undefined;
  characters: readonly CampaignCharacterReference[];
  loading: boolean;
  saving: boolean;
  error: string;
  successMessage: string;
  onCreate: () => Promise<void>;
  onClose: () => void;
};

export function CampaignCharacterPanel({
  campaignName,
  playerName,
  characters,
  loading,
  saving,
  error,
  successMessage,
  onCreate,
  onClose,
}: CampaignCharacterPanelProps) {
  return (
    <section
      className="campaign-character-panel"
      id="campaign-character-panel"
      aria-labelledby="campaign-character-panel-heading"
    >
      <header className="campaign-information__header">
        <div>
          <p>NEW CHARACTER</p>
          <h4 id="campaign-character-panel-heading">
            {campaignName && playerName
              ? `Characters for ${playerName} in ${campaignName}`
              : "Choose a Campaign Player"}
          </h4>
        </div>
        <button
          className="campaign-information__close"
          type="button"
          onClick={onClose}
          aria-label="Close New Character"
        >
          Close
        </button>
      </header>

      {!campaignName || !playerName ? (
        <p className="campaign-information__message">
          Select a Campaign and one of its Players before creating a Character.
        </p>
      ) : (
        <>
          <div className="campaign-character-panel__create">
            <div>
              <strong>Create Another Character</strong>
              <span>It will be saved as New Character until its Character Sheet is completed.</span>
            </div>
            <button type="button" disabled={saving} onClick={() => onCreate()}>
              {saving ? "Creating…" : "Add New Character"}
            </button>
          </div>
          <p className="campaign-character-panel__scope">
            The future Character Sheet Name field will update this same linked record here and on the sheet.
          </p>

          {error ? (
            <p className="campaign-information__message campaign-information__message--error" role="alert">
              {error}
            </p>
          ) : null}
          {successMessage ? (
            <p className="campaign-player-panel__success" role="status">{successMessage}</p>
          ) : null}

          <div className="campaign-character-panel__existing">
            <h5>Characters Linked to {playerName}</h5>
            {loading ? (
              <p>Reading Characters…</p>
            ) : characters.length === 0 ? (
              <p>No Characters have been created for this Player yet.</p>
            ) : (
              <ul>{characters.map((character) => (
                <li key={character.id}>{character.name}</li>
              ))}</ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
