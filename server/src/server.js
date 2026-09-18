const app = require("./app");
const env = require("./config/env");

let server;
let isShuttingDown = false;

function startServer() {
  server = app.listen(env.port, () => {
    console.log(
      `Server running in ${env.nodeEnv} mode on port ${env.port}`
    );
  });
}

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Closing server gracefully...`);

  if (!server) {
    process.exit(0);
  }

  server.close((error) => {
    if (error) {
      console.error("Error while closing the HTTP server:", error);
      process.exit(1);
    }

    console.log("HTTP server closed successfully.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000).unref();
}

function handleUnexpectedError(error) {
  console.error("Unexpected fatal error:", error);

  shutdown("FATAL_ERROR");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", handleUnexpectedError);
process.on("unhandledRejection", handleUnexpectedError);

startServer();