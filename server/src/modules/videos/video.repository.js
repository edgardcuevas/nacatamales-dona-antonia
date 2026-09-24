const pool = require("../../database/pool");

const {
  VIDEO_SORT_FIELDS,
  VIDEO_SORT_ORDERS,
} = require("./video.constants");

function buildAdministrativeWhere({
  isActive,
  provider,
  title,
} = {}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (provider !== undefined) {
    conditions.push("provider = ?");
    parameters.push(provider);
  }

  if (title !== undefined) {
    conditions.push("title LIKE ?");
    parameters.push(`%${title}%`);
  }

  return {
    whereSql:
      conditions.length === 0
        ? ""
        : `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function getAdministrativeOrder({
  sortBy,
  sortOrder,
}) {
  if (
    !Object.hasOwn(VIDEO_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(VIDEO_SORT_ORDERS, sortOrder)
  ) {
    throw new Error("Invalid video sort configuration");
  }

  return `${VIDEO_SORT_FIELDS[sortBy]} ${VIDEO_SORT_ORDERS[sortOrder]}`;
}

function getVideoColumns() {
  return `
    id,
    title,
    description,
    url,
    provider,
    external_id,
    thumbnail_url,
    sort_order,
    is_active,
    created_at,
    updated_at
  `;
}

async function listPublicVideos() {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        title,
        description,
        url,
        provider,
        external_id,
        thumbnail_url,
        sort_order
      FROM videos
      WHERE is_active = 1
      ORDER BY
        sort_order ASC,
        created_at DESC,
        id DESC
    `
  );

  return rows;
}

async function findPublicVideoById(videoId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        title,
        description,
        url,
        provider,
        external_id,
        thumbnail_url,
        sort_order
      FROM videos
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
    `,
    [videoId]
  );

  return rows[0] ?? null;
}

async function listVideos(filters) {
  const { whereSql, parameters } =
    buildAdministrativeWhere(filters);
  const orderSql = getAdministrativeOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
        ${getVideoColumns()}
      FROM videos
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
      FROM videos
      ${whereSql}
    `,
    parameters
  );

  return {
    videos: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findVideoById(videoId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getVideoColumns()}
      FROM videos
      WHERE id = ?
      LIMIT 1
    `,
    [videoId]
  );

  return rows[0] ?? null;
}

async function createVideo({
  title,
  description,
  url,
  provider,
  externalId,
  thumbnailUrl,
  sortOrder,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO videos (
        title,
        description,
        url,
        provider,
        external_id,
        thumbnail_url,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      title,
      description,
      url,
      provider,
      externalId,
      thumbnailUrl,
      sortOrder,
    ]
  );

  return { id: result.insertId };
}

async function updateVideoById({
  videoId,
  updates,
}) {
  const columnMap = {
    title: "title",
    description: "description",
    url: "url",
    provider: "provider",
    externalId: "external_id",
    thumbnailUrl: "thumbnail_url",
    sortOrder: "sort_order",
  };
  const updateEntries = Object.entries(updates);

  if (updateEntries.length === 0) {
    throw new Error("Video updates cannot be empty");
  }

  if (
    updateEntries.some(
      ([field]) => !Object.hasOwn(columnMap, field)
    )
  ) {
    throw new Error("Invalid video update field");
  }

  const setClause = updateEntries
    .map(([field]) => `${columnMap[field]} = ?`)
    .join(", ");
  const parameters = updateEntries.map(
    ([, value]) => value
  );
  const [result] = await pool.execute(
    `
      UPDATE videos
      SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [...parameters, videoId]
  );

  return result.affectedRows === 1;
}

async function updateVideoStatusById({
  videoId,
  isActive,
}) {
  const [result] = await pool.execute(
    `
      UPDATE videos
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, videoId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  listPublicVideos,
  findPublicVideoById,
  listVideos,
  findVideoById,
  createVideo,
  updateVideoById,
  updateVideoStatusById,
};
