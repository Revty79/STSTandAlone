PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    player_user_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE DEFAULT 'New Character'
        CHECK (length(trim(name)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (campaign_id, player_user_id)
        REFERENCES campaign_players (campaign_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_characters_player
    ON campaign_characters (campaign_id, player_user_id, name COLLATE NOCASE, id);
