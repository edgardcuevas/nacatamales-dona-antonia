const AppError = require("../errors/app-error");

const {
  errorResponse,
} = require("../shared/http-response");

function isMalformedJsonError(error) {
  return (
    error instanceof SyntaxError &&
    error.status === 400 &&
    error.type === "entity.parse.failed"
  );
}

// Server defects were invisible until this existed: the backend
// classifies its own failures as AppError, so responding to the client
// without logging meant a failing YouTube synchronization or media
// write left no trace at all. Only 5xx is logged, because those need
// attention, while 4xx is normal traffic and would just add noise.
function logServerError(error, request) {
  const method =
    typeof request?.method === "string"
      ? request.method
      : "UNKNOWN";
  // request.path excludes the query string on purpose: it is the only
  // route field that cannot carry a token in a query parameter.
  const path =
    typeof request?.path === "string"
      ? request.path
      : "unknown";
  const cause =
    error?.cause instanceof Error
      ? ` cause=${error.cause.message}`
      : "";

  console.error(
    `Server error: code=${error.code} status=${error.statusCode} method=${method} path=${path} message=${JSON.stringify(error.message)}${cause}`
  );
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  if (isMalformedJsonError(error)) {
    return errorResponse(
      response,
      400,
      "INVALID_JSON",
      "The request body contains invalid JSON"
    );
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logServerError(error, request);
    }

    return errorResponse(
      response,
      error.statusCode,
      error.code,
      error.message
    );
  }

  console.error("Unhandled request error:", error);

  return errorResponse(
    response,
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected error occurred"
  );
}

module.exports = errorHandler;