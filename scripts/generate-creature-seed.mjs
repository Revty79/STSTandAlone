import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(projectDirectory, "data", "serrian-tide-creature-sheet.json");
const supplementPath = path.join(projectDirectory, "data", "serrian-tide-creature-supplements.json");
const seedPath = path.join(projectDirectory, "data", "serrian-tide-creature-seed.json");
const reportPath = path.join(projectDirectory, "data", "serrian-tide-creature-import-report.json");
const migrationPath = path.join(projectDirectory, "src-tauri", "migrations", "0008_seed_creature_catalog.sql");
const supplementMigrationPath = path.join(projectDirectory, "src-tauri", "migrations", "0010_seed_cat_and_falcon.sql");
const sizeScalePath = path.join(projectDirectory, "src", "data", "sizeScale.json");
const skillCatalogPath = path.join(projectDirectory, "data", "serrian-tide-skill-catalog.tsv");
const refreshSource = process.argv.includes("--refresh-source");
const createInitialMigration = process.argv.includes("--create-initial-migration");
const createSupplementMigration = process.argv.includes("--create-supplement-migration");

const spreadsheetId = "1MPNiOoUEBT8KnC51Bx--FwKyqBbojYPRKLOFc2Azmug";
const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
const sourceSystem = "serrian-tide-creature-canon";
const supplementSourceSystem = "serrian-tide-locally-approved-creature-additions";
const initialSupplementSha256 = "7af01c82110a4dfda3d10d3618e40c37ed4bc319c0184507f82adcf5cf018f5e";
const creatureAttributeNames = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const creatureMovementModes = new Set(["Burrow", "Climb", "Crawl", "Flight", "Land", "Rooted", "Swim"]);
const anatomyProfiles = {
  quadruped: {
    pools: [["HEAD", "Head", 10], ["NECK", "Neck", 10], ["LFORE", "Left Foreleg", 10], ["RFORE", "Right Foreleg", 10], ["LHIND", "Left Hindleg", 15], ["RHIND", "Right Hindleg", 15], ["TORSO", "Torso", 30]],
    hits: [
      [0, "Head", "Head, skull, muzzle", "HEAD", "", ""], [1, "Neck", "Neck", "NECK", "", ""],
      [2, "Left Foreleg", "Left front leg", "LFORE", "", ""], [3, "Right Foreleg", "Right front leg", "RFORE", "", ""],
      [4, "Left Hindleg", "Left rear leg", "LHIND", "", ""], [5, "Right Hindleg", "Right rear leg", "RHIND", "", ""],
      [6, "Torso", "Torso", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [7, "Chest", "Torso — chest", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [8, "Abdomen", "Torso — abdomen", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [9, "Hindquarters", "Torso — hindquarters", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
    ],
  },
  bird: {
    pools: [["HEAD", "Head", 10], ["NECK", "Neck", 10], ["LWING", "Left Wing", 12], ["RWING", "Right Wing", 12], ["LLEG", "Left Leg", 10], ["RLEG", "Right Leg", 10], ["TORSO", "Torso", 30], ["TAIL", "Tail", 6]],
    hits: [
      [0, "Head", "Head and beak", "HEAD", "", ""], [1, "Neck", "Neck", "NECK", "", ""],
      [2, "Left Wing", "Left wing", "LWING", "Disabling this location prevents normal Flight.", ""],
      [3, "Right Wing", "Right wing", "RWING", "Disabling this location prevents normal Flight.", ""],
      [4, "Left Leg", "Left leg and foot", "LLEG", "", ""], [5, "Right Leg", "Right leg and foot", "RLEG", "", ""],
      [6, "Torso", "Chest and body", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [7, "Chest", "Torso — chest", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [8, "Abdomen", "Torso — abdomen", "TORSO", "", "PROPOSED FOR REVIEW — shared HP pool."],
      [9, "Tail", "Tail feathers and tail base", "TAIL", "", ""],
    ],
  },
};
const tabDefinitions = [
  ["Creatures", 0, ["Creature ID", "Canonical Name", "Family", "Creature Type", "Size", "Challenge Rating", "Kill XP", "Description", "Typical Behavior", "Habitat / Ecology", "Notes"]],
  ["Challenge Rating Reference", 2000000002, ["CR", "Threat Band", "Attack Target % Guidance", "Damage Guidance", "Initiative Guidance", "Soak Guidance", "HP Toughness Guidance", "Kill XP", "Current Creature Example", "Example Notes"]],
  ["Creature Attributes", 1288222429, ["Creature ID", "Variant ID", "Attribute", "Value", "Notes"]],
  ["Creature Movement", 1614107578, ["Creature ID", "Variant ID", "Movement Mode", "Movement Value", "Initiative", "Requirements", "Notes"]],
  ["Creature HP Pools", 2000000001, ["HP Pool ID", "Creature ID", "Variant ID", "Pool Name", "HP %", "Notes"]],
  ["Creature Hit Locations", 1545852131, ["Creature ID", "Variant ID", "Hit Location #", "Location Name", "Body Parts Included", "HP Pool ID", "Natural Armor", "Soak", "Location Effect", "Notes"]],
  ["Creature Attacks", 522850830, ["Attack ID", "Creature ID", "Variant ID", "Attack Name", "Attack %", "Damage", "Damage Type", "Range / Reach", "Source / Required Anatomy", "Requirements", "Uses / Recharge", "Special Effect", "Notes"]],
  ["Creature Skills", 669756046, ["Creature ID", "Variant ID", "Skill", "Rank", "Notes"]],
  ["Creature Abilities", 719770728, ["Ability ID", "Creature ID", "Variant ID", "Ability Name", "Ability Type", "Activation", "Requirements", "Uses / Recharge", "Description", "Mechanical Effect", "Notes"]],
  ["Creature Defenses", 1711482762, ["Creature ID", "Variant ID", "Defense Type", "Against", "Value", "Notes"]],
  ["Creature Uses", 1657984556, ["Creature ID", "Variant ID", "Use", "Notes"]],
  ["Creature Variants", 555226648, ["Variant ID", "Creature ID", "Variant Name", "Variant Type", "Size Override", "Challenge Rating Override", "Kill XP Override", "Description", "Notes"]],
  ["Creature IP Provenance", 2000000003, ["Creature ID", "Canonical Name", "Basis Category", "Source / Tradition", "Copyright / IP Note", "Review Status"]],
];

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/u, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The Google Sheet CSV ended inside a quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  while (rows.length && rows.at(-1).every((value) => value === "")) rows.pop();
  return rows;
}

async function fetchSnapshot() {
  const tabs = {};
  for (const [name, gid, expectedHeaders] of tabDefinitions) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`);
    if (!response.ok) throw new Error(`Could not read ${name}: HTTP ${response.status}.`);
    const rows = parseCsv(await response.text());
    const headers = rows.shift() ?? [];
    if (headers.join("\u0000") !== expectedHeaders.join("\u0000")) {
      throw new Error(`${name} headers changed. Expected ${expectedHeaders.join(" | ")}; received ${headers.join(" | ")}.`);
    }
    tabs[name] = {
      sheetId: gid,
      headers,
      rows: rows.map((values, index) => {
        if (values.length > headers.length && values.slice(headers.length).some(Boolean)) {
          throw new Error(`${name} row ${index + 2} has unexpected populated columns.`);
        }
        return headers.map((_, column) => values[column] === "" || values[column] === undefined ? null : values[column]);
      }),
    };
  }
  return { schemaVersion: 1, spreadsheetId, spreadsheetUrl, tabs };
}

function rows(snapshot, tabName) {
  const tab = snapshot.tabs[tabName];
  if (!tab) throw new Error(`Snapshot is missing ${tabName}.`);
  const expected = tabDefinitions.find(([name]) => name === tabName)?.[2] ?? [];
  if (tab.headers.join("\u0000") !== expected.join("\u0000")) {
    throw new Error(`${tabName} snapshot headers no longer match the import contract.`);
  }
  return tab.rows.map((values) =>
    Object.fromEntries(
      tab.headers.map((header, column) => [header, values[column] ?? null]),
    ),
  );
}

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function optionalText(value) {
  const result = text(value);
  return result === "" ? null : result;
}

function creatureNotes(value) {
  const result = text(value);
  return /proposed for review/iu.test(result) ? "" : result;
}

function number(value, label, { integer = false, optional = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (optional) return null;
    throw new Error(`${label} is required.`);
  }
  const result = Number(value);
  if (!Number.isFinite(result) || (integer && !Number.isInteger(result))) {
    throw new Error(`${label} must be ${integer ? "a whole number" : "numeric"}; received ${JSON.stringify(value)}.`);
  }
  return result;
}

function unique(rows_, field, label) {
  const values = new Set();
  for (const row of rows_) {
    const value = text(row[field]);
    if (!value) throw new Error(`${label} has a blank ${field}.`);
    const identity = value.toLocaleLowerCase("en-US");
    if (values.has(identity)) throw new Error(`${label} repeats ${field} ${JSON.stringify(value)}.`);
    values.add(identity);
  }
  return values;
}

function catalogCounts(creatures, challengeReference) {
  return {
    creatures: creatures.length,
    challengeRatings: challengeReference.length,
    attributes: creatures.reduce((sum, item) => sum + item.attributes.length, 0),
    movement: creatures.reduce((sum, item) => sum + item.movement.length, 0),
    hpPools: creatures.reduce((sum, item) => sum + item.hpPools.length, 0),
    hitLocations: creatures.reduce((sum, item) => sum + item.hitLocations.length, 0),
    attacks: creatures.reduce((sum, item) => sum + item.attacks.length, 0),
    skillLinks: creatures.reduce((sum, item) => sum + item.skillLinks.length, 0),
    abilities: creatures.reduce((sum, item) => sum + item.abilities.length, 0),
    defenses: creatures.reduce((sum, item) => sum + item.defenses.length, 0),
    uses: creatures.reduce((sum, item) => sum + item.uses.length, 0),
    variants: creatures.reduce((sum, item) => sum + item.variants.length, 0),
    provenance: creatures.filter((item) => item.provenance).length,
  };
}

function appendSupplementalCreatures(seed, supplement, canonicalSizes, { preserveHistoricalReviewNotes = false } = {}) {
  if (supplement.schemaVersion !== 1 || supplement.sourceSystem !== supplementSourceSystem || !Array.isArray(supplement.records)) {
    throw new Error("The local Creature supplement does not match the supported schema.");
  }
  const canonicalIds = new Set(seed.creatures.map((record) => record.core.canonicalId.toLocaleLowerCase("en-US")));
  const canonicalNames = new Set(seed.creatures.map((record) => record.core.canonicalName.toLocaleLowerCase("en-US")));
  const hpPoolIds = new Set(seed.creatures.flatMap((record) => record.hpPools).map((row) => row.canonicalId.toLocaleLowerCase("en-US")));
  const attackIds = new Set(seed.creatures.flatMap((record) => record.attacks).map((row) => row.canonicalId.toLocaleLowerCase("en-US")));
  const counters = {
    attributes: seed.counts.attributes,
    movement: seed.counts.movement,
    hpPools: seed.counts.hpPools,
    hitLocations: seed.counts.hitLocations,
    attacks: seed.counts.attacks,
    uses: seed.counts.uses,
  };
  const nextOrder = (key) => counters[key]++;
  const supplementalNote = (value, historicalValue = "") => preserveHistoricalReviewNotes
    ? (text(value) || historicalValue)
    : creatureNotes(value);
  const historicalCoreNotes = {
    "CR-CAT": "PROPOSED FOR REVIEW — locally authored Creature catalog addition using established Serrian Tide animal conventions.",
    "CR-FALCON": "PROPOSED FOR REVIEW — locally authored Creature catalog addition using established Serrian Tide raptor conventions.",
  };

  const supplementalRecords = supplement.records.map((definition, recordIndex) => {
    const core = definition.core ?? {};
    const canonicalId = text(core.canonicalId);
    const canonicalName = text(core.canonicalName);
    if (!canonicalId || canonicalIds.has(canonicalId.toLocaleLowerCase("en-US"))) throw new Error(`Creature supplement repeats or omits canonical ID ${JSON.stringify(canonicalId)}.`);
    if (!canonicalName || canonicalNames.has(canonicalName.toLocaleLowerCase("en-US"))) throw new Error(`Creature supplement repeats or omits canonical name ${JSON.stringify(canonicalName)}.`);
    canonicalIds.add(canonicalId.toLocaleLowerCase("en-US"));
    canonicalNames.add(canonicalName.toLocaleLowerCase("en-US"));
    if (!canonicalSizes.has(core.size)) throw new Error(`${canonicalId} uses non-canonical Size ${JSON.stringify(core.size)}.`);
    const challengeRating = number(core.challengeRating, `${canonicalId} Challenge Rating`, { integer: true, optional: false });
    const killXp = number(core.killXp, `${canonicalId} Kill XP`, { integer: true, optional: false });
    if (challengeRating < 1 || challengeRating > 50) throw new Error(`${canonicalId} Challenge Rating must be 1 through 50.`);
    if (killXp < 0) throw new Error(`${canonicalId} Kill XP cannot be negative.`);

    const attributeKeys = Object.keys(definition.attributes ?? {});
    if (attributeKeys.length !== creatureAttributeNames.length || creatureAttributeNames.some((key) => !attributeKeys.includes(key))) {
      throw new Error(`${canonicalId} must define exactly the six canonical Attributes.`);
    }
    const attributes = creatureAttributeNames.map((attributeKey) => ({
      variantCanonicalId: null,
      attributeKey,
      value: number(definition.attributes[attributeKey], `${canonicalId} ${attributeKey}`, { optional: false }),
      notes: supplementalNote("", attributeKey === "Strength" ? "PROPOSED FOR REVIEW — base/pre-Size Attribute value." : ""),
      sortOrder: nextOrder("attributes"),
    }));

    const movement = (definition.movement ?? []).map((row) => {
      if (!creatureMovementModes.has(row.movementMode)) throw new Error(`${canonicalId} uses unsupported movement mode ${JSON.stringify(row.movementMode)}.`);
      return {
        variantCanonicalId: null,
        movementMode: row.movementMode,
        movementValue: number(row.movementValue, `${canonicalId} ${row.movementMode} Movement`, { optional: false }),
        initiative: number(row.initiative, `${canonicalId} ${row.movementMode} Initiative`, { optional: false }),
        requirements: text(row.requirements), notes: supplementalNote(row.notes, "PROPOSED FOR REVIEW — base/pre-Size movement."), sortOrder: nextOrder("movement"),
      };
    });
    if (!movement.length) throw new Error(`${canonicalId} must define at least one movement mode.`);

    const profile = anatomyProfiles[definition.anatomyProfile];
    if (!profile) throw new Error(`${canonicalId} uses unsupported anatomy profile ${JSON.stringify(definition.anatomyProfile)}.`);
    const idStem = canonicalId.replace(/^CR-/u, "");
    const hpPools = profile.pools.map(([suffix, poolName, hpPercentage]) => {
      const poolId = `HP-${idStem}-${suffix}`;
      if (hpPoolIds.has(poolId.toLocaleLowerCase("en-US"))) throw new Error(`Creature supplement repeats HP Pool ID ${JSON.stringify(poolId)}.`);
      hpPoolIds.add(poolId.toLocaleLowerCase("en-US"));
      return { canonicalId: poolId, variantCanonicalId: null, poolName, hpPercentage, notes: "", sortOrder: nextOrder("hpPools") };
    });
    if (hpPools.reduce((sum, row) => sum + row.hpPercentage, 0) !== 100) throw new Error(`${canonicalId} HP Pools must total 100%.`);
    const hitLocations = profile.hits.map(([hitLocationNumber, locationName, bodyPartsIncluded, poolSuffix, locationEffect, notes]) => ({
      variantCanonicalId: null, hitLocationNumber, locationName, bodyPartsIncluded,
      hpPoolCanonicalId: `HP-${idStem}-${poolSuffix}`, naturalArmor: 0, soak: 0,
      locationEffect, notes: supplementalNote(notes), sortOrder: nextOrder("hitLocations"),
    }));
    if (hitLocations.length !== 10 || hitLocations.some((row, index) => row.hitLocationNumber !== index)) {
      throw new Error(`${canonicalId} anatomy profile must map each result from 0 through 9 exactly once.`);
    }

    const attacks = (definition.attacks ?? []).map((row) => {
      const attackId = text(row.canonicalId);
      if (!attackId || attackIds.has(attackId.toLocaleLowerCase("en-US"))) throw new Error(`Creature supplement repeats or omits Attack ID ${JSON.stringify(attackId)}.`);
      attackIds.add(attackId.toLocaleLowerCase("en-US"));
      return {
        canonicalId: attackId, variantCanonicalId: null, attackName: text(row.attackName),
        attackPercentage: number(row.attackPercentage, `${attackId} Attack %`, { optional: false }), damage: optionalText(row.damage),
        damageType: text(row.damageType), rangeReach: text(row.rangeReach), requiredAnatomy: text(row.requiredAnatomy),
        requirements: text(row.requirements), usesRecharge: text(row.usesRecharge), specialEffect: text(row.specialEffect),
        notes: supplementalNote(row.notes, "PROPOSED FOR REVIEW — calibrated from current CR guidance."), sortOrder: nextOrder("attacks"),
      };
    });
    const uses = (definition.uses ?? []).map((row) => {
      const sortOrder = nextOrder("uses");
      const useName = text(row.useName);
      if (!useName) throw new Error(`${canonicalId} has a blank Creature Use.`);
      return {
        seedIdentity: `use-${hash(`${canonicalId}\u0000\u0000${sortOrder}`)}`,
        variantCanonicalId: null, useName, notes: supplementalNote(row.notes), sortOrder,
      };
    });

    return {
      sortOrder: seed.creatures.length + recordIndex,
      core: {
        canonicalId, canonicalName, family: text(core.family), creatureType: text(core.creatureType), size: core.size,
        challengeRating, killXp, description: text(core.description), typicalBehavior: text(core.typicalBehavior),
        habitatEcology: text(core.habitatEcology), notes: supplementalNote(core.notes, historicalCoreNotes[canonicalId] ?? ""),
      },
      attributes, movement, hpPools, hitLocations, attacks, skillLinks: [], abilities: [], defenses: [], uses, variants: [], provenance: null,
    };
  });
  const creatures = [...seed.creatures, ...supplementalRecords];
  return { seed: { ...seed, creatures, counts: catalogCounts(creatures, seed.challengeReference) }, supplementalRecords };
}

function parseSkillCatalog(source) {
  const names = new Map();
  const lines = source.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trimEnd().split("\n");
  const headers = lines.shift()?.split("\t") ?? [];
  const nameIndex = headers.indexOf("Skill Name");
  if (nameIndex < 0) throw new Error("The canonical Skill TSV has no Skill Name column.");
  for (const line of lines) {
    const name = line.split("\t")[nameIndex]?.trim();
    if (!name) continue;
    const identity = name.toLocaleLowerCase("en-US");
    if (names.has(identity)) throw new Error(`Canonical Skill name ${JSON.stringify(name)} is duplicated.`);
    names.set(identity, {
      name,
      sourceExternalId: `skill-${hash(identity)}`,
    });
  }
  return names;
}

function variantReference(row) {
  return optionalText(row["Variant ID"]);
}

function buildSeed(snapshot, canonicalSizes, skills) {
  const source = Object.fromEntries(tabDefinitions.map(([name]) => [name, rows(snapshot, name)]));
  const creatureIds = unique(source.Creatures, "Creature ID", "Creatures");
  unique(source.Creatures, "Canonical Name", "Creatures");
  const variantIds = unique(source["Creature Variants"], "Variant ID", "Creature Variants");
  const poolIds = unique(source["Creature HP Pools"], "HP Pool ID", "Creature HP Pools");
  unique(source["Creature Attacks"], "Attack ID", "Creature Attacks");
  unique(source["Creature Abilities"], "Ability ID", "Creature Abilities");

  const variantById = new Map(source["Creature Variants"].map((row) => [text(row["Variant ID"]).toLocaleLowerCase("en-US"), row]));
  const poolById = new Map(source["Creature HP Pools"].map((row) => [text(row["HP Pool ID"]).toLocaleLowerCase("en-US"), row]));
  const childTabs = ["Creature Attributes", "Creature Movement", "Creature HP Pools", "Creature Hit Locations", "Creature Attacks", "Creature Skills", "Creature Abilities", "Creature Defenses", "Creature Uses", "Creature Variants", "Creature IP Provenance"];
  for (const tabName of childTabs) {
    for (const [index, row] of source[tabName].entries()) {
      const creatureId = text(row["Creature ID"]);
      if (!creatureIds.has(creatureId.toLocaleLowerCase("en-US"))) {
        throw new Error(`${tabName} row ${index + 2} references missing Creature ${JSON.stringify(creatureId)}.`);
      }
      const variantId = variantReference(row);
      if (variantId) {
        const variant = variantById.get(variantId.toLocaleLowerCase("en-US"));
        if (!variant) throw new Error(`${tabName} row ${index + 2} references missing Variant ${JSON.stringify(variantId)}.`);
        if (text(variant["Creature ID"]).toLocaleLowerCase("en-US") !== creatureId.toLocaleLowerCase("en-US")) {
          throw new Error(`${tabName} row ${index + 2} references a Variant belonging to another Creature.`);
        }
      }
    }
  }

  const challengeReference = source["Challenge Rating Reference"].map((row) => ({
    challengeRating: number(row.CR, "Challenge Rating Reference CR", { integer: true, optional: false }),
    threatBand: text(row["Threat Band"]),
    attackTargetGuidance: text(row["Attack Target % Guidance"]),
    damageGuidance: text(row["Damage Guidance"]),
    initiativeGuidance: text(row["Initiative Guidance"]),
    soakGuidance: text(row["Soak Guidance"]),
    hpToughnessGuidance: text(row["HP Toughness Guidance"]),
    killXp: number(row["Kill XP"], `CR ${row.CR} Kill XP`, { integer: true }),
    currentCreatureExample: text(row["Current Creature Example"]),
    exampleNotes: text(row["Example Notes"]),
  }));
  if (challengeReference.length !== 50 || challengeReference.some((row, index) => row.challengeRating !== index + 1)) {
    throw new Error("Challenge Rating Reference must contain each whole-number CR from 1 through 50 exactly once and in order.");
  }

  const group = (tabName) => {
    const grouped = new Map();
    for (const [sortOrder, row] of source[tabName].entries()) {
      const key = text(row["Creature ID"]).toLocaleLowerCase("en-US");
      grouped.set(key, [...(grouped.get(key) ?? []), { row, sortOrder }]);
    }
    return grouped;
  };
  const grouped = Object.fromEntries(childTabs.map((name) => [name, group(name)]));
  const attributeNames = new Set(creatureAttributeNames);

  const creatures = source.Creatures.map((coreRow, creatureSortOrder) => {
    const canonicalId = text(coreRow["Creature ID"]);
    const key = canonicalId.toLocaleLowerCase("en-US");
    const size = text(coreRow.Size);
    if (!canonicalSizes.has(size)) throw new Error(`${canonicalId} uses non-canonical Size ${JSON.stringify(size)}.`);
    const challengeRating = number(coreRow["Challenge Rating"], `${canonicalId} Challenge Rating`, { integer: true, optional: false });
    if (challengeRating < 1 || challengeRating > 50) throw new Error(`${canonicalId} Challenge Rating must be 1 through 50.`);
    const mapRows = (name, mapper) => (grouped[name].get(key) ?? []).map(({ row, sortOrder }) => mapper(row, sortOrder));
    const attributes = mapRows("Creature Attributes", (row, sortOrder) => {
      const attributeKey = text(row.Attribute);
      if (!attributeNames.has(attributeKey)) throw new Error(`${canonicalId} has unsupported Attribute ${JSON.stringify(attributeKey)}.`);
      return { variantCanonicalId: variantReference(row), attributeKey, value: number(row.Value, `${canonicalId} ${attributeKey}`), notes: creatureNotes(row.Notes), sortOrder };
    });
    const movement = mapRows("Creature Movement", (row, sortOrder) => ({
      variantCanonicalId: variantReference(row), movementMode: text(row["Movement Mode"]),
      movementValue: number(row["Movement Value"], `${canonicalId} Movement Value`),
      initiative: number(row.Initiative, `${canonicalId} Initiative`), requirements: text(row.Requirements), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const hpPools = mapRows("Creature HP Pools", (row, sortOrder) => ({
      canonicalId: text(row["HP Pool ID"]), variantCanonicalId: variantReference(row), poolName: text(row["Pool Name"]),
      hpPercentage: number(row["HP %"], `${canonicalId} HP %`), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const hitLocations = mapRows("Creature Hit Locations", (row, sortOrder) => {
      const hitLocationNumber = number(row["Hit Location #"], `${canonicalId} Hit Location #`, { integer: true, optional: false });
      if (hitLocationNumber < 0 || hitLocationNumber > 9) throw new Error(`${canonicalId} Hit Location # must be 0 through 9.`);
      const hpPoolCanonicalId = optionalText(row["HP Pool ID"]);
      if (hpPoolCanonicalId) {
        const pool = poolById.get(hpPoolCanonicalId.toLocaleLowerCase("en-US"));
        if (!pool || text(pool["Creature ID"]).toLocaleLowerCase("en-US") !== key) {
          throw new Error(`${canonicalId} Hit Location ${hitLocationNumber} references an invalid HP Pool.`);
        }
        if ((variantReference(pool) ?? "").toLocaleLowerCase("en-US") !== (variantReference(row) ?? "").toLocaleLowerCase("en-US")) {
          throw new Error(`${canonicalId} Hit Location ${hitLocationNumber} and its HP Pool disagree on Variant ID.`);
        }
      }
      return {
        variantCanonicalId: variantReference(row), hitLocationNumber, locationName: text(row["Location Name"]),
        bodyPartsIncluded: text(row["Body Parts Included"]), hpPoolCanonicalId,
        naturalArmor: number(row["Natural Armor"], `${canonicalId} Natural Armor`), soak: number(row.Soak, `${canonicalId} Soak`),
        locationEffect: text(row["Location Effect"]), notes: creatureNotes(row.Notes), sortOrder,
      };
    });
    const attacks = mapRows("Creature Attacks", (row, sortOrder) => ({
      canonicalId: text(row["Attack ID"]), variantCanonicalId: variantReference(row), attackName: text(row["Attack Name"]),
      attackPercentage: number(row["Attack %"], `${canonicalId} Attack %`), damage: optionalText(row.Damage), damageType: text(row["Damage Type"]),
      rangeReach: text(row["Range / Reach"]), requiredAnatomy: text(row["Source / Required Anatomy"]), requirements: text(row.Requirements),
      usesRecharge: text(row["Uses / Recharge"]), specialEffect: text(row["Special Effect"]), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const skillLinks = mapRows("Creature Skills", (row, sortOrder) => {
      const sourceSkillName = text(row.Skill);
      const skill = skills.get(sourceSkillName.toLocaleLowerCase("en-US"));
      if (!skill) throw new Error(`${canonicalId} references missing canonical Skill ${JSON.stringify(sourceSkillName)}.`);
      return { variantCanonicalId: variantReference(row), skillExternalId: skill.sourceExternalId, skillName: skill.name, rank: optionalText(row.Rank), notes: creatureNotes(row.Notes), sortOrder };
    });
    const abilities = mapRows("Creature Abilities", (row, sortOrder) => ({
      canonicalId: text(row["Ability ID"]), variantCanonicalId: variantReference(row), abilityName: text(row["Ability Name"]), abilityType: text(row["Ability Type"]),
      activation: text(row.Activation), requirements: text(row.Requirements), usesRecharge: text(row["Uses / Recharge"]), description: text(row.Description),
      mechanicalEffect: text(row["Mechanical Effect"]), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const defenses = mapRows("Creature Defenses", (row, sortOrder) => ({
      seedIdentity: `defense-${hash(`${canonicalId}\u0000${variantReference(row) ?? ""}\u0000${sortOrder}`)}`,
      variantCanonicalId: variantReference(row), defenseType: text(row["Defense Type"]), against: text(row.Against), value: optionalText(row.Value), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const uses = mapRows("Creature Uses", (row, sortOrder) => ({
      seedIdentity: `use-${hash(`${canonicalId}\u0000${variantReference(row) ?? ""}\u0000${sortOrder}`)}`,
      variantCanonicalId: variantReference(row), useName: text(row.Use), notes: creatureNotes(row.Notes), sortOrder,
    }));
    const variants = mapRows("Creature Variants", (row, sortOrder) => {
      const sizeOverride = optionalText(row["Size Override"]);
      if (sizeOverride && !canonicalSizes.has(sizeOverride)) throw new Error(`${row["Variant ID"]} uses non-canonical Size ${JSON.stringify(sizeOverride)}.`);
      const crOverride = number(row["Challenge Rating Override"], `${row["Variant ID"]} CR Override`, { integer: true });
      if (crOverride !== null && (crOverride < 1 || crOverride > 50)) throw new Error(`${row["Variant ID"]} CR Override must be 1 through 50.`);
      return { canonicalId: text(row["Variant ID"]), variantName: text(row["Variant Name"]), variantType: text(row["Variant Type"]), sizeOverride,
        challengeRatingOverride: crOverride, killXpOverride: number(row["Kill XP Override"], `${row["Variant ID"]} Kill XP Override`, { integer: true }),
        description: text(row.Description), notes: creatureNotes(row.Notes), sortOrder };
    });
    const provenanceRows = mapRows("Creature IP Provenance", (row) => ({ canonicalName: text(row["Canonical Name"]), basisCategory: text(row["Basis Category"]), sourceTradition: text(row["Source / Tradition"]), copyrightIpNote: text(row["Copyright / IP Note"]), reviewStatus: text(row["Review Status"]) }));
    if (provenanceRows.length !== 1) throw new Error(`${canonicalId} must have exactly one IP Provenance row.`);
    return {
      sortOrder: creatureSortOrder,
      core: { canonicalId, canonicalName: text(coreRow["Canonical Name"]), family: text(coreRow.Family), creatureType: text(coreRow["Creature Type"]), size,
        challengeRating, killXp: number(coreRow["Kill XP"], `${canonicalId} Kill XP`, { integer: true, optional: false }), description: text(coreRow.Description),
        typicalBehavior: text(coreRow["Typical Behavior"]), habitatEcology: text(coreRow["Habitat / Ecology"]), notes: creatureNotes(coreRow.Notes) },
      attributes, movement, hpPools, hitLocations, attacks, skillLinks, abilities, defenses, uses, variants, provenance: provenanceRows[0],
    };
  });

  const counts = catalogCounts(creatures, challengeReference);
  return { schemaVersion: 1, sourceSystem, spreadsheetId, spreadsheetUrl, counts, challengeReference, creatures };
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, columns, values, { ignore = true } = {}) {
  return `INSERT ${ignore ? "OR IGNORE " : ""}INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sql).join(", ")});`;
}

function creatureId(canonicalId) {
  return `(SELECT id FROM creatures WHERE canonical_id = ${sql(canonicalId)} COLLATE NOCASE)`;
}

function variantId(canonicalId) {
  return canonicalId === null ? "NULL" : `(SELECT id FROM creature_variants WHERE canonical_id = ${sql(canonicalId)} COLLATE NOCASE)`;
}

function serializeMigration(seed, sourceSha256, sizeScaleSha256, { sourceLabel = "Creature workbook snapshot", warning = "Do not hand-edit; refresh the repository snapshot deliberately, review the report, and regenerate." } = {}) {
  const statements = [
    "-- Generated by scripts/generate-creature-seed.mjs.",
    `-- ${sourceLabel} SHA-256: ${sourceSha256}`,
    `-- Shared Size scale SHA-256: ${sizeScaleSha256}`,
    `-- ${warning}`,
    "",
    "PRAGMA foreign_keys = ON;",
    "",
  ];
  for (const row of seed.challengeReference) {
    statements.push(insert("challenge_rating_reference", ["challenge_rating", "threat_band", "attack_target_guidance", "damage_guidance", "initiative_guidance", "soak_guidance", "hp_toughness_guidance", "kill_xp", "current_creature_example", "example_notes"], [row.challengeRating, row.threatBand, row.attackTargetGuidance, row.damageGuidance, row.initiativeGuidance, row.soakGuidance, row.hpToughnessGuidance, row.killXp, row.currentCreatureExample, row.exampleNotes]));
  }
  statements.push("");
  for (const record of seed.creatures) {
    const core = record.core;
    statements.push(insert("creatures", ["canonical_id", "canonical_name", "family", "creature_type", "size", "challenge_rating", "kill_xp", "description", "typical_behavior", "habitat_ecology", "notes", "source_system"], [core.canonicalId, core.canonicalName, core.family, core.creatureType, core.size, core.challengeRating, core.killXp, core.description, core.typicalBehavior, core.habitatEcology, core.notes, sourceSystem]));
  }
  statements.push("");
  for (const record of seed.creatures) {
    for (const row of record.variants) statements.push(`INSERT OR IGNORE INTO creature_variants (canonical_id, creature_id, variant_name, variant_type, size_override, challenge_rating_override, kill_xp_override, description, notes, sort_order) VALUES (${sql(row.canonicalId)}, ${creatureId(record.core.canonicalId)}, ${sql(row.variantName)}, ${sql(row.variantType)}, ${sql(row.sizeOverride)}, ${sql(row.challengeRatingOverride)}, ${sql(row.killXpOverride)}, ${sql(row.description)}, ${sql(row.notes)}, ${row.sortOrder});`);
  }
  statements.push("");
  for (const record of seed.creatures) {
    const cid = creatureId(record.core.canonicalId);
    for (const row of record.attributes) statements.push(`INSERT OR IGNORE INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order) VALUES (${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.attributeKey)}, ${sql(row.value)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.movement) statements.push(`INSERT OR IGNORE INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order) VALUES (${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.movementMode)}, ${sql(row.movementValue)}, ${sql(row.initiative)}, ${sql(row.requirements)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.hpPools) statements.push(`INSERT OR IGNORE INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order) VALUES (${sql(row.canonicalId)}, ${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.poolName)}, ${sql(row.hpPercentage)}, ${sql(row.notes)}, ${row.sortOrder});`);
  }
  statements.push("");
  for (const record of seed.creatures) {
    const cid = creatureId(record.core.canonicalId);
    for (const row of record.hitLocations) {
      const pool = row.hpPoolCanonicalId === null ? "NULL" : `(SELECT id FROM creature_hp_pools WHERE canonical_id = ${sql(row.hpPoolCanonicalId)} COLLATE NOCASE)`;
      statements.push(`INSERT OR IGNORE INTO creature_hit_locations (creature_id, variant_id, hit_location_number, location_name, body_parts_included, hp_pool_id, natural_armor, soak, location_effect, notes, sort_order) VALUES (${cid}, ${variantId(row.variantCanonicalId)}, ${row.hitLocationNumber}, ${sql(row.locationName)}, ${sql(row.bodyPartsIncluded)}, ${pool}, ${sql(row.naturalArmor)}, ${sql(row.soak)}, ${sql(row.locationEffect)}, ${sql(row.notes)}, ${row.sortOrder});`);
    }
    for (const row of record.attacks) statements.push(`INSERT OR IGNORE INTO creature_attacks (canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy, requirements, uses_recharge, special_effect, notes, sort_order) VALUES (${sql(row.canonicalId)}, ${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.attackName)}, ${sql(row.attackPercentage)}, ${sql(row.damage)}, ${sql(row.damageType)}, ${sql(row.rangeReach)}, ${sql(row.requiredAnatomy)}, ${sql(row.requirements)}, ${sql(row.usesRecharge)}, ${sql(row.specialEffect)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.skillLinks) statements.push(`INSERT OR IGNORE INTO creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order) VALUES (${cid}, ${variantId(row.variantCanonicalId)}, (SELECT id FROM skills WHERE source_system = 'serrian-tide-core' AND source_external_id = ${sql(row.skillExternalId)}), ${sql(row.rank)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.abilities) statements.push(`INSERT OR IGNORE INTO creature_abilities (canonical_id, creature_id, variant_id, ability_name, ability_type, activation, requirements, uses_recharge, description, mechanical_effect, notes, sort_order) VALUES (${sql(row.canonicalId)}, ${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.abilityName)}, ${sql(row.abilityType)}, ${sql(row.activation)}, ${sql(row.requirements)}, ${sql(row.usesRecharge)}, ${sql(row.description)}, ${sql(row.mechanicalEffect)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.defenses) statements.push(`INSERT OR IGNORE INTO creature_defenses (seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order) VALUES (${sql(row.seedIdentity)}, ${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.defenseType)}, ${sql(row.against)}, ${sql(row.value)}, ${sql(row.notes)}, ${row.sortOrder});`);
    for (const row of record.uses) statements.push(`INSERT OR IGNORE INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order) VALUES (${sql(row.seedIdentity)}, ${cid}, ${variantId(row.variantCanonicalId)}, ${sql(row.useName)}, ${sql(row.notes)}, ${row.sortOrder});`);
    const row = record.provenance;
    if (row) statements.push(`INSERT OR IGNORE INTO creature_ip_provenance (creature_id, canonical_name, basis_category, source_tradition, copyright_ip_note, review_status) VALUES (${cid}, ${sql(row.canonicalName)}, ${sql(row.basisCategory)}, ${sql(row.sourceTradition)}, ${sql(row.copyrightIpNote)}, ${sql(row.reviewStatus)});`);
  }
  return `${statements.join("\n")}\n`;
}

const [sizeScaleText, skillCatalogText, supplementText] = await Promise.all([
  readFile(sizeScalePath, "utf8"), readFile(skillCatalogPath, "utf8"), readFile(supplementPath, "utf8"),
]);
const sizeScale = JSON.parse(sizeScaleText);
const orderedSizes = Object.entries(sizeScale).sort((left, right) => left[1] - right[1]);
if (orderedSizes.some(([, order], index) => order !== index)) throw new Error("The shared Size scale must be consecutively ordered from zero.");
const canonicalSizes = new Set(orderedSizes.map(([name]) => name));
const snapshot = refreshSource ? await fetchSnapshot() : JSON.parse(await readFile(snapshotPath, "utf8"));
const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
const sourceSha256 = hash(snapshotText);
const supplement = JSON.parse(supplementText);
const supplementSha256 = hash(`${JSON.stringify(supplement, null, 2)}\n`);
const sizeScaleSha256 = hash(sizeScaleText);
const baseSeed = buildSeed(snapshot, canonicalSizes, parseSkillCatalog(skillCatalogText));
const { seed, supplementalRecords } = appendSupplementalCreatures(baseSeed, supplement, canonicalSizes);
const { supplementalRecords: historicalSupplementalRecords } = appendSupplementalCreatures(
  baseSeed,
  supplement,
  canonicalSizes,
  { preserveHistoricalReviewNotes: true },
);
seed.sourceSha256 = sourceSha256;
seed.supplementSha256 = supplementSha256;
seed.sizeScaleSha256 = sizeScaleSha256;

const everyRecord = seed.creatures.flatMap((record) => [record.core, ...record.attributes, ...record.movement, ...record.hpPools, ...record.hitLocations, ...record.attacks, ...record.skillLinks, ...record.abilities, ...record.defenses, ...record.uses, ...record.variants, record.provenance]).filter(Boolean);
const report = {
  schemaVersion: 1,
  sourceSystem,
  spreadsheetId,
  spreadsheetUrl,
  supplementSourceSystem,
  supplementFile: "data/serrian-tide-creature-supplements.json",
  sourceSha256,
  supplementSha256,
  sizeScaleSha256,
  counts: seed.counts,
  validation: {
    duplicateCanonicalIds: 0,
    orphanCreatureReferences: 0,
    orphanVariantReferences: 0,
    orphanHpPoolReferences: 0,
    unresolvedSkillReferences: 0,
  },
  nullZeroAudit: {
    movementValue: { null: seed.creatures.flatMap((row) => row.movement).filter((row) => row.movementValue === null).length, zero: seed.creatures.flatMap((row) => row.movement).filter((row) => row.movementValue === 0).length },
    movementInitiative: { null: seed.creatures.flatMap((row) => row.movement).filter((row) => row.initiative === null).length, zero: seed.creatures.flatMap((row) => row.movement).filter((row) => row.initiative === 0).length },
    naturalArmor: { null: seed.creatures.flatMap((row) => row.hitLocations).filter((row) => row.naturalArmor === null).length, zero: seed.creatures.flatMap((row) => row.hitLocations).filter((row) => row.naturalArmor === 0).length },
    soak: { null: seed.creatures.flatMap((row) => row.hitLocations).filter((row) => row.soak === null).length, zero: seed.creatures.flatMap((row) => row.hitLocations).filter((row) => row.soak === 0).length },
    attackDamage: { null: seed.creatures.flatMap((row) => row.attacks).filter((row) => row.damage === null).length },
    defenseValue: { null: seed.creatures.flatMap((row) => row.defenses).filter((row) => row.value === null).length },
  },
  reviewMarkerCount: everyRecord.filter((row) => Object.values(row).some((value) => typeof value === "string" && /proposed for review/iu.test(value))).length,
};

await Promise.all([
  ...(refreshSource ? [writeFile(snapshotPath, snapshotText, "utf8")] : []),
  writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ...(createSupplementMigration
    ? [writeFile(supplementMigrationPath, serializeMigration(
      { challengeReference: [], creatures: historicalSupplementalRecords },
      initialSupplementSha256,
      sizeScaleSha256,
      {
        sourceLabel: "Approved Creature supplement",
        warning: "Do not hand-edit; update data/serrian-tide-creature-supplements.json and regenerate.",
      },
    ), "utf8")]
    : []),
  ...(createInitialMigration
    ? [writeFile(migrationPath, serializeMigration(seed, sourceSha256, sizeScaleSha256), "utf8")]
    : []),
]);

process.stdout.write(`Prepared ${seed.counts.creatures} Creatures, ${seed.counts.challengeRatings} CR references, ${seed.counts.hitLocations} hit locations, and ${seed.counts.attacks} attacks with ${report.validation.unresolvedSkillReferences} unresolved Skill references.${createInitialMigration ? " Initial migration 0008 was regenerated." : " Applied migration 0008 was not rewritten."}${createSupplementMigration ? " Supplement migration 0010 was regenerated in its original form." : " Applied migration 0010 was not rewritten."}\n`);
