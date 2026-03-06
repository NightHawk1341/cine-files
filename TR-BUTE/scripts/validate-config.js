#!/usr/bin/env node

/**
 * Configuration Validation Script
 * Validates environment variables for deployment readiness
 */

const config = require('../lib/config');

console.log('Configuration Validation\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Environment Info
console.log('Environment Information:');
console.log(`   NODE_ENV: ${config.nodeEnv}`);
console.log(`   Deployment Mode: ${config.deploymentMode}`);
console.log(`   App URL: ${config.appUrl}`);
console.log(`   Notification Mode: ${config.notificationMode}\n`);

// Validation results
const errors = [];
const warnings = [];
const info = [];

// Critical validations
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Authentication Configuration:\n');

console.log(`   Telegram Auth: ${config.auth.telegram.enabled ? '[OK] Enabled' : '[--] Disabled'}`);
if (config.auth.telegram.enabled) {
  console.log(`   - User Bot Token: ${config.auth.telegram.userBotToken ? '[OK]' : '[ERROR]'}`);
  console.log(`   - Admin Bot Token: ${config.auth.telegram.adminBotToken ? '[OK]' : '[WARN]'}`);
  console.log(`   - Admin Chat ID: ${config.auth.telegram.adminChatId ? '[OK]' : '[WARN]'}`);

  if (!config.auth.telegram.userBotToken) {
    errors.push('Telegram mode requires USER_BOT_TOKEN');
  }
}

console.log(`\n   Yandex OAuth: ${config.auth.yandex.enabled ? '[OK] Enabled' : '[--] Disabled'}`);
if (config.auth.yandex.enabled) {
  console.log(`   - Client ID: ${config.auth.yandex.clientId ? '[OK]' : '[ERROR]'}`);
  console.log(`   - Client Secret: ${config.auth.yandex.clientSecret ? '[OK]' : '[ERROR]'}`);
  console.log(`   - Redirect URI: ${config.auth.yandex.redirectUri || '[ERROR]'}`);

  if (!config.auth.yandex.clientId || !config.auth.yandex.clientSecret) {
    errors.push('Yandex mode requires YANDEX_CLIENT_ID and YANDEX_CLIENT_SECRET');
  }
}

// Mode-specific validation
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Deployment Mode Validation:\n');

if (config.isTelegramMode) {
  console.log('   Mode: Telegram (Vercel)');

  if (!config.auth.telegram.enabled) {
    errors.push('Telegram mode detected but Telegram auth is not enabled');
  }

  if (config.auth.yandex.enabled) {
    warnings.push('Yandex auth is enabled in Telegram mode (should be disabled)');
  }

  console.log(`   [OK] Correct mode for Vercel deployment`);
} else if (config.isYandexMode) {
  console.log('   Mode: Yandex (Browser/Email)');

  if (!config.auth.yandex.enabled) {
    errors.push('Yandex mode detected but Yandex OAuth is not enabled');
  }

  if (!config.email.enabled) {
    warnings.push('Email not configured - notifications will not work');
  }

  if (config.auth.telegram.enabled) {
    warnings.push('Telegram auth is enabled in Yandex mode (should be disabled)');
  }

  console.log(`   [OK] Correct mode for Yandex Cloud deployment`);
}

// Database
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Configuration:\n');
console.log(`   PostgreSQL: ${config.databaseUrl ? '[OK] Configured' : '[ERROR] Missing'}`);

if (!config.databaseUrl && config.isProduction) {
  errors.push('DATABASE_URL is required in production');
}

// External Services
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('External Services:\n');

console.log(`   T-Bank: ${config.tbank.enabled ? '[OK] Enabled' : '[WARN] Disabled'}`);
if (!config.tbank.enabled) {
  warnings.push('T-Bank not configured - payment features disabled');
}

console.log(`   Supabase: ${config.supabase.enabled ? '[OK] Enabled' : '[WARN] Disabled'}`);
if (!config.supabase.enabled) {
  warnings.push('Supabase not configured - image uploads may fail');
}

console.log(`   Email (Yandex): ${config.email.enabled ? '[OK] Enabled' : '[WARN] Disabled'}`);
if (config.isYandexMode && !config.email.enabled) {
  errors.push('Email is required for Yandex mode notifications');
}

// JWT
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Security:\n');
console.log(`   JWT Secret: ${config.jwt.secret ? '[OK] Set' : '[ERROR] Missing'}`);

if (!config.jwt.secret) {
  errors.push('JWT_SECRET or SESSION_SECRET is required');
}

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Validation Summary:\n');

if (errors.length === 0 && warnings.length === 0) {
  console.log('   All checks passed!');
  console.log('   Configuration is ready for deployment\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.log(`   Errors: ${errors.length}`);
  errors.forEach((err, i) => {
    console.log(`      ${i + 1}. ${err}`);
  });
  console.log('');
}

if (warnings.length > 0) {
  console.log(`   Warnings: ${warnings.length}`);
  warnings.forEach((warn, i) => {
    console.log(`      ${i + 1}. ${warn}`);
  });
  console.log('');
}

if (info.length > 0) {
  console.log(`   Info: ${info.length}`);
  info.forEach((inf, i) => {
    console.log(`      ${i + 1}. ${inf}`);
  });
  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (errors.length > 0) {
  console.log('Configuration validation failed');
  console.log('   Please fix critical errors before deploying\n');
  process.exit(1);
} else {
  console.log('Configuration has warnings but can proceed');
  console.log('   Review warnings for optimal setup\n');
  process.exit(0);
}
