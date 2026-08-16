import { DestinationPlaceholder } from "../components/DestinationPlaceholder";
import type { AuthSession } from "../types/user";

type HeavensPlaceholderPageProps = {
  session: AuthSession;
  onReturn: () => void;
  onLogout: () => void;
};

export function HeavensPlaceholderPage({
  session,
  onReturn,
  onLogout,
}: HeavensPlaceholderPageProps) {
  return (
    <DestinationPlaceholder
      accessLabel="G.O.D. ACCESS"
      title="The Heavens"
      session={session}
      onReturn={onReturn}
      onLogout={onLogout}
    />
  );
}
