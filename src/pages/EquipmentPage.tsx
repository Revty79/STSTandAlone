import type { AuthSession } from "../types/user";
import { ItemCatalogPage } from "./ItemCatalogPage";

export function EquipmentPage(props: { session: AuthSession; onBack: () => void; onLogout: () => void }) {
  return <ItemCatalogPage {...props} mode="equipment" />;
}
