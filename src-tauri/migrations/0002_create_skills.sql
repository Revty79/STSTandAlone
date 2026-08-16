PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
        CHECK (length(trim(name)) > 0),
    classification TEXT NOT NULL DEFAULT 'standard'
        CHECK (length(trim(classification)) > 0),
    tier INTEGER
        CHECK (tier IS NULL OR tier > 0),
    primary_attribute TEXT,
    secondary_attribute TEXT,
    definition TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source_identity
    ON skills (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_skills_name
    ON skills (name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_skills_classification
    ON skills (classification COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_skills_tier
    ON skills (tier, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_skills_primary_attribute
    ON skills (primary_attribute COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_skills_secondary_attribute
    ON skills (secondary_attribute COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_skills_created_by_user
    ON skills (created_by_user_id, name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS skill_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL,
    related_skill_id INTEGER NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'parent'
        CHECK (length(trim(relationship_type)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (skill_id <> related_skill_id),
    UNIQUE (skill_id, related_skill_id, relationship_type),
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE,
    FOREIGN KEY (related_skill_id) REFERENCES skills (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_relationships_skill
    ON skill_relationships (skill_id, relationship_type, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_related
    ON skill_relationships (related_skill_id, relationship_type, sort_order, id);

CREATE TABLE IF NOT EXISTS skill_extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL,
    extension_type TEXT NOT NULL
        CHECK (length(trim(extension_type)) > 0),
    schema_version INTEGER NOT NULL
        CHECK (schema_version > 0),
    data_json TEXT NOT NULL
        CHECK (length(trim(data_json)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (skill_id, extension_type),
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_extensions_type
    ON skill_extensions (extension_type, skill_id);
