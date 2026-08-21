import type { AuthSession } from "../types/user";
import { ItemCatalogPage, type ItemCatalogSection } from "./ItemCatalogPage";

type Props = { session: AuthSession; onBack: () => void; onLogout: () => void };
const SECTIONS: readonly ItemCatalogSection[] = [
  { id: "inventory", label: "Inventory Catalog" },
];

export function InventoryPage(props: Props) {
  return <ItemCatalogPage {...props} title="Inventory" eyebrow="THE HEAVENS / INVENTORY" sections={SECTIONS} />;
}
