// Run manually with:
// node --env-file=.env database/scripts/cleanup-auth-sessions.js
const authSessionRepository = require(
  "../../src/modules/auth/auth-session.repository"
);
const pool = require("../../src/database/pool");

const {
  AUTH_SESSION_RETENTION_DAYS,
} = authSessionRepository;

async function cleanupAuthSessions({
  repository = authSessionRepository,
  databasePool = pool,
  logger = console,
} = {}) {
  try {
    const deletedRows =
      await repository.deleteStaleAuthSessions();

    logger.log(
      `Deleted ${deletedRows} stale authentication sessions ` +
      `(retention: ${AUTH_SESSION_RETENTION_DAYS} days).`
    );

    return deletedRows;
  } finally {
    await databasePool.end();
  }
}

async function run() {
  try {
    await cleanupAuthSessions();
  } catch {
    console.error(
      "Unable to clean stale authentication sessions."
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void run();
}

module.exports = {
  cleanupAuthSessions,
  run,
};
