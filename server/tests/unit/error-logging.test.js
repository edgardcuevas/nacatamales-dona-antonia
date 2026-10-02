const test = require("node:test");
const assert = require("node:assert/strict");
const {
  afterEach,
  mock,
} = require("node:test");

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

function handle(error, request = {}) {
  const response = createMockResponse();

  function next() {
    throw new Error("next must not be called");
  }

  errorHandler(error, request, response, next);

  return response;
}

function captureConsoleError() {
  const lines = [];

  mock.method(
    console,
    "error",
    (...arguments_) => {
      lines.push(arguments_);
    }
  );

  return lines;
}

function getLoggedText(lines) {
  return lines
    .flat()
    .map((value) => String(value))
    .join("\n");
}

afterEach(() => {
  mock.restoreAll();
});

test("server-side AppError is logged once with code, status, method and path", () => {
  const lines = captureConsoleError();

  const response = handle(
    new AppError(
      500,
      "VIDEO_STATUS_PERSISTENCE_FAILED",
      "The YouTube video status could not be recorded"
    ),
    {
      method: "GET",
      path: "/api/admin/videos/3/status",
    }
  );

  assert.equal(lines.length, 1);
  const logged = getLoggedText(lines);
  assert.match(
    logged,
    /VIDEO_STATUS_PERSISTENCE_FAILED/
  );
  assert.match(logged, /status=500/);
  assert.match(logged, /method=GET/);
  assert.match(
    logged,
    /path=\/api\/admin\/videos\/3\/status/
  );
  assert.match(
    logged,
    /The YouTube video status could not be recorded/
  );

  // The HTTP response must be untouched by the logging.
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "VIDEO_STATUS_PERSISTENCE_FAILED",
      message:
        "The YouTube video status could not be recorded",
    },
  });
});

test("client-side AppError is never logged", () => {
  const lines = captureConsoleError();

  for (const statusCode of [400, 401, 403, 404, 409, 429]) {
    const response = handle(
      new AppError(
        statusCode,
        "SOMETHING_REJECTED",
        "Rejected input"
      ),
      {
        method: "POST",
        path: "/api/admin/videos",
      }
    );

    assert.equal(response.statusCode, statusCode);
    assert.deepEqual(response.body, {
      success: false,
      error: {
        code: "SOMETHING_REJECTED",
        message: "Rejected input",
      },
    });
  }

  assert.equal(lines.length, 0);
});

test("the logged line excludes the query string and any request payload", () => {
  const lines = captureConsoleError();

  handle(
    new AppError(
      500,
      "MEDIA_CONFIRM_FAILED",
      "The media could not be confirmed"
    ),
    {
      method: "POST",
      path: "/api/admin/media/confirm",
      originalUrl:
        "/api/admin/media/confirm?token=super-secret-token",
      query: {
        token: "super-secret-token",
        password: "another-secret",
      },
      body: {
        password: "another-secret",
        refreshToken: "a-refresh-jwt-value",
      },
      headers: {
        cookie: "refreshToken=a-cookie-token-value",
        authorization: "Bearer an-access-token-value",
      },
      cookies: {
        refreshToken: "a-cookie-token-value",
      },
    }
  );

  const logged = getLoggedText(lines);
  for (const secret of [
    "super-secret-token",
    "another-secret",
    "a-refresh-jwt-value",
    "a-cookie-token-value",
    "an-access-token-value",
  ]) {
    assert.equal(
      logged.includes(secret),
      false,
      `the log leaked ${secret}`
    );
  }

  assert.equal(logged.includes("?"), false);
  assert.match(
    logged,
    /path=\/api\/admin\/media\/confirm/
  );
});

test("an Error cause is logged as text but a non-Error cause is ignored", () => {
  const lines = captureConsoleError();

  handle(
    new AppError(
      500,
      "PERSISTENCE_FAILED",
      "The record could not be saved"
    ),
    {
      method: "POST",
      path: "/api/admin/photos",
    }
  );

  handle(
    Object.assign(
      new AppError(
        500,
        "PERSISTENCE_FAILED",
        "The record could not be saved"
      ),
      {
        cause: new Error("ER_DUP_ENTRY duplicate entry"),
      }
    ),
    {
      method: "POST",
      path: "/api/admin/photos",
    }
  );

  handle(
    Object.assign(
      new AppError(
        500,
        "PERSISTENCE_FAILED",
        "The record could not be saved"
      ),
      {
        cause: {
          secret: "should-not-appear",
          code: "SOME_DRIVER_CODE",
        },
      }
    ),
    {
      method: "POST",
      path: "/api/admin/photos",
    }
  );

  assert.equal(lines.length, 3);
  const logged = getLoggedText(lines);

  assert.match(
    logged,
    /cause=ER_DUP_ENTRY duplicate entry/
  );
  assert.equal(
    logged.includes("should-not-appear"),
    false
  );
  assert.equal(
    logged.includes("SOME_DRIVER_CODE"),
    false
  );
});

test("logging survives a request without method or path", () => {
  const lines = captureConsoleError();

  const response = handle(
    new AppError(
      500,
      "UNEXPECTED_CONTEXT",
      "Failed without a request shape"
    )
  );

  assert.equal(lines.length, 1);
  const logged = getLoggedText(lines);
  assert.match(logged, /method=UNKNOWN/);
  assert.match(logged, /path=unknown/);
  assert.equal(response.statusCode, 500);
});

test("unknown errors keep using the existing full-object log", () => {
  const lines = captureConsoleError();
  const error = new Error("Unexpected failure");

  const response = handle(error, {
    method: "GET",
    path: "/api/categories",
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], "Unhandled request error:");
  assert.equal(lines[0][1], error);
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

test("malformed JSON is still answered without being logged as a server error", () => {
  const lines = captureConsoleError();
  const error = new SyntaxError("Unexpected token");
  error.status = 400;
  error.type = "entity.parse.failed";

  const response = handle(error, {
    method: "POST",
    path: "/api/admin/photos",
  });

  assert.equal(lines.length, 0);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: "INVALID_JSON",
      message: "The request body contains invalid JSON",
    },
  });
});