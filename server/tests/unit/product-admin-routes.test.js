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
  DB_NAME: "product_admin_routes_test",
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
const productService = require(
  "../../src/modules/products/product.service"
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
  product: {
    id: 4,
    categoryId: 1,
    name: "Admin product",
    slug: "admin-product",
    description: null,
    price: "10.00",
    isAvailable: true,
    isActive: true,
    sortOrder: 0,
    category: {
      id: 1,
      name: "Admin category",
      slug: "admin-category",
    },
    createdAt: null,
    updatedAt: null,
  },
  listResult: {
    products: [],
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
  productService,
  "listAdministrativeProducts",
  async (filters) => {
    state.calls.list = filters;
    if (state.errors.list) {
      throw state.errors.list;
    }
    return state.listResult;
  }
);
mock.method(
  productService,
  "getProductById",
  async (productId) => {
    state.calls.get = { productId };
    if (state.errors.get) {
      throw state.errors.get;
    }
    return state.product;
  }
);
mock.method(
  productService,
  "createProduct",
  async (input) => {
    state.calls.create = input;
    if (state.errors.create) {
      throw state.errors.create;
    }
    return state.product;
  }
);
mock.method(
  productService,
  "updateProduct",
  async (input) => {
    state.calls.update = input;
    if (state.errors.update) {
      throw state.errors.update;
    }
    return state.product;
  }
);
mock.method(
  productService,
  "changeProductStatus",
  async (input) => {
    state.calls.status = input;
    if (state.errors.status) {
      throw state.errors.status;
    }
    return state.product;
  }
);
mock.method(
  productService,
  "changeProductAvailability",
  async (input) => {
    state.calls.availability = input;
    if (state.errors.availability) {
      throw state.errors.availability;
    }
    return state.product;
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

test("product admin routes require authentication", async () => {
  const result = await request("/api/admin/products");

  assert.equal(result.status, 401);
  assert.equal(
    result.body.error.code,
    "AUTHENTICATION_REQUIRED"
  );
});

test("product admin routes allow ADMIN and EDITOR", async () => {
  const adminResult = await request(
    "/api/admin/products",
    { accessToken: token("ADMIN") }
  );
  state.currentUser = {
    id: 2,
    email: "editor@example.com",
    role: "EDITOR",
    isActive: true,
  };
  const editorResult = await request(
    "/api/admin/products",
    { accessToken: token("EDITOR") }
  );

  assert.equal(adminResult.status, 200);
  assert.equal(editorResult.status, 200);
});

test("product admin list supports filters and safe response", async () => {
  state.listResult = {
    products: [state.product],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const result = await request(
    "/api/admin/products?page=1&limit=20&isAvailable=false&sortBy=price&sortOrder=desc",
    { accessToken: token() }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.data.products[0].price, "10.00");
  assert.equal(
    Object.hasOwn(
      result.body.data.products[0],
      "password_hash"
    ),
    false
  );
  assert.equal(
    state.calls.list.isAvailable,
    false
  );
});

test("product admin creation validates category, price, and fields", async () => {
  const created = await request(
    "/api/admin/products",
    {
      method: "POST",
      accessToken: token(),
      body: {
        categoryId: 1,
        name: "New product",
        slug: "new-product",
        price: "15.5",
        isAvailable: true,
      },
    }
  );
  const invalidPrice = await request(
    "/api/admin/products",
    {
      method: "POST",
      accessToken: token(),
      body: {
        categoryId: 1,
        name: "Bad product",
        slug: "bad-product",
        price: "1.234",
        isAvailable: true,
      },
    }
  );
  const extra = await request(
    "/api/admin/products",
    {
      method: "POST",
      accessToken: token(),
      body: {
        categoryId: 1,
        name: "Extra product",
        slug: "extra-product",
        isAvailable: true,
        image: "not-allowed.jpg",
      },
    }
  );

  assert.equal(created.status, 201);
  assert.equal(invalidPrice.status, 400);
  assert.equal(
    invalidPrice.body.error.code,
    "INVALID_PRODUCT_PRICE"
  );
  assert.equal(extra.status, 400);
  assert.equal(
    extra.body.error.code,
    "UNEXPECTED_PRODUCT_FIELDS"
  );
});

test("product admin can edit, change category, status, and availability", async () => {
  const updated = await request(
    "/api/admin/products/4",
    {
      method: "PATCH",
      accessToken: token(),
      body: {
        categoryId: 2,
        name: "Updated product",
      },
    }
  );
  const status = await request(
    "/api/admin/products/4/status",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isActive: false },
    }
  );
  const availability = await request(
    "/api/admin/products/4/availability",
    {
      method: "PATCH",
      accessToken: token(),
      body: { isAvailable: false },
    }
  );

  assert.equal(updated.status, 200);
  assert.equal(status.status, 200);
  assert.equal(availability.status, 200);
  assert.equal(state.calls.update.productId, 4);
  assert.equal(state.calls.update.updates.categoryId, 2);
  assert.equal(state.calls.status.isActive, false);
  assert.equal(
    state.calls.availability.isAvailable,
    false
  );
});

test("product admin detail rejects invalid IDs and inactive users", async () => {
  const invalid = await request(
    "/api/admin/products/not-an-id",
    { accessToken: token() }
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_PRODUCT_ID");

  state.currentUser = null;
  const inactive = await request(
    "/api/admin/products/4",
    { accessToken: token() }
  );
  assert.equal(inactive.status, 401);
  assert.equal(
    inactive.body.error.code,
    "AUTHENTICATED_USER_UNAVAILABLE"
  );
});
