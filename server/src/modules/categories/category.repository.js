const pool = require("../../database/pool");

const {
  CATEGORY_SORT_FIELDS,
  CATEGORY_SORT_ORDERS,
} = require("./category.constants");

function buildCategoryListWhere({
  isActive,
  name,
}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (name !== undefined) {
    conditions.push("name LIKE ?");
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

  return `${CATEGORY_SORT_FIELDS[sortBy]} ${CATEGORY_SORT_ORDERS[sortOrder]}`;
}

async function listPublicCategories() {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        name,
        slug,
        description,
        sort_order
      FROM categories
      WHERE is_active = 1
      ORDER BY sort_order ASC, name ASC, id ASC
    `
  );

  return rows;
}

async function findPublicCategoryBySlug(slug) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        name,
        slug,
        description,
        sort_order
      FROM categories
      WHERE slug = ?
        AND is_active = 1
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
        id,
        name,
        slug,
        description,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM categories
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
      FROM categories
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
        id,
        name,
        slug,
        description,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM categories
      WHERE id = ?
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
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO categories (
        name,
        slug,
        description,
        sort_order
      )
      VALUES (?, ?, ?, ?)
    `,
    [name, slug, description, sortOrder]
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
