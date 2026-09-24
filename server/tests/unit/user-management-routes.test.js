const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  before,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "user_management_routes_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
  IMAGEKIT_PUBLIC_KEY: "test_public_key",
  IMAGEKIT_PRIVATE_KEY: "test_private_key",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
});

for (const [name, value] of Object.entries(
  TEST_ENVIRONMENT
)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const AppError = require("../../src/errors/app-error");
const userService = require(
  "../../src/modules/users/user.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");

const serviceState = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  listResult: {
    users: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  },
  user: {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: null,
    updatedAt: null,
  },
  calls: {},
  errors: {},
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () => serviceState.currentUser
);
mock.method(
  userService,
  "listAdministrativeUsers",
  async (filters) => {
    serviceState.calls.list = filters;
    if (serviceState.errors.list) {
      throw serviceState.errors.list;
    }
    return serviceState.listResult;
  }
);
mock.method(
  userService,
  "getUserById",
  async (userId) => {
    serviceState.calls.get = { userId };
    if (serviceState.errors.get) {
      throw serviceState.errors.get;
    }
    return serviceState.user;
  }
);
mock.method(
  userService,
  "createAdministrativeUser",
  async (input) => {
    serviceState.calls.create = [
      ...(serviceState.calls.create ?? []),
      input,
    ];
    if (serviceState.errors.create) {
      throw serviceState.errors.create;
    }
    return serviceState.user;
  }
);
mock.method(
  userService,
  "changeUserRole",
  async (input) => {
    serviceState.calls.role = input;
    if (serviceState.errors.role) {
      throw serviceState.errors.role;
    }
    return serviceState.user;
  }
);
mock.method(
  userService,
  "changeUserStatus",
  async (input) => {
    serviceState.calls.status = input;
    if (serviceState.errors.status) {
      throw serviceState.errors.status;
    }
    return serviceState.user;
  }
);
mock.method(
  userService,
  "resetUserPassword",
  async (input) => {
    serviceState.calls.password = {
      userId: input.userId,
      passwordType: typeof input.password,
    };
    if (serviceState.errors.password) {
      throw serviceState.errors.password;
    }
    return serviceState.user;
  }
);
mock.method(
  userService,
  "revokeUserSessions",
  async (userId) => {
    serviceState.calls.sessions = { userId };
    if (serviceState.errors.sessions) {
      throw serviceState.errors.sessions;
    }
    return 0;
  }
);

const app = require("../../src/app");
const pool = require("../../src/database/pool");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

afterEach(() => {
  serviceState.calls = {};
  serviceState.errors = {};
  serviceState.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
});

function accessToken(role = "ADMIN", id = 1) {
  return generateAccessToken({
    id,
    role,
  });
}

async function request(
  path,
  {
    method = "GET",
    body,
    token,
  } = {}
) {
  const headers = {};
  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });
  const responseBody = await response.json();

  return {
    status: response.status,
    body: responseBody,
  };
}

test("admin user routes require authentication", async () => {
  const result = await request("/api/admin/users");

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("admin user routes reject EDITOR with 403", async () => {
  serviceState.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };

  const result = await request("/api/admin/users", {
    token: accessToken("EDITOR", 2),
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
});

test("admin can list users with pagination and safe response", async () => {
  serviceState.listResult = {
    users: [serviceState.user],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const result = await request(
    "/api/admin/users?page=1&limit=20&sortBy=email&sortOrder=asc",
    { token: accessToken() }
  );

  assert.equal(result.status, 200);
  assert.equal(
    result.body.message,
    "Administrative users retrieved successfully"
  );
  assert.equal(result.body.data.users.length, 1);
  assert.equal(
    Object.hasOwn(result.body.data.users[0], "password_hash"),
    false
  );
  assert.deepEqual(serviceState.calls.list, {
    page: 1,
    limit: 20,
    role: undefined,
    isActive: undefined,
    email: undefined,
    sortBy: "email",
    sortOrder: "asc",
  });
});

test("admin can retrieve an existing user", async () => {
  const result = await request(
    "/api/admin/users/2",
    { token: accessToken() }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.user.id, 2);
  assert.equal(
    Object.hasOwn(result.body.data.user, "password_hash"),
    false
  );
});

test("admin user detail rejects an invalid user ID before the service", async () => {
  const result = await request(
    "/api/admin/users/not-a-number",
    { token: accessToken() }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "INVALID_USER_ID");
  assert.deepEqual(serviceState.calls, {});
});

test("admin can create ADMIN and EDITOR users without sensitive response data", async () => {
  const adminResult = await request(
    "/api/admin/users",
    {
      method: "POST",
      token: accessToken(),
      body: {
        email: "new-admin@example.com",
        password: "StrongAdminPassword1!",
        role: "ADMIN",
      },
    }
  );
  const editorResult = await request(
    "/api/admin/users",
    {
      method: "POST",
      token: accessToken(),
      body: {
        email: "new-editor@example.com",
        password: "StrongEditorPassword1!",
        role: "EDITOR",
      },
    }
  );

  assert.equal(adminResult.status, 201);
  assert.equal(editorResult.status, 201);
  assert.equal(
    Object.hasOwn(adminResult.body.data.user, "password"),
    false
  );
  assert.equal(
    Object.hasOwn(adminResult.body.data.user, "password_hash"),
    false
  );
  assert.equal(
    serviceState.calls.create[0].email,
    "new-admin@example.com"
  );
  assert.equal(
    serviceState.calls.create[1].email,
    "new-editor@example.com"
  );
});

test("admin creation rejects duplicate, invalid, and unauthorized fields", async () => {
  const duplicate = new AppError(
    409,
    "USER_EMAIL_ALREADY_EXISTS",
    "This email is already in use"
  );
  serviceState.errors.create = duplicate;

  const duplicateResult = await request(
    "/api/admin/users",
    {
      method: "POST",
      token: accessToken(),
      body: {
        email: "duplicate@example.com",
        password: "StrongAdminPassword1!",
        role: "EDITOR",
      },
    }
  );
  serviceState.errors.create = null;

  const invalidEmail = await request(
    "/api/admin/users",
    {
      method: "POST",
      token: accessToken(),
      body: {
        email: "invalid",
        password: "StrongAdminPassword1!",
        role: "EDITOR",
      },
    }
  );
  const extraField = await request(
    "/api/admin/users",
    {
      method: "POST",
      token: accessToken(),
      body: {
        email: "new@example.com",
        password: "StrongAdminPassword1!",
        role: "EDITOR",
        isActive: false,
      },
    }
  );

  assert.equal(duplicateResult.status, 409);
  assert.equal(
    duplicateResult.body.error.code,
    "USER_EMAIL_ALREADY_EXISTS"
  );
  assert.equal(invalidEmail.status, 400);
  assert.equal(invalidEmail.body.error.code, "INVALID_USER_EMAIL");
  assert.equal(extraField.status, 400);
  assert.equal(
    extraField.body.error.code,
    "UNEXPECTED_USER_FIELDS"
  );
});

test("admin can change role and status through PATCH routes", async () => {
  const roleResult = await request(
    "/api/admin/users/2/role",
    {
      method: "PATCH",
      token: accessToken(),
      body: { role: "EDITOR" },
    }
  );
  const statusResult = await request(
    "/api/admin/users/2/status",
    {
      method: "PATCH",
      token: accessToken(),
      body: { isActive: false },
    }
  );

  assert.equal(roleResult.status, 200);
  assert.equal(statusResult.status, 200);
  assert.equal(serviceState.calls.role.userId, 2);
  assert.equal(serviceState.calls.role.role, "EDITOR");
  assert.equal(serviceState.calls.status.userId, 2);
  assert.equal(serviceState.calls.status.isActive, false);
  assert.equal(serviceState.calls.status.actorId, 1);
});

test("admin role and status validators reject invalid input", async () => {
  const roleResult = await request(
    "/api/admin/users/2/role",
    {
      method: "PATCH",
      token: accessToken(),
      body: { role: "OWNER" },
    }
  );
  const statusResult = await request(
    "/api/admin/users/2/status",
    {
      method: "PATCH",
      token: accessToken(),
      body: { isActive: "false" },
    }
  );

  assert.equal(roleResult.status, 400);
  assert.equal(roleResult.body.error.code, "INVALID_USER_ROLE");
  assert.equal(statusResult.status, 400);
  assert.equal(
    statusResult.body.error.code,
    "INVALID_USER_STATUS"
  );
});

test("admin can reset a password without returning password data", async () => {
  const result = await request(
    "/api/admin/users/2/password",
    {
      method: "PATCH",
      token: accessToken(),
      body: {
        password: "StrongReplacementPassword1!",
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data, null);
  assert.equal(
    Object.hasOwn(result.body, "password"),
    false
  );
  assert.equal(
    serviceState.calls.password.passwordType,
    "string"
  );
});

test("admin password route rejects weak passwords and unexpected fields", async () => {
  const weak = await request(
    "/api/admin/users/2/password",
    {
      method: "PATCH",
      token: accessToken(),
      body: { password: "weak" },
    }
  );
  const extra = await request(
    "/api/admin/users/2/password",
    {
      method: "PATCH",
      token: accessToken(),
      body: {
        password: "StrongReplacementPassword1!",
        role: "ADMIN",
      },
    }
  );

  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, "INVALID_USER_PASSWORD");
  assert.equal(extra.status, 400);
  assert.equal(
    extra.body.error.code,
    "UNEXPECTED_USER_FIELDS"
  );
});

test("admin can revoke another user's sessions and repeated calls remain successful", async () => {
  const first = await request(
    "/api/admin/users/2/sessions",
    {
      method: "DELETE",
      token: accessToken(),
    }
  );
  const second = await request(
    "/api/admin/users/2/sessions",
    {
      method: "DELETE",
      token: accessToken(),
    }
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.data, null);
  assert.equal(
    first.body.message,
    "User sessions revoked successfully"
  );
  assert.equal(serviceState.calls.sessions.userId, 2);
});

test("admin session route rejects a body user ID", async () => {
  const result = await request(
    "/api/admin/users/2/sessions",
    {
      method: "DELETE",
      token: accessToken(),
      body: { userId: 999 },
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "UNEXPECTED_USER_FIELDS"
  );
});
