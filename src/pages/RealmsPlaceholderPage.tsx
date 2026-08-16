import { DestinationPlaceholder } from "../components/DestinationPlaceholder";
import type { AuthSession } from "../types/user";

type RealmsPlaceholderPageProps = {
  session: AuthSession;
  onReturn?: () => void;
  onLogout: () => void;
};

export function RealmsPlaceholderPage({
  session,
  onReturn,
  onLogout,
}: RealmsPlaceholderPageProps) {
  return (
    <DestinationPlaceholder
      accessLabel="PLAYER ACCESS"
      title="Realms Dashboard"
      session={session}
      onReturn={onReturn}
      onLogout={onLogout}
    />
  );
}
