# Conditional Visibility & Styling Reference

All JS-driven visibility and styling changes across the public site. Does not include CSS `@media` rules or static class assignments.

## Core Rule

Use CSS classes (`classList.add/remove/toggle`) for conditional visibility — NOT inline styles (`element.style.*`). Inline styles on persistent elements (header, footer, body) leak across SPA navigations.

## Router (`public/js/core/router.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `active-page` | `.bottom-nav-button` | Route matches link href | Route changes |
| `header-button-active` | `.header-search-desktop` | Path is `/search` | Path is not `/search` |
| `modal-open` | `body` | — | Router cleanup on navigation |
| `sheet-open` | `body` | — | Router cleanup on navigation |
| `popup-open` | `body` | — | Router cleanup on navigation |

## Header (`public/js/modules/header.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `header-hidden` | `#site-header` | Scrolling down (desktop) | Scrolling up (desktop) |

## Footer (`public/js/modules/footer.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `collapsed` | `.footer-social-group` | Group toggle closed, mobile default | Group toggle open |
| `hidden` | `.footer-social-list` | Group toggle closed | Group toggle open |

## Bottom Nav (`public/js/modules/bottom-nav.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `mobile-pressed-to-active` | `.bottom-nav-button` | Touch start | Touch end, touch cancel |

## Modal (`public/js/modules/modal.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `modal-open` | `body` | Modal opens | Modal closes |

Modal creates `.modal-overlay` appended to `body`. Removed on close.

## Bottom Sheet (`public/js/modules/bottom-sheet.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `bottom-sheet-open` | `.bottom-sheet` | Sheet opens | Sheet closes (swipe/click/esc) |
| `sheet-open` | `body` | Sheet opens | Sheet closes |

Sheet creates `.bottom-sheet-overlay` appended to `body`. Removed on close.

## Image Zoom (`public/js/modules/image-zoom.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `popup-open` | `body` | Zoom overlay opens | Zoom overlay closes (click/esc) |

Creates `.image-zoom-overlay` appended to `body`. Removed on close.

## Toast (`public/js/modules/toast.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `toast-entering` | `.toast` | Toast created | Animation completes |
| `toast-leaving` | `.toast` | Dismiss starts | Toast DOM removed |
| `toast-expanded` | `.toast-container` | Hover on stacked toasts (desktop) | Mouse leave |

Toast container is persistent — appended once and reused.

## Theme Toggle (`public/js/modules/theme-toggle.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `theme-transition-disable` | `html` | Theme switch starts | 50ms after switch |

Also sets `data-theme` attribute on `html` and updates `meta[name="theme-color"]`.

## Scroll-to-Top (`public/js/modules/scroll-to-top.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `scroll-to-top-visible` | `#scroll-to-top` | Scroll > 300px | Scroll <= 300px |

## Comment List (`public/js/modules/comment-list.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `comment-hidden` | `.comment` | Comment status is `hidden` | — (static render) |

## FOUC Prevention (`public/index.html` inline script)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `page-loading` | `html` | Inline script (before paint) | Init script (after Router.init) |
| `page-ready` | `html` | Init script (after Router.init) | — |

## Article Editor Modal (`public/js/components/article-editor-modal.js`)

| Class | Element | When Added | When Removed |
|-------|---------|------------|-------------|
| `modal-open` | `body` | Editor opens | Editor closes |
| `editor-block--dragging` | `.editor-block` | Drag starts | Drag ends |
| `editor-block--dragover` | `.editor-block` | Drag over block | Drag leave / drop |
| `editor-inline-toolbar--visible` | `.editor-inline-toolbar` | Text selected in contenteditable | Selection cleared / collapsed |
| `editor-inline-toolbar--link-mode` | `.editor-inline-toolbar` | Link button clicked | Link applied / cancelled |
| `editor-tag-chip--selected` | `.editor-tag-chip` | Tag selected in panel | Tag deselected |
| `editor-char-count--over` | `.editor-char-count` | Character count exceeds threshold | Count drops below threshold |

Creates `.editor-modal`, `.editor-panel-overlay`, `.editor-preview-overlay` appended to `body`. All removed on close.

## Known Inline Style Usage

These are acceptable exceptions where inline styles are used:

| File | Element | Property | Reason |
|------|---------|----------|--------|
| `router.js` | `.progress-bar` | `width`, `opacity` | Animation progress (ephemeral element) |
| `router.js` | `body` | `position`, `top`, `width`, `overflow` | Body lock cleanup (removeProperty) |
| `bottom-sheet.js` | Sheet panel | `transform` | Swipe gesture tracking |
| `skeleton.js` | Skeleton elements | `width`, `height` | Dynamic sizing |
| `article-editor-modal.js` | `.editor-inline-toolbar` | `top`, `left` | Positioned relative to text selection |

When adding new JS-driven visibility changes, add an entry to this document.
