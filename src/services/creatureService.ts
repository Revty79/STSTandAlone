import { creatureRepository, type CreatureRepository } from "../data/repositories/creatureRepository";
import type { CreatureAggregate, CreatureItemCandidate, CreatureLibraryFilters, CreatureLibraryOptions, CreatureLibraryPage, CreatureSkillCandidate, SaveCreatureAggregate } from "../types/creature";

export class CreatureValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CreatureValidationError"; }
}

function cleanOptional(value: string | null): string | null { const clean = value?.trim() ?? ""; return clean || null; }
function finite(value: number, label: string): number { if (!Number.isFinite(value)) throw new CreatureValidationError(`${label} must be a number.`); return value; }
function nullableFinite(value: number | null, label: string): number | null { return value === null ? null : finite(value, label); }
function uniqueRows<T>(rows: T[], identity: (row: T) => string, label: (row: T) => string) {
  const seen = new Set<string>();
  for (const row of rows) { const key = identity(row).toLocaleLowerCase(); if (seen.has(key)) throw new CreatureValidationError(`${label(row)} cannot be added twice.`); seen.add(key); }
}

export function normalizeCreature(input: SaveCreatureAggregate): SaveCreatureAggregate {
  const name = input.core.name.trim();
  if (!name) throw new CreatureValidationError("Creature name is required.");
  const sourceSystem = cleanOptional(input.core.sourceSystem);
  const sourceExternalId = cleanOptional(input.core.sourceExternalId);
  if ((sourceSystem === null) !== (sourceExternalId === null)) throw new CreatureValidationError("Creature source system and external identity must be supplied together.");
  const altNames = input.altNames.map((row, sortOrder) => ({ altName: row.altName.trim(), sortOrder })).filter((row) => row.altName);
  const genreTags = input.genreTags.map((row, sortOrder) => ({ genreTag: row.genreTag.trim(), sortOrder })).filter((row) => row.genreTag);
  uniqueRows(altNames, (row) => row.altName, (row) => row.altName);
  uniqueRows(genreTags, (row) => row.genreTag, (row) => row.genreTag);
  const attributes = input.attributes.map((row, sortOrder) => ({ attributeKey: row.attributeKey.trim(), value: finite(row.value, `${row.attributeKey || "Attribute"} Value`), notes: row.notes.trim(), sortOrder }));
  if (attributes.some((row) => !row.attributeKey)) throw new CreatureValidationError("Every Attribute row needs an Attribute name.");
  uniqueRows(attributes, (row) => row.attributeKey, (row) => row.attributeKey);
  const movementModes = input.movementModes.map((row, sortOrder) => ({ movementMode: row.movementMode.trim(), baseValue: finite(row.baseValue, `${row.movementMode || "Movement"} Base Value`), notes: row.notes.trim(), sortOrder }));
  if (movementModes.some((row) => !row.movementMode)) throw new CreatureValidationError("Every Movement row needs a Movement Mode.");
  const hpLocations = input.hpLocations.map((row, sortOrder) => ({ locationName: row.locationName.trim(), hpValue: finite(row.hpValue, `${row.locationName || "Location"} HP`), notes: row.notes.trim(), sortOrder }));
  if (hpLocations.some((row) => !row.locationName)) throw new CreatureValidationError("Every HP Location needs a name.");
  const attacks = input.attacks.map((row, sortOrder) => ({ name: row.name.trim(), damage: nullableFinite(row.damage, `${row.name || "Attack"} Damage`), rangeText: row.rangeText.trim(), effect: row.effect.trim(), notes: row.notes.trim(), sortOrder }));
  if (attacks.some((row) => !row.name)) throw new CreatureValidationError("Every Attack needs a name.");
  const skillLinks = input.skillLinks.map((row, index) => ({ ...row, skillName: row.skillName.trim(), skillClassification: row.skillClassification.trim(), linkType: row.linkType.trim(), value: nullableFinite(row.value, `${row.skillName || "Skill"} Value`), notes: row.notes.trim(), sortOrder: input.skillLinks.slice(0, index).filter((candidate) => candidate.linkType.trim().toLocaleLowerCase() === row.linkType.trim().toLocaleLowerCase()).length }));
  for (const row of skillLinks) {
    if (!Number.isInteger(row.skillId) || row.skillId <= 0 || !row.linkType) throw new CreatureValidationError("Every Creature Skill link must reference a saved Skill and have a type.");
    if (row.linkType.toLocaleLowerCase() === "granted" && row.skillClassification.toLocaleLowerCase() !== "special ability") throw new CreatureValidationError("Granted / Special Abilities must reference a Special Ability Skill.");
  }
  uniqueRows(skillLinks, (row) => `${row.skillId}:${row.linkType}`, (row) => row.skillName || "That Skill");
  const uses = input.uses.map((row, sortOrder) => ({ useType: row.useType.trim(), notes: row.notes.trim(), sortOrder })).filter((row) => row.useType);
  uniqueRows(uses, (row) => row.useType, (row) => row.useType);
  const variants = input.variants.map((row, sortOrder) => ({ name: row.name.trim(), description: row.description.trim(), notes: row.notes.trim(), sortOrder }));
  if (variants.some((row) => !row.name)) throw new CreatureValidationError("Every Variant needs a name.");
  const purchaseItemLinks = input.purchaseItemLinks.map((row) => ({ ...row, itemName: row.itemName.trim(), category: row.category.trim(), subtype: row.subtype.trim(), genreTags: row.genreTags.map((tag) => tag.trim()).filter(Boolean), relationship: row.relationship.trim(), notes: row.notes.trim() }));
  for (const row of purchaseItemLinks) if (!Number.isInteger(row.itemId) || row.itemId <= 0 || !row.relationship) throw new CreatureValidationError("Every Purchase link must reference a saved Inventory Item.");
  uniqueRows(purchaseItemLinks, (row) => `${row.itemId}:${row.relationship}`, (row) => row.itemName || "That Item");
  return {
    id: input.id,
    core: {
      ...input.core, name, challengeRating: nullableFinite(input.core.challengeRating, "Challenge Rating"),
      encounterScale: input.core.encounterScale.trim(), type: input.core.type.trim(), role: input.core.role.trim(),
      size: input.core.size.trim(), descriptionShort: input.core.descriptionShort.trim(),
      hpTotal: nullableFinite(input.core.hpTotal, "HP Total"), initiative: nullableFinite(input.core.initiative, "Initiative"),
      armorSoak: nullableFinite(input.core.armorSoak, "Armor Soak"),
      magicResonanceInteraction: input.core.magicResonanceInteraction.trim(), behaviorTactics: input.core.behaviorTactics.trim(),
      habitat: input.core.habitat.trim(), diet: input.core.diet.trim(), lootHarvest: input.core.lootHarvest.trim(),
      storyHooks: input.core.storyHooks.trim(), notes: input.core.notes.trim(), sourceSystem, sourceExternalId,
    },
    altNames, genreTags, attributes, movementModes, hpLocations, attacks, skillLinks, uses, variants, purchaseItemLinks,
  };
}

export class CreatureService {
  constructor(private readonly repository: CreatureRepository = creatureRepository) {}
  listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage> { return this.repository.listCreatures(filters); }
  listOptions(): Promise<CreatureLibraryOptions> { return this.repository.listOptions(); }
  listSkillCandidates(search: string, classification?: string): Promise<CreatureSkillCandidate[]> { return this.repository.listSkillCandidates(search, classification); }
  listItemCandidates(search: string): Promise<CreatureItemCandidate[]> { return this.repository.listItemCandidates(search); }
  getCreature(id: number): Promise<CreatureAggregate | null> { return this.repository.getCreatureAggregate(id); }
  async saveCreature(input: SaveCreatureAggregate): Promise<CreatureAggregate> { return this.repository.saveCreatureAggregate(normalizeCreature(input)); }
  deleteCreature(id: number): Promise<void> { return this.repository.deleteCreature(id); }
}

export const creatureService = new CreatureService();
