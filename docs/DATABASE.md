# CineFiles — Database Schema

## Overview

PostgreSQL via Supabase (`@supabase/supabase-js`). 12 tables covering users, content, tags, comments, media, and settings. Same client library as TR-BUTE.

## Models

### User
Core user model with OAuth integration.
- Fields: id, email, name, avatar, role (reader/editor/admin), preferences (JSON), OAuth IDs (yandexId, vkId, telegramId), tributeUserId
- Relations: authored articles, comments, auth tokens, uploaded media

### AuthToken
Refresh token storage for session management.
- Fields: id, token (unique), userId, expiresAt, createdAt
- Cleanup: daily cron removes expired tokens

### Article
Main content entity with block-based content.
- Fields: id, title, subtitle, slug (unique), lead, content (JSON blocks), category, author, coverImage, status (draft/review/published/archived), isPinned, isFeatured, allowComments, metaTitle, metaDescription, tributeProductIds (String[]), viewCount, commentCount, timestamps
- Relations: author (User), category (Category), tags (ArticleTag[]), comments (Comment[]), collections (CollectionArticle[])

### Category
Article categorization.
- Fields: id, name, slug (unique), description, sortOrder
- Relations: articles

### Tag
Enriched tags with optional TMDB linking.
- Fields: id, name, nameEn, slug (unique), type (movie/tv/person/genre/franchise/studio/topic/game/anime), description, tmdbEntityId, articleCount, timestamps
- Relations: tmdbEntity (TmdbEntity), articles (ArticleTag[])

### ArticleTag
Many-to-many junction between Article and Tag.
- Fields: articleId, tagId, isPrimary (Boolean)
- Composite key: (articleId, tagId)

### TmdbEntity
Cached TMDB data for linked tags.
- Fields: id, tmdbId, entityType (movie/tv/person), titleRu, titleEn, metadata (JSON), credits (JSON), lastSyncedAt
- Relations: tags (Tag[])

### TmdbCache
Short-lived API response cache.
- Fields: id, key (unique), data (JSON), expiresAt
- Cleanup: daily cron removes expired entries

### Comment
Threaded comments on articles.
- Fields: id, body, status (visible/hidden/deleted), articleId, authorId, parentId (self-reference for threading), timestamps
- Relations: article, author, parent, replies

### Media
Uploaded image metadata.
- Fields: id, url, filename, mimeType, fileSize, width, height, altText, credit, uploaderId, timestamps
- Relations: uploader (User)

### Collection
Curated article groupings.
- Fields: id, title, slug (unique), description, coverImage, isVisible, timestamps
- Relations: articles (CollectionArticle[])

### CollectionArticle
Many-to-many junction with ordering.
- Fields: collectionId, articleId, sortOrder
- Composite key: (collectionId, articleId)

### AppSetting
Key-value store for site configuration.
- Fields: id, key (unique), value (JSON), timestamps

## Schema Management

- **Schema file**: `SQL_SCHEMA.sql` (PostgreSQL DDL)
- **Apply schema**: Run SQL via Supabase Dashboard SQL editor
- **Browse data**: Supabase Dashboard Table Editor
- **Seed data**: `npm run db:seed`

## Key Design Decisions

1. **Supabase client** — same `@supabase/supabase-js` library as TR-BUTE for consistency.
2. **Block-based content**: Articles store content as JSONB, not rich text. Enables flexible rendering without WYSIWYG complexity.
3. **Soft-delete comments**: Status field (visible/hidden/deleted) preserves thread structure.
4. **Cascading deletes**: Article deletion cascades to comments and tag relations via `ON DELETE CASCADE`.
5. **TMDB separation**: Entity data stored separately from tags — one entity can be referenced by multiple tags.
6. **Article counts on tags**: Denormalized `article_count` for performance (updated on tag operations).
7. **View/comment counts on articles**: Denormalized counters avoid expensive COUNT queries.
