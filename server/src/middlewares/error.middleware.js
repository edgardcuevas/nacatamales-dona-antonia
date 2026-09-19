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