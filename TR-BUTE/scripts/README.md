# Development Scripts

This directory contains validation and helper scripts for TR-BUTE development.

## 📋 Available Scripts

### `check-new-features.js`
**Quick feature validation for new API endpoints**

Use this when you've created a new API handler and want to verify it's properly set up.

```bash
# Check a specific handler
node scripts/check-new-features.js api/products/authors.js

# Or use npm script
npm run check:feature api/products/authors.js
```

**What it checks:**
- ✅ Handler file exists
- ✅ Handler is registered in `/server/routes/index.js`
- ✅ For product handlers: registered in correct section (before catch-all)
- ℹ️  Reminds you to update SELECT queries if modifying products table

### `validate-routing.js`
**Comprehensive routing validation**

Scans the entire codebase to find potential routing issues.

```bash
# Run full validation
node scripts/validate-routing.js

# Or use npm script
npm run check:routing
```

**What it checks:**
- Finds API handlers that exist but aren't registered
- Finds registered handlers whose files don't exist
- Warns about product routes that might be incorrectly placed

## 🚀 Workflow

### When Adding a New Feature:

1. **Create your feature files** (handler, frontend code, etc.)

2. **Run the quick check:**
   ```bash
   npm run check:feature api/your/handler.js
   ```

3. **Fix any issues** it reports

4. **Review the checklist:**
   - See `/DEVELOPMENT_CHECKLIST.md` for complete feature checklist

5. **Commit your changes**

### Before Deploying:

1. **Run full validation:**
   ```bash
   npm run check:routing
   ```

2. **Review and fix** any issues or warnings

3. **Test locally** to ensure everything works

## 📚 Related Documentation

- `/DEVELOPMENT_CHECKLIST.md` - Complete checklist for adding features
- This file - Script usage and documentation

## 🔧 Common Fixes

### "Handler NOT found in router"

**Problem:** You created an API handler but forgot to register it.

**Fix:**
1. Open `/server/routes/index.js`
2. Add at the appropriate section:
   ```javascript
   const myHandler = require('../../api/your/handler');
   app.get('/api/your/endpoint', myHandler);
   ```
3. Add authentication if needed: `requireAdminAuth` or `authenticateToken`

### "Warning: Handler might not be in PRODUCT-SPECIFIC ROUTES section"

**Problem:** Product handlers must be registered BEFORE the `/:idOrSlug` catch-all route.

**Fix:**
1. Move your handler registration to the "PRODUCT-SPECIFIC ROUTES" section (around line 60-74)
2. This section is specifically for routes like `/api/products/search`, `/api/products/authors`, etc.

### "Don't forget to update SELECT queries"

**Problem:** You added a new field to the products table but forgot to include it in queries.

**Fix:**
Update ALL these queries in `/server/routes/products.js`:
- `router.get('/')` - Main product list
- `router.get('/:idOrSlug')` - Single product
- `publicProductList` - Public product list

Add your field to the SELECT columns:
```sql
SELECT
  p.id,
  p.title,
  -- ... other fields ...
  p.your_new_field  -- Add this!
FROM products p
```

## 💡 Tips

- Run `check:feature` immediately after creating a new handler
- Run `check:routing` before creating a pull request
- Keep `/DEVELOPMENT_CHECKLIST.md` open while coding new features
- These scripts help catch mistakes early, but manual testing is still essential!
