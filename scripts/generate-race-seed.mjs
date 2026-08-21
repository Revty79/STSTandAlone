import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectDirectory, "data", "serrian-tide-race-sheet.json");
const skillCatalogPath = path.join(projectDirectory, "data", "serrian-tide-skill-catalog.tsv");
const seedPath = path.join(projectDirectory, "data", "serrian-tide-race-seed.json");
const reportPath = path.join(projectDirectory, "data", "serrian-tide-race-import-report.json");
const migrationPath = path.join(projectDirectory, "src-tauri", "migrations", "0006_seed_race_catalog.sql");
const createMigration = process.argv.slice(2).includes("--create-migration-6");

const sourceSystem = "serrian-tide-race-sheet";
const emptyReferences = /^(?:|none|n\/a|na)$/iu;
const expectedHeaders = {
  "info in one spot": [
    "Race", "Legacy Description", "Physical Characteristics", "Physicial Description",
    "Age Range", "Size", "Strenght Max", "Dexterity Max", "Constitution Max",
    "Intelligence Max", "Wisdom Max", "Charisma Max", "Base Magic", "Base Movement",
    "Racial Quirk", "Quirk Success Effect", "Quirk Failure Effect", "Skill Bonuses",
    "Racial Special Abilities", "Common Languages Known", "Common Archtypes",
    "Examples of Use in Different Genres", "Cultural Mindset", "Outlook On Magic",
  ],
  "Racial Definitions": [
    "Race", "Legacy Description", "Physical Characteristics", "Physicial Description",
    "Racial Quirk", "Quirk Success Effect", "Quirk Failure Effect",
    "Common Languages Known", "Common Archtypes", "Examples of Use in Different Genres",
    "Cultural Mindset", "Outlook On Magic",
  ],
  "Racial Attributes": [
    "Race", "Age Range", "Size", "Strenght Max", "Dexterity Max", "Constitution Max",
    "Intelligence Max", "Wisdom Max", "Charisma Max", "Base Magic", "Base Movement",
  ],
  "Racial Bonus Skills": [
    "Race", "Bonus Skill 1", "Point Value", "Bonus Skill 2", "Point Value",
    "Bonus Skill 3", "Point Value", "Bosus Skill 4", "point value", "Bonus Skill 5",
    "point value", "Bonus Skill 6", "point value", "Bonus Skill 7", "point value",
    "Racial Special Abilitie 1", "Point Value", "Racial Special Abilitie 2",
    "Point Value", "Racial Special Abilitie 3", "Point Value",
    "Racial Special Abilitie 4", "Point Value", "Racial Special Abilitie 5", "Point Value",
  ],
};
const definitionToConsolidatedColumns = [0, 1, 2, 3, 14, 15, 16, 19, 20, 21, 22, 23];
const attributesToConsolidatedColumns = [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const attributeColumns = [
  ["STR", 3], ["DEX", 4], ["CON", 5],
  ["INT", 6], ["WIS", 7], ["CHR", 8],
];
const bonusColumns = [1, 3, 5, 7, 9, 11, 13];
const grantedColumns = [15, 17, 19, 21, 23];

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceExternalId(name) {
  return `race-${hash(name.toLocaleLowerCase("en-US"))}`;
}

function skillExternalId(name) {
  return `skill-${hash(name.toLocaleLowerCase("en-US"))}`;
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function number(value, label, nullable = false) {
  const source = text(value);
  if (!source && nullable) return null;
  const parsed = Number(source);
  if (!Number.isFinite(parsed)) throw new Error(`${label} has invalid number ${JSON.stringify(source)}.`);
  return parsed;
}

function ageRange(source, raceName) {
  const value = text(source);
  if (!value) return { ageRangeText: "", ageMin: null, ageMax: null };
  const match = value.match(/^(\d+)\s*[-–—]\s*(\d+)$/u);
  if (!match) return { ageRangeText: value, ageMin: null, ageMax: null };
  const ageMin = Number(match[1]);
  const ageMax = Number(match[2]);
  if (ageMin > ageMax) throw new Error(`${raceName} has an inverted age range ${value}.`);
  return { ageRangeText: value, ageMin, ageMax };
}

function movementModes(source, raceName) {
  const value = text(source);
  const landOnly = value.match(/^(\d+(?:\.\d+)?)$/u);
  if (landOnly) return [{ movementMode: "Land", baseValue: Number(landOnly[1]), notes: "", sortOrder: 0 }];
  const landAndSwim = value.match(/^(\d+(?:\.\d+)?)\s*\(land\)\s*\/\s*(\d+(?:\.\d+)?)\s*\(swim\)$/iu);
  if (landAndSwim) return [
    { movementMode: "Land", baseValue: Number(landAndSwim[1]), notes: "", sortOrder: 0 },
    { movementMode: "Swim", baseValue: Number(landAndSwim[2]), notes: "", sortOrder: 1 },
  ];
  throw new Error(`${raceName} has unsupported movement text ${JSON.stringify(value)}.`);
}

function assertHeaders(snapshot) {
  for (const [tabName, headers] of Object.entries(expectedHeaders)) {
    const actual = snapshot.tabs?.[tabName]?.[0] ?? [];
    if (actual.slice(0, headers.length).join("\u001f") !== headers.join("\u001f")) {
      throw new Error(`Unexpected headers on ${tabName}: ${actual.join(", ")}`);
    }
  }
}

function rowsByName(rows, tabName) {
  const result = new Map();
  rows.slice(1).forEach((row, index) => {
    const name = text(row[0]);
    if (!name) throw new Error(`${tabName} row ${index + 2} has no Race name.`);
    const key = name.toLocaleLowerCase("en-US");
    if (result.has(key)) throw new Error(`${tabName} contains duplicate Race ${name}.`);
    result.set(key, { rowNumber: index + 2, values: row, name });
  });
  return result;
}

function parseSkillCatalog(source) {
  const lines = source.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").split("\n");
  if (!lines.at(-1)) lines.pop();
  const headers = lines.shift()?.split("\t") ?? [];
  if (headers[2] !== "Skill Type" || headers[4] !== "Skill Name") {
    throw new Error(`Unexpected Skill catalog headers: ${headers.join(", ")}`);
  }
  const byName = new Map();
  lines.forEach((line, index) => {
    const columns = line.split("\t");
    const name = text(columns[4]);
    const classification = text(columns[2]);
    if (!name) throw new Error(`Skill catalog row ${index + 2} has no Skill name.`);
    const key = name.toLocaleLowerCase("en-US");
    const matches = byName.get(key) ?? [];
    matches.push({ name, classification, sourceExternalId: skillExternalId(name) });
    byName.set(key, matches);
  });
  return byName;
}

function reconcileSkillLink({ raceName, sourceName, sourceValue, linkType, sourceColumn, rowNumber }, skillsByName, discrepancies) {
  const name = text(sourceName);
  if (emptyReferences.test(name)) return null;
  const matches = skillsByName.get(name.toLocaleLowerCase("en-US")) ?? [];
  if (matches.length !== 1) {
    discrepancies.push({
      raceName,
      linkType,
      sourceSkillName: name,
      sourceValue: text(sourceValue) || null,
      sourceRow: rowNumber,
      sourceColumn,
      reason: matches.length === 0 ? "No case-insensitive exact Skill name exists." : "More than one case-insensitive exact Skill name exists.",
    });
    return null;
  }
  const match = matches[0];
  if (linkType === "granted" && match.classification.toLocaleLowerCase("en-US") !== "special ability") {
    discrepancies.push({
      raceName,
      linkType,
      sourceSkillName: name,
      sourceValue: text(sourceValue) || null,
      sourceRow: rowNumber,
      sourceColumn,
      reason: `Exact Skill is classified as ${match.classification}, not special ability.`,
    });
    return null;
  }
  return {
    skillExternalId: match.sourceExternalId,
    skillName: match.name,
    skillClassification: match.classification,
    linkType,
    value: text(sourceValue) ? number(sourceValue, `${raceName} ${name} value`) : null,
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

function serializeMigration(seed, sourceHash) {
  const races = seed.records.map((record) => ({ ordinal: record.ordinal, ...record.core }));
  const caps = seed.records.flatMap((record) => record.attributeCaps.map((cap, index) => ({
    ordinal: record.ordinal * 100 + index,
    raceExternalId: record.core.sourceExternalId,
    ...cap,
  })));
  const movements = seed.records.flatMap((record) => record.movementModes.map((mode, index) => ({
    ordinal: record.ordinal * 100 + index,
    raceExternalId: record.core.sourceExternalId,
    ...mode,
  })));
  const links = seed.records.flatMap((record) => record.skillLinks.map((link, index) => ({
    ordinal: record.ordinal * 100 + index,
    raceExternalId: record.core.sourceExternalId,
    ...link,
  })));
  return `-- Generated by scripts/generate-race-seed.mjs.
-- Google Sheet snapshot SHA-256: ${sourceHash}
-- Unmatched Skill references are intentionally excluded and retained in
-- data/serrian-tide-race-import-report.json for an explicit user decision.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS temp._serrian_tide_race_seed;
CREATE TEMP TABLE _serrian_tide_race_seed (
    ordinal INTEGER PRIMARY KEY,
    source_external_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    legacy_description TEXT NOT NULL,
    physical_characteristics TEXT NOT NULL,
    physical_description TEXT NOT NULL,
    age_range_text TEXT NOT NULL,
    age_min INTEGER,
    age_max INTEGER,
    size TEXT NOT NULL,
    base_magic REAL,
    racial_quirk_name TEXT NOT NULL,
    quirk_success_effect TEXT NOT NULL,
    quirk_failure_effect TEXT NOT NULL,
    common_languages_known TEXT NOT NULL,
    common_archetypes TEXT NOT NULL,
    genre_examples TEXT NOT NULL,
    cultural_mindset TEXT NOT NULL,
    outlook_on_magic TEXT NOT NULL
);

INSERT INTO _serrian_tide_race_seed (
    ordinal, source_external_id, name, legacy_description,
    physical_characteristics, physical_description, age_range_text,
    age_min, age_max, size, base_magic, racial_quirk_name,
    quirk_success_effect, quirk_failure_effect, common_languages_known,
    common_archetypes, genre_examples, cultural_mindset, outlook_on_magic
) VALUES
${sqlRows(races, [
    "ordinal", "sourceExternalId", "name", "legacyDescription",
    "physicalCharacteristics", "physicalDescription", "ageRangeText",
    "ageMin", "ageMax", "size", "baseMagic", "racialQuirkName",
    "quirkSuccessEffect", "quirkFailureEffect", "commonLanguagesKnown",
    "commonArchetypes", "genreExamples", "culturalMindset", "outlookOnMagic",
  ])};

INSERT OR IGNORE INTO races (
    name, legacy_description, physical_characteristics, physical_description,
    age_range_text, age_min, age_max, size, base_magic, racial_quirk_name,
    quirk_success_effect, quirk_failure_effect, common_languages_known,
    common_archetypes, genre_examples, cultural_mindset, outlook_on_magic,
    created_by_user_id, source_system, source_external_id
)
SELECT name, legacy_description, physical_characteristics, physical_description,
       age_range_text, age_min, age_max, size, base_magic, racial_quirk_name,
       quirk_success_effect, quirk_failure_effect, common_languages_known,
       common_archetypes, genre_examples, cultural_mindset, outlook_on_magic,
       NULL, '${sourceSystem}', source_external_id
FROM _serrian_tide_race_seed
ORDER BY ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_race_cap_seed;
CREATE TEMP TABLE _serrian_tide_race_cap_seed (
    ordinal INTEGER PRIMARY KEY,
    race_external_id TEXT NOT NULL,
    attribute_key TEXT NOT NULL,
    max_value REAL NOT NULL,
    sort_order INTEGER NOT NULL
);
INSERT INTO _serrian_tide_race_cap_seed VALUES
${sqlRows(caps, ["ordinal", "raceExternalId", "attributeKey", "maxValue", "sortOrder"])};
INSERT OR IGNORE INTO race_attribute_caps (race_id, attribute_key, max_value, sort_order)
SELECT race.id, seed.attribute_key, seed.max_value, seed.sort_order
FROM _serrian_tide_race_cap_seed seed
JOIN races race
  ON race.source_system = '${sourceSystem}'
 AND race.source_external_id = seed.race_external_id
ORDER BY seed.ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_race_movement_seed;
CREATE TEMP TABLE _serrian_tide_race_movement_seed (
    ordinal INTEGER PRIMARY KEY,
    race_external_id TEXT NOT NULL,
    movement_mode TEXT NOT NULL,
    base_value REAL NOT NULL,
    notes TEXT NOT NULL,
    sort_order INTEGER NOT NULL
);
INSERT INTO _serrian_tide_race_movement_seed VALUES
${sqlRows(movements, ["ordinal", "raceExternalId", "movementMode", "baseValue", "notes", "sortOrder"])};
INSERT INTO race_movement_modes (race_id, movement_mode, base_value, notes, sort_order)
SELECT race.id, seed.movement_mode, seed.base_value, seed.notes, seed.sort_order
FROM _serrian_tide_race_movement_seed seed
JOIN races race
  ON race.source_system = '${sourceSystem}'
 AND race.source_external_id = seed.race_external_id
WHERE NOT EXISTS (
    SELECT 1 FROM race_movement_modes existing
    WHERE existing.race_id = race.id
      AND existing.movement_mode = seed.movement_mode COLLATE NOCASE
)
ORDER BY seed.ordinal;

DROP TABLE IF EXISTS temp._serrian_tide_race_skill_seed;
CREATE TEMP TABLE _serrian_tide_race_skill_seed (
    ordinal INTEGER PRIMARY KEY,
    race_external_id TEXT NOT NULL,
    skill_external_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    value REAL,
    sort_order INTEGER NOT NULL
);
INSERT INTO _serrian_tide_race_skill_seed VALUES
${sqlRows(links, ["ordinal", "raceExternalId", "skillExternalId", "linkType", "value", "sortOrder"])};
INSERT OR IGNORE INTO race_skill_links (race_id, skill_id, link_type, value, sort_order)
SELECT race.id, skill.id, seed.link_type, seed.value, seed.sort_order
FROM _serrian_tide_race_skill_seed seed
JOIN races race
  ON race.source_system = '${sourceSystem}'
 AND race.source_external_id = seed.race_external_id
JOIN skills skill
  ON skill.source_system = 'serrian-tide-core'
 AND skill.source_external_id = seed.skill_external_id
ORDER BY seed.ordinal;

DROP TABLE _serrian_tide_race_skill_seed;
DROP TABLE _serrian_tide_race_movement_seed;
DROP TABLE _serrian_tide_race_cap_seed;
DROP TABLE _serrian_tide_race_seed;
`;
}

const [sourceText, skillCatalogText] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(skillCatalogPath, "utf8"),
]);
const snapshot = JSON.parse(sourceText);
assertHeaders(snapshot);
const consolidated = rowsByName(snapshot.tabs["info in one spot"], "info in one spot");
const definitions = rowsByName(snapshot.tabs["Racial Definitions"], "Racial Definitions");
const attributes = rowsByName(snapshot.tabs["Racial Attributes"], "Racial Attributes");
const bonuses = rowsByName(snapshot.tabs["Racial Bonus Skills"], "Racial Bonus Skills");
const skillsByName = parseSkillCatalog(skillCatalogText);

if (consolidated.size !== 56) throw new Error(`Expected 56 Races; found ${consolidated.size}.`);
for (const [key, source] of consolidated) {
  const definition = definitions.get(key);
  const attribute = attributes.get(key);
  const bonus = bonuses.get(key);
  if (!definition || !attribute || !bonus) throw new Error(`${source.name} is missing from a normalized source tab.`);
  definitionToConsolidatedColumns.forEach((column, index) => {
    if (text(source.values[column]) !== text(definition.values[index])) {
      throw new Error(`${source.name} differs between the consolidated and Definitions tabs.`);
    }
  });
  attributesToConsolidatedColumns.forEach((column, index) => {
    if (text(source.values[column]) !== text(attribute.values[index])) {
      throw new Error(`${source.name} differs between the consolidated and Attributes tabs.`);
    }
  });
}

const discrepancies = [];
const records = [];
let ordinal = 0;
for (const [key, source] of consolidated) {
  ordinal += 1;
  const definition = definitions.get(key);
  const attribute = attributes.get(key);
  const bonus = bonuses.get(key);
  const ages = ageRange(attribute.values[1], source.name);
  const sourceId = sourceExternalId(source.name);
  const attributeCaps = attributeColumns.map(([attributeKey, column], sortOrder) => ({
    attributeKey,
    maxValue: number(attribute.values[column], `${source.name} ${attributeKey} maximum`),
    sortOrder,
  }));
  const skillLinks = [];
  for (const [sortOrder, column] of bonusColumns.entries()) {
    const link = reconcileSkillLink({
      raceName: source.name,
      sourceName: bonus.values[column],
      sourceValue: bonus.values[column + 1],
      linkType: "bonus",
      sourceColumn: expectedHeaders["Racial Bonus Skills"][column],
      rowNumber: bonus.rowNumber,
    }, skillsByName, discrepancies);
    if (link) skillLinks.push({ ...link, sortOrder });
  }
  for (const [sortOrder, column] of grantedColumns.entries()) {
    const link = reconcileSkillLink({
      raceName: source.name,
      sourceName: bonus.values[column],
      sourceValue: bonus.values[column + 1],
      linkType: "granted",
      sourceColumn: expectedHeaders["Racial Bonus Skills"][column],
      rowNumber: bonus.rowNumber,
    }, skillsByName, discrepancies);
    if (link) skillLinks.push({ ...link, sortOrder });
  }
  const duplicateLinks = new Set();
  for (const link of skillLinks) {
    const identity = `${link.linkType}:${link.skillExternalId}`;
    if (duplicateLinks.has(identity)) throw new Error(`${source.name} repeats ${link.skillName} as ${link.linkType}.`);
    duplicateLinks.add(identity);
  }
  records.push({
    ordinal,
    core: {
      sourceExternalId: sourceId,
      name: source.name,
      legacyDescription: text(definition.values[1]),
      physicalCharacteristics: text(definition.values[2]),
      physicalDescription: text(definition.values[3]),
      ...ages,
      size: text(attribute.values[2]),
      baseMagic: number(attribute.values[9], `${source.name} Base Magic`, true),
      racialQuirkName: text(definition.values[4]),
      quirkSuccessEffect: text(definition.values[5]),
      quirkFailureEffect: text(definition.values[6]),
      commonLanguagesKnown: text(definition.values[7]),
      commonArchetypes: text(definition.values[8]),
      genreExamples: text(definition.values[9]),
      culturalMindset: text(definition.values[10]),
      outlookOnMagic: text(definition.values[11]),
    },
    attributeCaps,
    movementModes: movementModes(attribute.values[10], source.name),
    skillLinks,
    source: {
      consolidatedRow: source.rowNumber,
      definitionsRow: definition.rowNumber,
      attributesRow: attribute.rowNumber,
      bonusSkillsRow: bonus.rowNumber,
    },
  });
}

const sourceHash = hash(sourceText);
const counts = {
  races: records.length,
  attributeCaps: records.reduce((sum, record) => sum + record.attributeCaps.length, 0),
  movementModes: records.reduce((sum, record) => sum + record.movementModes.length, 0),
  bonusLinks: records.reduce((sum, record) => sum + record.skillLinks.filter(({ linkType }) => linkType === "bonus").length, 0),
  grantedLinks: records.reduce((sum, record) => sum + record.skillLinks.filter(({ linkType }) => linkType === "granted").length, 0),
};
if (JSON.stringify(counts) !== JSON.stringify({ races: 56, attributeCaps: 336, movementModes: 57, bonusLinks: 217, grantedLinks: 32 })) {
  throw new Error(`Unexpected safe import counts: ${JSON.stringify(counts)}.`);
}
if (discrepancies.length !== 35) throw new Error(`Expected 35 unresolved Skill references; found ${discrepancies.length}.`);

const seed = { schemaVersion: 1, sourceSystem, sourceSha256: sourceHash, counts, records };
const groupedDiscrepancies = [...new Set(discrepancies.map(({ sourceSkillName }) => sourceSkillName))]
  .sort((left, right) => left.localeCompare(right, "en-US"))
  .map((sourceSkillName) => ({
    sourceSkillName,
    occurrences: discrepancies.filter((item) => item.sourceSkillName === sourceSkillName),
  }));
const report = {
  schemaVersion: 1,
  sourceSystem,
  sourceSha256: sourceHash,
  policy: "Only case-insensitive exact matches to existing Skills are linked. No Skills or aliases are created.",
  sourceCounts: { races: 56, bonusReferences: 248, grantedReferences: 36 },
  importedCounts: counts,
  unresolvedReferenceCount: discrepancies.length,
  unresolvedUniqueNameCount: groupedDiscrepancies.length,
  unresolvedByName: groupedDiscrepancies,
  unresolvedReferences: discrepancies,
};
const migration = serializeMigration(seed, sourceHash);

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
  `Prepared ${counts.races} Races, ${counts.attributeCaps} caps, ${counts.movementModes} movement modes, ${counts.bonusLinks} bonus links, and ${counts.grantedLinks} granted links. ${discrepancies.length} unmatched references remain in the report.${createMigration ? " Migration 0006 was created." : " Migration 0006 was not rewritten."}\n`,
);
