-- Partner integrations table (neutral naming)
CREATE TABLE IF NOT EXISTS "integrations" (
    "id"                  SERIAL PRIMARY KEY,
    "title"               VARCHAR(200) NOT NULL,
    "integration_type"    VARCHAR(30) NOT NULL DEFAULT 'featured',
    "placement"           VARCHAR(50) NOT NULL DEFAULT 'sidebar',
    "image_url"           TEXT,
    "destination_url"     TEXT,
    "alt_text"            VARCHAR(300),
    "html_content"        TEXT,
    "start_date"          TIMESTAMPTZ,
    "end_date"            TIMESTAMPTZ,
    "is_active"           BOOLEAN NOT NULL DEFAULT TRUE,
    "priority"            INTEGER NOT NULL DEFAULT 0,
    "max_views"           INTEGER NOT NULL DEFAULT 0,
    "current_views"       INTEGER NOT NULL DEFAULT 0,
    "click_count"         INTEGER NOT NULL DEFAULT 0,
    "target_categories"   INTEGER[],
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ
);

CREATE INDEX "integrations_is_active_idx" ON "integrations"("is_active");
CREATE INDEX "integrations_placement_idx" ON "integrations"("placement");
