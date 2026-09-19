const test = require("node:test");
const assert = require("node:assert/strict");

const AppError = require("../../src/errors/app-error");
const errorHandler = require(
  "../../src/middlewares/error.middleware"
);

function createMockResponse() {
  return {
    headersSent: false,
    statusCode: null,
    body: null,

    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("errorHandler responds correctly for an AppError", () => {
  const error = new AppError(
    403,
    "ACCESS_DENIED",
    "Access denied"
  );

  const request = {};
  const response = createMockResponse();

  function next() {
    throw new Error("next must not be called");
  }

  errorHandler(error, request, response, next);

  assert.equal(response.statusCode, 403);

  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "ACCESS_DENIED",
      message: "Access denied",
    },
  });
});


test("errorHandler hides details of unexpected errors", () => {
  const error = new Error("Sensitive internal information");

  const request = {};
  const response = createMockResponse();

  function next() {
    throw new Error("next must not be called");
  }

  errorHandler(error, request, response, next);

  assert.equal(response.statusCode, 500);

  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });

  assert.notEqual(
    response.body.error.message,
    error.message
  );
});

test("errorHandler responds correctly for malformed JSON", () => {
  const error = new SyntaxError("Unexpected token");

  error.status = 400;
  error.type = "entity.parse.failed";

  const request = {};
  const response = createMockResponse();

  function next() {
    throw new Error("next must not be called");
  }

  errorHandler(error, request, response, next);

  assert.equal(response.statusCode, 400);

  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "INVALID_JSON",
      message: "The request body contains invalid JSON",
    },
  });
});