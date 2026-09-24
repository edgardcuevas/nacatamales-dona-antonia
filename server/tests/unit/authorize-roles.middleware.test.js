const test = require("node:test");
const assert = require("node:assert/strict");

const AppError = require("../../src/errors/app-error");
const authorizeRoles = require(
  "../../src/middlewares/authorize-roles.middleware"
);

function execute(middleware, request) {
  let nextCalls = 0;
  let nextError;

  middleware(request, {}, (error) => {
    nextCalls += 1;
    nextError = error;
  });

  return {
    nextCalls,
    nextError,
  };
}

function createRequest(role) {
  return {
    currentUser: role === undefined
      ? undefined
      : {
          id: 7,
          email: "user@example.com",
          role,
          isActive: true,
        },
    body: {
      role: "ADMIN",
    },
    params: {
      role: "ADMIN",
    },
    query: {
      role: "ADMIN",
    },
  };
}

function assertError(
  result,
  statusCode,
  code,
  message
) {
  assert.equal(result.nextCalls, 1);
  assert.ok(result.nextError instanceof AppError);
  assert.equal(result.nextError.statusCode, statusCode);
  assert.equal(result.nextError.code, code);
  assert.equal(result.nextError.message, message);
}

test("authorizeRoles permits an ADMIN when ADMIN is allowed", () => {
  const middleware = authorizeRoles("ADMIN");
  const result = execute(
    middleware,
    createRequest("ADMIN")
  );

  assert.equal(result.nextCalls, 1);
  assert.equal(result.nextError, undefined);
});

test("authorizeRoles permits an EDITOR when EDITOR is allowed", () => {
  const middleware = authorizeRoles("EDITOR");
  const result = execute(
    middleware,
    createRequest("EDITOR")
  );

  assert.equal(result.nextCalls, 1);
  assert.equal(result.nextError, undefined);
});

test("authorizeRoles rejects an EDITOR on an ADMIN-only middleware", () => {
  const middleware = authorizeRoles("ADMIN");
  const result = execute(
    middleware,
    createRequest("EDITOR")
  );

  assertError(
    result,
    403,
    "FORBIDDEN",
    "You do not have permission to perform this action"
  );
});

test("authorizeRoles requires currentUser", () => {
  const middleware = authorizeRoles("ADMIN");
  const result = execute(middleware, {});

  assertError(
    result,
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication is required"
  );
});

test("authorizeRoles rejects an invalid currentUser role with 403", () => {
  const middleware = authorizeRoles("ADMIN");
  const result = execute(
    middleware,
    createRequest("OWNER")
  );

  assertError(
    result,
    403,
    "FORBIDDEN",
    "You do not have permission to perform this action"
  );
});

test("authorizeRoles ignores role values in request data", () => {
  const middleware = authorizeRoles("ADMIN");
  const request = createRequest("EDITOR");
  const result = execute(middleware, request);

  assertError(
    result,
    403,
    "FORBIDDEN",
    "You do not have permission to perform this action"
  );
});

test("authorizeRoles rejects an empty role list during configuration", () => {
  assert.throws(
    () => authorizeRoles(),
    /At least one allowed role is required/
  );
});

test("authorizeRoles rejects an invalid allowed role during configuration", () => {
  assert.throws(
    () => authorizeRoles("OWNER"),
    /Invalid role configuration/
  );
});

test("authorizeRoles supports multiple allowed roles", () => {
  const middleware = authorizeRoles(
    "ADMIN",
    "EDITOR"
  );
  const result = execute(
    middleware,
    createRequest("EDITOR")
  );

  assert.equal(result.nextCalls, 1);
  assert.equal(result.nextError, undefined);
});
