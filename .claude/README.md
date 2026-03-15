# Claude Implementation Protocols

## Before Starting Any Task

1. Read `CLAUDE.md` — project rules, conventions, gotchas
2. Read `DEVELOPMENT_CHECKLIST.md` — step-by-step checklists for common operations
3. Check `docs/` for system-specific documentation relevant to the task

## Required Reading by Task Type

| Task | Read First |
|------|-----------|
| Adding API endpoints | `CLAUDE.md` (API Pattern), `server/routes/index.js` |
| Database changes | `SQL_SCHEMA.sql`, `docs/DATABASE.md` |
| Frontend pages | `docs/SPA_LIFECYCLE.md`, `docs/CONDITIONAL_VISIBILITY.md` |
| CSS/theming | `docs/THEMING.md`, `public/css/global.css` (variables) |
| Auth changes | `docs/AUTH_SYSTEM.md` |
| Content/articles | `docs/CONTENT_SYSTEM.md` |
| TMDB integration | `docs/TMDB_INTEGRATION.md` |
| Deployment | `docs/DEPLOYMENT.md`, `.github/workflows/deploy-yandex.yml` |

## Validation — Run Before Completing ANY Task

```bash
npm run check:claude
```

This runs all 5 validators:
- `pre-commit-check.js` — API files registered, JS syntax valid
- `validate-routes.js` — Route order (specific before catch-all)
- `validate-router-selectors.js` — Content selectors exist
- `validate-page-scripts.js` — Page scripts included in index.html
- `validate-spa-styles.js` — CSS files referenced in scripts exist

**Do NOT tell the user a feature is complete until this passes.**

## Key Patterns

### API Handlers (Factory Pattern)
```javascript
// api/example.js
function list({ pool, config }) {
  return async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM example WHERE id = $1', [req.params.id]);
    res.json(rows);
  };
}
module.exports = { list };
```

### Page Registration
```javascript
Router.registerPage('/route', {
  styles: ['/css/page.css'],
  async init(params) { /* build DOM, show skeletons, fetch data */ },
  cleanup() { /* reset state, clear timers, remove body-appended elements */ }
});
```

### CSS Variables (never hardcode colors)
```css
color: var(--text-primary);
background: var(--bg-secondary);
border: 1px solid var(--border-color);
```

## Sister Project

CineFiles shares CSS variable naming, auth providers, and development conventions with [TR-BUTE](https://github.com/NightHawk1341/TR-BUTE). Changes to shared patterns should be mirrored in both projects.
