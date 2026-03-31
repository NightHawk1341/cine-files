const { config, validateConfig } = require('./lib/config');
const { closePool, warmupPool } = require('./lib/db');

validateConfig();

const app = require('./server/app');

// ============================================================
// Start server
// ============================================================
var PORT = config.port;

app.listen(PORT, function () {
  console.log('CineFiles server running on port ' + PORT);
  // INFRA-1: Warm up DB pool on startup (non-blocking)
  warmupPool().catch(function (err) {
    console.error('Pool warmup error:', err);
  });
});

// ============================================================
// Graceful shutdown
// ============================================================
async function shutdown() {
  console.log('Shutting down...');
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', function (err) {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', function (err) {
  console.error('Uncaught exception:', err);
  shutdown();
});

module.exports = app;
