PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign_character_spell_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    document_id TEXT NOT NULL CHECK (length(trim(document_id)) > 0),
    name TEXT NOT NULL DEFAULT '',
    tradition TEXT NOT NULL
        CHECK (tradition IN (
            'Spellcraft/Talismanism/Faith',
            'Psionics',
            'Bardic Resonance'
        )),
    document_json TEXT NOT NULL CHECK (json_valid(document_json)),
    in_spellbook INTEGER NOT NULL DEFAULT 0 CHECK (in_spellbook IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (character_id, document_id),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_spell_documents_book
    ON campaign_character_spell_documents (character_id, in_spellbook, name COLLATE NOCASE, id);
