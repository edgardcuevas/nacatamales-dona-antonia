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
  DB_NAME: "category_admin_routes_test",
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
const categoryService = require(
  "../../src/modules/categories/category.service"
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
  category: {
    id: 3,
    name: "Admin category",
    slug: "admin-category",
    description: null,
    sortOrder: 0,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
  listResult: {
    categories: [],
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
  categoryService,
  "listAdministrativeCategories",
  async (filters) => {
    state.calls.list = filters;
    if (state.errors.list) {
      throw state.errors.list;
    }
    return state.listResult;
  }
);
mock.method(
  categoryService,
  "getCategoryById",
  async (categoryId) => {
    state.calls.get = { categoryId };
    if (state.errors.get) {
      throw state.errors.get;
    }
    return state.category;
  }
);
mock.method(
  categoryService,
  "createCategory",
  async (input) => {
    state.calls.create = input;
    if (state.errors.create) {
      throw state.errors.create;
    }
    return state.category;
  }
);
mock.method(
  categoryService,
  "updateCategory",
  async (input) => {
    state.calls.update = input;
    if (state.errors.update) {
      throw state.errors.update;
    }
    return state.category;
  }
);
mock.method(
  categoryService,
  "changeCategoryStatus",
  async (input) => {
    state.calls.status = input;
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.category;
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

test("category admin routes require authentication", async () => {
  const result = await request("/api/admin/categories");

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("category admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/categories",
    { accessToken: token("ADMIN") }
  );
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request(
    "/api/admin/categories",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
});

test("category admin list supports pagination and safe response", async () => {
  state.listResult = {
    categories: [state.category],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const result = await request(
    "/api/admin/categories?page=1&limit=20&sortBy=name&sortOrder=asc",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.categories.length, 1);
  assert.equal(
    Object.hasOwn(
      result.body.data.categories[0],
      "password_hash"
    ),
    false
  );
  assert.deepEqual(state.calls.list, {
    page: 1,
    limit: 20,
    isActive: undefined,
    name: undefined,
    sortBy: "name",
    sortOrder: "asc",
  });
});

test("category admin creation rejects duplicates and unknown fields", async () => {
  state.errors.create = new AppError(
    409,
    "CATEGORY_NAME_ALREADY_EXISTS",
    "A category with this name already exists"
  );
  const duplicate = await request(
    "/api/admin/categories",
    {
      method: "POST",
      accessToken: token(),
      body: {
        name: "Existing",
        slug: "existing",
      },
    }
  );
  state.errors.create = null;

  const unknown = await request(
    "/api/admin/categories",
    {
      method: "POST",
      accessToken: token(),
      body: {
        name: "New",
        slug: "new",
        isActive: true,
      },
    }
  );

  assert.equal(duplicate.status, 409);
  assert.equal(
    duplicate.body.error.code,
    "CATEGORY_NAME_ALREADY_EXISTS"
  );
  assert.equal(unknown.status, 400);
  assert.equal(
    unknown.body.error.code,
    "UNEXPECTED_CATEGORY_FIELDS"
  );
});

test("category admin can create, edit, and change status", async () => {
  const created = await request(
    "/api/admin/categories",
    {
      method: "POST",
      accessToken: token(),
      body: {
        name: "New category",
        slug: "new-category",
        description: "Description",
        sortOrder: 4,
      },
    }
  );
  const updated = await request(
    "/api/admin/categories/3",
    {
      method: "PATCH",
      accessToken: token(),
      body: { name: "Updated category" },
    }
  );
  const status = await request(
    "/api/admin/categories/3/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: false },
    }
  );

  assert.equal(created.status, 201);
  assert.equal(updated.status, 200);
  assert.equal(status.status, 200);
  assert.equal(state.calls.create.slug, "new-category");
  assert.equal(state.calls.update.categoryId, 3);
  assert.equal(state.calls.status.isActive, false);
});

test("category admin edit requires at least one field", async () => {
  const result = await request(
    "/api/admin/categories/3",
    {
      method: "PATCH",
      accessToken: token(),
      body: {},
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error.code,
    "INVALID_CATEGORY_INPUT"
  );
});

test("category admin inactive user cannot manage content", async () => {
  state.currentUser = null;
  const result = await request(
    "/api/admin/categories",
    { accessToken: token() }
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
