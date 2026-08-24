-- Earlier Campaign authoring loaded only the Inventory catalog, so a G.O.D. who
-- chose Move All could not authorize any Weapons, Armor, or General Equipment.
-- Backfill only those campaigns whose selected Inventory exactly equals every
-- Inventory item from their chosen genres. Selective Campaign lists are left alone.
INSERT OR IGNORE INTO campaign_inventory_items (campaign_id, item_id, sort_order)
SELECT eligible.campaign_id,
       item.id,
       COALESCE((
           SELECT MAX(existing.sort_order) + 1
           FROM campaign_inventory_items existing
           WHERE existing.campaign_id = eligible.campaign_id
       ), 0) + ROW_NUMBER() OVER (
           PARTITION BY eligible.campaign_id
           ORDER BY item.name COLLATE NOCASE, item.id
       ) - 1
FROM (
    SELECT campaign.id AS campaign_id
    FROM campaigns campaign
    WHERE EXISTS (
        SELECT 1 FROM campaign_inventory_tags selected_tag
        WHERE selected_tag.campaign_id = campaign.id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM campaign_inventory_items selected_item
        JOIN items selected_catalog_item ON selected_catalog_item.id = selected_item.item_id
        WHERE selected_item.campaign_id = campaign.id
          AND selected_catalog_item.catalog_scope = 'equipment' COLLATE NOCASE
    )
      AND (
        SELECT COUNT(*)
        FROM campaign_inventory_items selected_item
        JOIN items selected_catalog_item ON selected_catalog_item.id = selected_item.item_id
        WHERE selected_item.campaign_id = campaign.id
          AND selected_catalog_item.catalog_scope = 'inventory' COLLATE NOCASE
      ) > 0
      AND (
        SELECT COUNT(*)
        FROM campaign_inventory_items selected_item
        JOIN items selected_catalog_item ON selected_catalog_item.id = selected_item.item_id
        WHERE selected_item.campaign_id = campaign.id
          AND selected_catalog_item.catalog_scope = 'inventory' COLLATE NOCASE
      ) = (
        SELECT COUNT(*)
        FROM items possible_item
        WHERE possible_item.catalog_scope = 'inventory' COLLATE NOCASE
          AND EXISTS (
            SELECT 1
            FROM item_tag_links possible_link
            JOIN campaign_inventory_tags selected_tag
              ON selected_tag.tag_id = possible_link.tag_id
            WHERE possible_link.item_id = possible_item.id
              AND selected_tag.campaign_id = campaign.id
          )
      )
) eligible
JOIN items item ON item.catalog_scope = 'equipment' COLLATE NOCASE
WHERE EXISTS (
    SELECT 1
    FROM item_tag_links item_link
    JOIN campaign_inventory_tags selected_tag ON selected_tag.tag_id = item_link.tag_id
    WHERE item_link.item_id = item.id
      AND selected_tag.campaign_id = eligible.campaign_id
);
