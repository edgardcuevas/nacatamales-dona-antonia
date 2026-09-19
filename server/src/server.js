const app = require("./app");
const env = require("./config/env");
const pool = require("./database/pool");

let server;
let isShuttingDown = false;

function startServer() {
  server = app.listen(env.port, () => {
    console.log(
      `Server running in ${env.nodeEnv} mode on port ${env.port}`
    );
  });
}

async function closeDatabasePool() {
  try {
    await pool.end();
    console.log("MySQL connection pool closed successfully.");
  } catch (error) {
    console.error(
      "Error while closing the MySQL connection pool:",
      error
    );

    throw error;
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Closing server gracefully...`);

  const forceShutdownTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);

  forceShutdownTimer.unref();

  let exitCode = 0;

  if (server) {
    try {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      console.log("HTTP server closed successfully.");
    } catch (error) {
      exitCode = 1;
      console.error("Error while closing the HTTP server:", error);
    }
  }

  try {
    await closeDatabasePool();
  } catch {
    exitCode = 1;
  }

  clearTimeout(forceShutdownTimer);
  process.exit(exitCode);
}

function handleUnexpectedError(error) {
  console.error("Unexpected fatal error:", error);

  void shutdown("FATAL_ERROR");
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", handleUnexpectedError);
process.on("unhandledRejection", handleUnexpectedError);

startServer();