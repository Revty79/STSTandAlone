PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign_character_currency_holdings (
    character_id INTEGER NOT NULL,
    currency_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (character_id, currency_id),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (currency_id) REFERENCES campaign_derived_currencies (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_character_currency_holdings_currency
ON campaign_character_currency_holdings (currency_id, character_id);
