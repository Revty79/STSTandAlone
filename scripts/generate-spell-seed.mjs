import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const canonicalSpellSourcePath = path.join(
  projectDirectory,
  "data",
  "serrian-tide-spell-catalog.tsv",
);
const skillCatalogPath = path.join(
  projectDirectory,
  "data",
  "serrian-tide-skill-catalog.tsv",
);
const seedPath = path.join(
  projectDirectory,
  "data",
  "serrian-tide-spell-seed.json",
);
const reportPath = path.join(
  projectDirectory,
  "data",
  "serrian-tide-spell-import-report.json",
);
const migrationPath = path.join(
  projectDirectory,
  "src-tauri",
  "migrations",
  "0004_seed_spell_construction.sql",
);
const arguments_ = process.argv.slice(2);
const createMigration = arguments_.includes("--create-migration-4");
const sourceArgument = arguments_.find((argument) => !argument.startsWith("--"));
const sourcePath = path.resolve(sourceArgument ?? canonicalSpellSourcePath);
const importedAt = "2026-08-16T00:00:00.000Z";

const spellHeaders = [
  "Name",
  "Parent Skill",
  "Mastery Level",
  "Spell Cost",
  "Casting Time",
  "Range",
  "Shape",
  "Duration",
  "Effects",
  "Container Breakdown",
  "Add ons",
  "Modifiers",
  "Notes/Special Conditions",
  "Flavor Line",
  "Progressive spell conditions",
];
const skillHeaders = [
  "Primary Attribute",
  "Secondary Attribute",
  "Skill Type",
  "Skill Tier",
  "Skill Name",
  "Parent Skill",
  "Definition",
];
const practitionerLevels = [
  "Apprentice",
  "Novice",
  "Master",
  "High Master",
  "Grand Master",
];
const emptyPattern = /^(?:|--|none|n\/a|—|â€”|-)+$/iu;

const containerPatterns = [
  { ruleId: "temporal-spatial", pattern: /temporal\s*[/&-]\s*spatial/giu },
  { ruleId: "aoe", pattern: /\baoe\b|\barea(?:\s+of\s+effect)?\b/giu },
  { ruleId: "control", pattern: /\bcontrol\b/giu },
  { ruleId: "target", pattern: /(?<!multi[-\s])\btarget\b/giu },
];
const effectPatterns = [
  { ruleId: "transfer-life-force", pattern: /transfer\s+life\s+force/giu, scalable: true },
  { ruleId: "create-destroy-basic", pattern: /create\s*[/&-]\s*destroy\s*\(?basic\)?/giu },
  { ruleId: "create-destroy-major", pattern: /create\s*[/&-]\s*destroy\s*\(?major\)?/giu },
  { ruleId: "blind-deaf-silence", pattern: /blind\s*[/&-]\s*deaf\s*[/&-]\s*silence/giu },
  { ruleId: "grapple-restrain", pattern: /grapple\s*[/&-]\s*restrain/giu },
  { ruleId: "accelerate-hasten", pattern: /accelerate\s*[/&-]\s*hasten|\bhasten\b/giu, scalable: true },
  { ruleId: "decelerate-slow", pattern: /decelerate\s*[/&-]\s*slow|\bslow\b/giu, scalable: true },
  { ruleId: "illusion-mask", pattern: /illusion\s*[/&-]\s*mask|mask\s*[/&-]\s*illusion/giu },
  { ruleId: "reveal-detect", pattern: /reveal\s*[/&-]\s*detect|detect\s*[/&-]\s*reveal/giu },
  { ruleId: "counter-cancel", pattern: /counter\s*[/&-]\s*cancel|cancel\s*[/&-]\s*counter/giu },
  { ruleId: "link-bind", pattern: /link\s*[/&-]\s*bind|bind\s*[/&-]\s*link/giu },
  { ruleId: "summon-major", pattern: /summon\s*\(?major\)?/giu },
  { ruleId: "summon-minor", pattern: /summon\s*\(?minor\)?/giu },
  { ruleId: "transform-alter", pattern: /transform\s*[/&-]\s*alter|alter\s*[/&-]\s*transform/giu },
  { ruleId: "temporal-stasis", pattern: /temporal\s+stasis/giu },
  { ruleId: "spatial-bubble", pattern: /spatial\s+bubble/giu },
  { ruleId: "pocket-space", pattern: /pocket\s+space/giu },
  { ruleId: "anchor-lock", pattern: /anchor\s*[/&-]\s*lock/giu },
  { ruleId: "stun-daze", pattern: /stun\s*[/&-]\s*daze/giu },
  { ruleId: "teleportation", pattern: /\bteleportation\b/giu },
  { ruleId: "immobilize", pattern: /\bimmobilize\b/giu },
  { ruleId: "knockdown", pattern: /\bknockdown\b/giu },
  { ruleId: "damage", pattern: /\bdamage\b/giu, scalable: true },
  { ruleId: "healing", pattern: /\bhealing\b/giu, scalable: true },
  { ruleId: "debuff", pattern: /\bdebuff\b/giu, scalable: true },
  { ruleId: "buff", pattern: /(?<!de)\bbuff\b/giu, scalable: true },
  { ruleId: "banish", pattern: /\bbanish\b/giu },
  { ruleId: "push", pattern: /\bpush\b/giu },
  { ruleId: "pull", pattern: /\bpull\b/giu },
  { ruleId: "disarm", pattern: /\bdisarm\b/giu },
];
const modifierPatterns = [
  ["per-success-assignment", /per\s+success\s+assignment/iu],
  ["component-requirement", /component\s+requirement/iu],
  ["environmental-dependency", /environmental\s+dependency/iu],
  ["static-assignment", /static\s+assignment/iu],
  ["sense-modifier", /sense\s+modifier/iu],
  ["backlash-risk", /backlash\s+risk/iu],
  ["expose-conceal", /expose\s*[/&-]\s*conceal/iu],
  ["release-delayed", /release\s*\(?delayed\)?/iu],
  ["concentration", /\bconcentration\b/iu],
  ["progressive-spell", /progressive\s+spell/iu],
];

const scalableEffectCosts = {
  damage: [3, 2],
  healing: [3, 2],
  buff: [2, 1],
  debuff: [2, 1],
  "accelerate-hasten": [4, 1],
  "decelerate-slow": [4, 1],
  "transfer-life-force": [4, 2],
};

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceExternalId(name) {
  return `skill-${hash(name.toLocaleLowerCase("en-US"))}`;
}

function stableId(name, category, ordinal = 0) {
  return `${category}-${hash(`${name}|${category}|${ordinal}`).slice(0, 20)}`;
}

function parseTsv(source, expectedHeaders) {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  if (!lines.at(-1)) lines.pop();
  const rawHeaders = lines.shift()?.split("\t") ?? [];
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.slice(0, expectedHeaders.length).join("\t") !== expectedHeaders.join("\t")) {
    throw new Error(`Unexpected TSV headers: ${headers.join(", ")}`);
  }
  return lines.map((line, index) => {
    const values = line.split("\t");
    if (values.length < expectedHeaders.length) {
      throw new Error(`TSV row ${index + 2} has only ${values.length} columns.`);
    }
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(
        expectedHeaders.map((header, column) => [header, values[column]?.trim() ?? ""]),
      ),
    };
  });
}

function canonicalTarget(row) {
  const { Name: name, "Parent Skill": parent, "Mastery Level": mastery } = row.values;
  if (name === "Earthen Grasp" && mastery.startsWith("Novice")) return "Earthen Tangle";
  if (name === "Maelstrom Vortex" && parent === "Water") return "Maelstrom";
  if (name === "Blink Step" && parent === "Psychoportation") return "Blink";
  if (name === "Threads of Fate" && mastery.startsWith("Novice")) return "Whispered Fate";
  if (name === "Umbral Veil" && parent === "Umbrakinesis") return "Umbral Cloak";
  return name;
}

function meaningful(value) {
  return !emptyPattern.test(value.trim());
}

function allMatches(text, definitions, kind) {
  const matches = [];
  for (const definition of definitions) {
    definition.pattern.lastIndex = 0;
    for (const match of text.matchAll(definition.pattern)) {
      matches.push({
        kind,
        ruleId: definition.ruleId,
        scalable: definition.scalable ?? false,
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        source: match[0],
      });
    }
  }
  matches.sort((left, right) => left.index - right.index || right.end - left.end);
  return matches.filter((candidate, index, list) =>
    !list.slice(0, index).some(
      (existing) => candidate.index >= existing.index && candidate.end <= existing.end,
    ),
  );
}

function reportedComponentCost(text, endIndex) {
  const tail = text.slice(endIndex, endIndex + 90);
  const match = tail.match(/^\s*\(\s*([+âˆ’−–-]?\d+)\s*mana\b/iu)
    ?? tail.match(/^\s*\(\s*([+âˆ’−–-]?\d+)\s*\)/iu);
  if (!match) return undefined;
  return Math.abs(Number(match[1].replace(/[âˆ’−–]/gu, "-")));
}

function effectQuantity(ruleId, text, match, warnings) {
  const costs = scalableEffectCosts[ruleId];
  if (!costs) return 1;
  const componentCost = reportedComponentCost(text, match.end);
  if (componentCost !== undefined) {
    const [baseCost, incrementCost] = costs;
    const remainder = componentCost - baseCost;
    if (remainder >= 0 && remainder % incrementCost === 0) {
      return 1 + remainder / incrementCost;
    }
  }
  const local = text.slice(Math.max(0, match.index - 45), match.end + 100);
  const explicit = ruleId === "damage"
    ? local.match(/(?:deals?\s*)?(\d+)\s+(?:points?\s+of\s+)?damage|damage[^\d]{0,25}(\d+)\s*(?:points?|pts?)/iu)
    : ruleId === "healing" || ruleId === "transfer-life-force"
      ? local.match(/(?:heals?|healing|transfer)[^\d]{0,25}(\d+)\s*(?:hp|points?|pts?)/iu)
      : ruleId === "buff" || ruleId === "debuff"
        ? local.match(/([+âˆ’−–-]?\d+)\s*%|[+âˆ’−–-](\d+)\s*(?:to\s+)?(?:stat|roll|initiative|defen|accura)/iu)
        : local.match(/[+âˆ’−–-](\d+)\s*initiative/iu);
  const amount = explicit
    ? Number(explicit[1] ?? explicit[2])
    : undefined;
  if (Number.isFinite(amount) && amount > 0) {
    if ((ruleId === "buff" || ruleId === "debuff") && explicit?.[1]?.includes("%")) {
      return Math.max(1, Math.ceil(amount / 5));
    }
    return amount;
  }
  warnings.push(`No deterministic quantity was found for ${ruleId}; imported at its base quantity of 1.`);
  return 1;
}

function parseStructure(row, targetName, warnings) {
  const breakdown = row.values["Container Breakdown"];
  const containerMatches = allMatches(breakdown, containerPatterns, "container");
  const effectMatches = allMatches(breakdown, effectPatterns, "effect");
  if (containerMatches.length === 0) {
    const fallback = meaningful(row.values.Shape) && !/single\s+target/iu.test(row.values.Shape)
      ? "aoe"
      : "target";
    containerMatches.push({
      kind: "container",
      ruleId: fallback,
      index: 0,
      end: 0,
      source: "",
    });
    warnings.push(`No recognized container was found; used ${fallback} as a reviewable fallback.`);
  }

  const roots = [];
  const occurrences = [];
  for (const [index, match] of containerMatches.entries()) {
    const container = {
      id: stableId(targetName, "container", index),
      containerRuleId: match.ruleId,
      effects: [],
      rangeDescription: "",
      durations: [],
      modifiers: [],
      children: [],
    };
    const before = breakdown.slice(Math.max(0, match.index - 35), match.index);
    const parent = /nested/iu.test(before) ? occurrences.at(-1)?.container : undefined;
    if (parent) parent.children.push(container);
    else roots.push(container);
    occurrences.push({ ...match, container });
  }

  for (const [index, effectMatch] of effectMatches.entries()) {
    const owner = occurrences.filter((candidate) => candidate.index <= effectMatch.index).at(-1)
      ?? occurrences[0];
    owner.container.effects.push({
      id: stableId(targetName, "effect", index),
      ruleId: effectMatch.ruleId,
      quantity: effectQuantity(effectMatch.ruleId, breakdown, effectMatch, warnings),
      description: effectMatch.source,
    });
  }
  if (effectMatches.length === 0) {
    warnings.push("No construction-table Stand-Alone effect could be parsed; the raw breakdown was preserved for manual review.");
  }
  for (const occurrence of occurrences) {
    if (occurrence.container.effects.length === 0) {
      warnings.push(`${occurrence.ruleId} container has no directly parsed Stand-Alone effect and will remain visibly invalid until reviewed.`);
    }
  }
  return roots;
}

function firstContainer(containers, predicate = () => true) {
  for (const container of containers) {
    if (predicate(container)) return container;
    const child = firstContainer(container.children, predicate);
    if (child) return child;
  }
  return undefined;
}

const controlEffectIds = new Set([
  "push",
  "pull",
  "grapple-restrain",
  "immobilize",
  "stun-daze",
  "disarm",
  "knockdown",
  "blind-deaf-silence",
  "anchor-lock",
]);
const temporalEffectIds = new Set([
  "teleportation",
  "banish",
  "pocket-space",
  "spatial-bubble",
  "temporal-stasis",
]);
const scalableEffectIds = new Set(Object.keys(scalableEffectCosts));

function flattenContainers(containers) {
  return containers.flatMap((container) => [
    container,
    ...flattenContainers(container.children),
  ]);
}

function normalizeForCalculator(containers, targetName, warnings) {
  const flattened = flattenContainers(containers);
  const rangeSource = flattened.find(({ rangeRuleId }) => rangeRuleId);
  const durationSource = flattened.find(({ durations }) => durations.length > 0);
  const shapeSource = flattened.find(({ shape }) => shape)?.shape;
  const multiTargetSource = flattened.find(({ multiTarget }) => multiTarget)?.multiTarget;
  const entries = flattened.flatMap((container) =>
    container.effects.map((effect) => ({
      effect,
      sourceContainerRuleId: container.containerRuleId,
    })),
  );

  const retainedEntries = entries.filter(({ effect }) => {
    if (effect.ruleId !== "spatial-bubble" || shapeSource) return true;
    warnings.push("Spatial Bubble was retained in source metadata but excluded from active construction because the calculator requires an AoE Shape.");
    return false;
  });
  const hasRetainedTemporalEffect = retainedEntries.some(({ effect }) =>
    temporalEffectIds.has(effect.ruleId),
  );
  const categorized = new Map([
    ["target", []],
    ["aoe", []],
    ["control", []],
    ["temporal-spatial", []],
  ]);

  for (const entry of retainedEntries) {
    const { effect, sourceContainerRuleId } = entry;
    let targetRuleId = sourceContainerRuleId;
    if (controlEffectIds.has(effect.ruleId)) {
      targetRuleId = "control";
      if (sourceContainerRuleId !== "control") {
        warnings.push(`${effect.ruleId} was moved into a Control container required by the calculator.`);
      }
    } else if (effect.ruleId === "spatial-bubble") {
      targetRuleId = "aoe";
      if (sourceContainerRuleId !== "aoe") {
        warnings.push("Spatial Bubble was moved into an AoE container required by the calculator.");
      }
    } else if (sourceContainerRuleId === "aoe" && !shapeSource) {
      targetRuleId = "target";
      warnings.push(`${effect.ruleId} was moved from an incomplete AoE into Target; the source provides no calculator-valid Shape.`);
    } else if (sourceContainerRuleId === "control") {
      targetRuleId = "target";
      warnings.push(`${effect.ruleId} was moved from Control into Target because it is not a Control Stand-Alone.`);
    } else if (sourceContainerRuleId === "temporal-spatial" && !hasRetainedTemporalEffect) {
      targetRuleId = "target";
      warnings.push(`${effect.ruleId} was moved from an incomplete Temporal/Spatial container into Target.`);
    }
    categorized.get(targetRuleId).push(effect);
  }

  const sourceHasAoe = flattened.some(({ containerRuleId }) => containerRuleId === "aoe");
  if (sourceHasAoe && shapeSource && categorized.get("aoe").length === 0) {
    const targetEffects = categorized.get("target");
    const candidateIndex = targetEffects.findIndex(({ ruleId }) => !controlEffectIds.has(ruleId));
    if (candidateIndex >= 0) {
      const [candidate] = targetEffects.splice(candidateIndex, 1);
      categorized.get("aoe").push(candidate);
      warnings.push(`${candidate.ruleId} was attached to the shaped AoE so the active construction satisfies the calculator's direct-effect rule.`);
    }
  }

  const normalized = [];
  let containerOrdinal = 0;
  for (const ruleId of ["target", "aoe", "control", "temporal-spatial"]) {
    const effects = categorized.get(ruleId);
    const buckets = [];
    for (const effect of effects) {
      const bucket = buckets.find((candidate) =>
        candidate.length < 5
        && (scalableEffectIds.has(effect.ruleId)
          || !candidate.some(({ ruleId: existingRuleId }) => existingRuleId === effect.ruleId)),
      );
      if (bucket) bucket.push(effect);
      else buckets.push([effect]);
    }
    for (const bucket of buckets) {
      const container = {
        id: stableId(targetName, "calculator-container", containerOrdinal),
        containerRuleId: ruleId,
        effects: bucket,
        rangeDescription: "",
        durations: [],
        modifiers: [],
        children: [],
      };
      if (ruleId === "aoe" && shapeSource) {
        container.shape = {
          ...shapeSource,
          id: stableId(targetName, "calculator-shape", containerOrdinal),
        };
      }
      normalized.push(container);
      containerOrdinal += 1;
    }
  }

  if (normalized.length === 0) {
    throw new Error(`"${targetName}" has no calculator-supported Stand-Alone effect.`);
  }
  const primary = normalized[0];
  if (rangeSource?.rangeRuleId) {
    primary.rangeRuleId = rangeSource.rangeRuleId;
    primary.rangeDescription = rangeSource.rangeDescription;
  }
  if (durationSource) primary.durations = durationSource.durations;
  if (multiTargetSource) {
    const owner = normalized.find(({ containerRuleId }) => containerRuleId === "target")
      ?? normalized.find(({ containerRuleId }) => containerRuleId === "aoe");
    if (owner) owner.multiTarget = multiTargetSource;
    else warnings.push("Multi-Target was retained in source metadata but excluded because the calculator requires Target or AoE.");
  }
  return normalized;
}

function parseRange(value) {
  const normalized = value.toLocaleLowerCase("en-US");
  if (!meaningful(value)) return undefined;
  if (normalized.includes("unlimited")) return "unlimited";
  if (normalized.includes("line of sight")) return "line-of-sight";
  if (normalized.includes("long")) return "long";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("short")) return "short";
  if (normalized.includes("melee")) return "melee-reach";
  if (normalized.includes("touch")) return "touch";
  if (normalized.includes("self")) return "self";
  return undefined;
}

function parseShape(row, targetName, warnings) {
  const value = row.values.Shape;
  if (!meaningful(value) || /single\s+target|multi[-\s]target/iu.test(value)) return undefined;
  let ruleId;
  if (/\bwall\b/iu.test(value)) ruleId = "wall";
  else if (/\bcone\b/iu.test(value)) ruleId = "cone";
  else if (/\bline\b/iu.test(value)) ruleId = "line";
  else if (/\bradius\b/iu.test(value) && !/sphere|cube|zone/iu.test(value)) ruleId = "radius";
  else if (/sphere|cube|zone/iu.test(value)) ruleId = "sphere-cube-zone";
  if (!ruleId) {
    warnings.push(`Unrecognized shape "${value}" was retained only in source metadata.`);
    return undefined;
  }

  let quantity = 0;
  const size = value.match(/(\d+)\s*ft/iu);
  if (ruleId !== "sphere-cube-zone" && size) {
    const base = ruleId === "radius" ? 10 : 30;
    quantity = Math.max(0, Math.ceil((Number(size[1]) - base) / 10));
  } else if (ruleId === "sphere-cube-zone") {
    const addOnSegment = row.values["Add ons"].match(/shape\s*:[^;]*(?=;|,?\s*duration|$)/iu)?.[0] ?? "";
    const parentheticalCosts = [...addOnSegment.matchAll(/\((\d+)\s*(?:mana)?\)/giu)];
    const explicitTotal = addOnSegment.match(/=\s*(\d+)\s*\)?/iu);
    const cost = explicitTotal
      ? Number(explicitTotal[1])
      : parentheticalCosts.length > 0
        ? Number(parentheticalCosts.at(-1)[1])
        : undefined;
    if (cost !== undefined && cost >= 5 && (cost - 5) % 3 === 0) {
      quantity = (cost - 5) / 3;
    } else {
      warnings.push(`Sphere/Cube/Zone size steps are undefined; "${value}" was retained without invented scaling.`);
    }
  }
  return {
    id: stableId(targetName, "shape"),
    ruleId,
    quantity,
    description: value,
  };
}

function parseDurations(value, targetName, warnings) {
  if (!meaningful(value)) return [];
  const durations = [];
  if (/instantaneous/iu.test(value)) {
    durations.push({ id: stableId(targetName, "duration", durations.length), ruleId: "instantaneous", quantity: 0, description: value });
  }
  if (/combat\s+step/iu.test(value)) {
    durations.push({ id: stableId(targetName, "duration", durations.length), ruleId: "combat-step", quantity: 0, description: value });
    const count = value.match(/(\d+)\s+combat\s+steps?/iu);
    if (count && Number(count[1]) > 1) warnings.push(`Multiple Combat Steps in "${value}" are not defined as stackable.`);
  }
  if (/combat\s+round|\b\d+\s+rounds?/iu.test(value)) {
    durations.push({ id: stableId(targetName, "duration", durations.length), ruleId: "combat-round", quantity: 0, description: value });
    const count = value.match(/(\d+)\s+(?:combat\s+)?rounds?/iu);
    if (count && Number(count[1]) > 1) warnings.push(`Multiple Combat Rounds in "${value}" cannot be encoded by the current non-stackable rule.`);
  }
  if (/lingering/iu.test(value)) {
    const count = value.match(/lingering[^\d]{0,20}(\d+)\s*(?:steps?|rounds?)/iu)
      ?? value.match(/(\d+)\s+lingering\s+steps?/iu);
    const quantity = count ? Number(count[1]) : 1;
    durations.push({ id: stableId(targetName, "duration", durations.length), ruleId: "lingering", quantity, description: value });
    if (!count || /hours|permanent|day/iu.test(value)) warnings.push(`Non-step Lingering duration "${value}" requires manual rules review.`);
  }
  if (durations.length === 0) warnings.push(`Unrecognized duration "${value}" was retained only in source metadata.`);
  return durations;
}

function parseMultiTarget(row, warnings) {
  const combined = `${row.values.Shape}; ${row.values["Add ons"]}`;
  if (!/multi[-\s]target/iu.test(combined)) return undefined;
  const extra = combined.match(/multi[-\s]target[^;]{0,50}?(\d+)\s*(?:extra|additional)/iu)
    ?? combined.match(/(\d+)\s*(?:extra|additional)[^;]{0,20}(?:targets?)?/iu);
  const total = combined.match(/multi[-\s]target[^;]{0,50}?(?:up\s+to\s+)?(\d+)\s*(?:targets?|allies|creatures|foes|enemies)/iu);
  let additionalTargets = extra ? Number(extra[1]) : total ? Math.max(1, Number(total[1]) - 1) : 1;
  if (!extra && !total) {
    const cost = combined.match(/multi[-\s]target[^;]{0,60}?\((\d+)\s*(?:mana)?\)/iu);
    if (cost && Number(cost[1]) >= 3) additionalTargets = Number(cost[1]) - 2;
    else warnings.push("Multi-Target count was not explicit; imported one additional target for review.");
  }
  return { ruleId: "multi-target", additionalTargets, description: combined };
}

function modifierQuantity(ruleId, text) {
  const label = modifierPatterns.find(([candidate]) => candidate === ruleId)?.[1];
  const index = label ? text.search(label) : -1;
  const local = index >= 0 ? text.slice(index, index + 120) : text;
  const multiplied = local.match(/[âˆ’−–-]2\s*[*xÃ—]\s*(\d+)/iu);
  if ((ruleId === "component-requirement" || ruleId === "concentration") && multiplied) {
    return Number(multiplied[1]);
  }
  if (ruleId === "component-requirement" || ruleId === "concentration") {
    const cost = local.match(/[âˆ’−–-](\d+)/u);
    if (cost && Number(cost[1]) > 2 && Number(cost[1]) % 2 === 0) return Number(cost[1]) / 2;
  }
  return 1;
}

function parseProgressive(row) {
  const raw = row.values["Progressive spell conditions"];
  const enabled = meaningful(raw)
    || /progressive/iu.test(row.values["Mastery Level"])
    || (/progressive\s+spell/iu.test(row.values.Modifiers) && !/not\s+used/iu.test(row.values.Modifiers));
  const pieces = new Map();
  const matches = [...raw.matchAll(/\b(Apprentice|Novice|Master|High\s+Master|Grand\s+Master)(?:\+)?\s*:/giu)];
  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? raw.length;
    pieces.set(match[1].replace(/\s+/gu, " ").replace(/^./u, (letter) => letter.toUpperCase()), raw.slice(start, end).replace(/^[\sâ€¢•*;.-]+|[\sâ€¢•*;.-]+$/gu, "").trim());
  }
  return {
    enabled,
    costMode: "original-base",
    milestones: practitionerLevels.map((level) => ({
      level,
      tierName: level,
      condition: pieces.get(level) ?? "",
      description: pieces.get(level) ?? "",
      notes: enabled ? raw : "",
      flavorLine: "",
      changes: [],
    })),
  };
}

function parseModifiers(row, targetName, progressive, warnings) {
  const text = row.values.Modifiers;
  const selections = [];
  for (const [ruleId, pattern] of modifierPatterns) {
    const present = pattern.test(text) && !(ruleId === "progressive-spell" && /not\s+used/iu.test(text));
    if (!present) continue;
    selections.push({
      id: stableId(targetName, "modifier", selections.length),
      ruleId,
      quantity: modifierQuantity(ruleId, text),
      description: text,
    });
  }
  if (progressive.enabled && !selections.some(({ ruleId }) => ruleId === "progressive-spell")) {
    selections.push({
      id: stableId(targetName, "modifier", selections.length),
      ruleId: "progressive-spell",
      quantity: 1,
      description: row.values["Progressive spell conditions"],
    });
    warnings.push("Progressive conditions required the Progressive Spell modifier; no tier changes were invented from prose.");
  }
  return selections;
}

function traditionFor(classification) {
  if (classification.toLocaleLowerCase("en-US") === "spell") return "Spellcraft/Talismanism/Faith";
  if (classification.toLocaleLowerCase("en-US") === "psionic skill") return "Psionics";
  if (classification.toLocaleLowerCase("en-US") === "reverberation") return "Bardic Resonance";
  throw new Error(`Unsupported magic classification "${classification}".`);
}

function buildSpell(group, skill) {
  const primary = group.rows[0];
  const row = primary.values;
  const targetName = group.targetName;
  const warnings = [];
  const progressive = parseProgressive(primary);
  const containers = parseStructure(primary, targetName, warnings);
  const rangeRuleId = parseRange(row.Range);
  const rangeOwner = firstContainer(containers);
  if (rangeRuleId && rangeOwner) {
    rangeOwner.rangeRuleId = rangeRuleId;
    rangeOwner.rangeDescription = row.Range;
  } else if (meaningful(row.Range)) {
    warnings.push(`Unrecognized range "${row.Range}" was retained only in source metadata.`);
  }
  const shape = parseShape(primary, targetName, warnings);
  if (shape) {
    const shapeOwner = firstContainer(containers, ({ containerRuleId }) => containerRuleId === "aoe") ?? rangeOwner;
    if (shapeOwner) shapeOwner.shape = shape;
  }
  const durations = parseDurations(row.Duration, targetName, warnings);
  if (rangeOwner) rangeOwner.durations = durations;
  const multiTarget = parseMultiTarget(primary, warnings);
  if (multiTarget) {
    const targetOwner = firstContainer(containers, ({ containerRuleId }) => containerRuleId === "target")
      ?? firstContainer(containers, ({ containerRuleId }) => containerRuleId === "aoe")
      ?? rangeOwner;
    if (targetOwner) targetOwner.multiTarget = multiTarget;
  }
  const modifiers = parseModifiers(primary, targetName, progressive, warnings);
  const calculatorContainers = normalizeForCalculator(containers, targetName, warnings);
  const tradition = traditionFor(skill.classification);
  const spell = {
    schemaVersion: 6,
    id: stableId(targetName, "spell"),
    name: targetName,
    tradition,
    sphere: tradition === "Spellcraft/Talismanism/Faith" ? skill.parentName : "",
    discipline: tradition === "Psionics" ? skill.parentName : "",
    resonance: tradition === "Bardic Resonance" ? skill.parentName : "",
    containers: calculatorContainers,
    modifiers,
    description: row.Effects,
    notes: row["Notes/Special Conditions"],
    flavorLine: row["Flavor Line"],
    progressive,
    createdAt: importedAt,
    modifiedAt: importedAt,
  };
  return {
    spell,
    warnings,
    referenceMastery: row["Mastery Level"].replace(/\s*\(Progressive\)\s*/giu, "").trim(),
    referenceCost: Number(row["Spell Cost"]),
    referenceCastingTime: Number(row["Casting Time"]),
  };
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function serializeMigration(seed, sourceHash) {
  const oldChronoBurstId = sourceExternalId("CHAono-Burst");
  const oldChronoStasisId = sourceExternalId("CHAono-Stasis Field");
  const rows = seed.records.map((record, index) => `  (${[
    index + 1,
    record.sourceExternalId,
    record.parentExternalId,
    JSON.stringify(record.spell),
    JSON.stringify(record.source),
  ].map(sqlValue).join(", ")})`);
  return `-- Generated by scripts/generate-spell-seed.mjs.
-- Canonical spell TSV SHA-256: ${sourceHash}
-- Do not hand-edit this migration; update the TSV/parser and regenerate it.

PRAGMA foreign_keys = ON;

-- Repair the two spelling errors from the original catalog without changing
-- the existing row ids or their saved relationships.
UPDATE OR IGNORE skills
SET name = 'Chrono-Burst',
    source_external_id = ${sqlValue(sourceExternalId("Chrono-Burst"))},
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE source_system = 'serrian-tide-core'
  AND source_external_id = ${sqlValue(oldChronoBurstId)};

UPDATE OR IGNORE skills
SET name = 'Chrono-Stasis Field',
    source_external_id = ${sqlValue(sourceExternalId("Chrono-Stasis Field"))},
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE source_system = 'serrian-tide-core'
  AND source_external_id = ${sqlValue(oldChronoStasisId)};

-- Soul Lock is the only construction-sheet spell that was not already a
-- canonical Skill. Existing installations receive it here; fresh installs
-- already receive the same identity from migration 0003.
INSERT OR IGNORE INTO skills (
    name, classification, tier, primary_attribute, secondary_attribute,
    definition, created_by_user_id, source_system, source_external_id
) VALUES (
    'Soul Lock', 'spell', 3, 'INT', 'WIS',
    'Binds multiple foes with spectral chains; restrained targets suffer Immobilize and –2 to all rolls until freed.',
    NULL, 'serrian-tide-core', ${sqlValue(sourceExternalId("Soul Lock"))}
);

INSERT OR IGNORE INTO skill_relationships (skill_id, related_skill_id, relationship_type, sort_order)
SELECT child.id, parent.id, 'parent', 0
FROM skills child
JOIN skills parent
  ON parent.source_system = 'serrian-tide-core'
 AND parent.source_external_id = ${sqlValue(sourceExternalId("Death"))}
WHERE child.source_system = 'serrian-tide-core'
  AND child.source_external_id = ${sqlValue(sourceExternalId("Soul Lock"))};

DROP TABLE IF EXISTS temp._serrian_tide_spell_seed;
CREATE TEMP TABLE _serrian_tide_spell_seed (
    ordinal INTEGER PRIMARY KEY,
    source_external_id TEXT NOT NULL UNIQUE,
    parent_external_id TEXT NOT NULL,
    construction_json TEXT NOT NULL,
    source_json TEXT NOT NULL
);

INSERT INTO _serrian_tide_spell_seed (
    ordinal, source_external_id, parent_external_id, construction_json, source_json
) VALUES
${rows.join(",\n")};

-- User-authored Spell Construction data always wins. The seed only fills a
-- missing extension and therefore remains safe to re-run.
INSERT OR IGNORE INTO skill_extensions (skill_id, extension_type, schema_version, data_json)
SELECT skill.id,
       'spell-construction',
       6,
       json_set(seed.construction_json, '$.frameworkSkillId', framework.id)
FROM _serrian_tide_spell_seed seed
JOIN skills skill
  ON skill.source_system = 'serrian-tide-core'
 AND skill.source_external_id = seed.source_external_id
JOIN skills framework
  ON framework.source_system = 'serrian-tide-core'
 AND framework.source_external_id = seed.parent_external_id
ORDER BY seed.ordinal;

INSERT OR IGNORE INTO skill_extensions (skill_id, extension_type, schema_version, data_json)
SELECT skill.id, 'spell-import-source', 1, seed.source_json
FROM _serrian_tide_spell_seed seed
JOIN skills skill
  ON skill.source_system = 'serrian-tide-core'
 AND skill.source_external_id = seed.source_external_id
ORDER BY seed.ordinal;

DROP TABLE _serrian_tide_spell_seed;
`;
}

const [spellSource, skillSource] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(skillCatalogPath, "utf8"),
]);
const sourceRows = parseTsv(spellSource, spellHeaders).filter(({ values }) => values.Name);
const skillRows = parseTsv(skillSource, skillHeaders).map(({ values }) => ({
  name: values["Skill Name"],
  classification: values["Skill Type"],
  parentName: values["Parent Skill"],
}));
const skillsByName = new Map(skillRows.map((row) => [row.name.toLocaleLowerCase("en-US"), row]));

const grouped = new Map();
for (const row of sourceRows) {
  const targetName = canonicalTarget(row);
  const key = targetName.toLocaleLowerCase("en-US");
  const group = grouped.get(key) ?? { targetName, rows: [] };
  group.rows.push(row);
  grouped.set(key, group);
}

for (const group of grouped.values()) {
  if (group.rows.length === 1) continue;
  const fingerprints = new Set(group.rows.map(({ values }) => JSON.stringify(values)));
  if (fingerprints.size !== 1) {
    throw new Error(`Canonical mapping produced conflicting rows for "${group.targetName}".`);
  }
}

const records = [];
for (const group of grouped.values()) {
  const skill = skillsByName.get(group.targetName.toLocaleLowerCase("en-US"));
  if (!skill) throw new Error(`Mapped spell "${group.targetName}" is absent from the Skill catalog.`);
  const sheetParent = group.rows[0].values["Parent Skill"];
  if (skill.parentName !== sheetParent) {
    throw new Error(`Mapped spell "${group.targetName}" belongs to "${skill.parentName}", not source parent "${sheetParent}".`);
  }
  const parsed = buildSpell(group, skill);
  records.push({
    targetName: group.targetName,
    sourceExternalId: sourceExternalId(group.targetName),
    parentExternalId: sourceExternalId(skill.parentName),
    spell: parsed.spell,
    source: {
      schemaVersion: 1,
      importVersion: 1,
      sourceFile: "data/serrian-tide-spell-catalog.tsv",
      sourceRows: group.rows.map(({ rowNumber, values }) => ({ rowNumber, values })),
      canonicalMapping: {
        targetSkillName: group.targetName,
        targetParentName: skill.parentName,
        sourceNames: [...new Set(group.rows.map(({ values }) => values.Name))],
      },
      spreadsheetReference: {
        referenceOnly: true,
        masteryLabel: parsed.referenceMastery,
        statedSpellCost: parsed.referenceCost,
        statedCastingTime: parsed.referenceCastingTime,
      },
      parseWarnings: parsed.warnings,
      importedAt,
    },
  });
}
records.sort((left, right) => left.targetName.localeCompare(right.targetName, "en-US"));

if (sourceRows.length !== 373) throw new Error(`Expected 373 populated source rows; found ${sourceRows.length}.`);
if (records.length !== 371) throw new Error(`Expected 371 canonical spell records; found ${records.length}.`);
if (!records.some(({ targetName }) => targetName === "Soul Lock")) throw new Error("Soul Lock was not imported.");

const sourceHash = hash(spellSource);
const warningRecords = records.filter(({ source }) => source.parseWarnings.length > 0);
const seed = {
  schemaVersion: 1,
  sourceSha256: sourceHash,
  generatedAt: importedAt,
  sourceRowCount: sourceRows.length,
  recordCount: records.length,
  records,
};
const report = {
  schemaVersion: 1,
  sourceSha256: sourceHash,
  sourceRowCount: sourceRows.length,
  duplicateSourceRowsCollapsed: sourceRows.length - records.length,
  canonicalRecordCount: records.length,
  recordsWithWarnings: warningRecords.length,
  totalWarnings: records.reduce((total, record) => total + record.source.parseWarnings.length, 0),
  aliases: [
    "Earthen Grasp (Novice) -> Earthen Tangle",
    "Maelstrom Vortex (Water) -> Maelstrom",
    "Blink Step (Psychoportation) -> Blink",
    "Threads of Fate (Novice) -> Whispered Fate",
    "Umbral Veil (Umbrakinesis) -> Umbral Cloak",
  ],
  correctedCatalogNames: ["Chrono-Burst", "Chrono-Stasis Field"],
  addedCatalogNames: ["Soul Lock"],
  reviewQueue: warningRecords.map(({ targetName, source }) => ({
    targetName,
    warnings: source.parseWarnings,
  })),
};
const migration = serializeMigration(seed, sourceHash);

await Promise.all([
  mkdir(path.dirname(seedPath), { recursive: true }),
  mkdir(path.dirname(migrationPath), { recursive: true }),
]);
await Promise.all([
  writeFile(canonicalSpellSourcePath, spellSource, "utf8"),
  writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ...(createMigration ? [writeFile(migrationPath, migration, "utf8")] : []),
]);

process.stdout.write(
  `Generated ${records.length} calculator-shaped Spell Construction records from ${sourceRows.length} reference rows; ${warningRecords.length} records retain review notes in source metadata.${createMigration ? " Migration 0004 was created." : " Migration 0004 is immutable; later changes require a new migration."}\n`,
);
