# CineFiles — Content System

## Block-Based Articles

Articles use a block-based content model. Content is stored as a JSON array of typed blocks in the `content` field of the `Article` model.

### Block Types

| Type | Description | Rendered By |
|------|-------------|-------------|
| `paragraph` | Rich text paragraph | `<p>` with HTML |
| `heading` | Section heading (h2–h4) | `<h2>`/`<h3>`/`<h4>` |
| `image` | Image with caption and credit | `<figure>` with `<figcaption>` |
| `quote` | Blockquote with optional attribution | `<blockquote>` |
| `list` | Ordered or unordered list | `<ol>` / `<ul>` |
| `embed` | YouTube, VK Video, RuTube embed | `<iframe>` (CSP-allowed) |
| `divider` | Visual separator | `<hr>` |
| `spoiler` | Collapsible content (click to reveal) | `<details>` / `<summary>` |
| `infobox` | Highlighted info/warning box | Styled `<aside>` |
| `tribute_products` | TR-BUTE product cards | Server component injection |
| `movie_card` | TMDB movie/TV info card | Styled card with TMDB data |

### Block Schema (TypeScript)

Defined in `lib/types.ts`:
```typescript
interface Block {
  type: string;
  data: Record<string, any>;
}
```

Each block type has its own `data` shape. See `ArticleBody.tsx` for the rendering logic.

### Rendering

`ArticleBody.tsx` maps each block to its HTML representation. It accepts an optional `customBlocks` prop for injecting server components (used for `tribute_products` blocks that need server-side data fetching).

## Article Lifecycle

```
draft → review → published → archived
```

- **draft**: Only visible to author and admins
- **review**: Submitted for editorial review
- **published**: Live on the site, included in feeds/sitemap
- **archived**: Hidden from public, preserved in database

## Article Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Article title (required) |
| `subtitle` | String? | Optional subtitle |
| `slug` | String | URL-safe identifier (auto-generated from title via transliteration) |
| `lead` | String? | Article lead/summary for cards and search |
| `content` | JSON | Array of content blocks |
| `category` | Relation | One category per article |
| `coverImage` | String? | Cover image URL (Yandex S3) |
| `status` | Enum | draft / review / published / archived |
| `isPinned` | Boolean | Pin to top of listings |
| `isFeatured` | Boolean | Show in featured section |
| `allowComments` | Boolean | Enable/disable comments |
| `metaTitle` | String? | Custom SEO title |
| `metaDescription` | String? | Custom SEO description |
| `tributeProductIds` | String[] | Linked TR-BUTE product IDs |
| `viewCount` | Int | Auto-incremented on page view |
| `commentCount` | Int | Updated on comment create/delete |

## Block Editor (Admin)

`components/editor/BlockEditor.tsx` provides a visual editor for creating and editing article blocks. It supports:

- Adding/removing/reordering blocks
- Type-specific editing interfaces
- Image upload integration (Yandex S3)
- TMDB search for movie_card blocks
- TR-BUTE product selection for tribute_products blocks

## Slug Generation

Slugs are auto-generated from Russian titles using `lib/transliterate.ts`. The transliteration converts Cyrillic characters to Latin equivalents. Uniqueness is enforced with a timestamp fallback if a collision occurs.
