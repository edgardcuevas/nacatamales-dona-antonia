const pool = require("../../database/pool");

const {
  PRODUCT_SORT_FIELDS,
  PRODUCT_SORT_ORDERS,
} = require("./product.constants");

function buildPublicProductWhere({
  categorySlug,
  available,
} = {}) {
  const conditions = [
    "p.is_active = 1",
    "c.is_active = 1",
  ];
  const parameters = [];

  if (categorySlug !== undefined) {
    conditions.push("c.slug = ?");
    parameters.push(categorySlug);
  }

  if (available !== undefined) {
    conditions.push("p.is_available = ?");
    parameters.push(available ? 1 : 0);
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function buildAdminProductWhere({
  name,
  categoryId,
  isActive,
  isAvailable,
} = {}) {
  const conditions = [];
  const parameters = [];

  if (name !== undefined) {
    conditions.push("p.name LIKE ?");
    parameters.push(`%${name}%`);
  }

  if (categoryId !== undefined) {
    conditions.push("p.category_id = ?");
    parameters.push(categoryId);
  }

  if (isActive !== undefined) {
    conditions.push("p.is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (isAvailable !== undefined) {
    conditions.push("p.is_available = ?");
    parameters.push(isAvailable ? 1 : 0);
  }

  return {
    whereSql:
      conditions.length === 0
        ? ""
        : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getProductAdminColumns() {
  return `
    p.id,
    p.category_id,
    p.name,
    p.slug,
    p.description,
    p.price,
    p.is_available,
    p.is_active,
    p.sort_order,
    p.image_media_id,
    p.created_at,
    p.updated_at,
    c.name AS category_name,
    c.slug AS category_slug,
    m.id AS image_id,
    m.secure_url AS image_url,
    m.alt_text AS image_alt_text,
    m.width AS image_width,
    m.height AS image_height
  `;
}

function getProductPublicColumns() {
  return `
    p.id,
    p.name,
    p.slug,
    p.description,
    p.price,
    p.is_available,
    p.sort_order,
    c.id AS category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    m.id AS image_id,
    m.secure_url AS image_url,
    m.alt_text AS image_alt_text,
    m.width AS image_width,
    m.height AS image_height
  `;
}

function getProductImageJoin() {
  return `
    LEFT JOIN media m
      ON m.id = p.image_media_id
      AND m.is_active = 1
      AND m.resource_type = 'IMAGE'
  `;
}

function getProductListOrder({
  sortBy,
  sortOrder,
}) {
  if (
    !Object.hasOwn(PRODUCT_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(PRODUCT_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid product sort configuration");
  }

  const column = PRODUCT_SORT_FIELDS[sortBy];
  const qualifiedColumn = column.includes(".")
    ? column
    : `p.${column}`;

  return `${qualifiedColumn} ${PRODUCT_SORT_ORDERS[sortOrder]}`;
}

async function listPublicProducts({
  page = 1,
  limit = 20,
  categorySlug,
  available,
} = {}) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    throw new Error("Invalid product pagination");
  }

  const { whereSql, parameters } =
    buildPublicProductWhere({
      categorySlug,
      available,
    });
  const offset = (page - 1) * limit;
  const [rows] = await pool.execute(
    `
      SELECT
        ${getProductPublicColumns()}
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${getProductImageJoin()}
      ${whereSql}
      ORDER BY p.sort_order ASC, p.name ASC, p.id ASC
      LIMIT ? OFFSET ?
    `,
    [
      ...parameters,
      limit,
      offset,
    ]
  );
  const [countRows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_items
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${whereSql}
    `,
    parameters
  );

  return {
    products: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findPublicProductBySlug(slug) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getProductPublicColumns()}
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${getProductImageJoin()}
      WHERE p.slug = ?
        AND p.is_active = 1
        AND c.is_active = 1
      LIMIT 1
    `,
    [slug]
  );

  return rows[0] ?? null;
}

async function listProducts(filters) {
  const { whereSql, parameters } =
    buildAdminProductWhere(filters);
  const orderSql = getProductListOrder(filters);
  const offset = (filters.page - 1) * filters.limit;
  const [rows] = await pool.execute(
    `
      SELECT
        ${getProductAdminColumns()}
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${getProductImageJoin()}
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
    `,
    [
      ...parameters,
      filters.limit,
      offset,
    ]
  );
  const [countRows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_items
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${whereSql}
    `,
    parameters
  );

  return {
    products: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findProductById(productId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getProductAdminColumns()}
      FROM products p
      INNER JOIN categories c
        ON c.id = p.category_id
      ${getProductImageJoin()}
      WHERE p.id = ?
      LIMIT 1
    `,
    [productId]
  );

  return rows[0] ?? null;
}

async function createProduct({
  categoryId,
  name,
  slug,
  description,
  price,
  isAvailable,
  sortOrder,
  imageMediaId,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO products (
        category_id,
        name,
        slug,
        description,
        price,
        is_available,
        sort_order,
        image_media_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      categoryId,
      name,
      slug,
      description,
      price,
      isAvailable ? 1 : 0,
      sortOrder,
      imageMediaId,
    ]
  );

  return { id: result.insertId };
}

async function updateProductById({
  productId,
  updates,
}) {
  const columnMap = {
    categoryId: "category_id",
    name: "name",
    slug: "slug",
    description: "description",
    price: "price",
    sortOrder: "sort_order",
    imageMediaId: "image_media_id",
  };
  const updateEntries = Object.entries(updates);

  if (updateEntries.length === 0) {
    throw new Error("Product updates cannot be empty");
  }

  if (
    updateEntries.some(
      ([field]) => !Object.hasOwn(columnMap, field)
    )
  ) {
    throw new Error("Invalid product update field");
  }

  const setClause = updateEntries
    .map(([field]) => `${columnMap[field]} = ?`)
    .join(", ");
  const parameters = updateEntries.map(
    ([, value]) => value
  );
  const [result] = await pool.execute(
    `
      UPDATE products
      SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [...parameters, productId]
  );

  return result.affectedRows === 1;
}

async function updateProductStatusById({
  productId,
  isActive,
}) {
  const [result] = await pool.execute(
    `
      UPDATE products
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, productId]
  );

  return result.affectedRows === 1;
}

async function updateProductAvailabilityById({
  productId,
  isAvailable,
}) {
  const [result] = await pool.execute(
    `
      UPDATE products
      SET
        is_available = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isAvailable ? 1 : 0, productId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  listPublicProducts,
  findPublicProductBySlug,
  listProducts,
  findProductById,
  createProduct,
  updateProductById,
  updateProductStatusById,
  updateProductAvailabilityById,
};
