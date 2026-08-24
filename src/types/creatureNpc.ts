import type { CharacterAuthorizedItem } from "./character";
import type { SaveCreatureAggregate } from "./creature";

export type CreatureNpcCore = {
  id: number;
  campaignId: number;
  campaignName: string;
  controllerUserId: number;
  name: string;
  creatureId: number;
  creatureCanonicalId: string;
  creatureName: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatureNpcProfile = {
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  baselineSnapshot: SaveCreatureAggregate;
  currentSnapshot: SaveCreatureAggregate;
};

export type CreatureNpcOwnedItem = {
  itemId: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  quantity: number;
};

export type CreatureNpcAggregate = {
  core: CreatureNpcCore;
  profile: CreatureNpcProfile;
  items: CreatureNpcOwnedItem[];
  authorizedItems: CharacterAuthorizedItem[];
};

export type CreatureNpcDraft = {
  name: string;
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  creature: SaveCreatureAggregate;
  items: Array<{ itemId: number; quantity: number }>;
};

export type CreateCreatureNpc = {
  campaignId: number;
  requestingUserId: number;
  creatureId: number;
  templateSnapshotJson: string;
};

export type SaveCreatureNpc = {
  characterId: number;
  campaignId: number;
  requestingUserId: number;
  name: string;
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  currentSnapshotJson: string;
  items: Array<{ itemId: number; quantity: number }>;
};
