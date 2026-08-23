import type { CampaignProfileReference } from "../types/campaign";

type CampaignPlayerPanelProps = {
  campaignName: string | undefined;
  profiles: readonly CampaignProfileReference[];
  loading: boolean;
  error: string;
  addingProfileId: number | null;
  successMessage: string;
  onAdd: (profileId: number) => void | Promise<void>;
  onClose: () => void;
};

function profileRoleLabel(profile: CampaignProfileReference): string {
  if (profile.roles.length === 0) return "Local Profile";
  return profile.roles
    .map((role) => role === "god" ? "G.O.D." : "Player")
    .join(" / ");
}

export function CampaignPlayerPanel({
  campaignName,
  profiles,
  loading,
  error,
  addingProfileId,
  successMessage,
  onAdd,
  onClose,
}: CampaignPlayerPanelProps) {
  return (
    <section
      className="campaign-player-panel"
      id="campaign-player-panel"
      aria-labelledby="campaign-player-panel-heading"
    >
      <header className="campaign-information__header">
        <div>
          <p>ADD PLAYER</p>
          <h4 id="campaign-player-panel-heading">
            {campaignName ? `Profiles for ${campaignName}` : "No Campaign Selected"}
          </h4>
        </div>
        <button
          className="campaign-information__close"
          type="button"
          onClick={onClose}
          aria-label="Close Add Player profiles"
        >
          Close
        </button>
      </header>

      {!campaignName ? (
        <p className="campaign-information__message">
          Select a Campaign before adding a Player.
        </p>
      ) : loading ? (
        <p className="campaign-information__message">Reading local profiles…</p>
      ) : error ? (
        <p className="campaign-information__message campaign-information__message--error" role="alert">
          {error}
        </p>
      ) : profiles.length === 0 ? (
        <p className="campaign-information__message">No local profiles are available.</p>
      ) : (
        <div className="campaign-player-panel__profiles">
          {profiles.map((profile) => {
            const adding = addingProfileId === profile.id;
            return (
              <article className="campaign-player-panel__profile" key={profile.id}>
                <div>
                  <strong>{profile.username}</strong>
                  <span>{profileRoleLabel(profile)}</span>
                </div>
                <button
                  type="button"
                  disabled={profile.isCampaignPlayer || adding || addingProfileId !== null}
                  onClick={() => onAdd(profile.id)}
                >
                  {profile.isCampaignPlayer ? "Added" : adding ? "Adding…" : "Add"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {successMessage ? (
        <p className="campaign-player-panel__success" role="status">{successMessage}</p>
      ) : null}
    </section>
  );
}
