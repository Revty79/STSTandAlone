export const ITEM_COST_NOT_APPLICABLE = new Set(["Currency"]);
export const ITEM_WEIGHT_NOT_APPLICABLE = new Set(["Animal", "Mount", "Currency", "Service"]);
export const ITEM_EFFECT_REQUIRED = new Set(["Artifact", "Consumable", "Service", "Technology / Device", "Trap"]);

export type CanonicalItemForCompleteness = {
  key: string;
  item: {
    name: string;
    catalogSection: string;
    timelineTag: string;
    costCredits: number | null;
    category: string;
    subtype: string;
    weight: number | null;
    effectDescription: string;
  };
  genreTags: string[];
  weaponProfile: null | Record<string, unknown>;
  armorProfile: null | Record<string, unknown>;
};

const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export function requiredItemFieldsMissing(record: CanonicalItemForCompleteness): string[] {
  const missing: string[] = [];
  for (const field of ["name", "catalogSection", "timelineTag", "category", "subtype"] as const) {
    if (!present(record.item[field])) missing.push(field);
  }
  if (!record.genreTags.some(present)) missing.push("genreTags");
  if (!ITEM_COST_NOT_APPLICABLE.has(record.item.category) && !finite(record.item.costCredits)) missing.push("costCredits");
  if (!ITEM_WEIGHT_NOT_APPLICABLE.has(record.item.category) && !finite(record.item.weight)) missing.push("weight");
  if (ITEM_EFFECT_REQUIRED.has(record.item.category) && !present(record.item.effectDescription)) missing.push("effectDescription");
  if (record.item.category === "Weapon" && !record.weaponProfile) missing.push("weaponProfile");
  if (record.item.category === "Armor" && !record.armorProfile) missing.push("armorProfile");
  if (record.weaponProfile) {
    for (const field of ["weaponRole", "weaponCategory", "handedness", "damageType", "rangeType", "rangeText"] as const) {
      if (!present(record.weaponProfile[field])) missing.push(`weaponProfile.${field}`);
    }
    if (!finite(record.weaponProfile.damage)) missing.push("weaponProfile.damage");
  }
  if (record.armorProfile) {
    for (const field of ["areaCovered", "armorCategory", "armorType"] as const) {
      if (!present(record.armorProfile[field])) missing.push(`armorProfile.${field}`);
    }
    if (!finite(record.armorProfile.soak)) missing.push("armorProfile.soak");
    if (!finite(record.armorProfile.encumbrancePenalty)) missing.push("armorProfile.encumbrancePenalty");
  }
  return missing;
}

export function validateCanonicalItemCompleteness(records: CanonicalItemForCompleteness[]) {
  return records.flatMap((record) => {
    const missingFields = requiredItemFieldsMissing(record);
    return missingFields.length ? [{ itemKey: record.key, name: record.item.name, missingFields }] : [];
  });
}
