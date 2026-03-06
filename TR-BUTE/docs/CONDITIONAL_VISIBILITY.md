# Conditional Visibility & Styling Reference

All JS-driven visibility and appearance changes across the public site. Excludes `@media` rules (find those in CSS files directly).

**Keep this file up to date** whenever you add new conditional visibility or styling in JS — see `CLAUDE.md` for the requirement.

---

## Shared Infrastructure

### `public/js/core/router.js` — SPA routing
| Element | Condition | Change |
|---------|-----------|--------|
| Progress bar `.loading-bar` | Navigation started | `classList.add('active')` |
| Progress bar `.loading-bar` | Navigation complete | `classList.remove('active')`, add `'completing'` → then remove |
| Page container | Page loading | `classList.add('loading')`, remove `'loaded'` |
| Page container | Page loaded | `classList.add('loaded')`, remove `'loading'` |
| `document.body` | No modal/sheet/popup open | `style.overflow/position/top` cleared |

### `public/js/modules/header.js` — Header
| Element | Condition | Change |
|---------|-----------|--------|
| `.header-faq-btn` | On main page | `style.display = 'flex'` |
| `.header-back-btn` | On sub-page | `style.display = 'flex'` |
| Elements with `[data-main-only]` | On main vs sub-page | `style.display = 'none'` / `''` |
| `.header-login-icon` | User not logged in | `style.display = 'block'` |
| `.header-profile-icon` | User logged in | `style.display = 'block'` |
| Cart/favorites indicator dot | Has items | `style.display = 'block'` |
| Cart/favorites indicator dot | Empty | `style.display = 'none'` |
| `#header-profile-btn` | Has unseen updates (orders/feedback) | `classList.add('has-profile-count')` — desktop: fades icon and shows pill counter; mobile (≤768px): shows corner badge |
| `#header-profile-btn` | No unseen updates | `classList.remove('has-profile-count')` |
| `.header-go-main-btn` | On main page / no back history | `style.display = 'none'` |
| Search button | Search active | `classList.add('active')`, remove `'has-pending'` |
| Search button | Has pending query | `classList.add('has-pending')` |
| `.header-search-dropdown` | Search opened | `classList.add('open')` |
| `.header-search-dropdown` | Search closed | `classList.remove('open')` |
| Search overlay | Search active | `classList.add('active')` |
| `document.documentElement` | Search active | `style.overflow = 'hidden'`, `overscrollBehavior = 'none'` |
| `document.documentElement` | Inside any mini-app (Telegram/VK/MAX) | `setAttribute('data-miniapp', 'true')` → `global.css` applies `-webkit-touch-callout: none` to all elements |
| `document.documentElement` | Inside Telegram mini-app | also `setAttribute('data-telegram', 'true')` → `global.css` applies additional Telegram-specific overrides (btn-favorite colours) |
| Nav buttons (bottom nav + header) | Current page | `classList.add('active-page')` |
| Search sheet (mobile) | Dragging | `style.transform = translateY(...)`, `style.transition = 'none'` |
| `.header` | Scroll down past threshold | `style.transform = 'translateY(-Npx)'` (hides header) |
| `.header` | Scroll up | `style.transform = 'translateY(0)'` (shows header) |
| Sticky filters (desktop) | Header hidden on scroll | `style.top = '-Npx'` (hides with header) |
| Sticky filters (desktop) | Header shown on scroll | `style.top = ''` (restored) |
| Filter wrappers (when bottom nav visible) | Scrolled past natural position | `classList.add('filters-at-bottom')` — fixed above bottom nav; sets `--filter-at-bottom-height` and `--actual-bottom-nav-height` on `<html>` |
| Filter wrappers (when bottom nav visible) | Scrolled back to natural position | `classList.remove('filters-at-bottom')` — returns to flow; removes `--filter-at-bottom-height` |

### `public/js/modules/bottom-nav.js` — Bottom navigation
| Element | Condition | Change |
|---------|-----------|--------|
| Bottom nav buttons | Current page matches | `classList.add('active-page')` |
| Bottom nav buttons | Not current page | `classList.remove('active-page')` |

### `public/js/modules/footer.js` — Footer
| Element | Condition | Change |
|---------|-----------|--------|
| Social links `<ul>` | Social section toggled | `classList.add/remove('hidden')` |

### `public/js/modules/announcement-bar.js` — Announcement Bar
| Element | Condition | Change |
|---------|-----------|--------|
| `.announcement-bar` | Setting `announcement_bar.enabled` is true | `classList.add('is-active')` (makes bar visible) |
| `.announcement-bar-inner` | Text fits without scrolling | `classList.add('is-static')` |
| `.announcement-bar-track` | Touch drag in progress | `classList.add('is-paused')` (pauses CSS animation) |
| `.announcement-bar-track` | Scrolling needed | `style.animation` set to `announcement-scroll` keyframe |

### `public/js/modules/page-screen.js` — Full-area status screens
`showPageScreen(container, opts)` replaces `container.innerHTML` with a `.page-screen` block.
Used for: navigation errors (missing URL params), API errors, empty states, login-required screens.

| Element | Condition | Change |
|---------|-----------|--------|
| `.order-page-content` | Order not found / not logged in / API error | Replaced with `.page-screen` (error icon, message, "На главную" button) |
| `.catalog-page-overlay` | No `?id=` param in URL | Replaced with `.page-screen` ("Каталог не найден") |
| `#catalog-items-list` | Catalog has no products | Replaced with `.page-screen` ("Пока нет постеров") |
| `#catalog-items-list` | API error loading catalog | Replaced with `.page-screen` ("Ошибка загрузки") |
| `.product-page-content` | Product not found | Replaced with `.page-screen` ("Товар не найден") |
| `.checkout-form-container` | Cart is empty at checkout | Replaced with `.page-screen` (basket icon, "Корзина пуста", "Перейти в корзину") |
| `.checkout-form-container` | User not logged in at checkout | Replaced with `.page-screen` ("Необходима авторизация", "Войти" → /profile) |

CSS: `page-screen.css` (imported via `global.css`).

### `public/js/modules/skeleton-loader.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Skeleton container | Content loaded | `classList.add('skeleton-fade-in')` (removed after 300ms) |

### `public/js/modules/hints.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Hint container | Dismissed | `classList.add('hiding')` |

### `public/js/modules/button-grain.js` — Page grain effect
| Element | Condition | Change |
|---------|-----------|--------|
| `.page-grain-layer` elements (appended to `body`) | Page loaded / SPA navigation (non-mobile-Firefox) | Created and appended; `classList.add('grain-loaded')` once grain image preloads |
| `.page-grain-layer` elements | Mobile Firefox detected (UA check at module init) | Not created — `_skipPageGrain` suppresses `init`, SPA listeners, and the persistence `setInterval`; backdrop grain functions remain active |
| `.backdrop-grain-layer` elements | Modal/backdrop opened (all browsers incl. mobile Firefox) | Created inside backdrop element via `addBackdropGrain()`; `classList.add('modal-backdrop-active')` on body to hide page grain via CSS |
| `document.body` | Modal/backdrop closed | `classList.remove('modal-backdrop-active')` |

### `public/js/modules/mobile-feedback.js` — Mobile ripple & grain feedback
| Element | Condition | Change |
|---------|-----------|--------|
| `.ripple-grain` layers (4 per touch) | Mobile Firefox detected (UA check at module init) | Not created — `_skipGrain` flag suppresses all grain element creation and their radial-gradient masks |
| `.ripple-grain` layer | Touch start (non-Firefox) | Created in container; `classList.add('grain-expanding')` on next rAF |
| `.ripple-grain` layer | Touch end | `classList.add('grain-fading')`, removed after 300 ms |

---

## Overlays & Modals

### `public/js/modules/mobile-modal.js`
Single module for all modal dialogs and bottom sheets (replaces the former
`bottom-card-modal.js`, `mobile-bottom-sheet.js`, and `confirm-sheet.js`).

**Modal dialog** (`showMobileModal` / `window.mobileModal.*`):
| Element | Condition | Change |
|---------|-----------|--------|
| `.mobile-modal-overlay` | Opened | `classList.add('active')`, `body.classList.add('modal-open')` |
| `.mobile-modal-overlay` | Closed | `classList.remove('active')`, `body.classList.remove('modal-open')` |
| `document.documentElement` | Modal opened | `style.setProperty('--locked-dvh', ...)` |
| `.mobile-modal-input` | Validation error | `style.borderColor = 'var(--status-error)'` |
| `.mobile-modal` | User dragging | `style.transform/transition` inline |
| `.mobile-modal-backdrop` | User dragging | `style.opacity`, `style.backdropFilter` inline |

**Bottom sheet** (`showMobileBottomSheet` / `window.showMobileBottomSheet`):
| Element | Condition | Change |
|---------|-----------|--------|
| `.mobile-bottom-sheet-overlay` | Opened | `classList.add('active')`, `body.classList.add('sheet-open')`, `body.style.top = -{scroll}px` |
| `.mobile-bottom-sheet-overlay` | Closed | `classList.remove('active')`, `body.classList.remove('sheet-open')`, `body.style.top = ''` |
| `document.documentElement` | Sheet opened | `style.setProperty('--locked-dvh', ...)` |
| `.mobile-bottom-sheet` | User dragging | `style.animation = 'none'`, `style.transform/transition` inline |
| `.mobile-bottom-sheet` | Drag released | `style.animation/transform/transition` cleared |

**Toast** (`showBottomToast` / `window.showBottomToast`):
| Element | Condition | Change |
|---------|-----------|--------|
| `.bottom-toast` | Shown | `classList.add('active')` |
| `.bottom-toast` | Dismissed | `classList.remove('active')` |

### `public/js/modules/tooltip.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Tooltip | Triggered | `classList.add('visible')` |
| Tooltip | Dismissed | `classList.remove('visible')` |

---

## Product Grid & Zoom

### `public/js/modules/product-grid.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Carousel indicator dots | Active slide | `classList.toggle('active', i === index)` |
| Product images | Loaded | `classList.add('loaded')` |
| Format variant dropdown | Opened | `classList.toggle('active', !isCurrentlyOpen)` |
| `.price-row-notify-btn` | User subscribes to coming_soon product | `classList.add('notified')` — switches bell SVG state via CSS (normal → active; hover shows remove bell) |
| `.price` (coming_soon) | User subscribes | `classList.add('notify-waiting')` — text changes to "В ожидании", makes element clickable to navigate to `/profile` |
| `.price` (coming_soon) | User unsubscribes | `classList.remove('notify-waiting')` — text reverts to "Скоро" |
| `.products` grid container | Mobile Firefox detected at `renderProductGrid` call | `classList.add('ff-mobile-grid')` — enables `content-visibility: auto` on child cards via CSS, and switches image rendering from eager `src` to lazy `data-src` (resolved via `IntersectionObserver` with 500 px rootMargin) |

### `public/js/modules/zoom.js` — Image zoom popup
| Element | Condition | Change |
|---------|-----------|--------|
| Zoom image | Loading | `style.opacity = '0'`, wrapper `classList.add('loading')` |
| Zoom image | Loaded | `style.opacity = '1'`, wrapper `classList.remove('loading')`, add `'loaded'` |
| Zoom wrapper | Image dimensions set | `style.width = {displayWidth}px` |
| Zoom wrapper | Closed | `style.width = ''` |
| Image content | Zoom level changed | `style.transform = scale({currentScale})` |
| Image content | Zoom reset | `style.transform = scale(1)` |
| Carousel indicators container | Single image | `style.display = 'none'` |
| Carousel indicators container | Multiple images | `style.display = ''` |
| Prev/next nav buttons | Navigation available | `style.display = 'flex'` or `'none'` |

### `public/js/modules/image-upload-modal.js`
| Element | Condition | Change |
|---------|-----------|--------|
| URL input section | URL tab selected | `classList.add('visible')` |
| URL submit button | Input has value | `disabled = false` |
| Confirm button | Upload valid | `disabled = false` |
| Upload button | Uploading | `classList.add('loading')` |
| Upload button | Done | `classList.remove('loading')` |

---

## Stories

### `public/js/modules/stories-popup.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Loading spinner | Media loading | `classList.add('visible')` |
| Loading spinner | Media loaded | `classList.remove('visible')` |
| Story title container | Story has title | `classList.add('visible')` |
| Story images | Loaded | `classList.add('loaded')` |

---

## Sort Scrubber

### `public/js/modules/sort-scrubber.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Letter picker | Scrubber activated | `classList.add('visible')` |
| Letter picker | Deactivated | `classList.remove('visible')`, add `'hidden'` |
| Scrubber panel | Activated | `classList.add('visible')` |
| Scrubber element | In use | `classList.add('active')` |
| Scrubber preview | Shown | `classList.add('visible')` |
| List items | Availability state | `classList.add/remove('available'/'unavailable')` |

---

## Catalog Page

### `public/js/pages/catalog.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Filters bar | Product type selected | `style.display = 'flex'` |
| Filters bar | Product type deselected | `style.display = 'none'` |
| Filter buttons | Active filter | `classList.add('active')` |
| Scroll-to-top button | Scrolled down | `classList.add('visible')` |
| Scroll-to-top button | Near top | `classList.remove('visible')` |
| `document.documentElement` | Page ready | `classList.remove('page-loading')`, add `'page-ready'` |

---

## Product Page

### `public/js/pages/product/main.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Product images | Loaded | `classList.add('loaded')` on img and parent |
| Product image (broken) | Load error | `style.display = 'none'` |
| "More photos" tile | Multiple images | `style.display = 'flex'` with inline layout styles |
| "More photos" tile | Hover | `style.backgroundColor` toggled between `--bg-tertiary` / `--bg-secondary` |
| Review count per-filter | Has items | `style.display = ''` |
| Review count per-filter | Empty | `style.display = 'none'` |
| Review filter buttons | Non-"all" filter empty | `style.display = 'none'` |
| Review filter buttons | Active | `classList.add('active')` |
| Custom product slide | Has background | `classList.add('custom-product')` |
| Custom product bg element | Background set | `style.backgroundImage = url(...)` |
| Combo format dropdown | Opened | `classList.add('active')` on dropdown, `classList.add('open')` on chevron |
| Combo format dropdown | Closed | `classList.remove('active')`, chevron remove `'open'` |
| Product info container | Has content | `style.display = 'flex'` |
| Product info container | Empty | `style.display = 'none'` |
| Variants section | Product has variants | `style.display = 'block'` |
| Variants section | No variants | `style.display = 'none'` |
| Collapsible sections | Has content | `style.display = 'block'` |
| Collapsible sections | Empty | `style.display = 'none'` |
| Format dropdown | Opened | `classList.add('active')`, price row `classList.add('product-format-open')`, chevron `classList.add('up')` |
| Format dropdown | Closed | Reverse of above |
| Format option button | In cart | `classList.add('in-cart')` |
| Price row | Has cart items | `classList.add('has-cart-items')` |
| Price info / cart status / delete btn | Cart item added | `style.display` toggled between `'none'` / `'flex'` |
| Favorite button | Item is favorited | `classList.toggle('is-favorite', ...)` |
| Favorite, share, AR buttons | Loaded | `style.display = ''` |
| Process carousel | Has process images | `style.display = 'block'` |
| Process carousel | No process images | `style.display = 'none'` |
| Process indicators | Single image | `style.display = 'none'` |
| Process prev/next buttons | At boundary | `classList.toggle('hidden', atBoundary)` |
| Process indicator dots | Active | `classList.toggle('active', idx === currentIndex)` |
| Masonry section | Has photos | `style.display = 'block'` |
| Masonry section | No photos | `style.display = 'none'` |
| Masonry filter buttons | Active | `classList.toggle('active', ...)` |
| Background selection container | Custom product | `style.display = 'block'/'none'` |
| Price / format group | Product available | `style.display = 'block'` |
| Price / format group | Unavailable/coming soon | `style.display = 'none'` |
| Authors section | No authors | `style.display = 'none'` |
| Fade carousel wrapper | Fade-style carousel | `classList.add('fade-carousel')` |
| Carousel nav / thumbnails | Fade carousel active | `style.display = 'none'` |
| Fade slides | Active slide | `classList.add('fade-active')` |
| Variant indicator | Mix variant | shows mix label, hides current/select labels |
| Variant indicator | Specific variant | shows current label, hides mix/select labels |
| Variant indicator | No selection | `style.display = 'none'` |
| Subscribe button | Subscribed | `classList.add('subscribed')` |
| Subscribe button | Unsubscribed | `classList.remove('subscribed')` |
| Collapsible section content | Toggled | `classList.toggle('open')` |
| Tab buttons | Visible based on content | `style.display = 'none'` / `''` |
| Tab buttons | Active | `classList.add('active')` |
| Tab wrapper | First/last tab position | `classList.toggle('first-tab-active', ...)` / `classList.toggle('last-tab-active', ...)` |
| Custom product image preview | Image selected | `classList.add('active')` |
| Custom product image preview | Cleared | `classList.remove('active')` |
| Custom product image section | Image not uploaded on cart add | `classList.add('has-error')` |
| Custom product image section | Image uploaded | `classList.remove('has-error')` |
| Zoom overlay | Active | `classList.add('active')`, `body.classList.add('popup-open')` |
| `document.documentElement` | Page ready | `classList.remove('page-loading')`, add `'page-ready'` |

### `public/js/pages/product/carousel.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Prev/next carousel buttons | At start/end | `classList.toggle('hidden', cur <= 1)` / `classList.toggle('hidden', ...)` |

---

## Cart Page

### `public/js/pages/cart.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Promo code result div | Valid code applied | `style.display = 'flex'` or `'block'` |
| Promo code result div | Cleared | `style.display = 'none'` |
| Promo code result div | Error | `style.color = 'var(--status-error)'` |
| Promo apply button | Code active | `style.display = 'none'` |
| Promo apply button | No active code | `style.display = ''` |
| Select-all checkbox label | All checked | `classList.toggle('checked', allChecked)` |
| Item checkbox | Toggled | `classList.toggle('checked')` |
| Cart item | Missing variation | `classList.add('variation-missing')` |
| Discount section | Discount error shown | `classList.add('has-error')` |
| Favorite button on item | Favorited | `classList.toggle('is-favorite', nowFavorite)` |
| Formats section on item | Expanded | `classList.toggle('expanded')` |
| Format toggle button | Expanded | `classList.toggle('open')` |
| Empty message | No items | `style.cssText` with inline center/color styles |

### `public/js/pages/cart/shipping.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Shipping provider buttons | Selected | `classList.add('active')` |
| Shipping type buttons | Selected | `classList.add('active')` |
| Postal code input | Address pre-selected | `disabled = true` |
| Postal code input | Manual entry | `disabled = false` |

### `public/js/pages/cart/shipping/ui.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Shipping results card | Calculation failed | `classList.add('has-error')` on `#shipping-results` |
| Shipping results card | Loading / manual / hidden | `classList.remove('has-error')` on `#shipping-results` |

---

## Checkout Page

### `public/js/pages/checkout.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Personal section | Unlocked | `classList.remove('personal-info-locked')` |
| Certificate toggle | Has non-PDF items | `style.display = 'block'` |
| Certificate toggle | PDF-only items | `style.display = 'none'` |
| PDF-only info block | PDF-only items | `style.display = 'block'` |
| Delivery method buttons | Selected | `classList.add('active')` |
| Promo section | Code applied | `classList.add('promo-section--dimmed')` |
| Certificate block | Promo applied | `classList.add('cart-discount-block--dimmed')` |
| Certificate block | No promo | `classList.remove('cart-discount-block--dimmed')` |
| Promo result div | Result exists | `style.display = 'block'` |
| Promo result div | Cleared | `style.display = 'none'` |
| Discount row in summary | Has discount | `style.display = ''` |
| Discount row in summary | No discount | `style.display = 'none'` |
| Form fields | Empty on blur/submit | `classList.add('field-error')` |
| Form fields | User fills in value | `classList.remove('field-error')` |

---

## Favorites Page

### `public/js/pages/favorites.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Favorites list | Has items | `style.display = ''` |
| Favorites list | Empty | `style.display = 'none'` |
| Filter button | Has items | `style.display = ''` |
| Filter button | Empty list | `style.display = 'none'` |
| Filter dropdown | Activated | `style.display = 'flex'` |
| Active filter button | Selected | `classList.add('active')` |
| Scroll-to-top button | Scrolled down | `classList.add('visible')` |
| Scroll-to-top button | Near top | `classList.remove('visible')` |

---

## Profile Page

### `public/js/pages/profile.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Viewed products section | User has viewed items | `style.display = 'block'` |
| Viewed products section | No viewed items | `style.display = 'none'` |
| Subscribed products section | User has subscriptions | `style.display = 'block'` |
| Subscribed products section | No subscriptions | `style.display = 'none'` |
| Logged-out profile UI | User authenticated | `style.display = 'none'` |
| `#telegram-login-button` | Inside Telegram Mini App | `style.display = 'flex'` |
| `#telegram-login-button` | Web browser (any mode) | `style.display = 'none'` |
| `#telegram-widget-container` | Web browser + Telegram mode + `TELEGRAM_BOT_USERNAME` set | `style.display = 'flex'` + Login Widget script injected |
| `#telegram-widget-container` | Any other context | `style.display = 'none'` |
| Carousel left arrow | At start | `classList.toggle('hidden', isAtStart)` |
| Carousel right arrow | At end | `classList.toggle('hidden', isAtEnd)` |
| Profile images | Loaded | `classList.add('loaded')` |
| Tab buttons | Active | `classList.add('active')` |
| Tab wrapper | First/last tab | `classList.toggle('first-tab-active', ...)` / `classList.toggle('last-tab-active', ...)` |
| Theme toggle icon | Dark mode | `classList.toggle('dark-mode', currentTheme === 'dark')` |
| Color scheme button | Active scheme | `classList.toggle('active', btn.dataset.scheme === scheme)` |
| `#profile-account-info` | API returns email/date | `style.display = ''` |
| `#profile-account-info` | No data | `style.display = 'none'` |
| `#profile-favorites-count` | Has favorites | `style.display = ''` |
| `#profile-favorites-count` | Empty | `style.display = 'none'` |
| `#profile-addresses-section` | Has saved address | `style.display = ''` |
| `#profile-addresses-section` | No saved address | `style.display = 'none'` |

### `public/js/pages/profile/orders.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Order scrub tooltip | Scrubbing | `style.left/top` positioned, `classList.add('visible')` |
| Pagination container | Single page | `style.display = 'none'` |
| Pagination container | Multiple pages | `style.display = 'flex'` |
| Filter expand button | Filters shown | `classList.toggle('active', filtersExpanded)` |
| Filter buttons container | Expanded | `classList.toggle('expanded', filtersExpanded)` |
| Date filter buttons | Active | `classList.add('active')` |

---

## Customers Page

### `public/js/pages/customers.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Gallery carousel prev/next | At boundary | `classList.toggle('hidden', isAtBoundary)` |
| Gallery images | Loaded | `classList.add('loaded')` |
| Tab buttons | Active | `classList.add('active')` |
| Tab wrapper | First/last tab | `classList.toggle('first-tab-active', ...)` / `classList.toggle('last-tab-active', ...)` |
| Comment like button | Liked | `classList.add('liked')` |
| Suggestion upvote button | Upvoted | `classList.add('upvoted')` |
| Login prompt | Not authenticated | shown in place of form content (`classList.add('hidden')` on form) |
| Scroll-to-top button | Scrolled down | `classList.add('visible')` |

---

## FAQ Page

### `public/js/pages/faq.js`
| Element | Condition | Change |
|---------|-----------|--------|
| FAQ category | Expanded | `classList.add('active')` |
| FAQ item | Expanded | `classList.add('active')` |

---

## Order Page

### `public/js/pages/order/tracking.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Tracking section | Order has tracking number | Rendered with number, copy button, and external link |
| Tracking section | No tracking number but shipped status | Shows "tracking number not yet added" message |

### `public/js/modules/faq-info-boxes.js`
| Element | Condition | Change |
|---------|-----------|--------|
| FAQ item | Expanded | `classList.add('active')`, `--content-height` CSS var set |
| FAQ item | Collapsed | `classList.remove('active')` |
| FAQ info boxes container | No items from API | `innerHTML = ''` (hidden) |

### `public/js/pages/order/payment.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Payment overlay | Opened | `classList.add('active')`, `body.style.overflow = 'hidden'` |
| Payment overlay | Closed | `classList.remove('active')`, `body.style.overflow = ''` |
| Payment container | Visible | `style.display = ''` |
| Payment container | Hidden | `style.display = 'none'` |

---

## Certificate Page

### `public/js/certificate.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Template carousel prev/next | Templates available | `style.display = 'flex'` |
| Carousel items | Selected | `style.display = 'flex'` |
| Carousel items | Not selected | `style.display = 'none'` |
| Template indicators | Active | `classList.add('active')` |
| Gifter mode section | Mode = 'gifter' | `style.display = 'block'` |
| Recipient mode section | Mode = 'recipient' | `style.display = 'block'` |
| Login-required block | User not logged in | `style.display = 'block'` |
| Redemption block | User logged in | `style.display = 'block'` |
| Mode buttons | Active | `classList.toggle('active', btn.dataset.mode === mode)` |
| Actions container | Certificate verified | `style.display = 'flex'` |
| Actions container | Not verified | `style.display = 'none'` |
| Details section | Certificate verified | `style.display = 'block'` |

---

## Picker Page

### `public/js/pages/picker.js`
| Element | Condition | Change |
|---------|-----------|--------|
| Picker card | Swipe right | `classList.add('show-right')`, remove `'show-left'` |
| Picker card | Swipe left | `classList.add('show-left')`, remove `'show-right'` |
| Picker card | At rest | `classList.remove('show-left', 'show-right')`, `style.transform = ''` |
| Picker card | Dragging | `style.transform = translateX({}) rotate({})` |
| Picker card | Confirmed swipe direction | `classList.add('swipe-left'/'swipe-right')` |
| Picker card | Undo | `classList.add('undo-left'/'undo-right')` |
| Picker card | Undo complete | all swipe classes removed, `style.transform = ''` |
| Swipe indicator | Shown | `classList.add('show')` |
| Cards stack | Position offset | `style.transform = translate(...)` |
| Picker card (liked) | Right swipe style | `style.background = imgUrl`, `style.boxShadow = rgba(38,222,129,...)` ⚠️ hardcoded color |
| Picker card (disliked) | Left swipe style | `style.background = imgUrl`, `style.boxShadow = rgba(255,71,87,...)` ⚠️ hardcoded color |
| Game screen | Game started | `style.display = 'flex'` |
| Cards by position | Stack order | `classList.add('picker-card-top'/'picker-card-second'/'picker-card-third')` |

---

## AR View

### `public/js/pages/ar-view.js`
| Element | Condition | Change |
|---------|-----------|--------|
| THREE.js objects (`posterGroup`, `reticle`, etc.) | Placement/surface detection | `.visible = true/false` (Three.js property, not CSS) |
| AR corner markers | Off-screen | `classList.toggle('off-screen', isOffScreen)` |
| AR buttons | Selected | `classList.add('active')` |
| Debug console | Toggle button click | `style.display = 'block'/'none'` |
| Done button | Corner count met | `disabled = false` |

---

## Notes on Hardcoded Colors

The following inline style changes use hardcoded colors instead of CSS variables — candidates for cleanup:

- `order/tracking.js`: success state `borderColor/background` with hardcoded green `rgba(74,222,128,...)` — use `var(--status-success)` / `var(--status-success-bg)`
- `picker.js`: swipe shadow colors `rgba(38,222,129,...)` / `rgba(255,71,87,...)` — use status vars or card-specific vars
- `product/main.js`: `qualityLabel.style.cssText = 'color: #818181'` and `qualityValue.style.cssText = 'color: #E0E0E0'` — use `var(--text-secondary)` / `var(--text-primary)`
