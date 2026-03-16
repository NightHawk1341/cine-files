-- ============================================================
-- CineFiles Database Schema
-- PostgreSQL (Supabase)
-- Generated from prisma/schema.prisma
-- ============================================================

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE "users" (
    "id"              SERIAL PRIMARY KEY,
    "yandex_id"       VARCHAR(50) UNIQUE,
    "vk_id"           VARCHAR(50) UNIQUE,
    "telegram_id"     VARCHAR(50) UNIQUE,
    "email"           VARCHAR(255),
    "display_name"    VARCHAR(100),
    "avatar_url"      TEXT,
    "login_method"    VARCHAR(20) NOT NULL,
    "role"            VARCHAR(20) NOT NULL DEFAULT 'reader',
    "tribute_user_id" INTEGER,
    "preferences"     JSONB NOT NULL DEFAULT '{}',
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_login_at"   TIMESTAMPTZ
);

CREATE TABLE "auth_tokens" (
    "id"            SERIAL PRIMARY KEY,
    "user_id"       INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "refresh_token" VARCHAR(500) NOT NULL UNIQUE,
    "expires_at"    TIMESTAMPTZ NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTENT
-- ============================================================

CREATE TABLE "categories" (
    "id"          SERIAL PRIMARY KEY,
    "slug"        VARCHAR(50) NOT NULL UNIQUE,
    "name_ru"     VARCHAR(100) NOT NULL,
    "name_en"     VARCHAR(100),
    "description" TEXT,
    "sort_order"  INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "articles" (
    "id"                  SERIAL PRIMARY KEY,
    "slug"                VARCHAR(200) NOT NULL UNIQUE,
    "category_id"         INTEGER NOT NULL REFERENCES "categories"("id"),
    "author_id"           INTEGER NOT NULL REFERENCES "users"("id"),
    "title"               VARCHAR(300) NOT NULL,
    "subtitle"            VARCHAR(500),
    "lead"                TEXT,
    "body"                JSONB NOT NULL,
    "cover_image_url"     TEXT,
    "cover_image_alt"     VARCHAR(300),
    "cover_image_credit"  VARCHAR(200),
    "meta_title"          VARCHAR(70),
    "meta_description"    VARCHAR(160),
    "canonical_url"       TEXT,
    "status"              VARCHAR(20) NOT NULL DEFAULT 'draft',
    "published_at"        TIMESTAMPTZ,
    "updated_at"          TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "view_count"          INTEGER NOT NULL DEFAULT 0,
    "comment_count"       INTEGER NOT NULL DEFAULT 0,
    "tribute_product_ids" INTEGER[] NOT NULL DEFAULT '{}',
    "is_featured"         BOOLEAN NOT NULL DEFAULT FALSE,
    "is_pinned"           BOOLEAN NOT NULL DEFAULT FALSE,
    "allow_comments"      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX "articles_slug_idx" ON "articles"("slug");
CREATE INDEX "articles_status_idx" ON "articles"("status");
CREATE INDEX "articles_category_id_idx" ON "articles"("category_id");
CREATE INDEX "articles_author_id_idx" ON "articles"("author_id");
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at" DESC);
CREATE INDEX "articles_is_featured_idx" ON "articles"("is_featured");

-- ============================================================
-- TAGGING SYSTEM (TMDB-powered)
-- ============================================================

CREATE TABLE "tmdb_entities" (
    "id"             SERIAL PRIMARY KEY,
    "tmdb_id"        INTEGER NOT NULL,
    "entity_type"    VARCHAR(20) NOT NULL,
    "title_ru"       TEXT,
    "title_en"       TEXT,
    "metadata"       JSONB NOT NULL,
    "credits"        JSONB,
    "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE("tmdb_id", "entity_type")
);

CREATE INDEX "tmdb_entities_entity_type_idx" ON "tmdb_entities"("entity_type");
CREATE INDEX "tmdb_entities_tmdb_id_idx" ON "tmdb_entities"("tmdb_id");

CREATE TABLE "tags" (
    "id"             SERIAL PRIMARY KEY,
    "slug"           VARCHAR(100) NOT NULL UNIQUE,
    "name_ru"        VARCHAR(150) NOT NULL,
    "name_en"        VARCHAR(150),
    "tag_type"       VARCHAR(30) NOT NULL,
    "tmdb_entity_id" INTEGER REFERENCES "tmdb_entities"("id"),
    "article_count"  INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "tags_tag_type_idx" ON "tags"("tag_type");
CREATE INDEX "tags_slug_idx" ON "tags"("slug");

CREATE TABLE "article_tags" (
    "article_id" INTEGER NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
    "tag_id"     INTEGER NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
    "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY ("article_id", "tag_id")
);

CREATE INDEX "article_tags_tag_id_idx" ON "article_tags"("tag_id");

-- ============================================================
-- COMMENTS
-- ============================================================

CREATE TABLE "comments" (
    "id"         SERIAL PRIMARY KEY,
    "article_id" INTEGER NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
    "user_id"    INTEGER NOT NULL REFERENCES "users"("id"),
    "parent_id"  INTEGER REFERENCES "comments"("id") ON DELETE CASCADE,
    "body"       TEXT NOT NULL,
    "status"     VARCHAR(20) NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ
);

CREATE INDEX "comments_article_id_idx" ON "comments"("article_id");
CREATE INDEX "comments_user_id_idx" ON "comments"("user_id");
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- ============================================================
-- TMDB CACHE
-- ============================================================

CREATE TABLE "tmdb_cache" (
    "id"         SERIAL PRIMARY KEY,
    "cache_key"  VARCHAR(200) NOT NULL UNIQUE,
    "response"   JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "tmdb_cache_cache_key_idx" ON "tmdb_cache"("cache_key");
CREATE INDEX "tmdb_cache_expires_at_idx" ON "tmdb_cache"("expires_at");

-- ============================================================
-- EDITORIAL MEDIA
-- ============================================================

CREATE TABLE "media" (
    "id"          SERIAL PRIMARY KEY,
    "uploaded_by" INTEGER NOT NULL REFERENCES "users"("id"),
    "url"         TEXT NOT NULL,
    "filename"    VARCHAR(255) NOT NULL,
    "mime_type"   VARCHAR(50) NOT NULL,
    "file_size"   INTEGER,
    "width"       INTEGER,
    "height"      INTEGER,
    "alt_text"    VARCHAR(300),
    "credit"      VARCHAR(200),
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SITE SETTINGS
-- ============================================================

CREATE TABLE "app_settings" (
    "key"        VARCHAR(100) PRIMARY KEY,
    "value"      JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COLLECTIONS
-- ============================================================

CREATE TABLE "collections" (
    "id"              SERIAL PRIMARY KEY,
    "slug"            VARCHAR(100) NOT NULL UNIQUE,
    "title"           VARCHAR(200) NOT NULL,
    "description"     TEXT,
    "cover_image_url" TEXT,
    "sort_order"      INTEGER NOT NULL DEFAULT 0,
    "is_visible"      BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "collection_articles" (
    "collection_id" INTEGER NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
    "article_id"    INTEGER NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
    "sort_order"    INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("collection_id", "article_id")
);

-- ============================================================
-- USER FAVORITES
-- ============================================================

CREATE TABLE "user_favorites" (
    "user_id"     INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "article_ids" INTEGER[] NOT NULL DEFAULT '{}',
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
