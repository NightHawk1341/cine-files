# SPA Lifecycle & Element Persistence

## Navigation Flow

When the user navigates between pages, the router executes these steps in order:

1. Dispatch `spa:pageleave` event with current path
2. Save scroll position for current route
3. Call `currentPage.cleanup()` (with error handling)
4. Remove body locks (`modal-open`, `sheet-open`, `popup-open`)
5. Remove current page-specific stylesheets from `<head>`
6. Match new path against registered routes
7. Load new page-specific CSS via `<link>` tags
8. Update URL via `history.pushState()`
9. Restore scroll position (back/forward) or scroll to top (new navigation)
10. Call `matched.init(params)` (awaited)
11. Update active link states in header and bottom nav
12. Dispatch `spa:pageenter` event with new path

## Three Element Categories

### Persistent Shell (survive all navigations)

These elements are created once in `index.html` and never removed:

| Element | Selector | Initialized by |
|---------|----------|----------------|
| Header | `#site-header` | `Header.init()` |
| Footer | `.footer` | `Footer.init()` |
| Bottom nav | `.bottom-nav` | `BottomNav.init()` |
| Scroll-to-top | `#scroll-to-top` | `ScrollToTop.init()` |
| Grain overlay | `.grain-overlay` | Inline script |
| Progress bar | `.progress-bar` | Router (dynamic) |

**Rules for persistent elements:**
- NEVER set inline styles (`element.style.*`) on them — use `classList` instead
- Inline styles leak across pages because these elements are never removed
- If inline styles are unavoidable, reset them in the page's `cleanup()`

### Page Content (swapped per navigation)

Everything inside `#page-content` is replaced on each navigation. Page scripts build their content via `document.createElement` calls in `init()`.

- The router does NOT fetch HTML — pages render entirely via JavaScript
- Each page's `init()` is responsible for clearing `#page-content` and building new DOM
- Show skeleton loading states immediately, then replace with real data after API fetch

### Body-Appended Elements (manual lifecycle)

Elements appended to `document.body` directly (outside `#page-content`) survive navigation. The router only manages `#page-content`.

**Components that append to body:**
| Component | Element | Cleanup |
|-----------|---------|---------|
| Modal | `.modal-overlay` | Auto-removed on close |
| Bottom Sheet | `.bottom-sheet-overlay` | Auto-removed on close |
| Toast | `.toast-container` | Auto-dismissed, persistent container |
| Image Zoom | `.image-zoom-overlay` | Auto-removed on close |
| Progress Bar | `.progress-bar` | Managed by router |

**If a page script appends elements to `document.body`**, it MUST remove them in `cleanup()`:
```javascript
cleanup() {
  var el = document.querySelector('.my-page-overlay');
  if (el) el.remove();
}
```

## CSS Lifecycle

### Global Stylesheets (never removed)
Loaded via `<link>` tags in `index.html` `<head>`. These persist across all navigations:
- `global.css`, `grain.css`, `header.css`, `footer.css`, `bottom-nav.css`, `page-layouts.css`
- Component CSS: `article-card.css`, `article-body.css`, `comment-list.css`

### Page-Specific Stylesheets (dynamic)
Listed in each page's `styles` array in `registerPage()`. The router:
1. Removes all current page stylesheets before navigation
2. Injects new page stylesheets as `<link>` tags
3. Tracks them in `currentStylesheets` array for cleanup

**If a page CSS file is NOT in the `styles` array**, it will not be loaded or cleaned up, causing either missing styles or style leaks.

## Page Handler Contract

Every page must register with:
```javascript
Router.registerPage('/route', {
  styles: ['/css/page.css'],  // Page-specific CSS files

  async init(params) {
    // 1. Get #page-content container
    // 2. Show skeleton loading state immediately
    // 3. Fetch data from API
    // 4. Build DOM with real data
  },

  cleanup() {
    // 1. Reset module-level state variables
    // 2. Remove body-appended elements (modals, overlays)
    // 3. Clear timers (setTimeout, setInterval)
    // 4. Abort in-flight fetch requests
    // 5. Remove event listeners added to persistent elements
  }
});
```

### What cleanup() MUST do:
- Reset module-scoped variables to initial state
- Remove any elements appended to `document.body`
- Clear all `setTimeout` / `setInterval` handles
- Remove event listeners added to `window`, `document`, or persistent elements

### What cleanup() does NOT need to do:
- Clear `#page-content` — the next page's `init()` handles this
- Remove page-specific CSS — the router handles this
- Reset scroll position — the router handles this

## Router Events

| Event | When | Detail |
|-------|------|--------|
| `spa:pageleave` | Before cleanup | `{ path: '/old-path' }` |
| `spa:pageenter` | After init | `{ path: '/new-path' }` |

Listen via `document.addEventListener('spa:pageenter', handler)`.

## Common Bugs

| Bug | Cause | Fix |
|-----|-------|-----|
| Stale state on repeat visits | Missing `cleanup()` or not resetting module state | Implement full cleanup |
| Modal persists after navigation | Body-appended element not removed | Remove in `cleanup()` |
| Styles wrong after SPA nav, correct after hard refresh | Page CSS not in `styles` array | Add to `styles` |
| Inline styles leak to other pages | `element.style.*` on persistent elements | Use `classList` instead |
| Scroll position wrong on back button | Not saving/restoring scroll | Router handles this automatically |
| Empty page flash before content | No skeleton loading state | Add skeletons before API fetch |
