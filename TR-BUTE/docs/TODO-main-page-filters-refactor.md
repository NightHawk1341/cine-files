# Task: Refactor Main Page to Use Shared page-filters Module

## Context

The shared `page-filters` module (`public/js/modules/page-filters.js` + `public/css/page-filters.css`) was created to replicate the main page's filter bar for catalog, favorites, customers, and product pages. The main page (`index.html` / `script.js`) still uses its own inline implementation with the same class names. This creates duplication — filter logic and styles exist in two places.

## Goal

Replace the main page's inline filter code in `script.js` with `createPageFilters()` from the shared module, and remove duplicated filter CSS from `style.css` (since `page-filters.css` already covers it).

## Files to Modify

| File | Change |
|------|--------|
| `public/script.js` | Remove ~500 lines of inline filter code; import and use `createPageFilters()` |
| `public/index.html` | Replace static filter bar HTML (lines 43–115) with empty `<div class="sticky-filter-wrapper">` container |
| `public/style.css` | Remove filter styles (lines ~219–650) that are now in `page-filters.css` |
| `public/index.html` | Add `<link rel="stylesheet" href="/css/page-filters.css">` |

## Coupling Points to Handle

### 1. FAQ Button
- Main page has `#main-faq-btn` inside the filter bar
- Uses `initFAQPopup('main')` / `openFAQPopup()` from `faq-popup.js`
- **Solution**: Use `features: { faq: true }` + `onFaqClick` callback in `createPageFilters()`

### 2. Sort Scrubber
- `initSortScrubber()` and `updateSortScrubberVisibility()` from `sort-scrubber.js`
- Called on every filter/sort change
- **Solution**: Call `updateSortScrubberVisibility()` inside the `onFilter` callback

### 3. Header Search Integration
- `sessionStorage.getItem('headerSearchQuery')` is read on init to pre-fill search from header
- **Solution**: After `createPageFilters()`, call `pf.setFilters({ search: headerQuery })` if session storage has a value

### 4. Infinite Scroll / Product Grid
- `filterAndDisplay()` handles filtering, sorting, and renders via `createProductCard()` with intersection observer pagination (`SEGMENT_SIZE`)
- **Solution**: Keep `filterAndDisplay()` as the `onFilter` callback — it receives the filter state and handles rendering

### 5. localStorage Key
- Currently `'catalogFilters'` — pass as `storageKey: 'catalogFilters'` to preserve saved filters

### 6. Mobile Sort Sheet
- Already supported by the module — checks `window.isMobileSortView()` and `window.showMobileSortSheet()`

### 7. CSS Duplication
- `style.css` lines ~219–650 duplicate what's in `page-filters.css`
- After adding `page-filters.css` to `index.html`, remove the duplicated block from `style.css`
- Verify no specificity conflicts (both files use same selectors, so load order matters)

## What to Keep in script.js

- `filterAndDisplay()` — the rendering/pagination logic (just becomes the `onFilter` callback)
- `sortProducts()` and `fuzzyMatchField()` — **already exported** from `page-filters.js` as `sortProducts()` and `matchesSearch()`; remove local copies
- Product loading, infinite scroll setup, product card rendering
- Sort scrubber integration

## Rough Implementation

```javascript
import { createPageFilters, sortProducts, matchesSearch } from '/js/modules/page-filters.js';

// In initMainPage():
const wrapper = document.querySelector('.products-header');
const pageFilters = createPageFilters(wrapper, {
  pageId: 'main',
  features: { search: true, genres: true, types: true, sort: true, reset: true, faq: true, collapse: true },
  onFilter: (filterState) => filterAndDisplay(filterState),
  onFaqClick: () => openFAQPopup(),
  storageKey: 'catalogFilters',
});

// Check for header search query
const headerQuery = sessionStorage.getItem('headerSearchQuery');
if (headerQuery) {
  sessionStorage.removeItem('headerSearchQuery');
  pageFilters.setFilters({ search: headerQuery });
}
```

## Validation

- Run `npm run check:claude` after changes
- Test: filters persist across page reloads (localStorage)
- Test: header search → main page pre-fills search input
- Test: mobile collapse/expand behavior
- Test: mobile sort bottom sheet
- Test: FAQ button opens popup
- Test: sort scrubber visibility updates on filter changes
- Test: SPA navigation to/from main page (cleanup)

## Estimated Scope

~500 lines removed from `script.js`, ~430 lines removed from `style.css`. Net reduction of ~900 lines.
