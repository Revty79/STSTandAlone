import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const dataDirectory = path.join(projectDirectory, "data");
const migrationDirectory = path.join(projectDirectory, "src-tauri", "migrations");
const sourceCatalogPath = path.join(dataDirectory, "serrian-tide-item-catalog.json");
const sourceLinksPath = path.join(dataDirectory, "serrian-tide-item-creature-links.json");
const sourceReportPath = path.join(dataDirectory, "serrian-tide-catalog-import-report.json");
const curatedCatalogPath = path.join(dataDirectory, "serrian-tide-curated-item-catalog.json");
const decisionsPath = path.join(dataDirectory, "serrian-tide-catalog-curation-decisions.json");
const reportPath = path.join(dataDirectory, "serrian-tide-catalog-curation-report.json");
const migrationPath = path.join(migrationDirectory, "0012_curate_item_catalog.sql");

const SOURCE_SYSTEM = "serrian-tide-canonical-catalog";
const BASE_COST = {
  "Ammunition": 20, "Animal": 120, "Armor": 200, "Artifact": 500,
  "Clothing": 35, "Consumable": 15, "Container": 20, "Crafting Material": 10,
  "Document": 15, "Furniture": 80, "General Equipment": 35, "Jewelry": 75,
  "Mount": 500, "Service": 50, "Technology / Device": 150, "Tool": 30,
  "Trap": 45, "Vehicle": 2500, "Weapon": 140,
};
const BASE_WEIGHT = {
  "Ammunition": 1, "Armor": 15, "Artifact": 2, "Clothing": 2,
  "Consumable": 0.5, "Container": 3, "Crafting Material": 2, "Document": 0.5,
  "Furniture": 30, "General Equipment": 3, "Jewelry": 0.2,
  "Technology / Device": 4, "Tool": 4, "Trap": 5, "Vehicle": 1500, "Weapon": 6,
};
const NO_COST = new Set(["Currency"]);
const NO_WEIGHT = new Set(["Animal", "Mount", "Currency", "Service"]);
const EFFECT_REQUIRED = new Set(["Artifact", "Consumable", "Service", "Technology / Device", "Trap"]);
const NEAR_ALIAS_GROUPS = [
  ["Multi-tool", "Multi Tool", "Multitool"],
  ["First Aid Kit", "First-Aid Kit", "First-Aid Supplies"],
  ["Toolkit", "Tool Kit"],
  ["Flashlight", "Flash Light"],
  ["Pocket Knife", "Pocketknife"],
  ["Backpack", "Back Pack"],
  ["Armored Personnel Carrier", "Armoured Personnel Carrier", "APC"],
  ["Rope (50 ft)", "50-foot Rope", "Rope, 50 ft"],
  ["Dog (Trained)", "Trained Dog"],
  ["Cat (Pet)", "Pet Cat"],
];

const clone = (value) => structuredClone(value);
const clean = (value) => String(value ?? "").trim();
const normalized = (value) => clean(value).toLocaleLowerCase("en-US")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'")
  .replace(/&/g, " and ").replace(/\barmoured\b/g, "armored")
  .replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value) => normalized(value).replace(/\s+/g, "-") || "item";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const uniq = (values) => {
  const result = []; const seen = new Set();
  for (const value of values) { const text = clean(value); const key = normalized(text); if (text && !seen.has(key)) { seen.add(key); result.push(text); } }
  return result;
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const sql = (value) => value === null || value === undefined ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const sqlRows = (rows) => rows.map((row) => `  (${row.map(sql).join(", ")})`).join(",\n");

function sourceRank(record) {
  if (record.weaponProfile || record.armorProfile) return 0;
  if (record.provenance?.some((entry) => entry.sourceEntryId?.startsWith("structured-sheet:"))) return 1;
  if (record.provenance?.some((entry) => entry.sourceEntryId?.startsWith("type-document:"))) return 2;
  return 3;
}

function timelineFor(genres, name) {
  const source = `${genres.join(" ")} ${name}`.toLocaleLowerCase();
  const eras = new Set();
  if (/\bancient\b/.test(source)) eras.add("Ancient");
  if (/fantasy|medieval|fairy tale|folklore|pirate|sword|bow|crossbow|chainmail/.test(source)) eras.add("Medieval");
  if (/renaissance/.test(source)) eras.add("Renaissance");
  if (/victorian|steampunk|western/.test(source)) eras.add("Industrial");
  if (/modern|noir|espionage|military|psychological|urban|zombie|nuclear|apocalyp|superhero/.test(source)) eras.add("Modern");
  if (/sci-fi|space opera|alien invasion|cyberpunk|quantum|laser|plasma|starship|hologra|neural|adaptive/.test(source)) eras.add("Future");
  if (eras.size > 1) return "Cross-Timeline";
  if (eras.size === 1) return [...eras][0];
  return genres.some((genre) => normalized(genre) === "universal") ? "Timeless" : "Modern";
}

function semanticCategory(item) {
  if (item.category !== "Tool") return item.category;
  const subtype = normalized(item.subtype);
  if (subtype === "mount") return "Mount";
  if (subtype === "animal" || subtype === "pet") return "Animal";
  if (subtype === "vehicle" || subtype === "transport") return "Vehicle";
  if (subtype === "clothing") return "Clothing";
  if (subtype === "document" || subtype === "knowledge") return "Document";
  if (subtype === "jewelry" || subtype === "luxury") return "Jewelry";
  if (["furniture", "decor", "housing", "land", "appliance"].includes(subtype)) return "Furniture";
  if (["charm", "relic", "ritual item", "trinket", "divination"].includes(subtype)) return "Artifact";
  if (["communication", "detection", "electronics", "power source", "recording device", "science gear", "illusion gear"].includes(subtype)) return "Technology / Device";
  if (["game set", "recreation", "personal", "household"].includes(subtype)) return "General Equipment";
  return item.category;
}

function subtypeFor(item) {
  const name = normalized(item.name); const category = item.category;
  const has = (pattern) => pattern.test(name);
  if (category === "Weapon" || category === "Armor") return "";
  if (category === "Ammunition") return has(/arrow/) ? "Arrow" : has(/bolt/) ? "Bolt" : has(/shell/) ? "Shell" : has(/cell|battery|charge/) ? "Power Cell" : has(/rocket|missile/) ? "Heavy Munition" : "Round";
  if (category === "Animal" || category === "Mount") return has(/horse|pony|camel|mule|donkey|yak|elephant|reindeer/) ? "Mount" : has(/cat|dog|falcon|owl|bird|rat|rabbit/) ? "Pet" : has(/cow|cattle|goat|sheep|chicken|pig|ox/) ? "Livestock" : "Companion";
  if (category === "Artifact") return has(/wand|staff|orb|crystal|stone/) ? "Mystic Focus" : has(/amulet|talisman|charm|pendant|medal|ring|necklace/) ? "Charm" : has(/mirror|tarot|oracle|divin|scry/) ? "Divination" : has(/implant|chip|interface|neural|quantum|holo|aether/) ? "Techno-Mystic Device" : has(/holy|sacred|prayer|rosary|crucifix|bless|saint|relic|chalice|idol|totem|symbol/) ? "Ritual Item" : "Relic";
  if (category === "Clothing") return has(/boot|shoe|sandal/) ? "Footwear" : has(/hat|helm|hood|cap|crown/) ? "Headwear" : has(/coat|cloak|jacket|robe/) ? "Outerwear" : has(/uniform/) ? "Uniform" : "Clothing";
  if (category === "Consumable") return has(/potion|serum|medicine|medkit|antidote|healing|bandage|first aid/) ? "Healing" : has(/food|meal|ration|bread|meat|fruit|bar\b/) ? "Food" : has(/drink|water|wine|ale|beer|juice|flask|bottle/) ? "Drink" : has(/booster|stimul|adrenal|pill|inject|capsule/) ? "Booster" : "Supply";
  if (category === "Container") return has(/backpack|pack|satchel|bag/) ? "Pack" : has(/case|box/) ? "Case" : has(/crate|chest/) ? "Crate" : has(/bottle|jar|vial|flask/) ? "Vessel" : "Storage";
  if (category === "Crafting Material") return has(/metal|iron|steel|alloy|copper|silver|gold/) ? "Metal" : has(/hide|bone|wood|leather|herb|plant/) ? "Organic" : has(/chemical|acid|powder|oil|fuel/) ? "Chemical" : has(/cloth|silk|fiber|wool/) ? "Textile" : "Component";
  if (category === "Currency") return has(/coin|doubloon|credit|cash|money/) ? "Coinage" : has(/gem|jewel|pearl|ingot|gold|silver/) ? "Valuable" : "Trade Good";
  if (category === "Document") return has(/map|chart|starmap/) ? "Map" : has(/permit|license|certificate|deed|pass/) ? "Permit" : has(/journal|log|record|note|ledger/) ? "Record" : has(/guide|manual|handbook/) ? "Guide" : "Text";
  if (category === "Furniture") return has(/chair|bench|stool|seat/) ? "Seating" : has(/table|desk/) ? "Table" : has(/bed|cot|hammock/) ? "Bed" : has(/cabinet|shelf|wardrobe|chest/) ? "Storage" : "Furnishing";
  if (category === "General Equipment") return has(/medical|medic|first aid|bandage/) ? "Medical" : has(/camp|survival|tent|bedroll/) ? "Field Gear" : has(/personal|hygiene|soap/) ? "Personal" : "Utility";
  if (category === "Jewelry") return has(/ring/) ? "Ring" : has(/necklace|pendant|amulet/) ? "Neckwear" : has(/bracelet|bangle|wrist/) ? "Bracelet" : "Adornment";
  if (category === "Service") return has(/ride|taxi|ticket|fare|transport|caravan|sled/) ? "Transport" : has(/rent|rental|hotel|inn|lodg|apartment|cottage/) ? "Lodging" : has(/doctor|medical|healing|surgery/) ? "Medical" : has(/ritual|exorc|bless|fortune/) ? "Ritual" : has(/admission|tour|concert|carnival|park/) ? "Entertainment" : has(/permit|license|membership/) ? "Permit" : "Professional";
  if (category === "Technology / Device") return has(/radio|phone|communicat|transmit/) ? "Communication" : has(/detect|scanner|sensor|goggle|binocular|rangefinder/) ? "Detection" : has(/computer|laptop|terminal|data|ai /) ? "Computing" : has(/battery|cell|generator|power/) ? "Power Source" : has(/medical|medic/) ? "Medical" : "Utility";
  if (category === "Tool") return has(/kit|set/) ? "Toolkit" : has(/lantern|flashlight|torch|lamp/) ? "Light Source" : has(/rope|grappl|climb/) ? "Climbing Gear" : has(/compass|sextant|navigation/) ? "Navigation" : has(/shovel|spade|pickaxe/) ? "Digging" : has(/medical|first aid/) ? "Medical" : "Utility";
  if (category === "Trap") return has(/alarm|tripwire|bell/) ? "Alarm" : has(/net|snare|cage|bind|restrain/) ? "Restraint" : has(/mine|bomb|explosive|grenade/) ? "Explosive" : has(/sigil|ward|magic|rune/) ? "Arcane" : "Hazard";
  if (category === "Vehicle") return has(/boat|ship|canoe|raft|submarine|skiff/) ? "Water" : has(/air|plane|jet|helicopter|zeppelin/) ? "Air" : has(/space|star|shuttle|pod/) ? "Space" : "Land";
  return "General";
}

function itemScale(name) {
  const value = normalized(name);
  if (/gargantuan|capital ship|airship|locomotive|train|freighter|carrier|building|castle/.test(value)) return 20;
  if (/large|heavy|great|war |wagon|truck|carriage|automobile|car\b/.test(value)) return 2;
  if (/small|light|pocket|mini|tiny|vial|coin|ring|needle/.test(value)) return 0.5;
  return 1;
}

function effectFor(item) {
  const name = item.name; const n = normalized(name); const subtype = item.subtype;
  if (item.category === "Service") return `Provides the ${subtype.toLocaleLowerCase()} service described by ${name}; access lasts for the listed purchase or engagement.`;
  if (item.category === "Trap") return /alarm/.test(n) ? "Alerts nearby creatures when its trigger is disturbed." : /net|snare|cage|bind|restrain/.test(n) ? "Restrains or obstructs a creature that activates the trigger." : /mine|bomb|explosive|grenade/.test(n) ? "Releases its explosive payload when triggered." : "Creates the hazard indicated by its name when its trigger is activated.";
  if (item.category === "Technology / Device") return `Provides the ${subtype.toLocaleLowerCase()} function indicated by ${name} when powered and used as intended.`;
  if (item.category === "Consumable") return subtype === "Healing" ? "Consumed to provide the restorative or medical use indicated by its name." : subtype === "Booster" ? "Consumed to provide the temporary enhancement indicated by its name." : subtype === "Food" || subtype === "Drink" ? "Consumed as nourishment; any special benefit is limited to the property stated in its name." : "Expended once to provide the use indicated by its name.";
  if (item.category === "Artifact") {
    if (/holy|sacred|prayer|rosary|crucifix|bless|saint|chalice|idol|totem|symbol/.test(n)) return "Supports prayer, blessings, consecration, or the sacred rite indicated by its name.";
    if (/cursed|damned|abyss|shadow|soulstone|black crystal|void/.test(n)) return "Carries a malign supernatural influence associated with its name; its specific manifestation is set by the source scenario.";
    if (/mirror|tarot|oracle|divin|scry|eye/.test(n)) return "Serves as a focus for divination or supernatural perception associated with its name.";
    if (/amplifier|booster|enhancer|strength|speed|reflex|invisibility|healing factor/.test(n)) return "Enhances the capability stated by its name; its exact magnitude follows the source scenario rather than creating a new subsystem.";
    if (/wand|staff|orb|crystal|stone|amulet|talisman|charm|pendant|ring/.test(n)) return "Channels or focuses the mystical property stated by its name without creating a separate spell or Skill.";
    return "A source-defined relic whose supernatural significance is conveyed by its name and narrative context.";
  }
  return "";
}

function weaponCategory(name) {
  const n = normalized(name);
  if (/grenade|bomb|mine|explosive|dynamite/.test(n)) return "Explosive";
  if (/laser|plasma|phaser|energy|particle|ray gun|blaster/.test(n)) return "Energy Weapon";
  if (/gun|rifle|pistol|revolver|shotgun|cannon|musket|carbine|firearm|smg|machine/.test(n)) return "Firearm";
  if (/crossbow/.test(n)) return "Crossbow"; if (/\bbow\b/.test(n)) return "Bow";
  if (/sword|blade|saber|cutlass|rapier|scimitar|katana/.test(n)) return "Sword";
  if (/axe|hatchet/.test(n)) return "Axe"; if (/hammer|sledge/.test(n)) return "Hammer";
  if (/mace|morningstar/.test(n)) return "Mace"; if (/whip|chain/.test(n)) return "Whip";
  if (/spear|lance|javelin|pike|halberd|trident|pitchfork/.test(n)) return "Polearm";
  if (/staff|quarterstaff/.test(n)) return "Staff"; if (/sling/.test(n)) return "Sling";
  if (/knife|dagger|shiv|scalpel/.test(n)) return "Knife";
  if (/club|bat|cudgel|pipe|crowbar|shovel|chair|bottle|wrench/.test(n)) return "Club";
  return "Exotic";
}

function medianBy(records, group, value) {
  const result = new Map(); const groups = new Map();
  for (const record of records) { const key = group(record); const entry = value(record); if (!finite(entry)) continue; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); }
  for (const [key, values] of groups) { values.sort((a, b) => a - b); result.set(key, values[Math.floor(values.length / 2)]); }
  return result;
}

function unresolvedRecord(entry, index) {
  const n = normalized(entry.name); let category = "Artifact"; let catalogSection = "Inventory";
  if (entry.category === "Military Equipment") { category = /radio|goggle|rangefinder|laser designator/.test(n) ? "Technology / Device" : "Tool"; catalogSection = "Equipment"; }
  else if (entry.category === "Superpower Enhancer" && /serum|injector/.test(n)) category = "Consumable";
  else if (entry.category === "Treasure") category = /coin|doubloon|ingot/.test(n) ? "Currency" : /necklace|jewel/.test(n) ? "Jewelry" : /map/.test(n) ? "Document" : /spyglass/.test(n) ? "Tool" : "Artifact";
  else if (/sword|dagger|mace|bow|spear/.test(n)) { category = "Weapon"; catalogSection = "Equipment"; }
  else if (/shield|armor/.test(n)) { category = "Armor"; catalogSection = "Equipment"; }
  else if (/wand|staff|gauntlet|implant|chip|interface|goggle|compass|key|device|amplifier|conductor/.test(n)) catalogSection = "Equipment";
  const genreTags = uniq([entry.genre]);
  return {
    key: `curated-${slug(entry.name)}-${index}`,
    item: { name: clean(entry.name), catalogSection, timelineTag: "", costCredits: null, category, subtype: "", weight: null, effectDescription: "", narrativeVariantNotes: `Recovered from the source ${entry.category} grouping during second-pass curation.`, createdByUserId: null, sourceSystem: SOURCE_SYSTEM, sourceExternalId: `item:curated:${slug(entry.sourceEntryId)}` },
    genreTags, weaponProfile: null, armorProfile: null,
    aliases: [], provenance: [{ sourceEntryId: entry.sourceEntryId, sourceKey: entry.source, sourceGenre: entry.genre ?? "", sourceCategory: entry.category }],
    isNew: true,
  };
}

function mainProfile(record, weaponMedians, armorMedians, decisions) {
  if (record.item.category === "Weapon" && !record.weaponProfile) record.weaponProfile = {};
  if (record.item.category === "Armor" && !record.armorProfile) record.armorProfile = {};
  if (record.weaponProfile) {
    const profile = record.weaponProfile; const category = clean(profile.weaponCategory) || weaponCategory(record.item.name);
    const ranged = ["Bow", "Crossbow", "Firearm", "Energy Weapon", "Sling", "Explosive"].includes(category);
    const damageType = clean(profile.damageType) || (/acid/.test(normalized(record.item.name)) ? "Acid" : /fire|flame|incendiary/.test(normalized(record.item.name)) ? "Fire" : /ice|cold|frost/.test(normalized(record.item.name)) ? "Cold" : /poison|venom/.test(normalized(record.item.name)) ? "Poison" : category === "Energy Weapon" ? "Energy" : ["Club", "Hammer", "Mace", "Staff", "Sling", "Explosive"].includes(category) ? "Bludgeoning" : category === "Axe" || category === "Sword" || category === "Whip" ? "Slashing" : "Piercing");
    const defaults = {
      weaponRole: record.item.category === "Weapon" ? "Primary" : "Improvised", weaponCategory: category,
      handedness: ["Bow", "Crossbow", "Polearm", "Staff", "Firearm"].includes(category) || /great|heavy|long|two handed/.test(normalized(record.item.name)) ? "2h" : "1h",
      damageType, rangeType: ranged ? (category === "Explosive" ? "Thrown" : "Ranged") : "Melee",
      rangeText: ranged ? (category === "Explosive" ? "Short throwing distance" : "Standard ranged weapon distance") : "Close",
      damage: weaponMedians.damage.get(category) ?? 10, weaponEffectDescription: "", weaponNarrativeNotes: "",
      sourceSystem: SOURCE_SYSTEM, sourceExternalId: `weapon:${record.item.sourceExternalId.replace(/^item:/, "")}`,
    };
    for (const [field, value] of Object.entries(defaults)) if (profile[field] === null || profile[field] === undefined || clean(profile[field]) === "") { decisions.push(decision(record.key, `weaponProfile.${field}`, profile[field] ?? null, value, "direct-analog", [category], "high", `Completed from the median and vocabulary of existing ${category} profiles.`)); profile[field] = value; }
  }
  if (record.armorProfile) {
    const profile = record.armorProfile; const n = normalized(record.item.name);
    const category = clean(profile.armorCategory) || (/shield/.test(n) ? "Shield" : /power|exo/.test(n) ? "Powered" : /plate|heavy|juggernaut/.test(n) ? "Heavy" : /leather|padded|light|cloak/.test(n) ? "Light" : "Medium");
    const defaults = {
      areaCovered: /shield/.test(n) ? "Arm / carried guard" : /helmet|helm|mask/.test(n) ? "Head" : /boot|greave/.test(n) ? "Legs" : /gauntlet/.test(n) ? "Arms" : "Body",
      soak: armorMedians.soak.get(category) ?? (category === "Heavy" ? 4 : category === "Medium" ? 3 : category === "Light" ? 2 : 2), armorCategory: category,
      armorType: /leather|hide/.test(n) ? "Leather" : /chain/.test(n) ? "Chain" : /plate|steel|iron|metal/.test(n) ? "Metal" : /energy|force/.test(n) ? "Energy" : /power|exo/.test(n) ? "Powered" : "Protective",
      encumbrancePenalty: armorMedians.penalty.get(category) ?? (category === "Heavy" ? -2 : category === "Medium" ? -1 : 0), armorEffectDescription: "", armorNarrativeNotes: "",
      sourceSystem: SOURCE_SYSTEM, sourceExternalId: `armor:${record.item.sourceExternalId.replace(/^item:/, "")}`,
    };
    for (const [field, value] of Object.entries(defaults)) if (profile[field] === null || profile[field] === undefined || clean(profile[field]) === "") { decisions.push(decision(record.key, `armorProfile.${field}`, profile[field] ?? null, value, "direct-analog", [category], "high", `Completed from the median and vocabulary of existing ${category} profiles.`)); profile[field] = value; }
  }
}

function decision(itemKey, field, oldValue, newValue, basis, referenceItems, confidence, notes) { return { itemKey, field, oldValue, newValue, basis, referenceItems, confidence, notes }; }

function chooseKeeper(group) { return [...group].sort((a, b) => sourceRank(a) - sourceRank(b) || a.key.localeCompare(b.key, "en-US"))[0]; }

function mergeRecords(records, decisions, duplicateAudit) {
  const groups = new Map();
  for (const record of records) { const key = normalized(record.item.name); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record); }
  const result = []; const sourceMap = new Map();
  for (const group of groups.values()) {
    const keeper = chooseKeeper(group); const merged = clone(keeper); merged.aliases = uniq(merged.aliases ?? []); merged.provenance = [...(merged.provenance ?? [])];
    const classifications = uniq(group.map((entry) => entry.item.category));
    const serviceConflict = classifications.includes("Service") && classifications.some((entry) => entry !== "Service");
    const currencyConflict = classifications.includes("Currency") && classifications.some((entry) => entry !== "Currency");
    if ((serviceConflict || currencyConflict) && group.length > 1) {
      duplicateAudit.push({ normalizedName: normalized(keeper.item.name), classification: "different", recordKeys: group.map((entry) => entry.key), reason: "The same display name represents a service/currency listing and a physical object." });
      const partitions = new Map();
      for (const entry of group) { const domain = entry.item.category === "Service" || entry.item.category === "Currency" ? entry.item.category : "Physical"; if (!partitions.has(domain)) partitions.set(domain, []); partitions.get(domain).push(entry); }
      for (const [domain, entries] of partitions) {
        const partitionKeeper = chooseKeeper(entries); const retained = clone(partitionKeeper); retained.aliases = [...(retained.aliases ?? [])];
        for (const entry of entries) {
          sourceMap.set(entry.item.sourceExternalId, retained.item.sourceExternalId);
          if (entry === partitionKeeper) continue;
          retained.genreTags = uniq([...retained.genreTags, ...entry.genreTags]);
          retained.provenance = [...retained.provenance, ...entry.provenance].filter((value, index, allEntries) => allEntries.findIndex((candidate) => candidate.sourceEntryId === value.sourceEntryId) === index);
          decisions.push(decision(retained.key, "mergedSourceExternalIds", [retained.item.sourceExternalId], entries.map((candidate) => candidate.item.sourceExternalId), "merged-source", entries.map((candidate) => candidate.item.name), "high", "Consolidated duplicate records within the same semantic service/currency/physical domain."));
        }
        if (domain !== "Physical") {
          const oldName = retained.item.name; retained.item.name = `${oldName} (${domain})`; retained.aliases.push(oldName);
          decisions.push(decision(retained.key, "name", oldName, retained.item.name, "curated-design", group.map((candidate) => candidate.item.name), "high", "Added a semantic qualifier so a service/currency listing is visibly distinct from the same-named physical object."));
        }
        result.push(retained);
      }
      continue;
    }
    for (const entry of group) {
      sourceMap.set(entry.item.sourceExternalId, merged.item.sourceExternalId);
      if (entry === keeper) continue;
      merged.genreTags = uniq([...(merged.genreTags ?? []), ...(entry.genreTags ?? [])]);
      merged.provenance = [...merged.provenance, ...(entry.provenance ?? [])].filter((value, index, all) => all.findIndex((candidate) => candidate.sourceEntryId === value.sourceEntryId) === index);
      merged.aliases = uniq([...merged.aliases, ...(entry.aliases ?? []), ...(normalized(entry.item.name) === normalized(merged.item.name) ? [] : [entry.item.name])]);
      if (!merged.weaponProfile && entry.weaponProfile) merged.weaponProfile = clone(entry.weaponProfile);
      if (!merged.armorProfile && entry.armorProfile) merged.armorProfile = clone(entry.armorProfile);
      for (const field of ["effectDescription", "narrativeVariantNotes"]) if (!clean(merged.item[field]) && clean(entry.item[field])) merged.item[field] = entry.item[field];
    }
    if (merged.weaponProfile?.weaponRole === "Primary" && merged.armorProfile && /shield/.test(normalized(merged.item.name))) { merged.item.category = "Armor"; merged.item.catalogSection = "Equipment"; }
    else if (merged.weaponProfile?.weaponRole === "Primary") { merged.item.category = "Weapon"; merged.item.catalogSection = "Equipment"; }
    else if (merged.armorProfile) { merged.item.category = "Armor"; merged.item.catalogSection = "Equipment"; }
    else if (merged.weaponProfile?.weaponRole === "Improvised" && classifications.includes("Tool")) { merged.item.category = "Tool"; merged.item.catalogSection = "Equipment"; }
    if (group.length > 1) {
      duplicateAudit.push({ normalizedName: normalized(keeper.item.name), classification: "same", keeperKey: merged.key, recordKeys: group.map((entry) => entry.key), sourceExternalIds: group.map((entry) => entry.item.sourceExternalId), reason: "Exact normalized name and compatible physical-object identity; profiles, genres, provenance, and links are unioned." });
      decisions.push(decision(merged.key, "mergedSourceExternalIds", [merged.item.sourceExternalId], group.map((entry) => entry.item.sourceExternalId), "merged-source", group.map((entry) => entry.item.name), "high", "Consolidated exact duplicate physical-object records into one aggregate."));
      decisions.push(decision(merged.key, "genreTags", keeper.genreTags, merged.genreTags, "merged-source", group.map((entry) => entry.item.name), "high", "Unioned genre classifications across every merged source record."));
      decisions.push(decision(merged.key, "provenanceSourceEntryIds", keeper.provenance.map((entry) => entry.sourceEntryId), merged.provenance.map((entry) => entry.sourceEntryId), "merged-source", group.map((entry) => entry.item.sourceExternalId), "high", "Retained every raw source reference represented by the merged physical object."));
    }
    result.push(merged);
  }
  return { records: result, sourceMap };
}

function applyNearAliases(records, sourceMap, decisions, duplicateAudit) {
  for (const names of NEAR_ALIAS_GROUPS) {
    const matches = records.filter((record) => names.some((name) => normalized(name) === normalized(record.item.name)));
    if (matches.length < 2) continue;
    const preferred = matches.find((record) => normalized(record.item.name) === normalized(names[0])) ?? chooseKeeper(matches);
    for (const other of matches) {
      if (other === preferred) continue;
      preferred.aliases = uniq([...(preferred.aliases ?? []), other.item.name, ...(other.aliases ?? [])]);
      preferred.genreTags = uniq([...preferred.genreTags, ...other.genreTags]);
      preferred.provenance = [...preferred.provenance, ...other.provenance].filter((value, index, all) => all.findIndex((candidate) => candidate.sourceEntryId === value.sourceEntryId) === index);
      if (!preferred.weaponProfile && other.weaponProfile) preferred.weaponProfile = clone(other.weaponProfile);
      if (!preferred.armorProfile && other.armorProfile) preferred.armorProfile = clone(other.armorProfile);
      sourceMap.set(other.item.sourceExternalId, preferred.item.sourceExternalId);
      records.splice(records.indexOf(other), 1);
      decisions.push(decision(preferred.key, "aliases", [], [other.item.name], "family-rule", [preferred.item.name], "high", "Merged an explicitly reviewed spelling or abbreviation alias."));
    }
    duplicateAudit.push({ normalizedName: normalized(preferred.item.name), classification: "alias", keeperKey: preferred.key, recordKeys: matches.map((entry) => entry.key), reason: "Explicit reviewed alias family; no fuzzy matching was used." });
  }
}

function auditRetainedVariants(records, duplicateAudit) {
  const groups = new Map();
  for (const record of records) {
    const match = record.item.name.match(/^(.+?)\s*\(([^)]+)\)$/);
    const base = normalized(match ? match[1] : record.item.name);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(record);
  }
  for (const [base, group] of groups) {
    if (group.length < 2 || !group.some((record) => /\([^)]+\)$/.test(record.item.name))) continue;
    if (group.some((record) => ["Service", "Currency"].includes(record.item.category))) continue;
    duplicateAudit.push({ normalizedName: base, classification: "variant", recordKeys: group.map((record) => record.key), names: group.map((record) => record.item.name), reason: "The parenthetical text identifies a functional, scale, condition, or narrative variant; the records remain independently selectable." });
  }
}

function completeRecord(record, itemMedians, weaponMedians, armorMedians, decisions) {
  if (!record.genreTags?.length) decisions.push(decision(record.key, "genreTags", [], ["Universal"], "family-rule", [record.item.category], "medium", "Assigned the existing Universal genre when the source supplied no narrower genre classification."));
  record.genreTags = uniq(record.genreTags?.length ? record.genreTags : ["Universal"]);
  const set = (field, value, basis, references, confidence, notes) => {
    const oldValue = record.item[field]; if (oldValue === value) return;
    decisions.push(decision(record.key, field, oldValue ?? null, value, basis, references, confidence, notes)); record.item[field] = value;
  };
  const category = semanticCategory(record.item);
  if (category !== record.item.category) set("category", category, "family-rule", [record.item.subtype], "high", "Normalized a broad source-sheet Tool category to the physical Item family while preserving its catalog section and aggregate identity.");
  if (!clean(record.item.timelineTag)) set("timelineTag", timelineFor(record.genreTags, record.item.name), "family-rule", record.genreTags, "high", "Mapped source genre vocabulary to the normalized catalog timeline vocabulary.");
  if (!clean(record.item.subtype)) set("subtype", subtypeFor(record.item) || (record.item.category === "Weapon" ? weaponCategory(record.item.name) : "Protective"), "family-rule", [record.item.category], "high", "Classified by category and reviewed name-family rules.");
  if (!NO_COST.has(record.item.category) && (!finite(record.item.costCredits) || record.item.costCredits <= 0)) {
    const base = itemMedians.cost.get(record.item.category) ?? BASE_COST[record.item.category] ?? 25; const value = Math.max(1, Math.round(base * itemScale(record.item.name)));
    set("costCredits", value, "direct-analog", [`${record.item.category} median/base family`], "medium", "Derived from structured category anchors with a conservative size-family modifier.");
  }
  if (NO_COST.has(record.item.category) && record.item.costCredits !== null) set("costCredits", null, "family-rule", [record.item.category], "high", "A currency record is itself a medium of value, so purchase cost is not applicable.");
  if (!NO_WEIGHT.has(record.item.category) && (!finite(record.item.weight) || record.item.weight <= 0)) {
    const base = itemMedians.weight.get(record.item.category) ?? BASE_WEIGHT[record.item.category] ?? 2; const value = Math.max(0.1, Math.round(base * itemScale(record.item.name) * 10) / 10);
    set("weight", value, "physical-standard", [`${record.item.category} physical family`], "medium", "Estimated conservatively from the physical family and scale indicated by the name.");
  }
  if (NO_WEIGHT.has(record.item.category) && record.item.weight !== null) set("weight", null, "family-rule", [record.item.category], "high", "Carried Item weight is not applicable to this listing category.");
  if (EFFECT_REQUIRED.has(record.item.category) && !clean(record.item.effectDescription)) set("effectDescription", effectFor(record.item), "curated-design", [record.item.category, record.item.subtype], "medium", "Added a category-specific functional description without inventing a new subsystem or numeric rule.");
  mainProfile(record, weaponMedians, armorMedians, decisions);
  if (record.weaponProfile && record.item.category === "Weapon") record.item.subtype = record.weaponProfile.weaponCategory;
  if (record.armorProfile && record.item.category === "Armor") record.item.subtype = record.armorProfile.armorCategory;
  const sourceName = record.item.name;
  const derivedAliases = [];
  if (/[’‘]/.test(sourceName)) derivedAliases.push(sourceName.replace(/[’‘]/g, "'"));
  if (sourceName.includes("-")) derivedAliases.push(sourceName.replaceAll("-", " "));
  const parenthetical = sourceName.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenthetical) derivedAliases.push(`${parenthetical[2]} ${parenthetical[1]}`);
  if (derivedAliases.length) decisions.push(decision(record.key, "aliases", record.aliases ?? [], uniq([...(record.aliases ?? []), ...derivedAliases]), "family-rule", [sourceName], "high", "Added deterministic punctuation or parenthetical search forms without fuzzy merging."));
  record.aliases = uniq([...(record.aliases ?? []), ...derivedAliases])
    .filter((alias) => clean(alias).toLocaleLowerCase() !== clean(record.item.name).toLocaleLowerCase());
}

function missingRequired(record) {
  const missing = [];
  for (const field of ["name", "catalogSection", "timelineTag", "category", "subtype"]) if (!clean(record.item[field])) missing.push(field);
  if (!record.genreTags.length) missing.push("genreTags");
  if (!NO_COST.has(record.item.category) && !finite(record.item.costCredits)) missing.push("costCredits");
  if (!NO_WEIGHT.has(record.item.category) && !finite(record.item.weight)) missing.push("weight");
  if (EFFECT_REQUIRED.has(record.item.category) && !clean(record.item.effectDescription)) missing.push("effectDescription");
  if (record.item.category === "Weapon" && !record.weaponProfile) missing.push("weaponProfile");
  if (record.item.category === "Armor" && !record.armorProfile) missing.push("armorProfile");
  if (record.weaponProfile) for (const field of ["weaponRole", "weaponCategory", "handedness", "damageType", "rangeType", "rangeText", "damage"]) if (field === "damage" ? !finite(record.weaponProfile[field]) : !clean(record.weaponProfile[field])) missing.push(`weaponProfile.${field}`);
  if (record.armorProfile) for (const field of ["areaCovered", "soak", "armorCategory", "armorType", "encumbrancePenalty"]) if (["soak", "encumbrancePenalty"].includes(field) ? !finite(record.armorProfile[field]) : !clean(record.armorProfile[field])) missing.push(`armorProfile.${field}`);
  return missing;
}

function migration(catalog, links, sourceMap, decisionsHash) {
  const itemRows = catalog.records.map((record, ordinal) => [ordinal, record.item.sourceExternalId, record.item.name, record.item.catalogSection, record.item.timelineTag, record.item.costCredits, record.item.category, record.item.subtype, record.item.weight, record.item.effectDescription, record.item.narrativeVariantNotes]);
  const genres = catalog.records.flatMap((record, ordinal) => record.genreTags.map((tag, sort) => [ordinal, tag, sort]));
  const aliases = catalog.records.flatMap((record, ordinal) => record.aliases.map((alias, sort) => [ordinal, alias, sort, "Canonical spelling and source-name alias.", "second-pass-curation"]));
  const weapons = catalog.records.flatMap((record, ordinal) => record.weaponProfile ? [[ordinal, ...["weaponRole", "weaponCategory", "handedness", "damageType", "rangeType", "rangeText", "damage", "weaponEffectDescription", "weaponNarrativeNotes", "sourceSystem", "sourceExternalId"].map((field) => record.weaponProfile[field] ?? null)]] : []);
  const armor = catalog.records.flatMap((record, ordinal) => record.armorProfile ? [[ordinal, ...["areaCovered", "soak", "armorCategory", "armorType", "encumbrancePenalty", "armorEffectDescription", "armorNarrativeNotes", "sourceSystem", "sourceExternalId"].map((field) => record.armorProfile[field] ?? null)]] : []);
  const mergeRows = [...sourceMap.entries()].filter(([oldId, newId]) => oldId !== newId).map(([oldId, newId]) => [oldId, newId]);
  const linkRows = links.map((link) => [link.itemSourceExternalId, link.creatureSourceExternalId, link.relationship, link.notes]);
  const parts = [`-- Generated by scripts/generate-catalog-curation.mjs.\n-- Decisions SHA-256: ${decisionsHash}\nPRAGMA foreign_keys = ON;\n`,
`CREATE TEMP TABLE _curated_items (ordinal INTEGER PRIMARY KEY, source_external_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, catalog_section TEXT NOT NULL, timeline_tag TEXT NOT NULL, cost_credits REAL, category TEXT NOT NULL, subtype TEXT NOT NULL, weight REAL, effect_description TEXT NOT NULL, narrative_variant_notes TEXT NOT NULL);\nINSERT INTO _curated_items VALUES\n${sqlRows(itemRows)};\n`,
`INSERT OR IGNORE INTO items (name,catalog_section,timeline_tag,cost_credits,category,subtype,weight,effect_description,narrative_variant_notes,created_by_user_id,source_system,source_external_id) SELECT name,catalog_section,timeline_tag,cost_credits,category,subtype,weight,effect_description,narrative_variant_notes,NULL,'${SOURCE_SYSTEM}',source_external_id FROM _curated_items;\nUPDATE items SET name=(SELECT name FROM _curated_items WHERE source_external_id=items.source_external_id), catalog_section=(SELECT catalog_section FROM _curated_items WHERE source_external_id=items.source_external_id), timeline_tag=(SELECT timeline_tag FROM _curated_items WHERE source_external_id=items.source_external_id), cost_credits=(SELECT cost_credits FROM _curated_items WHERE source_external_id=items.source_external_id), category=(SELECT category FROM _curated_items WHERE source_external_id=items.source_external_id), subtype=(SELECT subtype FROM _curated_items WHERE source_external_id=items.source_external_id), weight=(SELECT weight FROM _curated_items WHERE source_external_id=items.source_external_id), effect_description=(SELECT effect_description FROM _curated_items WHERE source_external_id=items.source_external_id), narrative_variant_notes=(SELECT narrative_variant_notes FROM _curated_items WHERE source_external_id=items.source_external_id), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_system='${SOURCE_SYSTEM}' AND source_external_id IN (SELECT source_external_id FROM _curated_items);\n`,
`CREATE TEMP TABLE _curated_merge (old_external_id TEXT PRIMARY KEY,new_external_id TEXT NOT NULL);\n${mergeRows.length ? `INSERT INTO _curated_merge VALUES\n${sqlRows(mergeRows)};` : ""}\nINSERT OR IGNORE INTO item_creature_links(item_id,creature_id,relationship,notes) SELECT keeper.id,link.creature_id,link.relationship,link.notes FROM _curated_merge map JOIN items old ON old.source_system='${SOURCE_SYSTEM}' AND old.source_external_id=map.old_external_id JOIN items keeper ON keeper.source_system='${SOURCE_SYSTEM}' AND keeper.source_external_id=map.new_external_id JOIN item_creature_links link ON link.item_id=old.id;\n`,
`DELETE FROM item_genre_tags WHERE item_id IN (SELECT item.id FROM items item JOIN _curated_items seed ON seed.source_external_id=item.source_external_id WHERE item.source_system='${SOURCE_SYSTEM}');\nCREATE TEMP TABLE _curated_genres (item_ordinal INTEGER,genre_tag TEXT,sort_order INTEGER);\nINSERT INTO _curated_genres VALUES\n${sqlRows(genres)};\nINSERT INTO item_genre_tags(item_id,genre_tag,sort_order) SELECT item.id,seed.genre_tag,seed.sort_order FROM _curated_genres seed JOIN _curated_items core ON core.ordinal=seed.item_ordinal JOIN items item ON item.source_system='${SOURCE_SYSTEM}' AND item.source_external_id=core.source_external_id;\n`,
`DELETE FROM item_aliases WHERE item_id IN (SELECT item.id FROM items item JOIN _curated_items seed ON seed.source_external_id=item.source_external_id WHERE item.source_system='${SOURCE_SYSTEM}');\nCREATE TEMP TABLE _curated_aliases (item_ordinal INTEGER,alias TEXT,sort_order INTEGER,notes TEXT,source_reference TEXT);\n${aliases.length ? `INSERT INTO _curated_aliases VALUES\n${sqlRows(aliases)};\nINSERT INTO item_aliases(item_id,alias,sort_order,notes,source_reference) SELECT item.id,seed.alias,seed.sort_order,seed.notes,seed.source_reference FROM _curated_aliases seed JOIN _curated_items core ON core.ordinal=seed.item_ordinal JOIN items item ON item.source_system='${SOURCE_SYSTEM}' AND item.source_external_id=core.source_external_id;` : ""}\n`,
`DELETE FROM item_weapon_profiles WHERE item_id IN (SELECT item.id FROM items item JOIN _curated_items seed ON seed.source_external_id=item.source_external_id WHERE item.source_system='${SOURCE_SYSTEM}');\nCREATE TEMP TABLE _curated_weapons (item_ordinal INTEGER,weapon_role TEXT,weapon_category TEXT,handedness TEXT,damage_type TEXT,range_type TEXT,range_text TEXT,damage REAL,weapon_effect_description TEXT,weapon_narrative_notes TEXT,source_system TEXT,source_external_id TEXT);\n${weapons.length ? `INSERT INTO _curated_weapons VALUES\n${sqlRows(weapons)};\nINSERT INTO item_weapon_profiles(item_id,weapon_role,weapon_category,handedness,damage_type,range_type,range_text,damage,weapon_effect_description,weapon_narrative_notes,source_system,source_external_id) SELECT item.id,seed.weapon_role,seed.weapon_category,seed.handedness,seed.damage_type,seed.range_type,seed.range_text,seed.damage,seed.weapon_effect_description,seed.weapon_narrative_notes,seed.source_system,seed.source_external_id FROM _curated_weapons seed JOIN _curated_items core ON core.ordinal=seed.item_ordinal JOIN items item ON item.source_system='${SOURCE_SYSTEM}' AND item.source_external_id=core.source_external_id;` : ""}\n`,
`DELETE FROM item_armor_profiles WHERE item_id IN (SELECT item.id FROM items item JOIN _curated_items seed ON seed.source_external_id=item.source_external_id WHERE item.source_system='${SOURCE_SYSTEM}');\nCREATE TEMP TABLE _curated_armor (item_ordinal INTEGER,area_covered TEXT,soak REAL,armor_category TEXT,armor_type TEXT,encumbrance_penalty REAL,armor_effect_description TEXT,armor_narrative_notes TEXT,source_system TEXT,source_external_id TEXT);\n${armor.length ? `INSERT INTO _curated_armor VALUES\n${sqlRows(armor)};\nINSERT INTO item_armor_profiles(item_id,area_covered,soak,armor_category,armor_type,encumbrance_penalty,armor_effect_description,armor_narrative_notes,source_system,source_external_id) SELECT item.id,seed.area_covered,seed.soak,seed.armor_category,seed.armor_type,seed.encumbrance_penalty,seed.armor_effect_description,seed.armor_narrative_notes,seed.source_system,seed.source_external_id FROM _curated_armor seed JOIN _curated_items core ON core.ordinal=seed.item_ordinal JOIN items item ON item.source_system='${SOURCE_SYSTEM}' AND item.source_external_id=core.source_external_id;` : ""}\n`,
`CREATE TEMP TABLE _curated_links (item_external_id TEXT,creature_external_id TEXT,relationship TEXT,notes TEXT);\n${linkRows.length ? `INSERT INTO _curated_links VALUES\n${sqlRows(linkRows)};\nINSERT OR IGNORE INTO item_creature_links(item_id,creature_id,relationship,notes) SELECT item.id,creature.id,seed.relationship,seed.notes FROM _curated_links seed JOIN items item ON item.source_system='${SOURCE_SYSTEM}' AND item.source_external_id=seed.item_external_id JOIN creatures creature ON creature.source_system='${SOURCE_SYSTEM}' AND creature.source_external_id=seed.creature_external_id;` : ""}\n`,
`DELETE FROM items WHERE source_system='${SOURCE_SYSTEM}' AND source_external_id IN (SELECT old_external_id FROM _curated_merge);\nDROP TABLE _curated_links; DROP TABLE _curated_armor; DROP TABLE _curated_weapons; DROP TABLE _curated_aliases; DROP TABLE _curated_genres; DROP TABLE _curated_merge; DROP TABLE _curated_items;\n`];
  return parts.join("\n");
}

async function main() {
  const [sourceText, linksText, reportText] = await Promise.all([readFile(sourceCatalogPath, "utf8"), readFile(sourceLinksPath, "utf8"), readFile(sourceReportPath, "utf8")]);
  const source = JSON.parse(sourceText); const sourceLinks = JSON.parse(linksText); const firstReport = JSON.parse(reportText);
  const original = source.records.map((record) => ({ ...clone(record), aliases: [], isNew: false }));
  const decisions = []; const duplicateAudit = [];
  const unresolved = firstReport.reconciliation.unresolvedEntries.map(unresolvedRecord);
  for (const record of unresolved) {
    const reference = record.provenance.map((entry) => entry.sourceEntryId);
    decisions.push(decision(record.key, "name", null, record.item.name, "source", reference, "high", "Preserved the captured source display name."));
    decisions.push(decision(record.key, "catalogSection", null, record.item.catalogSection, "curated-design", reference, "high", "Placed the reviewed Artifact/Spiritual entry by whether it is carried/used equipment or an inventory possession."));
    decisions.push(decision(record.key, "category", null, record.item.category, "family-rule", reference, "high", "Classified the reviewed entry from its source grouping and physical name family."));
    decisions.push(decision(record.key, "genreTags", null, record.genreTags, "source", reference, "high", "Preserved the captured source genre classification."));
    decisions.push(decision(record.key, "narrativeVariantNotes", null, record.item.narrativeVariantNotes, "curated-design", reference, "high", "Recorded why the record entered the catalog during second-pass review."));
  }
  const all = [...original, ...unresolved];
  const itemMedians = {
    cost: medianBy(original, (record) => semanticCategory(record.item), (record) => record.item.costCredits),
    weight: medianBy(original.filter((record) => !NO_WEIGHT.has(semanticCategory(record.item))), (record) => semanticCategory(record.item), (record) => record.item.weight),
  };
  const weaponMedians = { damage: medianBy(original.filter((record) => record.weaponProfile), (record) => record.weaponProfile.weaponCategory, (record) => record.weaponProfile.damage) };
  const armorSources = original.filter((record) => record.armorProfile);
  const armorMedians = { soak: medianBy(armorSources, (record) => record.armorProfile.armorCategory, (record) => record.armorProfile.soak), penalty: medianBy(armorSources, (record) => record.armorProfile.armorCategory, (record) => record.armorProfile.encumbrancePenalty) };
  const merged = mergeRecords(all, decisions, duplicateAudit); applyNearAliases(merged.records, merged.sourceMap, decisions, duplicateAudit); auditRetainedVariants(merged.records, duplicateAudit);
  for (const record of merged.records) completeRecord(record, itemMedians, weaponMedians, armorMedians, decisions);
  merged.records.sort((left, right) => left.item.name.localeCompare(right.item.name, "en-US") || left.key.localeCompare(right.key, "en-US"));
  const missing = merged.records.flatMap((record) => { const fields = missingRequired(record); return fields.length ? [{ itemKey: record.key, name: record.item.name, fields }] : []; });
  if (missing.length) throw new Error(`Canonical completeness failed for ${missing.length} records: ${JSON.stringify(missing.slice(0, 5))}`);
  const catalog = { schemaVersion: 2, sourceSystem: SOURCE_SYSTEM, firstPassCatalogSha256: sha256(sourceText), records: merged.records.map(({ isNew: _isNew, ...record }) => record) };
  const externalByOriginalKey = new Map(all.map((record) => [record.key, record.item.sourceExternalId]));
  const finalKeyByExternal = new Map(catalog.records.map((record) => [record.item.sourceExternalId, record.key]));
  for (const row of decisions) {
    if (catalog.records.some((record) => record.key === row.itemKey)) continue;
    const originalExternalId = externalByOriginalKey.get(row.itemKey);
    const retainedExternalId = originalExternalId ? (merged.sourceMap.get(originalExternalId) ?? originalExternalId) : null;
    const retainedKey = retainedExternalId ? finalKeyByExternal.get(retainedExternalId) : null;
    if (retainedKey) row.itemKey = retainedKey;
  }
  const curatedLinks = [...new Map(sourceLinks.records.map((link) => {
    const mapped = { ...link, itemSourceExternalId: merged.sourceMap.get(link.itemSourceExternalId) ?? link.itemSourceExternalId };
    return [`${mapped.itemSourceExternalId}\u001f${mapped.creatureSourceExternalId}\u001f${mapped.relationship.toLocaleLowerCase()}`, mapped];
  })).values()];
  for (const link of sourceLinks.records) {
    const mapped = merged.sourceMap.get(link.itemSourceExternalId) ?? link.itemSourceExternalId;
    if (mapped !== link.itemSourceExternalId) {
      const keeperKey = catalog.records.find((record) => record.item.sourceExternalId === mapped)?.key ?? mapped;
      decisions.push(decision(keeperKey, "creaturePurchaseLink.itemSourceExternalId", link.itemSourceExternalId, mapped, "merged-source", [link.creatureSourceExternalId], "high", "Repointed the purchase relationship to the retained canonical physical Item."));
    }
  }
  const accounting = firstReport.sourceAccounting.map((entry) => {
    const resolved = firstReport.reconciliation.unresolvedEntries.some((candidate) => candidate.sourceEntryId === entry.sourceEntryId);
    return resolved ? { ...entry, status: "Imported", reason: "Resolved by second-pass Artifact/Spiritual curation." } : entry;
  });
  const count = (predicate) => catalog.records.filter(predicate).length;
  const countBy = (values) => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map()).entries()].sort(([left], [right]) => left.localeCompare(right, "en-US")));
  const aliases = catalog.records.reduce((total, record) => total + record.aliases.length, 0);
  const curatedReport = {
    schemaVersion: 2, sourceSystem: SOURCE_SYSTEM,
    before: { itemRecords: original.length, firstPassWeaponProfiles: original.filter((record) => record.weaponProfile).length, firstPassArmorProfiles: original.filter((record) => record.armorProfile).length, unresolvedSourceEntries: unresolved.length, rawSourceEntries: firstReport.sourceAccounting.length },
    after: { itemRecords: catalog.records.length, equipmentItems: count((record) => record.item.catalogSection === "Equipment"), inventoryItems: count((record) => record.item.catalogSection === "Inventory"), weaponProfiles: count((record) => record.weaponProfile), primaryWeaponProfiles: count((record) => record.weaponProfile?.weaponRole === "Primary"), improvisedWeaponProfiles: count((record) => record.weaponProfile?.weaponRole === "Improvised"), armorProfiles: count((record) => record.armorProfile), aliases, creaturePurchaseLinks: curatedLinks.length, unresolvedSourceEntries: 0, missingRequiredFields: 0, rawSourceEntriesAccounted: accounting.length },
    deltas: {},
    vocabulary: { categories: countBy(catalog.records.map((record) => record.item.category)), timelines: countBy(catalog.records.map((record) => record.item.timelineTag)), genres: countBy(catalog.records.flatMap((record) => record.genreTags)), subtypes: countBy(catalog.records.map((record) => record.item.subtype)) },
    decisionSummary: { byBasis: countBy(decisions.map((row) => row.basis)), byConfidence: countBy(decisions.map((row) => row.confidence)), total: decisions.length },
    duplicateSummary: { reviewedGroups: duplicateAudit.length, samePhysicalObject: duplicateAudit.filter((entry) => entry.classification === "same").length, explicitAlias: duplicateAudit.filter((entry) => entry.classification === "alias").length, retainedVariants: duplicateAudit.filter((entry) => entry.classification === "variant").length, semanticallyDifferent: duplicateAudit.filter((entry) => entry.classification === "different").length, ambiguous: duplicateAudit.filter((entry) => entry.classification === "ambiguous").length, sourceRecordsRetiredByMerge: original.length + unresolved.length - catalog.records.length },
    relationshipSummary: { sourcePurchaseRows: sourceLinks.records.length, distinctPurchaseRelationshipsAfterMerge: curatedLinks.length, duplicateRelationshipRowsConsolidated: sourceLinks.records.length - curatedLinks.length },
    representativeAudit: ["Crowbar", "Shovel", "Spiked Shield", "Longsword", "Laser Cannon", "Adaptive Cloak", "Kevlar Vest", "Flashlight", "Horse", "Camel", "Dog (Trained)", "Cat (Pet)", "Falcon", "Exotic Pet (Small)", "Exotic Pet (Large)", "Wand", "Prayer Beads", "Holy Symbol", "Strength Amplifier Gauntlets", "Radio Transmitter", "Golden Doubloons", "Cursed Mirror"].map((name) => { const record = catalog.records.find((entry) => entry.item.name === name); return { name, itemKey: record?.key ?? null, present: Boolean(record), missingRequiredFields: record ? missingRequired(record) : ["record"] }; }),
    duplicateAudit, completenessPolicy: { requiredForAll: ["name", "catalogSection", "timelineTag", "category", "subtype", "genreTags"], costNotApplicable: [...NO_COST], weightNotApplicable: [...NO_WEIGHT], effectRequiredFor: [...EFFECT_REQUIRED], weaponProfileRequiredForCategory: "Weapon", armorProfileRequiredForCategory: "Armor", zeroIsNotUsedAsUnknown: true },
    derivationBases: ["source", "merged-source", "direct-analog", "family-rule", "physical-standard", "curated-design"], sourceAccounting: accounting, missingRequired: missing,
    intentionallyUnmerged: duplicateAudit.filter((entry) => ["variant", "different", "ambiguous"].includes(entry.classification)),
  };
  for (const field of ["itemRecords", "weaponProfiles", "armorProfiles", "unresolvedSourceEntries"]) {
    const beforeName = field === "weaponProfiles" ? "firstPassWeaponProfiles" : field === "armorProfiles" ? "firstPassArmorProfiles" : field;
    curatedReport.deltas[field] = curatedReport.after[field] - curatedReport.before[beforeName];
  }
  const decisionsDocument = { schemaVersion: 1, sourceSystem: SOURCE_SYSTEM, allowedBases: curatedReport.derivationBases, records: decisions };
  const decisionsText = `${JSON.stringify(decisionsDocument, null, 2)}\n`;
  await Promise.all([
    writeFile(curatedCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8"),
    writeFile(decisionsPath, decisionsText, "utf8"),
    writeFile(reportPath, `${JSON.stringify(curatedReport, null, 2)}\n`, "utf8"),
    writeFile(migrationPath, migration(catalog, curatedLinks, merged.sourceMap, sha256(decisionsText)), "utf8"),
  ]);
  console.log(JSON.stringify({ before: curatedReport.before, after: curatedReport.after, decisions: decisions.length, duplicateGroups: duplicateAudit.length }, null, 2));
}

await main();
