import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(projectDirectory, "data", "serrian-tide-item-sheet.json");
const seedPath = path.join(projectDirectory, "data", "serrian-tide-item-seed.json");
const reportPath = path.join(projectDirectory, "data", "serrian-tide-item-import-report.json");
const migrationPath = path.join(projectDirectory, "src-tauri", "migrations", "0014_seed_item_catalog.sql");
const creatureSeedPath = path.join(projectDirectory, "data", "serrian-tide-creature-seed.json");
const refreshSource = process.argv.includes("--refresh-source");
const createInitialMigration = process.argv.includes("--create-initial-migration");

const spreadsheetId = "1dGEJSExi2Sw2AWWcvWop6PCUzjnSnZ96_nwu_TaEnN0";
const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
const expectedCounts = {
  items: 1007,
  equipment: 494,
  inventory: 513,
  weaponProfiles: 221,
  armorProfiles: 47,
  properties: 252,
  tags: 8,
  tagLinks: 1242,
  armorLocations: 204,
  armorDamageModifiers: 128,
  rules: 16,
};

const tabDefinitions = [
  ["README", 1900000001, "A1:J100", null],
  ["Schema", 1900000002, "A1:J150", ["Source_Sheet", "Source_Column", "SQLite_Table", "SQLite_Column", "SQLite_Type", "Required", "Key_or_Relationship", "Notes"]],
  ["Catalog", 1361315280, "A1:Z1008", ["Item_ID", "Name", "Window", "Record_Type", "Family", "Category", "Subtype", "Description", "Weight", "Weight_Unit", "Size", "Durability", "Credits", "Price_Basis", "Tags", "Parent_Item_ID", "Source_System", "Source_External_ID"]],
  ["Weapons", 1612730127, "A1:Z1000", ["Item_ID", "Name", "Record_Type", "Weapon_Type", "Handedness", "Damage_Source", "Damage", "Damage_Type", "Range", "Reach", "Ammunition_ID", "Compatibility", "Capacity", "Fire_Modes", "Rate_of_Fire", "Reload_Initiative", "Rules_Text"]],
  ["Armor", 918782075, "A1:Z1000", ["Item_ID", "Name", "Armor_Type", "Coverage", "Base_Soak", "Damage_Modifiers", "Body_Shot_Bob_Locations", "Rules_Text"]],
  ["Properties", 839870984, "A1:Z1000", ["Item_ID", "Name", "Property", "Value", "Unit", "Related_ID", "Quantity", "Notes"]],
  ["Tags", 1484080691, "A1:Z1000", ["Tag_ID", "Tag_Name", "Tag_Group", "Description"]],
  ["Rules", 1351961577, "A1:Z1000", ["Rule_ID", "Rule_Name", "Rule", "Implementation_Guidance", "Status"]],
  ["Item_Tags", 1900000003, "A1:F2000", ["Item_ID", "Tag_Name", "Tag_ID"]],
  ["Armor_Locations", 1900000004, "A1:E500", ["Item_ID", "Location_Name"]],
  ["Armor_Damage_Modifiers", 1900000007, "A1:F500", ["Item_ID", "Modifier_Text", "Damage_Type", "Modifier", "Notes"]],
  ["Reference", 1900000005, "A1:F100", ["Reference_Type", "Value", "Code", "Sort_Order", "Notes"]],
  ["Audit", 1900000006, "A1:F100", ["Check", "Expected", "Actual", "Status", "Notes"]],
];

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function optionalText(value) {
  const result = text(value);
  return result || null;
}

function number(value, label) {
  if (value === null || value === undefined || text(value) === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} must be numeric; received ${JSON.stringify(value)}.`);
  return result;
}

function rows(snapshot, tabName) {
  const definition = tabDefinitions.find(([name]) => name === tabName);
  const tab = snapshot.tabs?.[tabName];
  if (!definition || !tab) throw new Error(`Snapshot is missing ${tabName}.`);
  if (tab.sheetId !== definition[1]) throw new Error(`${tabName} sheet identity changed; expected sheetId ${definition[1]}.`);
  const expectedHeaders = definition[3];
  if (!expectedHeaders) return tab.values;
  const [headers = [], ...sourceRows] = tab.values;
  if (headers.join("\u0000") !== expectedHeaders.join("\u0000")) {
    throw new Error(`${tabName} headers changed. Expected ${expectedHeaders.join(" | ")}; received ${headers.join(" | ")}.`);
  }
  return sourceRows
    .filter((values) => values.some((value) => text(value) !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null])));
}

function unique(records, field, label) {
  const values = new Set();
  for (const record of records) {
    const value = text(record[field]);
    if (!value) throw new Error(`${label} has a blank ${field}.`);
    const identity = value.toLocaleLowerCase("en-US");
    if (values.has(identity)) throw new Error(`${label} repeats ${field} ${JSON.stringify(value)}.`);
    values.add(identity);
  }
  return values;
}

function expectCount(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label} expected ${expected} rows but found ${actual}.`);
}

function splitTags(value) {
  return text(value).split(";").map((entry) => entry.trim()).filter(Boolean);
}

function splitFireModes(value) {
  return text(value).split(";").map((entry) => entry.trim()).filter(Boolean);
}

function nextSortOrder(counter, key) {
  const value = counter.get(key) ?? 0;
  counter.set(key, value + 1);
  return value;
}

function equipmentGroup(record) {
  if (record.Window === "Inventory") return null;
  if (record.Record_Type === "Weapon") return "weapon";
  if (record.Record_Type === "Armor") return "armor";
  return "general";
}

async function fetchSnapshot() {
  const accessToken = process.env.ITEM_SHEET_GOOGLE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Refreshing the private Item workbook requires ITEM_SHEET_GOOGLE_ACCESS_TOKEN. The checked-in snapshot remains usable without network access.");
  }
  const metadataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)&includeGridData=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metadataResponse.ok) throw new Error(`Could not read Item workbook metadata: HTTP ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json();
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  for (const [name, , range] of tabDefinitions) params.append("ranges", `'${name}'!${range}`);
  const valuesResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!valuesResponse.ok) throw new Error(`Could not read Item workbook values: HTTP ${valuesResponse.status}.`);
  const valueRanges = (await valuesResponse.json()).valueRanges ?? [];
  const tabs = {};
  for (let index = 0; index < tabDefinitions.length; index += 1) {
    const [name, expectedSheetId] = tabDefinitions[index];
    const metadataSheet = metadata.sheets?.find((sheet) => sheet.properties?.title === name);
    if (!metadataSheet || metadataSheet.properties.sheetId !== expectedSheetId) {
      throw new Error(`${name} sheet identity changed; expected sheetId ${expectedSheetId}.`);
    }
    tabs[name] = { sheetId: expectedSheetId, values: valueRanges[index]?.values ?? [] };
  }
  return {
    schemaVersion: 1,
    spreadsheetId,
    spreadsheetUrl,
    spreadsheetTitle: metadata.properties?.title ?? "Items Spreadsheet Mk3",
    sourceModifiedTime: null,
    capturedAt: new Date().toISOString(),
    tabs,
  };
}

async function readCreatureIds() {
  const seed = JSON.parse(await readFile(creatureSeedPath, "utf8"));
  return new Set(seed.creatures.map((creature) => creature.core.canonicalId.toLocaleLowerCase("en-US")));
}

async function buildSeed(snapshot) {
  if (snapshot.schemaVersion !== 1 || snapshot.spreadsheetId !== spreadsheetId) {
    throw new Error("The Item snapshot does not match the supported canonical workbook.");
  }
  const catalog = rows(snapshot, "Catalog");
  const weapons = rows(snapshot, "Weapons");
  const armor = rows(snapshot, "Armor");
  const properties = rows(snapshot, "Properties");
  const tags = rows(snapshot, "Tags");
  const itemTags = rows(snapshot, "Item_Tags");
  const armorLocations = rows(snapshot, "Armor_Locations");
  const armorModifiers = rows(snapshot, "Armor_Damage_Modifiers");
  const rules = rows(snapshot, "Rules");
  const reference = rows(snapshot, "Reference");
  const audit = rows(snapshot, "Audit");

  expectCount("Catalog", catalog.length, expectedCounts.items);
  expectCount("Equipment", catalog.filter((row) => row.Window === "Equipment").length, expectedCounts.equipment);
  expectCount("Inventory", catalog.filter((row) => row.Window === "Inventory").length, expectedCounts.inventory);
  expectCount("Weapons", weapons.length, expectedCounts.weaponProfiles);
  expectCount("Armor", armor.length, expectedCounts.armorProfiles);
  expectCount("Properties", properties.length, expectedCounts.properties);
  expectCount("Tags", tags.length, expectedCounts.tags);
  expectCount("Item_Tags", itemTags.length, expectedCounts.tagLinks);
  expectCount("Armor_Locations", armorLocations.length, expectedCounts.armorLocations);
  expectCount("Armor_Damage_Modifiers", armorModifiers.length, expectedCounts.armorDamageModifiers);
  expectCount("Rules", rules.length, expectedCounts.rules);

  const itemIds = unique(catalog, "Item_ID", "Catalog");
  unique(catalog, "Name", "Catalog");
  const tagIds = unique(tags, "Tag_ID", "Tags");
  unique(tags, "Tag_Name", "Tags");
  unique(rules, "Rule_ID", "Rules");
  const catalogById = new Map(catalog.map((record) => [record.Item_ID, record]));
  const tagsById = new Map(tags.map((record) => [record.Tag_ID, record]));
  const weaponById = new Map();
  const armorById = new Map();
  for (const record of catalog) {
    if (!["Equipment", "Inventory"].includes(record.Window)) throw new Error(`${record.Item_ID} has unsupported Window ${JSON.stringify(record.Window)}.`);
    for (const field of ["Name", "Record_Type", "Family", "Category", "Price_Basis", "Source_System", "Source_External_ID"]) {
      if (!text(record[field])) throw new Error(`${record.Item_ID} has a blank required ${field}.`);
    }
    const hasWeight = text(record.Weight) !== "";
    const hasWeightUnit = text(record.Weight_Unit) !== "";
    if (hasWeight !== hasWeightUnit) throw new Error(`${record.Item_ID} must provide Weight and Weight_Unit together.`);
    for (const field of ["Weight", "Durability", "Credits"]) {
      const value = number(record[field], `${record.Item_ID} ${field}`);
      if (value !== null && value < 0) throw new Error(`${record.Item_ID} ${field} cannot be negative.`);
    }
    if (record.Parent_Item_ID && !itemIds.has(record.Parent_Item_ID.toLocaleLowerCase("en-US"))) throw new Error(`${record.Item_ID} has missing parent ${record.Parent_Item_ID}.`);
  }
  for (const record of weapons) {
    if (!itemIds.has(record.Item_ID.toLocaleLowerCase("en-US"))) throw new Error(`Weapons references missing Item ${record.Item_ID}.`);
    if (weaponById.has(record.Item_ID)) throw new Error(`Weapons repeats Item ${record.Item_ID}.`);
    if (record.Ammunition_ID && !itemIds.has(record.Ammunition_ID.toLocaleLowerCase("en-US"))) throw new Error(`${record.Item_ID} references missing Ammunition ${record.Ammunition_ID}.`);
    weaponById.set(record.Item_ID, record);
  }
  for (const record of armor) {
    if (!itemIds.has(record.Item_ID.toLocaleLowerCase("en-US"))) throw new Error(`Armor references missing Item ${record.Item_ID}.`);
    if (armorById.has(record.Item_ID)) throw new Error(`Armor repeats Item ${record.Item_ID}.`);
    armorById.set(record.Item_ID, record);
  }
  const creatureIds = await readCreatureIds();
  for (const record of properties) {
    if (!itemIds.has(record.Item_ID.toLocaleLowerCase("en-US"))) throw new Error(`Properties references missing Item ${record.Item_ID}.`);
    const related = text(record.Related_ID);
    if (/^(ITEM|OFFER)-/u.test(related) && !itemIds.has(related.toLocaleLowerCase("en-US"))) throw new Error(`${record.Item_ID} Property references missing Item ${related}.`);
    if (/^CR-/u.test(related) && !creatureIds.has(related.toLocaleLowerCase("en-US"))) throw new Error(`${record.Item_ID} Property references missing Creature ${related}.`);
    if (related && !/^(ITEM|OFFER|CR)-/u.test(related)) throw new Error(`${record.Item_ID} Property has unsupported Related_ID ${related}.`);
  }
  for (const record of itemTags) {
    if (!itemIds.has(record.Item_ID.toLocaleLowerCase("en-US"))) throw new Error(`Item_Tags references missing Item ${record.Item_ID}.`);
    if (!tagIds.has(record.Tag_ID.toLocaleLowerCase("en-US"))) throw new Error(`${record.Item_ID} references missing Tag ${record.Tag_ID}.`);
    if (tagsById.get(record.Tag_ID)?.Tag_Name !== record.Tag_Name) throw new Error(`${record.Item_ID} Tag name does not match ${record.Tag_ID}.`);
  }
  const normalizedTagPairs = new Set(itemTags.map((row) => `${row.Item_ID}\u0000${row.Tag_Name}`));
  for (const record of catalog) {
    for (const tagName of splitTags(record.Tags)) {
      if (!normalizedTagPairs.has(`${record.Item_ID}\u0000${tagName}`)) throw new Error(`${record.Item_ID} Catalog.Tags is missing normalized link ${tagName}.`);
    }
  }
  const bodyLocations = reference
    .filter((row) => row.Reference_Type === "body_location")
    .sort((left, right) => Number(left.Sort_Order) - Number(right.Sort_Order))
    .map((row) => ({ key: text(row.Code), label: text(row.Value), sortOrder: Number(row.Sort_Order), notes: text(row.Notes) }));
  const bodyLocationByName = new Map(bodyLocations.map((row) => [row.label, row]));
  unique(bodyLocations, "key", "Body locations");
  unique(bodyLocations, "label", "Body locations");
  for (const record of armorLocations) {
    if (!armorById.has(record.Item_ID)) throw new Error(`Armor_Locations references Item without Armor profile ${record.Item_ID}.`);
    if (!bodyLocationByName.has(record.Location_Name)) throw new Error(`${record.Item_ID} uses unknown armor location ${record.Location_Name}.`);
  }
  for (const record of armorModifiers) {
    if (!armorById.has(record.Item_ID)) throw new Error(`Armor_Damage_Modifiers references Item without Armor profile ${record.Item_ID}.`);
    if (!text(record.Damage_Type) || !text(record.Modifier)) throw new Error(`${record.Item_ID} has an incomplete Armor Damage Modifier.`);
  }
  for (const check of audit) {
    if (check.Status !== "PASS" || text(check.Expected) !== text(check.Actual)) throw new Error(`Workbook Audit failed: ${check.Check}.`);
  }

  const propertyOrder = new Map();
  const modifierOrder = new Map();
  const tagsByItem = new Map();
  const locationsByItem = new Map();
  const modifiersByItem = new Map();
  const propertiesByItem = new Map();
  for (const row of itemTags) (tagsByItem.get(row.Item_ID) ?? tagsByItem.set(row.Item_ID, []).get(row.Item_ID)).push(row.Tag_Name);
  for (const row of armorLocations) (locationsByItem.get(row.Item_ID) ?? locationsByItem.set(row.Item_ID, []).get(row.Item_ID)).push(bodyLocationByName.get(row.Location_Name).key);
  for (const row of armorModifiers) {
    const aggregate = {
      modifierText: text(row.Modifier_Text),
      damageType: text(row.Damage_Type),
      modifier: text(row.Modifier),
      notes: text(row.Notes),
      sortOrder: nextSortOrder(modifierOrder, row.Item_ID),
    };
    (modifiersByItem.get(row.Item_ID) ?? modifiersByItem.set(row.Item_ID, []).get(row.Item_ID)).push(aggregate);
  }
  for (const row of properties) {
    const related = text(row.Related_ID);
    const aggregate = {
      propertyName: text(row.Property), value: text(row.Value), unit: text(row.Unit),
      relatedItemCanonicalId: /^(ITEM|OFFER)-/u.test(related) ? related : null,
      relatedCreatureCanonicalId: /^CR-/u.test(related) ? related : null,
      quantity: number(row.Quantity, `${row.Item_ID} ${row.Property} Quantity`), notes: text(row.Notes),
      sortOrder: nextSortOrder(propertyOrder, row.Item_ID),
    };
    (propertiesByItem.get(row.Item_ID) ?? propertiesByItem.set(row.Item_ID, []).get(row.Item_ID)).push(aggregate);
  }

  const items = catalog.map((record, sortOrder) => {
    const weapon = weaponById.get(record.Item_ID);
    const armorProfile = armorById.get(record.Item_ID);
    return {
      sortOrder,
      core: {
        canonicalId: record.Item_ID, name: record.Name,
        catalogScope: record.Window.toLocaleLowerCase("en-US"), equipmentGroup: equipmentGroup(record),
        recordType: record.Record_Type, family: record.Family, category: record.Category,
        subtype: text(record.Subtype), description: text(record.Description),
        weight: number(record.Weight, `${record.Item_ID} Weight`), weightUnit: text(record.Weight_Unit),
        size: text(record.Size), durability: number(record.Durability, `${record.Item_ID} Durability`),
        credits: number(record.Credits, `${record.Item_ID} Credits`), priceBasis: record.Price_Basis,
        parentCanonicalId: optionalText(record.Parent_Item_ID), sourceSystem: record.Source_System,
        sourceExternalId: record.Source_External_ID,
      },
      weaponProfile: weapon ? {
        profileRecordType: text(weapon.Record_Type), weaponType: text(weapon.Weapon_Type),
        handedness: text(weapon.Handedness), damageSource: text(weapon.Damage_Source), damage: text(weapon.Damage),
        damageType: text(weapon.Damage_Type), range: text(weapon.Range), reach: text(weapon.Reach),
        ammunitionCanonicalId: optionalText(weapon.Ammunition_ID), compatibility: text(weapon.Compatibility),
        capacity: text(weapon.Capacity), fireModes: splitFireModes(weapon.Fire_Modes),
        rateOfFire: text(weapon.Rate_of_Fire), reloadInitiative: text(weapon.Reload_Initiative),
        rulesText: text(weapon.Rules_Text),
      } : null,
      armorProfile: armorProfile ? {
        armorType: text(armorProfile.Armor_Type), coverage: text(armorProfile.Coverage),
        baseSoak: number(armorProfile.Base_Soak, `${record.Item_ID} Base Soak`),
        damageModifiersSourceText: text(armorProfile.Damage_Modifiers), rulesText: text(armorProfile.Rules_Text),
        damageModifiers: modifiersByItem.get(record.Item_ID) ?? [],
        coveredBodyLocationKeys: locationsByItem.get(record.Item_ID) ?? [],
      } : null,
      properties: propertiesByItem.get(record.Item_ID) ?? [],
      tags: tagsByItem.get(record.Item_ID) ?? [],
    };
  });
  const actualCounts = {
    items: items.length,
    equipment: items.filter((item) => item.core.catalogScope === "equipment").length,
    inventory: items.filter((item) => item.core.catalogScope === "inventory").length,
    weaponProfiles: items.filter((item) => item.weaponProfile).length,
    armorProfiles: items.filter((item) => item.armorProfile).length,
    properties: items.reduce((sum, item) => sum + item.properties.length, 0),
    tags: tags.length,
    tagLinks: items.reduce((sum, item) => sum + item.tags.length, 0),
    armorLocations: items.reduce((sum, item) => sum + (item.armorProfile?.coveredBodyLocationKeys.length ?? 0), 0),
    armorDamageModifiers: items.reduce((sum, item) => sum + (item.armorProfile?.damageModifiers.length ?? 0), 0),
    rules: rules.length,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) expectCount(key, actualCounts[key], expected);
  return {
    schemaVersion: 1,
    source: { spreadsheetId, spreadsheetUrl, title: snapshot.spreadsheetTitle, modifiedTime: snapshot.sourceModifiedTime },
    counts: actualCounts,
    bodyLocations,
    tags: tags.map((row) => ({ canonicalId: row.Tag_ID, name: row.Tag_Name, tagGroup: row.Tag_Group, description: row.Description })),
    rules: rules.map((row) => ({ ruleId: row.Rule_ID, ruleName: row.Rule_Name, ruleText: row.Rule, implementationGuidance: row.Implementation_Guidance, status: row.Status })),
    items,
  };
}

function sqlText(value) {
  return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  return value === null || value === undefined ? "NULL" : String(value);
}

function itemId(canonicalId) {
  return `(SELECT id FROM items WHERE canonical_id=${sqlText(canonicalId)} COLLATE NOCASE)`;
}

function generateMigration(seed) {
  const timestamp = seed.source.modifiedTime || "2026-08-23T00:00:00.000Z";
  const statements = [
    "PRAGMA foreign_keys = ON;",
    "",
    `-- Generated from ${spreadsheetUrl}`,
    `-- Canonical source SHA-256: ${hash(JSON.stringify(seed))}`,
    "",
  ];
  for (const item of seed.items) {
    const core = item.core;
    statements.push(`INSERT INTO items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,subtype,description,weight,weight_unit,size,durability,credits,price_basis,parent_item_id,created_by_user_id,source_system,source_external_id,created_at,updated_at) VALUES (${[
      sqlText(core.canonicalId), sqlText(core.name), sqlText(core.catalogScope), sqlText(core.equipmentGroup),
      sqlText(core.recordType), sqlText(core.family), sqlText(core.category), sqlText(core.subtype),
      sqlText(core.description), sqlNumber(core.weight), sqlText(core.weightUnit), sqlText(core.size),
      sqlNumber(core.durability), sqlNumber(core.credits), sqlText(core.priceBasis), "NULL", "NULL",
      sqlText(core.sourceSystem), sqlText(core.sourceExternalId), sqlText(timestamp), sqlText(timestamp),
    ].join(",")});`);
  }
  for (const item of seed.items.filter((entry) => entry.core.parentCanonicalId)) {
    statements.push(`UPDATE items SET parent_item_id=${itemId(item.core.parentCanonicalId)} WHERE canonical_id=${sqlText(item.core.canonicalId)} COLLATE NOCASE;`);
  }
  for (const location of seed.bodyLocations) {
    statements.push(`INSERT INTO armor_location_reference (location_code,location_name,sort_order,notes) VALUES (${sqlText(location.key)},${sqlText(location.label)},${location.sortOrder},${sqlText(location.notes)});`);
  }
  for (const tag of seed.tags) {
    statements.push(`INSERT INTO item_tags_catalog (canonical_id,name,tag_group,description) VALUES (${sqlText(tag.canonicalId)},${sqlText(tag.name)},${sqlText(tag.tagGroup)},${sqlText(tag.description)});`);
  }
  for (const rule of seed.rules) {
    statements.push(`INSERT INTO item_rules (rule_id,rule_name,rule_text,implementation_guidance,status) VALUES (${sqlText(rule.ruleId)},${sqlText(rule.ruleName)},${sqlText(rule.ruleText)},${sqlText(rule.implementationGuidance)},${sqlText(rule.status)});`);
  }
  for (const item of seed.items) {
    const owner = itemId(item.core.canonicalId);
    if (item.weaponProfile) {
      const profile = item.weaponProfile;
      statements.push(`INSERT INTO weapon_profiles (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,damage_type,range_text,reach_text,ammunition_item_id,compatibility,capacity,fire_modes,rate_of_fire,reload_initiative,rules_text) VALUES (${[
        owner, sqlText(profile.profileRecordType), sqlText(profile.weaponType), sqlText(profile.handedness),
        sqlText(profile.damageSource), sqlText(profile.damage), sqlText(profile.damageType), sqlText(profile.range),
        sqlText(profile.reach), profile.ammunitionCanonicalId ? itemId(profile.ammunitionCanonicalId) : "NULL",
        sqlText(profile.compatibility), sqlText(profile.capacity), sqlText(JSON.stringify(profile.fireModes)),
        sqlText(profile.rateOfFire), sqlText(profile.reloadInitiative), sqlText(profile.rulesText),
      ].join(",")});`);
    }
    if (item.armorProfile) {
      const profile = item.armorProfile;
      statements.push(`INSERT INTO armor_profiles (item_id,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text) VALUES (${owner},${sqlText(profile.armorType)},${sqlText(profile.coverage)},${sqlNumber(profile.baseSoak)},${sqlText(profile.damageModifiersSourceText)},${sqlText(profile.rulesText)});`);
      for (const row of profile.damageModifiers) {
        statements.push(`INSERT INTO item_armor_damage_modifiers (item_id,modifier_text,damage_type,modifier,notes,sort_order) VALUES (${owner},${sqlText(row.modifierText)},${sqlText(row.damageType)},${sqlText(row.modifier)},${sqlText(row.notes)},${row.sortOrder});`);
      }
      for (const [sortOrder, key] of profile.coveredBodyLocationKeys.entries()) {
        statements.push(`INSERT INTO armor_locations (item_id,location_code,sort_order) VALUES (${owner},${sqlText(key)},${sortOrder});`);
      }
    }
    for (const row of item.properties) {
      statements.push(`INSERT INTO item_properties (item_id,property_name,value,unit,related_item_id,related_creature_canonical_id,quantity,notes,sort_order) VALUES (${[
        owner, sqlText(row.propertyName), sqlText(row.value), sqlText(row.unit),
        row.relatedItemCanonicalId ? itemId(row.relatedItemCanonicalId) : "NULL",
        sqlText(row.relatedCreatureCanonicalId), sqlNumber(row.quantity), sqlText(row.notes), row.sortOrder,
      ].join(",")});`);
    }
    for (const tagName of item.tags) {
      statements.push(`INSERT INTO item_tag_links (item_id,tag_id) VALUES (${owner},(SELECT id FROM item_tags_catalog WHERE name=${sqlText(tagName)} COLLATE NOCASE));`);
    }
  }
  return `${statements.join("\n")}\n`;
}

let snapshot;
if (refreshSource) {
  snapshot = await fetchSnapshot();
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
} else {
  snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
}
const seed = await buildSeed(snapshot);
const seedSource = `${JSON.stringify(seed, null, 2)}\n`;
const migration = generateMigration(seed);
const report = {
  schemaVersion: 1,
  spreadsheetId,
  spreadsheetUrl,
  sourceModifiedTime: snapshot.sourceModifiedTime,
  expectedCounts,
  actualCounts: seed.counts,
  status: "PASS",
  unresolvedRecords: [],
  transformations: [
    "Catalog Window Equipment/Inventory maps to catalog_scope equipment/inventory.",
    "Equipment browse group derives from Equipment plus Record_Type; Inventory stores NULL.",
    "Spreadsheet canonical Item_ID and legacy namespaces are preserved exactly.",
    "SQLite internal item IDs are generated independently from canonical IDs.",
    "Weapon Capacity, Reload Initiative, Damage, Range, Reach, Rate of Fire, and Compatibility remain text-capable.",
    "Weapons.Fire_Modes is stored as a JSON string array without changing the displayed values.",
    "Ammunition_ID and ITEM-/OFFER- Property relationships resolve to internal Item foreign keys.",
    "CR- Property relationships retain the Creature canonical ID and reference the Creature catalog.",
    "Catalog.Tags is audited against normalized Item_Tags; permanent storage uses Item tag links.",
    "Armor Body Shot Bob names resolve to canonical Reference codes and normalized location links.",
    "Armor compound modifier text is retained while Armor_Damage_Modifiers supplies repeatable editor rows.",
  ],
  hashes: {
    snapshotSha256: hash(JSON.stringify(snapshot)),
    seedSha256: hash(seedSource),
    migrationSha256: hash(migration),
  },
};
await writeFile(seedPath, seedSource, "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (createInitialMigration) await writeFile(migrationPath, migration, "utf8");
console.log(JSON.stringify({ status: report.status, counts: seed.counts, wroteMigration: createInitialMigration }, null, 2));
