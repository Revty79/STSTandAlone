import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const dataDirectory = path.join(projectDirectory, "data");
const migrationDirectory = path.join(projectDirectory, "src-tauri", "migrations");
const sourcePath = path.join(dataDirectory, "serrian-tide-catalog-source-snapshot.json");
const decisionsPath = path.join(dataDirectory, "serrian-tide-catalog-import-decisions.json");
const manifestPath = path.join(dataDirectory, "serrian-tide-catalog-source-manifest.json");
const itemCatalogPath = path.join(dataDirectory, "serrian-tide-item-catalog.json");
const creatureCatalogPath = path.join(dataDirectory, "serrian-tide-creature-catalog.json");
const linksPath = path.join(dataDirectory, "serrian-tide-item-creature-links.json");
const reportPath = path.join(dataDirectory, "serrian-tide-catalog-import-report.json");
const creatureSeedMigrationPath = path.join(migrationDirectory, "0009_seed_creature_shells.sql");
const itemSeedMigrationPath = path.join(migrationDirectory, "0010_seed_item_catalog.sql");

const expectedHeaders = {
  Items: [
    "Item Name", "Timeline Tag", "Cost (Credits)", "Category", "Subtype",
    "Genre Tags", "Mechanical Effect Description", "Weight", "Narrative/Variant Notes",
  ],
  Weapons: [
    "Weapon Name", "Timeline Tag", "Cost (Credits)", "Category", "Handedness",
    "Type", "Range Type", "Range", "Genre Tags", "Weight", "Damage", "Effect",
    "Narrative/Variant Notes",
  ],
  Armor: [
    "Armor Name", "Timeline Tag", "Cost (Credits)", "Area Covered", "Soak",
    "Category", "Type", "Genre Tags", "Weight", "Encomberence Penalty", "Effect",
    "Narrative/Variant Notes",
  ],
};

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function slug(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nullableNumber(value, context, errors) {
  const source = text(value);
  if (!source) return null;
  const parsed = Number(source.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) {
    errors.push({ ...context, sourceValue: source, reason: "Expected a finite number or an empty unknown value." });
    return null;
  }
  return parsed;
}

function splitGenres(value) {
  const seen = new Set();
  return text(value).split(",").map((entry) => entry.trim()).filter((entry) => {
    const key = normalized(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addGenre(record, genre) {
  const clean = text(genre);
  if (!clean) return;
  if (!record.genreTags.some((entry) => normalized(entry) === normalized(clean))) {
    record.genreTags.push(clean);
  }
}

function addProvenance(record, sourceReference) {
  if (!record.provenance.some((entry) => entry.sourceEntryId === sourceReference.sourceEntryId)) {
    record.provenance.push(sourceReference);
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlRows(rows, fields) {
  if (!rows.length) return "";
  return rows.map((row) => `  (${fields.map((field) => sqlValue(row[field])).join(", ")})`).join(",\n");
}

function claimKey(preferred, qualifier, usedKeys) {
  const base = slug(preferred);
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  const qualified = `${base}--${slug(qualifier)}`;
  if (!usedKeys.has(qualified)) {
    usedKeys.add(qualified);
    return qualified;
  }
  let index = 2;
  while (usedKeys.has(`${qualified}--variant-${index}`)) index += 1;
  const key = `${qualified}--variant-${index}`;
  usedKeys.add(key);
  return key;
}

function sourceEntryId(sourceKey, location, entryNumber) {
  return `${sourceKey}:${location}:${entryNumber}`;
}

function buildStructuredRows(tabs, decisions) {
  const rowsByTab = {};
  for (const [tab, expectedCount] of Object.entries(decisions.structuredSheet.expectedCounts)) {
    const values = tabs[tab];
    if (!Array.isArray(values)) throw new Error(`The ${tab} source tab is missing.`);
    const actualHeader = values[0] ?? [];
    if (actualHeader.slice(0, expectedHeaders[tab].length).join("\u001f") !== expectedHeaders[tab].join("\u001f")) {
      throw new Error(`Unexpected ${tab} headers: ${actualHeader.join(", ")}`);
    }
    if (values.length - 1 !== expectedCount) {
      throw new Error(`Expected ${expectedCount} ${tab} rows; found ${values.length - 1}.`);
    }
    rowsByTab[tab] = values.slice(1).map((sourceValues, index) => ({
      tab,
      rowNumber: index + 2,
      values: [...sourceValues],
      name: text(sourceValues[0]),
      sourceEntryId: sourceEntryId("structured-sheet", tab, index + 2),
    }));
    if (rowsByTab[tab].some((row) => !row.name)) {
      throw new Error(`${tab} contains a source row without a name.`);
    }
  }
  return rowsByTab;
}

function structuredSourceReference(row) {
  if (row.tab === "Items") {
    return {
      sourceEntryId: row.sourceEntryId,
      sourceKey: "structured-sheet",
      sourceTitle: "inventories for the program",
      tab: row.tab,
      rowNumber: row.rowNumber,
      sourceCategory: text(row.values[3]),
      sourceSubtype: text(row.values[4]),
    };
  }
  return {
    sourceEntryId: row.sourceEntryId,
    sourceKey: "structured-sheet",
    sourceTitle: "inventories for the program",
    tab: row.tab,
    rowNumber: row.rowNumber,
    sourceCategory: text(row.values[row.tab === "Weapons" ? 3 : 5]),
    sourceSubtype: text(row.values[row.tab === "Weapons" ? 5 : 6]),
  };
}

function correctedArmorValues(row, decisions, report) {
  if (!decisions.structuredSheet.armorRowCorrections.some((name) => normalized(name) === normalized(row.name))) {
    return row.values;
  }
  if (row.values.length !== 11) {
    throw new Error(`${row.name} was configured for the missing Armor Type correction but has ${row.values.length} cells.`);
  }
  const corrected = [...row.values.slice(0, 6), "", ...row.values.slice(6)];
  report.reconciliation.normalizedEntries.push({
    sourceEntryId: row.sourceEntryId,
    name: row.name,
    action: "inserted-empty-armor-type",
    reason: "The source omits Armor Type and shifts the remaining cells left; the historical source was not changed.",
  });
  return corrected;
}

function structuredCanonicalCategory(row) {
  if (row.tab === "Weapons") return "Weapon";
  if (row.tab === "Armor") return "Armor";
  const category = text(row.values[3]);
  const subtype = text(row.values[4]);
  if (category === "Consumable") return "Consumable";
  if (category === "Service") return "Service";
  if (subtype === "Mount") return "Mount";
  if (subtype === "Animal" || subtype === "Pet") return "Animal";
  if (["Clothing", "Vehicle", "Transport", "Furniture", "Appliance", "Jewelry", "Document", "Knowledge", "Housing", "Land"].includes(subtype)) {
    return subtype === "Transport" ? "Vehicle" : subtype === "Appliance" ? "Furniture" : subtype === "Knowledge" ? "Document" : subtype;
  }
  if (category === "Artifact") return subtype === "Jewelry" ? "Jewelry" : subtype === "Document" ? "Document" : "Artifact";
  return "Tool";
}

function structuredCatalogSection(row, decisions, report) {
  if (row.tab === "Weapons" || row.tab === "Armor") return "Equipment";
  const category = text(row.values[3]);
  const subtype = text(row.values[4]);
  if (category === "Artifact") {
    if (decisions.structuredSheet.equipmentArtifactSubtypes.includes(subtype)) return "Equipment";
    if (decisions.structuredSheet.inventoryArtifactSubtypes.includes(subtype)) return "Inventory";
    report.reconciliation.conflicts.push({
      sourceEntryId: row.sourceEntryId,
      name: row.name,
      field: "catalogSection",
      resolution: "Inventory",
      reason: `The structured Artifact subtype ${subtype || "(blank)"} was not listed by policy; Inventory is used because the record is primarily a possession.`,
    });
    return "Inventory";
  }
  if (category === "Tool" && decisions.structuredSheet.inventoryToolSubtypes.includes(subtype)) return "Inventory";
  return decisions.structuredSheet.itemCatalogSectionByCategory[category] ?? "Equipment";
}

function createWeaponProfile(row, itemKey, decisions, errors) {
  const values = row.values;
  return {
    sourceSystem: decisions.sourceSystem,
    sourceExternalId: `weapon-profile:${itemKey}`,
    weaponRole: decisions.structuredSheet.weaponRolePolicy.improvisedNames.some((name) => normalized(name) === normalized(row.name)) ? "Improvised" : decisions.structuredSheet.weaponRolePolicy.defaultRole,
    weaponCategory: text(values[3]),
    handedness: text(values[4]),
    damageType: text(values[5]),
    rangeType: text(values[6]),
    rangeText: text(values[7]),
    damage: nullableNumber(values[10], { sourceEntryId: row.sourceEntryId, field: "damage" }, errors),
    weaponEffectDescription: text(values[11]),
    weaponNarrativeNotes: text(values[12]),
  };
}

function createArmorProfile(row, itemKey, decisions, report, errors) {
  const values = correctedArmorValues(row, decisions, report);
  return {
    sourceSystem: decisions.sourceSystem,
    sourceExternalId: `armor-profile:${itemKey}`,
    areaCovered: text(values[3]),
    soak: nullableNumber(values[4], { sourceEntryId: row.sourceEntryId, field: "soak" }, errors),
    armorCategory: text(values[5]),
    armorType: text(values[6]),
    encumbrancePenalty: nullableNumber(values[9], { sourceEntryId: row.sourceEntryId, field: "encumbrancePenalty" }, errors),
    armorEffectDescription: text(values[10]),
    armorNarrativeNotes: text(values[11]),
  };
}

function commonStructuredValues(row, report, decisions, errors) {
  if (row.tab === "Items") {
    return {
      timelineTag: text(row.values[1]),
      costCredits: nullableNumber(row.values[2], { sourceEntryId: row.sourceEntryId, field: "costCredits" }, errors),
      weight: nullableNumber(row.values[7], { sourceEntryId: row.sourceEntryId, field: "weight" }, errors),
      effectDescription: text(row.values[6]),
      narrativeVariantNotes: text(row.values[8]),
      genreTags: splitGenres(row.values[5]),
      category: text(row.values[3]),
      subtype: text(row.values[4]),
    };
  }
  if (row.tab === "Weapons") {
    return {
      timelineTag: text(row.values[1]),
      costCredits: nullableNumber(row.values[2], { sourceEntryId: row.sourceEntryId, field: "costCredits" }, errors),
      weight: nullableNumber(row.values[9], { sourceEntryId: row.sourceEntryId, field: "weight" }, errors),
      effectDescription: text(row.values[11]),
      narrativeVariantNotes: text(row.values[12]),
      genreTags: splitGenres(row.values[8]),
      category: "Weapon",
      subtype: text(row.values[3]),
    };
  }
  const values = correctedArmorValues(row, decisions, report);
  return {
    timelineTag: text(values[1]),
    costCredits: nullableNumber(values[2], { sourceEntryId: row.sourceEntryId, field: "costCredits" }, errors),
    weight: nullableNumber(values[8], { sourceEntryId: row.sourceEntryId, field: "weight" }, errors),
    effectDescription: text(values[10]),
    narrativeVariantNotes: text(values[11]),
    genreTags: splitGenres(values[7]),
    category: "Armor",
    subtype: text(values[5]),
  };
}

function createBaseRecord(row, report, decisions, errors) {
  const common = commonStructuredValues(row, report, decisions, errors);
  return {
    key: "",
    name: row.name,
    catalogSection: structuredCatalogSection(row, decisions, report),
    timelineTag: common.timelineTag,
    costCredits: common.costCredits,
    category: common.category,
    subtype: common.subtype,
    weight: common.weight,
    effectDescription: common.effectDescription,
    narrativeVariantNotes: common.narrativeVariantNotes,
    genreTags: common.genreTags,
    weaponProfile: null,
    armorProfile: null,
    sourceSystem: decisions.sourceSystem,
    sourceExternalId: "",
    provenance: [structuredSourceReference(row)],
    canonicalCategory: structuredCanonicalCategory(row),
    originKind: "structured-sheet",
  };
}

function parseTypeDocument(source) {
  const entries = [];
  let category = "";
  for (const paragraph of source.paragraphs) {
    const value = text(paragraph.text);
    if (!value) continue;
    if (paragraph.namedStyleType === "HEADING_3") {
      category = value;
      continue;
    }
    entries.push({
      name: value,
      category,
      paragraphNumber: paragraph.paragraphNumber,
      sourceEntryId: sourceEntryId("type-document", category || "unscoped", paragraph.paragraphNumber),
    });
  }
  return entries;
}

function parseGenreDocument(source) {
  const entries = [];
  let genre = "";
  let category = "";
  for (const paragraph of source.paragraphs) {
    const value = text(paragraph.text);
    if (!value) continue;
    if (paragraph.namedStyleType === "HEADING_3") {
      genre = value;
      category = "";
      continue;
    }
    if (paragraph.namedStyleType === "HEADING_4") {
      category = value;
      continue;
    }
    const ammunitionSection = genre === "Ammo by Genre";
    entries.push({
      name: value,
      genre: ammunitionSection ? category : genre,
      category: ammunitionSection ? "Ammunition" : category,
      originalGenreHeading: genre,
      originalCategoryHeading: category,
      paragraphNumber: paragraph.paragraphNumber,
      sourceEntryId: sourceEntryId("genre-document", `${genre}/${category}`, paragraph.paragraphNumber),
    });
  }
  return entries;
}

function categoryDecision(rawCategory, decisions) {
  const exact = decisions.documents.categoryAliases[rawCategory];
  if (exact) return { canonicalCategory: exact, unresolved: false };
  const pattern = decisions.documents.unresolvedCategoryPatterns.find((entry) => rawCategory.includes(entry));
  if (pattern) return { canonicalCategory: pattern, unresolved: true };
  return { canonicalCategory: rawCategory, unresolved: true };
}

const CLEAR_VEHICLE_NAME = /\b(?:aircraft|airship|atv|automobile|bicycle|bike|boat|buggy|bus|canoe|car|carriage|cart|chariot|coach|cycle|helicopter|hovercraft|jeep|jet|locomotive|motorcycle|plane|pod|raft|railcar|rover|ship|shuttle|skiff|sled|sleigh|speeder|stagecoach|submarine|taxi|train|tram|transport|truck|van|vehicle|wagon|zeppelin)\b/i;
const CLEAR_LIVING_MOUNT_NAME = /\b(?:camel|cat|cattle|dog|donkey|elephant|elk|goat|horse|mule|ox|pony|reindeer|wolf|yak)\b/i;

function refineDocumentCategory(entry, decision, report) {
  if (
    decision.canonicalCategory === "Mount" &&
    CLEAR_VEHICLE_NAME.test(entry.name) &&
    !CLEAR_LIVING_MOUNT_NAME.test(entry.name)
  ) {
    report.reconciliation.normalizedEntries.push({
      sourceEntryId: entry.sourceEntryId,
      name: entry.name,
      action: "classified-transport-list-entry-as-vehicle",
      reason: "The broad Mounts source section contains an explicitly named non-living vehicle; catalog placement remains Inventory.",
    });
    return { canonicalCategory: "Vehicle", unresolved: false };
  }
  return decision;
}

function compatibleCategories(record, sourceCategory, itemName, safeCreatureNames) {
  const recordCategory = record.canonicalCategory;
  if (recordCategory === sourceCategory) return true;
  if (sourceCategory === "Weapon" && record.weaponProfile) return true;
  if (sourceCategory === "Armor" && record.armorProfile) return true;
  const equipmentFamily = new Set(["Tool", "General Equipment", "Container", "Technology / Device", "Trap"]);
  if (equipmentFamily.has(recordCategory) && equipmentFamily.has(sourceCategory)) return true;
  if (safeCreatureNames.has(normalized(itemName))) {
    return new Set([recordCategory, sourceCategory]).size <= 2 && [recordCategory, sourceCategory].every((entry) => entry === "Animal" || entry === "Mount");
  }
  return false;
}

function findMergeCandidates(records, entry, canonicalCategory, decisions, safeCreatureNames, originKinds) {
  if (decisions.documents.neverBlindMergeNames.some((name) => normalized(name) === normalized(entry.name))) return [];
  return records.filter((record) =>
    originKinds.includes(record.originKind) &&
    normalized(record.name) === normalized(entry.name) &&
    compatibleCategories(record, canonicalCategory, entry.name, safeCreatureNames),
  );
}

function documentSourceReference(sourceKey, sourceTitle, entry) {
  return {
    sourceEntryId: entry.sourceEntryId,
    sourceKey,
    sourceTitle,
    paragraphNumber: entry.paragraphNumber,
    sourceGenre: text(entry.genre),
    sourceCategory: text(entry.category),
  };
}

function createDocumentRecord(entry, canonicalCategory, catalogSection, sourceKey, sourceTitle, genre, originKind) {
  return {
    key: "",
    name: entry.name,
    catalogSection,
    timelineTag: "",
    costCredits: null,
    category: canonicalCategory,
    subtype: "",
    weight: null,
    effectDescription: "",
    narrativeVariantNotes: "",
    genreTags: genre ? [genre] : [],
    weaponProfile: null,
    armorProfile: null,
    sourceSystem: "serrian-tide-canonical-catalog",
    sourceExternalId: "",
    provenance: [documentSourceReference(sourceKey, sourceTitle, entry)],
    canonicalCategory,
    originKind,
  };
}

function serializeCreatureSeed(creatures, sourceHash, decisionsHash) {
  const coreRows = creatures.records.map((record, ordinal) => ({ ordinal, ...record.creature }));
  const genreRows = creatures.records.flatMap((record, creatureOrdinal) => record.genreTags.map((genreTag, sortOrder) => ({
    ordinal: creatureOrdinal * 100 + sortOrder,
    creatureExternalId: record.creature.sourceExternalId,
    genreTag,
    sortOrder,
  })));
  const useRows = creatures.records.flatMap((record, creatureOrdinal) => record.uses.map((useType, sortOrder) => ({
    ordinal: creatureOrdinal * 100 + sortOrder,
    creatureExternalId: record.creature.sourceExternalId,
    useType,
    sortOrder,
  })));
  return `-- Generated by scripts/generate-catalog-seed.mjs.\n-- Source snapshot SHA-256: ${sourceHash}\n-- Import decisions SHA-256: ${decisionsHash}\n\nPRAGMA foreign_keys = ON;\n\nCREATE TEMP TABLE _serrian_tide_creature_seed (\n  ordinal INTEGER PRIMARY KEY, source_external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,\n  challenge_rating REAL, encounter_scale TEXT NOT NULL, type TEXT NOT NULL, role TEXT NOT NULL,\n  size TEXT NOT NULL, description_short TEXT NOT NULL, hp_total REAL, initiative REAL, armor_soak REAL,\n  magic_resonance_interaction TEXT NOT NULL, behavior_tactics TEXT NOT NULL, habitat TEXT NOT NULL,\n  diet TEXT NOT NULL, loot_harvest TEXT NOT NULL, story_hooks TEXT NOT NULL, notes TEXT NOT NULL\n);\nINSERT INTO _serrian_tide_creature_seed VALUES\n${sqlRows(coreRows, ["ordinal", "sourceExternalId", "name", "challengeRating", "encounterScale", "type", "role", "size", "descriptionShort", "hpTotal", "initiative", "armorSoak", "magicResonanceInteraction", "behaviorTactics", "habitat", "diet", "lootHarvest", "storyHooks", "notes"])};\nINSERT OR IGNORE INTO creatures (\n  name, challenge_rating, encounter_scale, type, role, size, description_short, hp_total, initiative,\n  armor_soak, magic_resonance_interaction, behavior_tactics, habitat, diet, loot_harvest, story_hooks,\n  notes, created_by_user_id, source_system, source_external_id\n)\nSELECT name, challenge_rating, encounter_scale, type, role, size, description_short, hp_total, initiative,\n  armor_soak, magic_resonance_interaction, behavior_tactics, habitat, diet, loot_harvest, story_hooks,\n  notes, NULL, '${creatures.sourceSystem}', source_external_id\nFROM _serrian_tide_creature_seed ORDER BY ordinal;\n\n${genreRows.length ? `CREATE TEMP TABLE _serrian_tide_creature_genre_seed (ordinal INTEGER PRIMARY KEY, creature_external_id TEXT NOT NULL, genre_tag TEXT NOT NULL, sort_order INTEGER NOT NULL);\nINSERT INTO _serrian_tide_creature_genre_seed VALUES\n${sqlRows(genreRows, ["ordinal", "creatureExternalId", "genreTag", "sortOrder"])};\nINSERT OR IGNORE INTO creature_genre_tags (creature_id, genre_tag, sort_order)\nSELECT creature.id, seed.genre_tag, seed.sort_order FROM _serrian_tide_creature_genre_seed seed\nJOIN creatures creature ON creature.source_system = '${creatures.sourceSystem}' AND creature.source_external_id = seed.creature_external_id\nORDER BY seed.ordinal;\nDROP TABLE _serrian_tide_creature_genre_seed;\n\n` : ""}${useRows.length ? `CREATE TEMP TABLE _serrian_tide_creature_use_seed (ordinal INTEGER PRIMARY KEY, creature_external_id TEXT NOT NULL, use_type TEXT NOT NULL, sort_order INTEGER NOT NULL);\nINSERT INTO _serrian_tide_creature_use_seed VALUES\n${sqlRows(useRows, ["ordinal", "creatureExternalId", "useType", "sortOrder"])};\nINSERT OR IGNORE INTO creature_uses (creature_id, use_type, notes, sort_order)\nSELECT creature.id, seed.use_type, '', seed.sort_order FROM _serrian_tide_creature_use_seed seed\nJOIN creatures creature ON creature.source_system = '${creatures.sourceSystem}' AND creature.source_external_id = seed.creature_external_id\nORDER BY seed.ordinal;\nDROP TABLE _serrian_tide_creature_use_seed;\n\n` : ""}DROP TABLE _serrian_tide_creature_seed;\n`;
}

function serializeItemSeed(catalog, links, sourceHash, decisionsHash) {
  const itemRows = catalog.records.map((record, ordinal) => ({ ordinal, ...record.item }));
  const genreRows = catalog.records.flatMap((record, itemOrdinal) => record.genreTags.map((genreTag, sortOrder) => ({
    ordinal: itemOrdinal * 100 + sortOrder,
    itemExternalId: record.item.sourceExternalId,
    genreTag,
    sortOrder,
  })));
  const weaponRows = catalog.records.filter((record) => record.weaponProfile).map((record, ordinal) => ({
    ordinal,
    itemExternalId: record.item.sourceExternalId,
    ...record.weaponProfile,
  }));
  const armorRows = catalog.records.filter((record) => record.armorProfile).map((record, ordinal) => ({
    ordinal,
    itemExternalId: record.item.sourceExternalId,
    ...record.armorProfile,
  }));
  const linkRows = links.records.map((record, ordinal) => ({ ordinal, ...record }));
  return `-- Generated by scripts/generate-catalog-seed.mjs.\n-- Source snapshot SHA-256: ${sourceHash}\n-- Import decisions SHA-256: ${decisionsHash}\n\nPRAGMA foreign_keys = ON;\n\nCREATE TEMP TABLE _serrian_tide_item_seed (\n  ordinal INTEGER PRIMARY KEY, source_external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,\n  catalog_section TEXT NOT NULL, timeline_tag TEXT NOT NULL, cost_credits REAL, category TEXT NOT NULL,\n  subtype TEXT NOT NULL, weight REAL, effect_description TEXT NOT NULL, narrative_variant_notes TEXT NOT NULL\n);\nINSERT INTO _serrian_tide_item_seed VALUES\n${sqlRows(itemRows, ["ordinal", "sourceExternalId", "name", "catalogSection", "timelineTag", "costCredits", "category", "subtype", "weight", "effectDescription", "narrativeVariantNotes"])};\nINSERT OR IGNORE INTO items (name, catalog_section, timeline_tag, cost_credits, category, subtype, weight, effect_description, narrative_variant_notes, created_by_user_id, source_system, source_external_id)\nSELECT name, catalog_section, timeline_tag, cost_credits, category, subtype, weight, effect_description, narrative_variant_notes, NULL, '${catalog.sourceSystem}', source_external_id\nFROM _serrian_tide_item_seed ORDER BY ordinal;\n\nCREATE TEMP TABLE _serrian_tide_item_genre_seed (ordinal INTEGER PRIMARY KEY, item_external_id TEXT NOT NULL, genre_tag TEXT NOT NULL, sort_order INTEGER NOT NULL);\n${genreRows.length ? `INSERT INTO _serrian_tide_item_genre_seed VALUES\n${sqlRows(genreRows, ["ordinal", "itemExternalId", "genreTag", "sortOrder"])};\n` : ""}INSERT OR IGNORE INTO item_genre_tags (item_id, genre_tag, sort_order)\nSELECT item.id, seed.genre_tag, seed.sort_order FROM _serrian_tide_item_genre_seed seed\nJOIN items item ON item.source_system = '${catalog.sourceSystem}' AND item.source_external_id = seed.item_external_id\nORDER BY seed.ordinal;\n\nCREATE TEMP TABLE _serrian_tide_weapon_seed (\n  ordinal INTEGER PRIMARY KEY, item_external_id TEXT NOT NULL, source_external_id TEXT NOT NULL UNIQUE,\n  weapon_role TEXT NOT NULL, weapon_category TEXT NOT NULL, handedness TEXT NOT NULL, damage_type TEXT NOT NULL,\n  range_type TEXT NOT NULL, range_text TEXT NOT NULL, damage REAL, weapon_effect_description TEXT NOT NULL, weapon_narrative_notes TEXT NOT NULL\n);\n${weaponRows.length ? `INSERT INTO _serrian_tide_weapon_seed VALUES\n${sqlRows(weaponRows, ["ordinal", "itemExternalId", "sourceExternalId", "weaponRole", "weaponCategory", "handedness", "damageType", "rangeType", "rangeText", "damage", "weaponEffectDescription", "weaponNarrativeNotes"])};\n` : ""}INSERT OR IGNORE INTO item_weapon_profiles (item_id, weapon_role, weapon_category, handedness, damage_type, range_type, range_text, damage, weapon_effect_description, weapon_narrative_notes, source_system, source_external_id)\nSELECT item.id, seed.weapon_role, seed.weapon_category, seed.handedness, seed.damage_type, seed.range_type, seed.range_text, seed.damage, seed.weapon_effect_description, seed.weapon_narrative_notes, '${catalog.sourceSystem}', seed.source_external_id\nFROM _serrian_tide_weapon_seed seed JOIN items item ON item.source_system = '${catalog.sourceSystem}' AND item.source_external_id = seed.item_external_id ORDER BY seed.ordinal;\n\nCREATE TEMP TABLE _serrian_tide_armor_seed (\n  ordinal INTEGER PRIMARY KEY, item_external_id TEXT NOT NULL, source_external_id TEXT NOT NULL UNIQUE,\n  area_covered TEXT NOT NULL, soak REAL, armor_category TEXT NOT NULL, armor_type TEXT NOT NULL, encumbrance_penalty REAL,\n  armor_effect_description TEXT NOT NULL, armor_narrative_notes TEXT NOT NULL\n);\n${armorRows.length ? `INSERT INTO _serrian_tide_armor_seed VALUES\n${sqlRows(armorRows, ["ordinal", "itemExternalId", "sourceExternalId", "areaCovered", "soak", "armorCategory", "armorType", "encumbrancePenalty", "armorEffectDescription", "armorNarrativeNotes"])};\n` : ""}INSERT OR IGNORE INTO item_armor_profiles (item_id, area_covered, soak, armor_category, armor_type, encumbrance_penalty, armor_effect_description, armor_narrative_notes, source_system, source_external_id)\nSELECT item.id, seed.area_covered, seed.soak, seed.armor_category, seed.armor_type, seed.encumbrance_penalty, seed.armor_effect_description, seed.armor_narrative_notes, '${catalog.sourceSystem}', seed.source_external_id\nFROM _serrian_tide_armor_seed seed JOIN items item ON item.source_system = '${catalog.sourceSystem}' AND item.source_external_id = seed.item_external_id ORDER BY seed.ordinal;\n\nCREATE TEMP TABLE _serrian_tide_item_creature_seed (ordinal INTEGER PRIMARY KEY, item_external_id TEXT NOT NULL, creature_external_id TEXT NOT NULL, relationship TEXT NOT NULL, notes TEXT NOT NULL);\n${linkRows.length ? `INSERT INTO _serrian_tide_item_creature_seed VALUES\n${sqlRows(linkRows, ["ordinal", "itemSourceExternalId", "creatureSourceExternalId", "relationship", "notes"])};\n` : ""}INSERT OR IGNORE INTO item_creature_links (item_id, creature_id, relationship, notes)\nSELECT item.id, creature.id, seed.relationship, seed.notes FROM _serrian_tide_item_creature_seed seed\nJOIN items item ON item.source_system = '${catalog.sourceSystem}' AND item.source_external_id = seed.item_external_id\nJOIN creatures creature ON creature.source_system = '${catalog.sourceSystem}' AND creature.source_external_id = seed.creature_external_id\nORDER BY seed.ordinal;\n\nDROP TABLE _serrian_tide_item_creature_seed;\nDROP TABLE _serrian_tide_armor_seed;\nDROP TABLE _serrian_tide_weapon_seed;\nDROP TABLE _serrian_tide_item_genre_seed;\nDROP TABLE _serrian_tide_item_seed;\n`;
}

async function main() {
  const [sourceText, decisionsText] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(decisionsPath, "utf8"),
  ]);
  const snapshot = JSON.parse(sourceText);
  const decisions = JSON.parse(decisionsText);
  const sourceHash = sha256(sourceText);
  const decisionsHash = sha256(decisionsText);
  const errors = [];
  const report = {
    schemaVersion: 2,
    sourceSystem: decisions.sourceSystem,
    sourceSha256: sourceHash,
    decisionsSha256: decisionsHash,
    sourceCounts: {},
    normalizedCounts: {},
    reconciliation: {
      exactSemanticMerges: [],
      crossSourceEnrichments: [],
      normalizedEntries: [],
      ambiguousSameNameCollisions: [],
      conflicts: [],
      unresolvedEntries: [],
      skippedEntries: [],
      recordsMissingMechanicalDetail: [],
    },
    creatureReview: {
      safeCreatureShells: [],
      purchaseItemsLinked: [],
      creatureLikeItemsIntentionallyUnlinked: [],
      genericPurchaseEntries: [],
      fantasyAmbiguousCandidates: [],
      configuredShellsWithoutSource: [],
    },
    sourceAccounting: [],
    validationErrors: errors,
  };

  const sources = snapshot.sources;
  const rowsByTab = buildStructuredRows(sources.structuredSheet.tabs, decisions);
  const typeEntries = parseTypeDocument(sources.typeDocument);
  const genreEntries = parseGenreDocument(sources.genreDocument);
  report.sourceCounts = {
    structuredItemsRows: rowsByTab.Items.length,
    structuredWeaponsRows: rowsByTab.Weapons.length,
    structuredArmorRows: rowsByTab.Armor.length,
    structuredTotalRows: rowsByTab.Items.length + rowsByTab.Weapons.length + rowsByTab.Armor.length,
    genreDocumentEntries: genreEntries.length,
    typeDocumentEntries: typeEntries.length,
    totalEntries: rowsByTab.Items.length + rowsByTab.Weapons.length + rowsByTab.Armor.length + genreEntries.length + typeEntries.length,
    genreDocumentByGenreAndCategory: [],
    typeDocumentByCategory: [],
  };
  const genreCountMap = new Map();
  for (const entry of genreEntries) {
    const key = `${entry.genre}\u001f${entry.category}`;
    genreCountMap.set(key, (genreCountMap.get(key) ?? 0) + 1);
  }
  report.sourceCounts.genreDocumentByGenreAndCategory = [...genreCountMap.entries()].map(([key, count]) => {
    const [genre, category] = key.split("\u001f");
    return { genre, category, count };
  });
  const typeCountMap = new Map();
  for (const entry of typeEntries) typeCountMap.set(entry.category, (typeCountMap.get(entry.category) ?? 0) + 1);
  report.sourceCounts.typeDocumentByCategory = [...typeCountMap.entries()].map(([category, count]) => ({ category, count }));

  const mergeAttachments = new Map();
  for (const decision of decisions.structuredSheet.mergeDecisions) {
    for (const attached of decision.attachSources) {
      mergeAttachments.set(`${attached.tab}\u001f${normalized(attached.name)}`, decision);
    }
  }
  const records = [];
  const recordByStructuredSource = new Map();
  for (const tab of ["Items", "Weapons", "Armor"]) {
    for (const row of rowsByTab[tab]) {
      if (mergeAttachments.has(`${tab}\u001f${normalized(row.name)}`)) continue;
      const record = createBaseRecord(row, report, decisions, errors);
      records.push(record);
      recordByStructuredSource.set(`${tab}\u001f${normalized(row.name)}`, record);
    }
  }
  for (const decision of decisions.structuredSheet.mergeDecisions) {
    const baseKey = `${decision.baseSource.tab}\u001f${normalized(decision.baseSource.name)}`;
    const record = recordByStructuredSource.get(baseKey);
    if (!record) throw new Error(`Missing configured merge base ${decision.baseSource.tab}/${decision.baseSource.name}.`);
    for (const attached of decision.attachSources) {
      const matches = rowsByTab[attached.tab].filter((row) => normalized(row.name) === normalized(attached.name));
      if (matches.length !== 1) throw new Error(`Expected one configured attachment ${attached.tab}/${attached.name}; found ${matches.length}.`);
      const row = matches[0];
      addProvenance(record, structuredSourceReference(row));
      if (row.tab === "Weapons") record.weaponProfile = createWeaponProfile(row, "pending", decisions, errors);
      if (row.tab === "Armor") record.armorProfile = createArmorProfile(row, "pending", decisions, report, errors);
      report.reconciliation.exactSemanticMerges.push({
        canonicalName: decision.canonicalName,
        baseSourceEntryId: record.provenance[0].sourceEntryId,
        attachedSourceEntryId: row.sourceEntryId,
        reason: decision.reason,
      });
      report.sourceAccounting.push({ sourceEntryId: row.sourceEntryId, source: "structured-sheet", name: row.name, status: "Merged", reason: decision.reason });
    }
  }

  const usedKeys = new Set();
  for (const record of records) {
    const qualifier = `${record.canonicalCategory}-${record.subtype || record.category}`;
    record.key = claimKey(record.name, qualifier, usedKeys);
    record.sourceExternalId = `item:${record.key}`;
    if (!record.weaponProfile && record.provenance.some((entry) => entry.tab === "Weapons")) {
      const row = rowsByTab.Weapons.find((entry) => entry.sourceEntryId === record.provenance.find((source) => source.tab === "Weapons").sourceEntryId);
      record.weaponProfile = createWeaponProfile(row, record.key, decisions, errors);
    }
    if (!record.armorProfile && record.provenance.some((entry) => entry.tab === "Armor")) {
      const row = rowsByTab.Armor.find((entry) => entry.sourceEntryId === record.provenance.find((source) => source.tab === "Armor").sourceEntryId);
      record.armorProfile = createArmorProfile(row, record.key, decisions, report, errors);
    }
    if (record.weaponProfile) record.weaponProfile.sourceExternalId = `weapon-profile:${record.key}`;
    if (record.armorProfile) record.armorProfile.sourceExternalId = `armor-profile:${record.key}`;
  }
  const mergedStructuredIds = new Set(report.sourceAccounting.map((entry) => entry.sourceEntryId));
  for (const tab of ["Items", "Weapons", "Armor"]) {
    for (const row of rowsByTab[tab]) {
      if (mergedStructuredIds.has(row.sourceEntryId)) continue;
      const record = records.find((candidate) => candidate.provenance.some((entry) => entry.sourceEntryId === row.sourceEntryId));
      if (!record) throw new Error(`Structured source row ${row.sourceEntryId} was not assigned.`);
      report.sourceAccounting.push({ sourceEntryId: row.sourceEntryId, source: "structured-sheet", name: row.name, status: "Imported", itemKey: record.key, profile: tab === "Weapons" ? "Weapon" : tab === "Armor" ? "Armor" : null });
    }
  }

  const safeCreatureNames = new Set(decisions.creatures.safeShells.flatMap((creature) => creature.purchaseItemNames.map(normalized)));
  for (const entry of typeEntries) {
    const decision = refineDocumentCategory(entry, categoryDecision(entry.category, decisions), report);
    const candidates = findMergeCandidates(records, entry, decision.canonicalCategory, decisions, safeCreatureNames, ["structured-sheet"]);
    if (candidates.length === 1) {
      const record = candidates[0];
      addProvenance(record, documentSourceReference("type-document", sources.typeDocument.title, entry));
      report.reconciliation.crossSourceEnrichments.push({ sourceEntryId: entry.sourceEntryId, itemKey: record.key, name: entry.name, enrichment: "type/category provenance", targetAuthority: "structured-sheet" });
      report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "type-document", name: entry.name, status: "Merged", itemKey: record.key });
      continue;
    }
    if (candidates.length > 1) {
      report.reconciliation.ambiguousSameNameCollisions.push({ sourceEntryId: entry.sourceEntryId, name: entry.name, candidateItemKeys: candidates.map((record) => record.key), action: "kept-separate" });
    }
    const catalogSection = decisions.documents.catalogSectionByCategory[decision.canonicalCategory];
    if (decision.unresolved || !catalogSection) {
      report.reconciliation.unresolvedEntries.push({ sourceEntryId: entry.sourceEntryId, source: "type-document", name: entry.name, category: entry.category, reason: "Catalog placement is not established by the explicit category policy." });
      report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "type-document", name: entry.name, status: "Unresolved", reason: "Catalog placement requires review." });
      continue;
    }
    const record = createDocumentRecord(entry, decision.canonicalCategory, catalogSection, "type-document", sources.typeDocument.title, "", "type-document");
    record.key = claimKey(record.name, `${decision.canonicalCategory}-type-list`, usedKeys);
    record.sourceExternalId = `item:${record.key}`;
    records.push(record);
    report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "type-document", name: entry.name, status: "Imported", itemKey: record.key });
  }

  for (const entry of genreEntries) {
    const decision = refineDocumentCategory(entry, categoryDecision(entry.category, decisions), report);
    const candidates = findMergeCandidates(records, entry, decision.canonicalCategory, decisions, safeCreatureNames, ["structured-sheet", "type-document"]);
    if (candidates.length === 1) {
      const record = candidates[0];
      addGenre(record, entry.genre);
      addProvenance(record, documentSourceReference("genre-document", sources.genreDocument.title, entry));
      report.reconciliation.crossSourceEnrichments.push({ sourceEntryId: entry.sourceEntryId, itemKey: record.key, name: entry.name, enrichment: `genre tag: ${entry.genre}`, targetAuthority: record.originKind });
      report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "genre-document", name: entry.name, status: "Merged", itemKey: record.key });
      continue;
    }
    if (candidates.length > 1) {
      report.reconciliation.ambiguousSameNameCollisions.push({ sourceEntryId: entry.sourceEntryId, name: entry.name, genre: entry.genre, candidateItemKeys: candidates.map((record) => record.key), action: "kept-separate" });
    }
    const catalogSection = decisions.documents.catalogSectionByCategory[decision.canonicalCategory];
    if (decision.unresolved || !catalogSection) {
      report.reconciliation.unresolvedEntries.push({ sourceEntryId: entry.sourceEntryId, source: "genre-document", name: entry.name, genre: entry.genre, category: entry.category, reason: "Artifact/Spiritual or unknown catalog placement requires individual review." });
      report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "genre-document", name: entry.name, status: "Unresolved", reason: "Catalog placement requires individual review." });
      continue;
    }
    const record = createDocumentRecord(entry, decision.canonicalCategory, catalogSection, "genre-document", sources.genreDocument.title, entry.genre, "genre-document");
    record.key = claimKey(`${record.name}--${entry.genre}--${decision.canonicalCategory}`, "genre-list", usedKeys);
    record.sourceExternalId = `item:${record.key}`;
    records.push(record);
    report.sourceAccounting.push({ sourceEntryId: entry.sourceEntryId, source: "genre-document", name: entry.name, status: "Imported", itemKey: record.key });
  }

  if (errors.length) {
    throw new Error(`Catalog normalization found ${errors.length} invalid numeric values. See validationErrors in the report object.`);
  }
  const accountedIds = new Set(report.sourceAccounting.map((entry) => entry.sourceEntryId));
  if (accountedIds.size !== report.sourceCounts.totalEntries || report.sourceAccounting.length !== report.sourceCounts.totalEntries) {
    throw new Error(`Expected ${report.sourceCounts.totalEntries} uniquely accounted entries; found ${accountedIds.size} unique / ${report.sourceAccounting.length} rows.`);
  }

  records.sort((left, right) => left.key.localeCompare(right.key, "en-US"));
  const itemCatalog = {
    schemaVersion: 1,
    sourceSystem: decisions.sourceSystem,
    sourceSha256: sourceHash,
    decisionsSha256: decisionsHash,
    records: records.map((record) => ({
      key: record.key,
      item: {
        name: record.name,
        catalogSection: record.catalogSection,
        timelineTag: record.timelineTag,
        costCredits: record.costCredits,
        category: record.category,
        subtype: record.subtype,
        weight: record.weight,
        effectDescription: record.effectDescription,
        narrativeVariantNotes: record.narrativeVariantNotes,
        sourceSystem: record.sourceSystem,
        sourceExternalId: record.sourceExternalId,
      },
      genreTags: record.genreTags,
      weaponProfile: record.weaponProfile,
      armorProfile: record.armorProfile,
      provenance: record.provenance,
    })),
  };

  const itemRecordByKey = new Map(itemCatalog.records.map((record) => [record.key, record]));
  const creatureRecords = [];
  const itemCreatureLinks = [];
  const linkedItemKeys = new Set();
  function livingSource(record) {
    if (record.item.category === "Vehicle") return false;
    return record.provenance.some((entry) =>
      (entry.sourceKey === "structured-sheet" && ["Animal", "Mount", "Pet"].includes(entry.sourceSubtype)) ||
      (["genre-document", "type-document"].includes(entry.sourceKey) && ["Animals", "Mounts", "Animal", "Mount"].includes(entry.sourceCategory)),
    );
  }
  for (const configured of decisions.creatures.safeShells) {
    const names = new Set(configured.purchaseItemNames.map(normalized));
    const linkedRecords = itemCatalog.records.filter((record) => names.has(normalized(record.item.name)) && record.item.catalogSection === "Inventory" && livingSource(record));
    if (!linkedRecords.length) {
      report.creatureReview.configuredShellsWithoutSource.push({ key: configured.key, name: configured.name });
      continue;
    }
    const genreTags = [];
    const uses = [];
    for (const record of linkedRecords) {
      for (const tag of record.genreTags) if (!genreTags.some((entry) => normalized(entry) === normalized(tag))) genreTags.push(tag);
      const hasMountSource = record.provenance.some((entry) => entry.sourceSubtype === "Mount" || entry.sourceCategory === "Mounts" || entry.sourceCategory === "Mount");
      const hasPetSource = record.provenance.some((entry) => entry.sourceSubtype === "Pet") || /\bpet\b/i.test(record.item.name);
      const hasCompanionSource = /\bcompanion\b/i.test(record.item.name);
      if (hasMountSource && !uses.includes("Mount")) uses.push("Mount");
      if (hasPetSource && !uses.includes("Pet")) uses.push("Pet");
      if (hasCompanionSource && !uses.includes("Companion")) uses.push("Companion");
      linkedItemKeys.add(record.key);
      itemCreatureLinks.push({
        itemKey: record.key,
        creatureKey: configured.key,
        itemSourceExternalId: record.item.sourceExternalId,
        creatureSourceExternalId: `creature:${configured.key}`,
        relationship: "Purchase",
        notes: "",
      });
      report.creatureReview.purchaseItemsLinked.push({ itemKey: record.key, itemName: record.item.name, creatureKey: configured.key, creatureName: configured.name });
    }
    const provenance = linkedRecords.flatMap((record) => record.provenance).filter((entry, index, all) => all.findIndex((candidate) => candidate.sourceEntryId === entry.sourceEntryId) === index);
    const creatureRecord = {
      key: configured.key,
      creature: {
        name: configured.name,
        challengeRating: null,
        encounterScale: "",
        type: "Animal",
        role: "",
        size: "",
        descriptionShort: "",
        hpTotal: null,
        initiative: null,
        armorSoak: null,
        magicResonanceInteraction: "",
        behaviorTactics: "",
        habitat: "",
        diet: "",
        lootHarvest: "",
        storyHooks: "",
        notes: "",
        sourceSystem: decisions.sourceSystem,
        sourceExternalId: `creature:${configured.key}`,
      },
      altNames: [],
      genreTags,
      attributes: [],
      movementModes: [],
      hpLocations: [],
      attacks: [],
      skillLinks: [],
      uses,
      variants: [],
      provenance,
    };
    creatureRecords.push(creatureRecord);
    report.creatureReview.safeCreatureShells.push({ key: configured.key, name: configured.name, purchaseItemCount: linkedRecords.length, itemKeys: linkedRecords.map((record) => record.key) });
  }

  for (const record of itemCatalog.records) {
    if (!livingSource(record) || linkedItemKeys.has(record.key)) continue;
    let reason = "Creature-like source entry was not mapped to a safe canonical identity in this pass.";
    let reviewType = "unlinked-creature-like-item";
    if (decisions.creatures.genericPurchaseEntries.some((name) => normalized(name) === normalized(record.item.name))) {
      reason = "Generic purchase entry must not create a made-up Creature identity.";
      reviewType = "generic-purchase-entry";
      report.creatureReview.genericPurchaseEntries.push({ itemKey: record.key, name: record.item.name, reason });
    } else if (decisions.creatures.ambiguousFantasyCandidates.some((name) => normalized(name) === normalized(record.item.name))) {
      reason = "Fantasy Creature identity requires the dedicated Creature catalog pass before linking.";
      reviewType = "fantasy-ambiguous-candidate";
      report.creatureReview.fantasyAmbiguousCandidates.push({ itemKey: record.key, name: record.item.name, reason });
    } else if (decisions.creatures.excludedIdentityPatterns.some((pattern) => record.item.name.includes(pattern))) {
      reason = "Modified, constructed, supernatural, or non-specific identity was intentionally excluded from safe animal shell creation.";
      reviewType = "excluded-modified-identity";
    }
    report.creatureReview.creatureLikeItemsIntentionallyUnlinked.push({ itemKey: record.key, name: record.item.name, reviewType, reason });
  }

  creatureRecords.sort((left, right) => left.key.localeCompare(right.key, "en-US"));
  itemCreatureLinks.sort((left, right) => left.itemKey.localeCompare(right.itemKey, "en-US") || left.creatureKey.localeCompare(right.creatureKey, "en-US"));
  const creatureCatalog = {
    schemaVersion: 1,
    sourceSystem: decisions.sourceSystem,
    sourceSha256: sourceHash,
    decisionsSha256: decisionsHash,
    records: creatureRecords,
  };
  const links = {
    schemaVersion: 1,
    sourceSystem: decisions.sourceSystem,
    sourceSha256: sourceHash,
    decisionsSha256: decisionsHash,
    records: itemCreatureLinks,
  };

  for (const record of itemCatalog.records) {
    const missingFields = [];
    if (record.item.costCredits === null) missingFields.push("costCredits");
    if (record.item.weight === null) missingFields.push("weight");
    if (!record.item.effectDescription) missingFields.push("effectDescription");
    if (record.weaponProfile?.damage === null) missingFields.push("weaponProfile.damage");
    if (record.armorProfile?.soak === null) missingFields.push("armorProfile.soak");
    if (record.armorProfile?.encumbrancePenalty === null) missingFields.push("armorProfile.encumbrancePenalty");
    if (missingFields.length) report.reconciliation.recordsMissingMechanicalDetail.push({ itemKey: record.key, name: record.item.name, missingFields });
  }

  const weaponProfiles = itemCatalog.records.filter((record) => record.weaponProfile);
  const armorProfiles = itemCatalog.records.filter((record) => record.armorProfile);
  const categoryCount = (category) => itemCatalog.records.filter((record) => record.item.category === category).length;
  report.normalizedCounts = {
    uniqueBaseItems: itemCatalog.records.length,
    equipmentItems: itemCatalog.records.filter((record) => record.item.catalogSection === "Equipment").length,
    inventoryItems: itemCatalog.records.filter((record) => record.item.catalogSection === "Inventory").length,
    weaponProfiles: weaponProfiles.length,
    primaryWeaponProfiles: weaponProfiles.filter((record) => record.weaponProfile.weaponRole === "Primary").length,
    improvisedWeaponProfiles: weaponProfiles.filter((record) => record.weaponProfile.weaponRole === "Improvised").length,
    armorProfiles: armorProfiles.length,
    dualProfileItems: itemCatalog.records.filter((record) => record.weaponProfile && record.armorProfile).length,
    ammunitionItems: categoryCount("Ammunition"),
    clothingItems: categoryCount("Clothing"),
    vehicleItems: categoryCount("Vehicle"),
    consumableItems: itemCatalog.records.filter((record) => record.item.category === "Consumable" || record.item.category === "Consumables").length,
    serviceItems: itemCatalog.records.filter((record) => record.item.category === "Service").length,
    genreTagRows: itemCatalog.records.reduce((total, record) => total + record.genreTags.length, 0),
    safeCreatureShells: creatureCatalog.records.length,
    purchaseRelationships: links.records.length,
    unresolvedSourceEntries: report.reconciliation.unresolvedEntries.length,
    skippedSourceEntries: report.reconciliation.skippedEntries.length,
    recordsMissingMechanicalDetail: report.reconciliation.recordsMissingMechanicalDetail.length,
  };
  if (report.normalizedCounts.weaponProfiles !== decisions.structuredSheet.expectedCounts.Weapons) throw new Error(`Expected 206 Weapon Profiles; found ${report.normalizedCounts.weaponProfiles}.`);
  if (report.normalizedCounts.armorProfiles !== decisions.structuredSheet.expectedCounts.Armor) throw new Error(`Expected 189 Armor Profiles; found ${report.normalizedCounts.armorProfiles}.`);

  const manifest = {
    schemaVersion: 1,
    capturedFromGoogleReadOnly: snapshot.capturedFromGoogleReadOnly,
    sourceSnapshotSha256: sourceHash,
    importDecisionsSha256: decisionsHash,
    sources: [
      {
        sourceKey: sources.structuredSheet.sourceKey,
        title: sources.structuredSheet.title,
        googleFileId: sources.structuredSheet.googleFileId,
        url: sources.structuredSheet.url,
        mimeType: sources.structuredSheet.mimeType,
        modifiedTime: sources.structuredSheet.modifiedTime,
        tabs: Object.entries(sources.structuredSheet.tabs).map(([name, values]) => ({ name, dataRows: values.length - 1, columns: values[0]?.length ?? 0 })),
      },
      {
        sourceKey: sources.genreDocument.sourceKey,
        title: sources.genreDocument.title,
        googleFileId: sources.genreDocument.googleFileId,
        url: sources.genreDocument.url,
        mimeType: sources.genreDocument.mimeType,
        modifiedTime: sources.genreDocument.modifiedTime,
        revisionId: sources.genreDocument.revisionId,
        sourceEntries: genreEntries.length,
      },
      {
        sourceKey: sources.typeDocument.sourceKey,
        title: sources.typeDocument.title,
        googleFileId: sources.typeDocument.googleFileId,
        url: sources.typeDocument.url,
        mimeType: sources.typeDocument.mimeType,
        modifiedTime: sources.typeDocument.modifiedTime,
        revisionId: sources.typeDocument.revisionId,
        sourceEntries: typeEntries.length,
      },
    ],
  };

  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(itemCatalogPath, `${JSON.stringify(itemCatalog, null, 2)}\n`, "utf8"),
    writeFile(creatureCatalogPath, `${JSON.stringify(creatureCatalog, null, 2)}\n`, "utf8"),
    writeFile(linksPath, `${JSON.stringify(links, null, 2)}\n`, "utf8"),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(creatureSeedMigrationPath, serializeCreatureSeed(creatureCatalog, sourceHash, decisionsHash), "utf8"),
    writeFile(itemSeedMigrationPath, serializeItemSeed(itemCatalog, links, sourceHash, decisionsHash), "utf8"),
  ]);
  console.log(JSON.stringify({ sourceCounts: report.sourceCounts, normalizedCounts: report.normalizedCounts }, null, 2));
}

await main();
