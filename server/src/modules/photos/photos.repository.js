const pool = require("../../database/pool");

const {
  PHOTO_SORT_FIELDS,
  PHOTO_SORT_ORDERS,
} = require("./photos.constants");

function buildAdministrativeWhere({ isActive, caption } = {}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("p.is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (caption !== undefined) {
    conditions.push("p.caption LIKE ?");
    parameters.push(`%${caption}%`);
  }

  return {
    whereSql:
      conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getAdministrativeOrder({ sortBy, sortOrder }) {
  if (
    !Object.hasOwn(PHOTO_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(PHOTO_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid photo sort configuration");
  }

  return `${PHOTO_SORT_FIELDS[sortBy]} ${PHOTO_SORT_ORDERS[sortOrder]}`;
}

function getPhotoColumns() {
  return `
    p.id,
    p.caption,
    p.image_media_id,
    p.is_active,
    p.sort_order,
    p.created_at,
    p.updated_at,
    m.id AS image_id,
    m.secure_url AS image_url,
    m.alt_text AS image_alt_text,
    m.width AS image_width,
    m.height AS image_height
  `;
}

function getPhotoJoin() {
  return `
    FROM photos p
    INNER JOIN media m
      ON m.id = p.image_media_id
  `;
}

async function listPublicPhotos() {
  const [rows] = await pool.execute(
    `
      SELECT
        p.id,
        p.caption,
        p.created_at,
        m.id AS image_id,
        m.secure_url AS image_url,
        m.alt_text AS image_alt_text,
        m.width AS image_width,
        m.height AS image_height
      FROM photos p
      INNER JOIN media m
        ON m.id = p.image_media_id
        AND m.is_active = 1
        AND m.resource_type = 'IMAGE'
      WHERE p.is_active = 1
      ORDER BY p.created_at DESC, p.id DESC
    `
  );

  return rows;
}

async function findPublicPhotoById(photoId) {
  const [rows] = await pool.execute(
    `
      SELECT
        p.id,
        p.caption,
        p.created_at,
        m.id AS image_id,
        m.secure_url AS image_url,
        m.alt_text AS image_alt_text,
        m.width AS image_width,
        m.height AS image_height
      FROM photos p
      INNER JOIN media m
        ON m.id = p.image_media_id
        AND m.is_active = 1
        AND m.resource_type = 'IMAGE'
      WHERE p.id = ?
        AND p.is_active = 1
      LIMIT 1
    `,
    [photoId]
  );

  return rows[0] ?? null;
}

async function listPhotos(filters) {
  const { whereSql, parameters } = buildAdministrativeWhere(filters);
  const orderSql = getAdministrativeOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
        ${getPhotoColumns()}
      ${getPhotoJoin()}
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
    `,
    [...parameters, filters.limit, offset]
  );
  const [countRows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_items
      FROM photos p
      ${whereSql}
    `,
    parameters
  );

  return {
    photos: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findPhotoById(photoId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getPhotoColumns()}
      ${getPhotoJoin()}
      WHERE p.id = ?
      LIMIT 1
    `,
    [photoId]
  );

  return rows[0] ?? null;
}

async function createPhoto({ caption, imageMediaId, sortOrder }) {
  const [result] = await pool.execute(
    `
      INSERT INTO photos (
        caption,
        image_media_id,
        sort_order
      )
      VALUES (?, ?, ?)
    `,
    [caption, imageMediaId, sortOrder]
  );

  return { id: result.insertId };
}

async function updatePhotoById({ photoId, updates }) {
  const columnMap = {
    caption: "caption",
    imageMediaId: "image_media_id",
    sortOrder: "sort_order",
    isActive: "is_active",
  };
  const updateEntries = Object.entries(updates);

  if (updateEntries.length === 0) {
    throw new Error("Photo updates cannot be empty");
  }

  if (updateEntries.some(([field]) => !Object.hasOwn(columnMap, field))) {
    throw new Error("Invalid photo update field");
  }

  const setClause = updateEntries
    .map(([field]) => `${columnMap[field]} = ?`)
    .join(", ");
  const parameters = updateEntries.map(([, value]) => value);
  const [result] = await pool.execute(
    `
      UPDATE photos
      SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [...parameters, photoId]
  );

  return result.affectedRows === 1;
}

async function deletePhotoById(photoId) {
  const [result] = await pool.execute(
    `
      DELETE FROM photos
      WHERE id = ?
    `,
    [photoId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  listPublicPhotos,
  findPublicPhotoById,
  listPhotos,
  findPhotoById,
  createPhoto,
  updatePhotoById,
  deletePhotoById,
};