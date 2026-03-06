# Theme System

> **Last Updated:** February 15, 2026

This document describes the dark/light theme system for TR/BUTE.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [CSS Variables](#css-variables)
4. [Using Theme Variables](#using-theme-variables)
5. [Theme Toggle](#theme-toggle)
6. [Adding New Features](#adding-new-features)

---

## Overview

TR/BUTE supports dark (default) and light themes. The theme preference is:
- Stored in `localStorage` with key `tributary-theme`
- Applied via `data-theme` attribute on `<body>`
- Persisted across sessions and pages

**Files:**
- `public/css/global.css` - All theme CSS variables
- `public/css/page-layouts.css` - Shared layouts using `var(--border-color)` for theme-adaptive borders
- `public/js/modules/theme.js` - Theme toggle logic
- `public/pages/profile.html` - Theme toggle UI

---

## How It Works

1. `theme.js` loads early in `<head>` (before CSS) to prevent flash of wrong theme
2. Script reads theme from `localStorage` (default: 'dark')
3. Applies `data-theme="dark"` or `data-theme="light"` to `<body>`
4. CSS variables automatically switch based on `body[data-theme]` selector
5. User toggles theme in Profile page settings

---

## CSS Variables

All theme colors are defined in `/public/css/global.css`. Use these variables throughout all CSS files - never use hardcoded colors.

### Brand Colors
```css
/* Dark theme (default) */
--brand-primary: #ff9500;      /* Main brand color (icons, accents) */
--brand-secondary: #fbe98a;    /* Secondary brand (highlights) */
--brand-hover: #f5d963;        /* Brand color on hover */
--brand-muted: rgba(255, 149, 0, 0.15);

/* Light theme - Darker for better contrast on white */
--brand-primary: #d97706;      /* 4.5:1 contrast ratio */
--brand-secondary: #ca8a04;    /* Darker yellow-gold */
--brand-hover: #b45309;
```

> **Note:** Brand colors are automatically darker in light theme to meet WCAG AA contrast requirements (4.5:1 for text).

### Background Colors
```css
--bg-primary: #121212;         /* Main page background */
--bg-secondary: #1e1e1e;       /* Cards, elevated surfaces */
--bg-tertiary: #2b2b2b;        /* Hover states, inputs */
--bg-quaternary: #3a3a3a;      /* Active states */
--bg-overlay: rgba(0, 0, 0, 0.8);
```

### Text Colors
```css
--text-primary: #E0E0E0;       /* Main text */
--text-secondary: #a3a3a3;     /* Secondary text */
--text-tertiary: #818181;      /* Muted text, placeholders */
--text-inverse: #121212;       /* Text on light backgrounds */
```

### Border Colors
```css
--border-color: rgba(65, 65, 65, 0.5);      /* Default borders */
--border-hover: rgba(143, 143, 143, 0.5);   /* Border on hover */
--border-active: rgba(255, 149, 0, 0.5);    /* Active/focus borders */
--divider: rgba(65, 65, 65, 0.3);           /* Subtle dividers */
```

### Status Colors (Unified with Admin)
```css
--status-pending: #FFC107;     /* Yellow - waiting/pending */
--status-pending-bg: rgba(255, 193, 7, 0.15);
--status-info: #2196F3;        /* Blue - information */
--status-info-bg: rgba(33, 150, 243, 0.15);
--status-success: #4CAF50;     /* Green - completed */
--status-success-bg: rgba(76, 175, 80, 0.15);
--status-warning: #FF9800;     /* Orange - attention needed */
--status-warning-bg: rgba(255, 152, 0, 0.15);
--status-error: #F44336;       /* Red - error/cancelled */
--status-error-bg: rgba(244, 67, 54, 0.15);
--status-purple: #9C27B0;      /* Purple - returned */
--status-purple-bg: rgba(156, 39, 176, 0.15);
--status-shipped: #673ab7;     /* Deep purple - shipped */
--status-shipped-bg: rgba(103, 58, 183, 0.15);
--status-confirmed: #64B5F6;   /* Light blue - confirmed */
--status-confirmed-bg: rgba(100, 181, 246, 0.15);
--status-paid: #81C784;        /* Light green - paid */
--status-paid-bg: rgba(129, 199, 132, 0.2);
--status-hold: #9E9E9E;        /* Grey - on hold */
--status-hold-bg: rgba(158, 158, 158, 0.15);
```

### Interactive Colors
```css
--link-color: #66b3db;         /* Links */
--link-hover: #8ec8e8;         /* Links on hover */
--favorite-color: #e91e63;     /* Heart/favorite */
```

### Skeleton Loading
```css
--skeleton-bg-base: rgba(255, 255, 255, 0.05);
--skeleton-bg-highlight: rgba(255, 255, 255, 0.1);
```

---

## Using Theme Variables

### Do This (Correct)
```css
.my-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.my-card:hover {
  border-color: var(--border-hover);
}

.error-text {
  color: var(--status-error);
}
```

### Don't Do This (Wrong)
```css
.my-card {
  background-color: #1e1e1e;  /* Hardcoded - won't work with light theme */
  border: 1px solid #414141;
  color: #E0E0E0;
}
```

---

## Theme Toggle

### JavaScript API

```javascript
// Get current theme
const theme = window.ThemeManager.get(); // 'dark' or 'light'

// Set theme
window.ThemeManager.set('light');

// Toggle theme
const newTheme = window.toggleTheme(); // Returns new theme

// Listen for theme changes
window.addEventListener('themechange', (e) => {
  console.log('Theme changed to:', e.detail.theme);
});
```

### Profile Page Toggle

The theme toggle is in `/profile` under Settings. It uses:
- `#toggle-theme` button element
- CSS class `.toggle-button` with `data-state` attribute
- Styles in `/public/css/profile.css`

---

## Adding New Features

When adding new features, follow these guidelines:

### 1. Use Theme Variables
Always use CSS variables from `global.css`:
```css
.new-feature {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
```

### 2. Don't Add New Color Variables
Unless absolutely necessary, use existing variables. The theme system works because all colors are centralized.

### 3. Test Both Themes
Test your feature in both dark and light modes:
1. Go to Profile > Settings
2. Toggle "Light theme"
3. Verify all elements are visible and readable

### 4. Status Colors Are Universal
Status colors (success, error, warning, etc.) work on both themes. Use them for:
- Order statuses
- Alerts and notifications
- Form validation
- Action buttons

### 5. Skeleton Loaders
Skeleton loaders automatically adapt. Just use the `.skeleton` class family:
```html
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-rect" style="height: 100px;"></div>
```

---

## Light Theme Colors

The light theme overrides these variables in `body[data-theme="light"]`:

```css
body[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --bg-quaternary: #d4d4d4;
  --bg-overlay: rgba(0, 0, 0, 0.5);

  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --text-inverse: #ffffff;

  --border-color: rgba(0, 0, 0, 0.1);
  --border-hover: rgba(0, 0, 0, 0.2);

  --skeleton-bg-base: rgba(0, 0, 0, 0.06);
  --skeleton-bg-highlight: rgba(0, 0, 0, 0.1);
}
```

Brand and status colors remain the same in both themes for consistency.

---

## Page CSS Theme Pattern

Each page CSS file contains a `LIGHT THEME OVERRIDES` section at the bottom using nested selectors:

```css
html[data-theme="light"],
body[data-theme="light"] {
  .my-element {
    color: var(--text-primary);
    border-color: var(--border-color);
  }
}
```

**Shared layouts** (`page-layouts.css`) already use CSS variables like `var(--border-color)`, so they adapt automatically — no per-page light-theme override is needed for shared properties.

**Page-specific overrides** only need light-theme rules for hardcoded dark-mode colors (e.g., `rgba(65, 65, 65, 0.5)` or `#1e1e1e`). When migrating these to CSS variables, the light-theme override becomes unnecessary.
