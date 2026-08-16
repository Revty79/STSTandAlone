import type { SkillCoreDraft } from "../types/skill";

export const SPECIAL_ABILITY_CLASSIFICATION = "special ability";

export function hasSkillAttribute(core: SkillCoreDraft): boolean {
  return Boolean(
    core.primaryAttribute?.trim() || core.secondaryAttribute?.trim(),
  );
}

export function applySkillAttributeRules(
  core: SkillCoreDraft,
): SkillCoreDraft {
  if (hasSkillAttribute(core)) return core;
  return {
    ...core,
    classification: SPECIAL_ABILITY_CLASSIFICATION,
    tier: null,
  };
}

export function updateSkillAttribute(
  core: SkillCoreDraft,
  attribute: "primaryAttribute" | "secondaryAttribute",
  value: string | null,
): SkillCoreDraft {
  const previouslyHadAttribute = hasSkillAttribute(core);
  const next = { ...core, [attribute]: value };
  if (!hasSkillAttribute(next)) return applySkillAttributeRules(next);

  // Leaving the automatic attribute-free state should restore an ordinary,
  // editable classification. The user can still deliberately choose
  // "special ability" again once an attribute is present.
  if (
    !previouslyHadAttribute &&
    core.classification === SPECIAL_ABILITY_CLASSIFICATION
  ) {
    return { ...next, classification: "standard" };
  }
  return next;
}
