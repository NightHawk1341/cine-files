# CineFiles — Admin Panel

## Access

- **URL**: `/admin/`
- **Protection**: Middleware cookie check + layout-level JWT verification
- **Minimum role**: `editor` (some features require `admin`)

## Important: Route Structure

Admin uses `/admin/` as a **direct URL segment**, NOT a route group `(admin)`. This prevents path conflicts with the dynamic `[category]` routes in `(public)/`.

## Pages

### Dashboard (`/admin/dashboard`)
- Overview statistics
- Quick actions

### Articles (`/admin/articles`)
- **List view**: Filterable by status (draft/review/published/archived)
- **Create**: `/admin/articles/new` — Block editor with content creation
- **Edit**: `/admin/articles/[id]/edit` — Full article editing
- **Permissions**: Editors create/edit own; admins edit any

### Tags (`/admin/tags`)
- Tag CRUD with type selection (movie/tv/person/genre/franchise/studio/topic/game/anime)
- TMDB search autocomplete for entity linking
- Auto-sync TMDB data on link
- **Permissions**: Editor+

### Media (`/admin/media`)
- Image library (all uploads stored in Yandex S3)
- Upload: JPEG, PNG, WebP, AVIF, GIF (max 5MB)
- Metadata: alt text, credit, dimensions
- **Permissions**: Editor+

### Comments (`/admin/comments`)
- Moderation interface with status filters (visible/hidden/deleted)
- Actions: hide, show, delete
- Moderation updates article comment counts
- **Permissions**: Admin only

### Collections (`/admin/collections`)
- Create/edit curated article collections
- Manage articles within collections (add/remove/reorder)
- Visibility toggle (draft/published)
- **Permissions**: Editor+

### Users (`/admin/users`)
- User list with role management
- Role assignment (reader/editor/admin)
- **Permissions**: Admin only

### Settings (`/admin/settings`)
- Site-wide configuration (stored in `AppSetting` table)
- Key-value pairs for dynamic settings
- **Permissions**: Admin only

## Block Editor

The admin uses a custom block-based editor (`components/editor/BlockEditor.tsx`) for article content:

- Visual block management (add/remove/reorder)
- Type-specific editing UI per block type
- Inline image upload integration
- TMDB search for movie_card blocks
- TR-BUTE product selection for tribute_products blocks

## Key Files
- `app/admin/layout.tsx` — Admin layout with sidebar navigation + auth verification
- `app/admin/*/page.tsx` — Individual admin pages
- `components/editor/BlockEditor.tsx` — Content editor
- `styles/pages/admin.module.css` — Admin page styles
- `styles/pages/admin-tags.module.css` — Tag management styles
