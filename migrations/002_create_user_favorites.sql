-- User favorites: saved article IDs per user
-- Uses integer array for simplicity (like TR-BUTE favorites pattern)

CREATE TABLE IF NOT EXISTS "user_favorites" (
    "user_id"     INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "article_ids" INTEGER[] NOT NULL DEFAULT '{}',
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
