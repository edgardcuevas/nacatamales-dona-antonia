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
  DB_NAME: "announcement_admin_routes_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
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
const announcementService = require(
  "../../src/modules/announcements/announcement.service"
);
const {
  generateAccessToken,
} = require("../../src/modules/auth/token.service");

const state = {
  currentUser: {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  },
  announcement: {
    id: 7,
    title: "QA announcement",
    content: "Content",
    type: "INFO",
    isActive: false,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    imageMediaId: null,
    image: null,
    createdAt: null,
    updatedAt: null,
  },
  listResult: {
    announcements: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  },
  calls: {},
  errors: {},
};

mock.method(
  userService,
  "getAuthenticatedUser",
  async () => state.currentUser
);
mock.method(
  announcementService,
  "listAdministrativeAnnouncements",
  async (filters) => {
    state.calls.list = filters;
    if (state.errors.list) {
      throw state.errors.list;
    }
    return state.listResult;
  }
);
mock.method(
  announcementService,
  "getAnnouncementById",
  async (announcementId) => {
    state.calls.get = { announcementId };
    if (state.errors.get) {
      throw state.errors.get;
    }
    return state.announcement;
  }
);
mock.method(
  announcementService,
  "createAnnouncement",
  async (input) => {
    state.calls.create = input;
    if (state.errors.create) {
      throw state.errors.create;
    }
    return state.announcement;
  }
);
mock.method(
  announcementService,
  "updateAnnouncement",
  async (input) => {
    state.calls.update = input;
    if (state.errors.update) {
      throw state.errors.update;
    }
    return state.announcement;
  }
);
mock.method(
  announcementService,
  "changeAnnouncementStatus",
  async (input) => {
    state.calls.status = input;
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.announcement;
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
  state.calls = {};
  state.errors = {};
  state.currentUser = {
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    isActive: true,
  };
});

function token(role = "ADMIN") {
  return generateAccessToken({
    id: role === "ADMIN" ? 1 : 2,
    role,
  });
}

async function request(
  path,
  {
    method = "GET",
    body,
    accessToken,
  } = {}
) {
  const headers = {};
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
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

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("announcement admin routes require authentication", async () => {
  const result = await request(
    "/api/admin/announcements"
  );
  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("announcement admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/announcements",
    { accessToken: token("ADMIN") }
  );
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request(
    "/api/admin/announcements",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
});

test("announcement admin creation, editing, and status use the service contract", async () => {
  const created = await request(
    "/api/admin/announcements",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA announcement",
        content: "Content",
        type: "INFO",
        startsAt: null,
        endsAt: null,
        sortOrder: 0,
        imageMediaId: null,
      },
    }
  );
  const updated = await request(
    "/api/admin/announcements/7",
    {
      method: "PATCH",
      accessToken: token(),
      body: { title: "Updated" },
    }
  );
  const status = await request(
    "/api/admin/announcements/7/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: true },
    }
  );

  assert.equal(created.status, 201);
  assert.equal(updated.status, 200);
  assert.equal(status.status, 200);
  assert.equal(state.calls.create.imageMediaId, null);
  assert.equal(state.calls.update.announcementId, 7);
  assert.equal(state.calls.status.isActive, true);
});

test("announcement admin rejects unknown fields and invalid status", async () => {
  const unknown = await request(
    "/api/admin/announcements",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA",
        content: "Content",
        type: "INFO",
        isActive: true,
      },
    }
  );
  const invalidStatus = await request(
    "/api/admin/announcements/7/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: "true" },
    }
  );

  assert.equal(unknown.status, 400);
  assert.equal(
    unknown.body.error.code,
    "UNEXPECTED_ANNOUNCEMENT_FIELDS"
  );
  assert.equal(invalidStatus.status, 400);
  assert.equal(
    invalidStatus.body.error.code,
    "INVALID_ANNOUNCEMENT_STATUS"
  );
});

test("announcement admin returns neutral service errors", async () => {
  state.errors.create = new AppError(
    409,
    "MEDIA_INACTIVE",
    "The selected media is inactive"
  );
  const result = await request(
    "/api/admin/announcements",
    {
      method: "POST",
      accessToken: token(),
      body: {
        title: "QA",
        content: "Content",
        type: "INFO",
        imageMediaId: 3,
      },
    }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "MEDIA_INACTIVE");
});

test("announcement admin inactive user cannot access routes", async () => {
  state.currentUser = null;
  const result = await request(
    "/api/admin/announcements",
    { accessToken: token() }
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
