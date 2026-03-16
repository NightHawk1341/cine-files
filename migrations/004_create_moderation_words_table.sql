-- Word filter for automatic content moderation (TR-BUTE pattern)
CREATE TABLE IF NOT EXISTS "moderation_words" (
    "id"         SERIAL PRIMARY KEY,
    "word"       VARCHAR(200) NOT NULL UNIQUE,
    "category"   VARCHAR(50) NOT NULL DEFAULT 'general',
    "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ
);

CREATE INDEX "moderation_words_is_active_idx" ON "moderation_words"("is_active");
CREATE INDEX "moderation_words_category_idx" ON "moderation_words"("category");
