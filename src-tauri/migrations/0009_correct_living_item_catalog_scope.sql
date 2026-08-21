-- Correct canonical purchase listings for living creatures without changing
-- their universal Item identity or any non-scope data.
UPDATE items
SET catalog_scope = 'inventory',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE source_system = 'serrian-tide-item-sheet'
  AND lower(trim(category)) = 'tool'
  AND lower(trim(subtype)) IN ('mount', 'animal', 'pet')
  AND catalog_scope <> 'inventory' COLLATE NOCASE;
