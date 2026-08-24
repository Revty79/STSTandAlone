import type { PortalActionDefinition } from "../components/PortalActionCard";
import type { CampaignCharacterReference } from "../types/campaign";

export function canOpenCharacterCreation(
  campaignId: string,
  character: CampaignCharacterReference | undefined,
): boolean {
  return Boolean(campaignId && character && !character.creationCompletedAt);
}

export function canAdvanceCharacter(
  campaignId: string,
  character: CampaignCharacterReference | undefined,
): boolean {
  return Boolean(campaignId && character?.creationCompletedAt);
}

export const REALMS_DASHBOARD_ACTIONS: readonly PortalActionDefinition[] = [
  {
    id: "character-sheet",
    title: "Character Sheet",
    description: "View the heart of your adventurer and their story.",
    featured: true,
  },
  {
    id: "advance-character",
    title: "Advance Character",
    description: "Prepare for the next chapter of your journey.",
  },
  {
    id: "spellbook",
    title: "Spellbook",
    description: "Read the complete details of every Spell this character knows.",
  },
  {
    id: "magic-calculator",
    title: "Magic Calculator",
    description: "Construct custom Spells and calculate impromptu magical effects.",
  },
] as const;
