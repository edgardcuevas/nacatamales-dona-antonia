const pool = require("../../database/pool");

const {
  MEDIA_PROVIDER,
  MEDIA_RESOURCE_TYPE,
  MEDIA_SORT_FIELDS,
  MEDIA_SORT_ORDERS,
} = require("./media.constants");

function getExecutor(connection) {
  return connection ?? pool;
}

function getMediaListOrder({
  sortBy,
  sortOrder,
}) {
  if (
    !Object.hasOwn(MEDIA_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(MEDIA_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid media sort configuration");
  }

  return `${MEDIA_SORT_FIELDS[sortBy]} ${MEDIA_SORT_ORDERS[sortOrder]}`;
}

function buildMediaListWhere({
  isActive,
  resourceType,
  publicId,
} = {}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (resourceType !== undefined) {
    conditions.push("resource_type = ?");
    parameters.push(resourceType);
  }

  if (publicId !== undefined) {
    conditions.push("public_id LIKE ?");
    parameters.push(`%${publicId}%`);
  }

  return {
    whereSql:
      conditions.length === 0
        ? ""
        : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getMediaColumns() {
  return `
    id,
    provider,
    public_id,
    secure_url,
    resource_type,
    format,
    bytes,
    width,
    height,
    alt_text,
    is_active,
    created_at,
    updated_at
  `;
}

async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listMedia(filters) {
  const { whereSql, parameters } =
    buildMediaListWhere(filters);
  const orderSql = getMediaListOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
        ${getMediaColumns()}
      FROM media
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
      FROM media
      ${whereSql}
    `,
    parameters
  );

  return {
    media: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findMediaById(
  mediaId,
  connection = null,
  forUpdate = false
) {
  const executor = getExecutor(connection);
  const lockSql = forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute(
    `
      SELECT
        ${getMediaColumns()}
      FROM media
      WHERE id = ?
      LIMIT 1${lockSql}
    `,
    [mediaId]
  );

  return rows[0] ?? null;
}

async function findMediaByPublicId(publicId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getMediaColumns()}
      FROM media
      WHERE provider = ?
        AND public_id = ?
      LIMIT 1
    `,
    [MEDIA_PROVIDER, publicId]
  );

  return rows[0] ?? null;
}

async function countMediaReferences(
  mediaId,
  connection = null
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.execute(
    `
      SELECT
        (SELECT COUNT(*)
           FROM categories
          WHERE image_media_id = ?) AS category_count,
        (SELECT COUNT(*)
           FROM products
          WHERE image_media_id = ?) AS product_count,
        (SELECT COUNT(*)
           FROM announcements
          WHERE image_media_id = ?) AS announcement_count
    `,
    [mediaId, mediaId, mediaId]
  );

  const row = rows[0] ?? {};
  return (
    Number(row.category_count ?? 0) +
    Number(row.product_count ?? 0) +
    Number(row.announcement_count ?? 0)
  );
}

async function createMedia({
  publicId,
  secureUrl,
  format,
  bytes,
  width,
  height,
  altText,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO media (
        provider,
        public_id,
        secure_url,
        resource_type,
        format,
        bytes,
        width,
        height,
        alt_text,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      MEDIA_PROVIDER,
      publicId,
      secureUrl,
      MEDIA_RESOURCE_TYPE,
      format,
      bytes,
      width,
      height,
      altText,
    ]
  );

  return { id: result.insertId };
}

async function updateMediaAltTextById({
  mediaId,
  altText,
}) {
  const [result] = await pool.execute(
    `
      UPDATE media
      SET
        alt_text = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [altText, mediaId]
  );

  return result.affectedRows === 1;
}

async function updateMediaStatusById({
  mediaId,
  isActive,
  connection = null,
}) {
  const executor = getExecutor(connection);
  const [result] = await executor.execute(
    `
      UPDATE media
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, mediaId]
  );

  return result.affectedRows === 1;
}

async function deleteMediaById(
  mediaId,
  connection = null
) {
  const executor = getExecutor(connection);
  const [result] = await executor.execute(
    `
      DELETE FROM media
      WHERE id = ?
    `,
    [mediaId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  withTransaction,
  listMedia,
  findMediaById,
  findMediaByPublicId,
  countMediaReferences,
  createMedia,
  updateMediaAltTextById,
  updateMediaStatusById,
  deleteMediaById,
};
