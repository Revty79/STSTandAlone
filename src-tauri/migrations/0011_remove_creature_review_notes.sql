PRAGMA foreign_keys = ON;

UPDATE creatures
SET notes = ''
WHERE source_system = 'serrian-tide-creature-canon'
  AND instr(lower(notes), 'proposed for review') > 0;

UPDATE creature_attributes
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_movement
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_hp_pools
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_hit_locations
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_attacks
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_skill_links
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_abilities
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_defenses
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_uses
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');

UPDATE creature_variants
SET notes = ''
WHERE instr(lower(notes), 'proposed for review') > 0
  AND creature_id IN (SELECT id FROM creatures WHERE source_system = 'serrian-tide-creature-canon');
