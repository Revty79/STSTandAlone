import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectDirectory, "data", "serrian-tide-item-sheet.json");
const decisionsPath = path.join(projectDirectory, "data", "serrian-tide-item-import-decisions.json");
const seedPath = path.join(projectDirectory, "data", "serrian-tide-item-seed.json");
const reportPath = path.join(projectDirectory, "data", "serrian-tide-item-import-report.json");
const migrationPath = path.join(projectDirectory, "src-tauri", "migrations", "0008_seed_item_catalog.sql");
const migrationRewriteRequested = process.argv.slice(2).includes("--create-migration-8");
if (migrationRewriteRequested) {
  throw new Error(
    "Migration 0008 is already released and checksum-locked. Regenerate the canonical seed/report and add a later corrective migration instead.",
  );
}
const createMigration = false;

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
const expectedSourceCounts = { Items: 425, Weapons: 206, Armor: 189 };

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function parseNumber(value, context, errors, { allowNegative = false } = {}) {
  const sourceValue = text(value);
  const parsed = Number(sourceValue.replaceAll(",", ""));
  if (!sourceValue || !Number.isFinite(parsed) || (!allowNegative && parsed < 0)) {
    errors.push({ ...context, sourceValue, reason: `Expected a ${allowNegative ? "finite" : "non-negative"} number.` });
    return null;
  }
  return parsed;
}

function splitGenreTags(value) {
  const seen = new Set();
  return text(value).split(",").map((tag) => tag.trim()).filter((tag) => {
    if (!tag) return false;
    const key = normalized(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertHeaders(snapshot) {
  for (const [tab, headers] of Object.entries(expectedHeaders)) {
    const actual = snapshot.tabs?.[tab]?.[0] ?? [];
    if (actual.slice(0, headers.length).join("\u001f") !== headers.join("\u001f")) {
      throw new Error(`Unexpected ${tab} headers: ${actual.join(", ")}`);
    }
  }
}

function buildSourceRows(tab, values) {
  const data = values.slice(1);
  if (data.length !== expectedSourceCounts[tab]) {
    throw new Error(`Expected ${expectedSourceCounts[tab]} ${tab} rows; found ${data.length}.`);
  }
  const nameCounts = new Map();
  for (const row of data) {
    const name = text(row[0]);
    if (!name) throw new Error(`${tab} contains a row without a name.`);
    const key = normalized(name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const identicalOccurrences = new Map();
  return data.map((row, index) => {
    const name = text(row[0]);
    const nameKey = normalized(name);
    const rowSignature = hash(row.map(text).join("\u001f"));
    const identicalKey = `${nameKey}\u001f${rowSignature}`;
    const occurrence = (identicalOccurrences.get(identicalKey) ?? 0) + 1;
    identicalOccurrences.set(identicalKey, occurrence);
    const semanticIdentity = nameCounts.get(nameKey) === 1
      ? `${tab.toLocaleLowerCase("en-US")}|${nameKey}`
      : `${tab.toLocaleLowerCase("en-US")}|${nameKey}|variant:${rowSignature.slice(0, 20)}|occurrence:${occurrence}`;
    return {
      tab,
      rowNumber: index + 2,
      values: row,
      name,
      nameKey,
      semanticIdentity,
      sourceKey: `${tab}\u001f${semanticIdentity}`,
    };
  });
}

function sourceExternalId(prefix, row) {
  return `${prefix}-${hash(`serrian-tide-item-sheet|${row.semanticIdentity}`)}`;
}

function findUniqueSource(rowsByTab, reference) {
  const matches = rowsByTab[reference.tab]?.filter((row) => row.nameKey === normalized(reference.name)) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected one ${reference.tab} source named ${reference.name}; found ${matches.length}.`);
  }
  return matches[0];
}

function commonValues(row, correctedArmorValues) {
  if (row.tab === "Items") {
    return {
      timelineTag: text(row.values[1]), cost: text(row.values[2]), weight: text(row.values[7]),
      effect: text(row.values[6]), narrative: text(row.values[8]), genres: text(row.values[5]),
    };
  }
  if (row.tab === "Weapons") {
    return {
      timelineTag: text(row.values[1]), cost: text(row.values[2]), weight: text(row.values[9]),
      effect: text(row.values[11]), narrative: text(row.values[12]), genres: text(row.values[8]),
    };
  }
  const values = correctedArmorValues ?? row.values;
  return {
    timelineTag: text(values[1]), cost: text(values[2]), weight: text(values[8]),
    effect: text(values[10]), narrative: text(values[11]), genres: text(values[7]),
  };
}

function sqlValue(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlRows(rows, fields) {
  return rows.map((row) => `  (${fields.map((field) => sqlValue(row[field])).join(", ")})`).join(",\n");
}

function serializeMigration(seed, sourceHash, decisionsHash) {
  const items = seed.records.map((record) => record.item);
  const genres = seed.records.flatMap((record) => record.genreTags.map((genreTag, index) => ({
    ordinal: record.ordinal * 100 + index,
    itemExternalId: record.item.sourceExternalId,
    genreTag,
    sortOrder: index,
  })));
  const weapons = seed.records.filter((record) => record.weaponProfile).map((record) => ({
    ordinal: record.ordinal,
    itemExternalId: record.item.sourceExternalId,
    ...record.weaponProfile,
  }));
  const armor = seed.records.filter((record) => record.armorProfile).map((record) => ({
    ordinal: record.ordinal,
    itemExternalId: record.item.sourceExternalId,
    ...record.armorProfile,
  }));
  return `-- Generated by scripts/generate-item-seed.mjs.
-- Google Sheet snapshot SHA-256: ${sourceHash}
-- Import decisions SHA-256: ${decisionsHash}
-- Reconciliation details: data/serrian-tide-item-import-report.json

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS temp._serrian_tide_item_seed;
CREATE TEMP TABLE _serrian_tide_item_seed (
  ordinal INTEGER PRIMARY KEY,
  source_external_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  catalog_scope TEXT NOT NULL,
  timeline_tag TEXT NOT NULL,
  cost_credits REAL NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  weight REAL NOT NULL,
  effect_description TEXT NOT NULL,
  narrative_variant_notes TEXT NOT NULL
);
INSERT INTO _serrian_tide_item_seed VALUES
${sqlRows(items, ["ordinal", "sourceExternalId", "name", "catalogScope", "timelineTag", "costCredits", "category", "subtype", "weight", "effectDescription", "narrativeVariantNotes"])};
INSERT OR IGNORE INTO items (
  name, catalog_scope, timeline_tag, cost_credits, category, subtype, weight,
  effect_description, narrative_variant_notes, created_by_user_id, source_system,
  source_external_id
)
SELECT name, catalog_scope, timeline_tag, cost_credits, category, subtype, weight,
       effect_description, narrative_variant_notes, NULL, '${seed.sourceSystem}', source_external_id
FROM _serrian_tide_item_seed ORDER BY ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_item_genre_seed;
CREATE TEMP TABLE _serrian_tide_item_genre_seed (
  ordinal INTEGER PRIMARY KEY,
  item_external_id TEXT NOT NULL,
  genre_tag TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
INSERT INTO _serrian_tide_item_genre_seed VALUES
${sqlRows(genres, ["ordinal", "itemExternalId", "genreTag", "sortOrder"])};
INSERT OR IGNORE INTO item_genre_tags (item_id, genre_tag, sort_order)
SELECT item.id, seed.genre_tag, seed.sort_order
FROM _serrian_tide_item_genre_seed seed
JOIN items item ON item.source_system = '${seed.sourceSystem}'
               AND item.source_external_id = seed.item_external_id
ORDER BY seed.ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_weapon_seed;
CREATE TEMP TABLE _serrian_tide_weapon_seed (
  ordinal INTEGER PRIMARY KEY,
  item_external_id TEXT NOT NULL,
  source_external_id TEXT NOT NULL UNIQUE,
  weapon_role TEXT NOT NULL,
  weapon_category TEXT NOT NULL,
  handedness TEXT NOT NULL,
  damage_type TEXT NOT NULL,
  range_type TEXT NOT NULL,
  range_text TEXT NOT NULL,
  damage REAL NOT NULL,
  weapon_effect_description TEXT NOT NULL,
  weapon_narrative_notes TEXT NOT NULL
);
INSERT INTO _serrian_tide_weapon_seed VALUES
${sqlRows(weapons, ["ordinal", "itemExternalId", "sourceExternalId", "weaponRole", "weaponCategory", "handedness", "damageType", "rangeType", "rangeText", "damage", "weaponEffectDescription", "weaponNarrativeNotes"])};
INSERT OR IGNORE INTO item_weapon_profiles (
  item_id, weapon_role, weapon_category, handedness, damage_type, range_type,
  range_text, damage, weapon_effect_description, weapon_narrative_notes,
  source_system, source_external_id
)
SELECT item.id, seed.weapon_role, seed.weapon_category, seed.handedness,
       seed.damage_type, seed.range_type, seed.range_text, seed.damage,
       seed.weapon_effect_description, seed.weapon_narrative_notes,
       '${seed.sourceSystem}', seed.source_external_id
FROM _serrian_tide_weapon_seed seed
JOIN items item ON item.source_system = '${seed.sourceSystem}'
               AND item.source_external_id = seed.item_external_id
ORDER BY seed.ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_armor_seed;
CREATE TEMP TABLE _serrian_tide_armor_seed (
  ordinal INTEGER PRIMARY KEY,
  item_external_id TEXT NOT NULL,
  source_external_id TEXT NOT NULL UNIQUE,
  area_covered TEXT NOT NULL,
  soak REAL NOT NULL,
  armor_category TEXT NOT NULL,
  armor_type TEXT NOT NULL,
  encumbrance_penalty REAL NOT NULL,
  armor_effect_description TEXT NOT NULL,
  armor_narrative_notes TEXT NOT NULL
);
INSERT INTO _serrian_tide_armor_seed VALUES
${sqlRows(armor, ["ordinal", "itemExternalId", "sourceExternalId", "areaCovered", "soak", "armorCategory", "armorType", "encumbrancePenalty", "armorEffectDescription", "armorNarrativeNotes"])};
INSERT OR IGNORE INTO item_armor_profiles (
  item_id, area_covered, soak, armor_category, armor_type, encumbrance_penalty,
  armor_effect_description, armor_narrative_notes, source_system, source_external_id
)
SELECT item.id, seed.area_covered, seed.soak, seed.armor_category, seed.armor_type,
       seed.encumbrance_penalty, seed.armor_effect_description,
       seed.armor_narrative_notes, '${seed.sourceSystem}', seed.source_external_id
FROM _serrian_tide_armor_seed seed
JOIN items item ON item.source_system = '${seed.sourceSystem}'
               AND item.source_external_id = seed.item_external_id
ORDER BY seed.ordinal;

DROP TABLE _serrian_tide_armor_seed;
DROP TABLE _serrian_tide_weapon_seed;
DROP TABLE _serrian_tide_item_genre_seed;
DROP TABLE _serrian_tide_item_seed;
`;
}

const [sourceText, decisionsText] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(decisionsPath, "utf8"),
]);
const snapshot = JSON.parse(sourceText);
const decisions = JSON.parse(decisionsText);
assertHeaders(snapshot);
if (decisions.schemaVersion !== 1 || decisions.sourceSystem !== "serrian-tide-item-sheet") {
  throw new Error("Unsupported Item import decisions file.");
}

const rowsByTab = Object.fromEntries(Object.keys(expectedHeaders).map((tab) => [
  tab,
  buildSourceRows(tab, snapshot.tabs[tab]),
]));
const allRows = Object.values(rowsByTab).flat();
const rowsBySourceKey = new Map(allRows.map((row) => [row.sourceKey, row]));
const sourceSystem = decisions.sourceSystem;
const catalogScopeOverrideRules = (decisions.catalogScopeOverrides ?? []).map((rule, index) => {
  const category = text(rule.category);
  const subtypes = [...new Set((rule.subtypes ?? []).map(text).filter(Boolean))];
  const catalogScope = text(rule.catalogScope);
  const reason = text(rule.reason);
  if (!category || !subtypes.length || !catalogScope || !reason) {
    throw new Error(`Catalog scope override ${index + 1} is incomplete.`);
  }
  return {
    ...rule,
    category,
    subtypes,
    catalogScope,
    reason,
    categoryKey: normalized(category),
    subtypeKeys: new Set(subtypes.map(normalized)),
    matchedSubtypeKeys: new Set(),
  };
});

const duplicateWarnings = {};
for (const [tab, rows] of Object.entries(rowsByTab)) {
  const grouped = new Map();
  for (const row of rows) {
    const matches = grouped.get(row.nameKey) ?? [];
    matches.push({ rowNumber: row.rowNumber, name: row.name, semanticIdentity: row.semanticIdentity });
    grouped.set(row.nameKey, matches);
  }
  duplicateWarnings[tab] = [...grouped.values()].filter((matches) => matches.length > 1);
}

const crossTabNames = [];
for (const [leftTab, rightTab] of [["Items", "Weapons"], ["Items", "Armor"], ["Weapons", "Armor"]]) {
  const rightByName = new Map(rowsByTab[rightTab].map((row) => [row.nameKey, row]));
  for (const left of rowsByTab[leftTab]) {
    const right = rightByName.get(left.nameKey);
    if (right) crossTabNames.push({ name: left.name, leftTab, leftRow: left.rowNumber, rightTab, rightRow: right.rowNumber });
  }
}

const correctionByArmorName = new Map((decisions.armorRowCorrections ?? []).map((entry) => [normalized(entry.name), entry]));
const usedCorrections = new Set();
const correctedArmorValues = new Map();
const structuralWarnings = [];
for (const row of rowsByTab.Armor) {
  const correction = correctionByArmorName.get(row.nameKey);
  let values = [...row.values];
  if (correction) {
    if (correction.action !== "missing-type-shift" || values.length !== 11) {
      throw new Error(`Unsupported Armor correction for ${row.name}.`);
    }
    values = [...values.slice(0, 6), "", ...values.slice(6)];
    usedCorrections.add(row.nameKey);
    structuralWarnings.push({ tab: "Armor", rowNumber: row.rowNumber, name: row.name, action: correction.action, reason: correction.reason });
  } else if (values.length < expectedHeaders.Armor.length) {
    values = [...values, ...Array(expectedHeaders.Armor.length - values.length).fill("")];
    structuralWarnings.push({
      tab: "Armor", rowNumber: row.rowNumber, name: row.name,
      action: "pad-missing-trailing-cell",
      reason: "The source row omits a trailing cell; existing values retain their declared columns and the missing trailing value is empty.",
    });
  }
  if (values.length !== expectedHeaders.Armor.length) {
    throw new Error(`Armor row ${row.rowNumber} has ${values.length} normalized cells.`);
  }
  correctedArmorValues.set(row.sourceKey, values);
}
for (const key of correctionByArmorName.keys()) {
  if (!usedCorrections.has(key)) throw new Error(`Armor correction ${key} was not used.`);
}

const baseSourceFor = new Map(allRows.map((row) => [row.sourceKey, row.sourceKey]));
const mergeReports = [];
const configuredMergePairs = new Set();
for (const decision of decisions.mergeDecisions ?? []) {
  const base = findUniqueSource(rowsByTab, decision.baseSource);
  const attachments = decision.attachSources.map((reference) => findUniqueSource(rowsByTab, reference));
  const conflicts = [];
  const baseCommon = commonValues(base, correctedArmorValues.get(base.sourceKey));
  for (const attachment of attachments) {
    baseSourceFor.set(attachment.sourceKey, base.sourceKey);
    configuredMergePairs.add([base.tab, attachment.tab].sort().join("|") + `|${base.nameKey}`);
    const attachedCommon = commonValues(attachment, correctedArmorValues.get(attachment.sourceKey));
    for (const field of ["timelineTag", "cost", "weight", "effect", "narrative", "genres"]) {
      if (normalized(baseCommon[field]) !== normalized(attachedCommon[field])) {
        conflicts.push({ field, baseValue: baseCommon[field], attachedValue: attachedCommon[field], attachedTab: attachment.tab });
      }
    }
  }
  mergeReports.push({
    canonicalName: decision.canonicalName,
    baseSource: { tab: base.tab, rowNumber: base.rowNumber, name: base.name },
    attachedSources: attachments.map((row) => ({ tab: row.tab, rowNumber: row.rowNumber, name: row.name })),
    reason: decision.reason,
    conflicts,
  });
}
const ambiguousMergeCandidates = crossTabNames.filter((candidate) =>
  !configuredMergePairs.has([candidate.leftTab, candidate.rightTab].sort().join("|") + `|${normalized(candidate.name)}`),
);

const parsing = {
  invalidCosts: [], invalidWeights: [], invalidDamage: [], invalidSoak: [], invalidEncumbrance: [],
};
const improvisedNames = new Set(decisions.weaponRolePolicy.improvisedNames.map(normalized));
const usedImprovisedNames = new Set();
const weaponRoleClassifications = [];
for (const row of rowsByTab.Weapons) {
  const role = improvisedNames.has(row.nameKey) ? "improvised" : decisions.weaponRolePolicy.defaultRole;
  if (role === "improvised") usedImprovisedNames.add(row.nameKey);
  weaponRoleClassifications.push({
    rowNumber: row.rowNumber,
    name: row.name,
    weaponRole: role,
    decision: role === "improvised" ? "explicit ordinary-object decision" : "configured primary default",
  });
}
for (const name of improvisedNames) {
  if (!usedImprovisedNames.has(name)) throw new Error(`Improvised Weapon decision ${name} did not match the source.`);
}

const baseRows = allRows.filter((row) => baseSourceFor.get(row.sourceKey) === row.sourceKey);
const sourceRowsForBase = new Map(baseRows.map((row) => [row.sourceKey, []]));
for (const row of allRows) sourceRowsForBase.get(baseSourceFor.get(row.sourceKey)).push(row);

const records = [];
const catalogScopeOverridesApplied = [];
for (const [index, base] of baseRows.entries()) {
  const contributors = sourceRowsForBase.get(base.sourceKey);
  const baseValues = commonValues(base, correctedArmorValues.get(base.sourceKey));
  const costCredits = parseNumber(baseValues.cost, { tab: base.tab, rowNumber: base.rowNumber, name: base.name, field: "cost_credits" }, parsing.invalidCosts);
  const weight = parseNumber(baseValues.weight, { tab: base.tab, rowNumber: base.rowNumber, name: base.name, field: "weight" }, parsing.invalidWeights);
  const itemExternalId = sourceExternalId("item", base);
  let category = "";
  let subtype = "";
  let catalogScope = "equipment";
  if (base.tab === "Items") {
    category = text(base.values[3]);
    subtype = text(base.values[4]);
    catalogScope = decisions.scopeByItemCategory[category] ?? "";
    const matchingOverrides = catalogScopeOverrideRules.filter((rule) =>
      rule.categoryKey === normalized(category) && rule.subtypeKeys.has(normalized(subtype)),
    );
    if (matchingOverrides.length > 1) {
      throw new Error(`Multiple catalog scope overrides match ${base.name}.`);
    }
    if (matchingOverrides.length === 1) {
      const override = matchingOverrides[0];
      catalogScope = override.catalogScope;
      override.matchedSubtypeKeys.add(normalized(subtype));
      catalogScopeOverridesApplied.push({
        rowNumber: base.rowNumber,
        name: base.name,
        category,
        subtype,
        catalogScope,
        reason: override.reason,
      });
    }
  }
  const genreTags = [];
  const seenTags = new Set();
  for (const contributor of [base, ...contributors.filter((row) => row.sourceKey !== base.sourceKey)]) {
    for (const tag of splitGenreTags(commonValues(contributor, correctedArmorValues.get(contributor.sourceKey)).genres)) {
      if (!seenTags.has(normalized(tag))) {
        seenTags.add(normalized(tag));
        genreTags.push(tag);
      }
    }
  }
  const weaponSource = contributors.find((row) => row.tab === "Weapons");
  const armorSource = contributors.find((row) => row.tab === "Armor");
  const role = weaponSource
    ? weaponRoleClassifications.find((entry) => entry.rowNumber === weaponSource.rowNumber).weaponRole
    : null;
  const weaponProfile = weaponSource ? {
    sourceExternalId: sourceExternalId("weapon-profile", weaponSource),
    sourceRow: weaponSource.rowNumber,
    weaponRole: role,
    weaponCategory: text(weaponSource.values[3]),
    handedness: text(weaponSource.values[4]),
    damageType: text(weaponSource.values[5]),
    rangeType: text(weaponSource.values[6]),
    rangeText: text(weaponSource.values[7]),
    damage: parseNumber(weaponSource.values[10], { tab: "Weapons", rowNumber: weaponSource.rowNumber, name: weaponSource.name, field: "damage" }, parsing.invalidDamage),
    weaponEffectDescription: text(weaponSource.values[11]),
    weaponNarrativeNotes: text(weaponSource.values[12]),
  } : null;
  const armorValues = armorSource ? correctedArmorValues.get(armorSource.sourceKey) : null;
  const armorProfile = armorSource ? {
    sourceExternalId: sourceExternalId("armor-profile", armorSource),
    sourceRow: armorSource.rowNumber,
    areaCovered: text(armorValues[3]),
    soak: parseNumber(armorValues[4], { tab: "Armor", rowNumber: armorSource.rowNumber, name: armorSource.name, field: "soak" }, parsing.invalidSoak),
    armorCategory: text(armorValues[5]),
    armorType: text(armorValues[6]),
    encumbrancePenalty: parseNumber(armorValues[9], { tab: "Armor", rowNumber: armorSource.rowNumber, name: armorSource.name, field: "encumbrance_penalty" }, parsing.invalidEncumbrance, { allowNegative: true }),
    armorEffectDescription: text(armorValues[10]),
    armorNarrativeNotes: text(armorValues[11]),
  } : null;
  records.push({
    ordinal: index + 1,
    item: {
      ordinal: index + 1,
      sourceExternalId: itemExternalId,
      name: base.name,
      catalogScope,
      timelineTag: baseValues.timelineTag,
      costCredits,
      category,
      subtype,
      weight,
      effectDescription: baseValues.effect,
      narrativeVariantNotes: baseValues.narrative,
    },
    genreTags,
    weaponProfile,
    armorProfile,
    source: {
      base: { tab: base.tab, rowNumber: base.rowNumber, semanticIdentity: base.semanticIdentity },
      contributors: contributors.map((row) => ({ tab: row.tab, rowNumber: row.rowNumber, semanticIdentity: row.semanticIdentity })),
    },
  });
}

for (const rule of catalogScopeOverrideRules) {
  for (const subtype of rule.subtypes) {
    if (!rule.matchedSubtypeKeys.has(normalized(subtype))) {
      throw new Error(`Catalog scope override ${rule.category} / ${subtype} did not match the source.`);
    }
  }
}

const unknownCategories = rowsByTab.Items
  .filter((row) => !decisions.scopeByItemCategory[text(row.values[3])])
  .map((row) => ({ rowNumber: row.rowNumber, name: row.name, category: text(row.values[3]) }));
const invalidCollections = Object.values(parsing);
if (unknownCategories.length || ambiguousMergeCandidates.length || invalidCollections.some((entries) => entries.length)) {
  throw new Error(`Item import has unresolved validation data: ${JSON.stringify({ unknownCategories, ambiguousMergeCandidates, parsing })}`);
}

const sourceRowAccounting = allRows.map((row) => {
  const baseKey = baseSourceFor.get(row.sourceKey);
  const record = records.find((candidate) => candidate.source.base.semanticIdentity === rowsBySourceKey.get(baseKey).semanticIdentity && candidate.source.base.tab === rowsBySourceKey.get(baseKey).tab);
  const attached = baseKey !== row.sourceKey;
  return {
    tab: row.tab,
    rowNumber: row.rowNumber,
    name: row.name,
    status: attached
      ? `${row.tab === "Weapons" ? "weapon" : "armor"}-profile-attached-to-existing-item`
      : row.tab === "Items"
        ? "base-item"
        : `base-item-and-${row.tab === "Weapons" ? "weapon" : "armor"}-profile`,
    itemSourceExternalId: record.item.sourceExternalId,
    profileSourceExternalId: row.tab === "Weapons"
      ? record.weaponProfile.sourceExternalId
      : row.tab === "Armor"
        ? record.armorProfile.sourceExternalId
        : null,
  };
});

const counts = {
  baseItems: records.length,
  weaponProfiles: records.filter((record) => record.weaponProfile).length,
  primaryWeaponProfiles: records.filter((record) => record.weaponProfile?.weaponRole === "primary").length,
  improvisedWeaponProfiles: records.filter((record) => record.weaponProfile?.weaponRole === "improvised").length,
  armorProfiles: records.filter((record) => record.armorProfile).length,
  genreTagRows: records.reduce((sum, record) => sum + record.genreTags.length, 0),
};
if (counts.baseItems !== 817 || counts.weaponProfiles !== 206 || counts.armorProfiles !== 189 ||
    counts.primaryWeaponProfiles + counts.improvisedWeaponProfiles !== 206) {
  throw new Error(`Unexpected normalized Item counts: ${JSON.stringify(counts)}.`);
}
if (sourceRowAccounting.length !== 820) throw new Error(`Expected 820 accounted source rows; found ${sourceRowAccounting.length}.`);

const sourceHash = hash(sourceText);
const decisionsHash = hash(decisionsText);
const seed = {
  schemaVersion: 1,
  sourceSystem,
  sourceSha256: sourceHash,
  decisionsSha256: decisionsHash,
  counts,
  records,
};
const conflictingSharedValues = mergeReports.flatMap((merge) =>
  merge.conflicts.length ? [{ canonicalName: merge.canonicalName, baseSource: merge.baseSource, conflicts: merge.conflicts }] : [],
);
const report = {
  schemaVersion: 1,
  sourceSystem,
  sourceSha256: sourceHash,
  decisionsSha256: decisionsHash,
  sourceCounts: { items: 425, weapons: 206, armor: 189, totalSourceRows: 820 },
  normalizedCounts: counts,
  reconciliation: {
    crossTabExactNameCandidates: crossTabNames,
    duplicatesWithinItems: duplicateWarnings.Items,
    duplicatesWithinWeapons: duplicateWarnings.Weapons,
    duplicatesWithinArmor: duplicateWarnings.Armor,
    sameNamesAcrossSourceTabs: crossTabNames,
    mergedRecords: mergeReports,
    mergedGeneralItemImprovisedWeapons: mergeReports.filter((merge) => merge.baseSource.tab === "Items"),
    ambiguousMergeCandidates,
    conflictingSharedValues,
  },
  catalogScopePolicy: {
    categoryDefaults: decisions.scopeByItemCategory,
    overrides: catalogScopeOverrideRules.map((rule) => ({
      category: rule.category,
      subtypes: rule.subtypes,
      catalogScope: rule.catalogScope,
      reason: rule.reason,
    })),
    appliedOverrides: catalogScopeOverridesApplied,
  },
  weaponRoleClassifications,
  validation: {
    ...parsing,
    unknownCategories,
    ambiguousWeaponRoles: [],
    structuralSourceWarnings: structuralWarnings,
    otherWarnings: [
      "Duplicate source names are retained as separate deterministic variants unless an explicit merge decision says otherwise.",
      "Free-text effects and narrative notes are preserved without interpreting them as game mechanics.",
    ],
  },
  accounting: {
    accountedSourceRowCount: sourceRowAccounting.length,
    unresolvedSourceRowCount: 0,
    sourceRows: sourceRowAccounting,
  },
};
const migration = serializeMigration(seed, sourceHash, decisionsHash);

await Promise.all([
  mkdir(path.dirname(seedPath), { recursive: true }),
  mkdir(path.dirname(migrationPath), { recursive: true }),
]);
await Promise.all([
  writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ...(createMigration ? [writeFile(migrationPath, migration, "utf8")] : []),
]);

process.stdout.write(
  `Prepared ${counts.baseItems} Items, ${counts.weaponProfiles} Weapon Profiles (${counts.primaryWeaponProfiles} primary / ${counts.improvisedWeaponProfiles} improvised), ${counts.armorProfiles} Armor Profiles, and ${counts.genreTagRows} Genre Tags. All ${sourceRowAccounting.length} source rows are accounted for with 0 unresolved.${createMigration ? " Migration 0008 was created." : " Migration 0008 was not rewritten."}\n`,
);
