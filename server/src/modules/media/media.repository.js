const pool = require("../../database/pool");

const {
  MEDIA_SORT_FIELDS,
  MEDIA_SORT_ORDERS,
} = require("./media.constants");

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
}) {
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

async function listMedia(filters) {
  const { whereSql, parameters } =
    buildMediaListWhere(filters);
  const orderSql = getMediaListOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
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

async function findMediaById(mediaId) {
  const [rows] = await pool.execute(
    `
      SELECT
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
      FROM media
      WHERE id = ?
      LIMIT 1
    `,
    [mediaId]
  );

  return rows[0] ?? null;
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
}) {
  const [result] = await pool.execute(
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

module.exports = {
  listMedia,
  findMediaById,
  updateMediaAltTextById,
  updateMediaStatusById,
};
