import type { AuthSession } from "../types/user";
import { ItemCatalogPage, type ItemCatalogSection } from "./ItemCatalogPage";

type Props = { session: AuthSession; onBack: () => void; onLogout: () => void };
const SECTIONS: readonly ItemCatalogSection[] = [
  { id: "weapons", label: "Weapons" },
  { id: "armor", label: "Armor" },
  { id: "general-equipment", label: "General Equipment" },
];

export function EquipmentPage(props: Props) {
  return <ItemCatalogPage {...props} title="Equipment" eyebrow="THE HEAVENS / EQUIPMENT" sections={SECTIONS} />;
}
