const pool = require("../../database/pool");

const {
  CATEGORY_SORT_FIELDS,
  CATEGORY_SORT_ORDERS,
} = require("./category.constants");

function buildCategoryListWhere({
  isActive,
  name,
} = {}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("c.is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (name !== undefined) {
    conditions.push("c.name LIKE ?");
    parameters.push(`%${name}%`);
  }

  return {
    whereSql:
      conditions.length === 0
        ? ""
        : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getCategoryListOrder({
  sortBy,
  sortOrder,
}) {
  if (
    !Object.hasOwn(CATEGORY_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(CATEGORY_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid category sort configuration");
  }

  const column = CATEGORY_SORT_FIELDS[sortBy];
  const qualifiedColumn = column.includes(".")
    ? column
    : `c.${column}`;

  return `${qualifiedColumn} ${CATEGORY_SORT_ORDERS[sortOrder]}`;
}

function getCategoryColumns() {
  return `
    c.id,
    c.name,
    c.slug,
    c.description,
    c.sort_order,
    c.is_active,
    c.image_media_id,
    c.created_at,
    c.updated_at,
    m.id AS image_id,
    m.secure_url AS image_url,
    m.alt_text AS image_alt_text,
    m.width AS image_width,
    m.height AS image_height
  `;
}

function getCategoryJoin() {
  return `
    FROM categories c
    LEFT JOIN media m
      ON m.id = c.image_media_id
      AND m.is_active = 1
      AND m.resource_type = 'IMAGE'
  `;
}

async function listPublicCategories() {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.sort_order,
        m.id AS image_id,
        m.secure_url AS image_url,
        m.alt_text AS image_alt_text,
        m.width AS image_width,
        m.height AS image_height
      ${getCategoryJoin()}
      WHERE c.is_active = 1
      ORDER BY c.sort_order ASC, c.name ASC, c.id ASC
    `
  );

  return rows;
}

async function findPublicCategoryBySlug(slug) {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.sort_order,
        m.id AS image_id,
        m.secure_url AS image_url,
        m.alt_text AS image_alt_text,
        m.width AS image_width,
        m.height AS image_height
      ${getCategoryJoin()}
      WHERE c.slug = ?
        AND c.is_active = 1
      LIMIT 1
    `,
    [slug]
  );

  return rows[0] ?? null;
}

async function listCategories(filters) {
  const { whereSql, parameters } =
    buildCategoryListWhere(filters);
  const orderSql = getCategoryListOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
        ${getCategoryColumns()}
      ${getCategoryJoin()}
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
      FROM categories c
      ${whereSql}
    `,
    parameters
  );

  return {
    categories: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findCategoryById(categoryId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getCategoryColumns()}
      ${getCategoryJoin()}
      WHERE c.id = ?
      LIMIT 1
    `,
    [categoryId]
  );

  return rows[0] ?? null;
}

async function createCategory({
  name,
  slug,
  description,
  sortOrder,
  imageMediaId,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO categories (
        name,
        slug,
        description,
        sort_order,
        image_media_id
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      name,
      slug,
      description,
      sortOrder,
      imageMediaId,
    ]
  );

  return { id: result.insertId };
}

async function updateCategoryById({
  categoryId,
  updates,
}) {
  const columnMap = {
    name: "name",
    slug: "slug",
    description: "description",
    sortOrder: "sort_order",
    imageMediaId: "image_media_id",
  };
  const updateEntries = Object.entries(updates);

  if (updateEntries.length === 0) {
    throw new Error("Category updates cannot be empty");
  }

  if (
    updateEntries.some(
      ([field]) => !Object.hasOwn(columnMap, field)
    )
  ) {
    throw new Error("Invalid category update field");
  }

  const setClause = updateEntries
    .map(([field]) => `${columnMap[field]} = ?`)
    .join(", ");
  const parameters = updateEntries.map(
    ([, value]) => value
  );
  const [result] = await pool.execute(
    `
      UPDATE categories
      SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [...parameters, categoryId]
  );

  return result.affectedRows === 1;
}

async function updateCategoryStatusById({
  categoryId,
  isActive,
}) {
  const [result] = await pool.execute(
    `
      UPDATE categories
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, categoryId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  listPublicCategories,
  findPublicCategoryBySlug,
  listCategories,
  findCategoryById,
  createCategory,
  updateCategoryById,
  updateCategoryStatusById,
};
