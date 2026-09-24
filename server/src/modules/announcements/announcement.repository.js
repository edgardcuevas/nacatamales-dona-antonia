const pool = require("../../database/pool");

const {
  ANNOUNCEMENT_SORT_FIELDS,
  ANNOUNCEMENT_SORT_ORDERS,
} = require("./announcement.constants");

function buildPublicAnnouncementWhere({ type } = {}) {
  const conditions = [
    "a.is_active = 1",
    "(a.starts_at IS NULL OR a.starts_at <= CURRENT_TIMESTAMP)",
    "(a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)",
  ];
  const parameters = [];

  if (type !== undefined) {
    conditions.push("a.type = ?");
    parameters.push(type);
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function buildAdministrativeWhere({
  isActive,
  type,
  title,
} = {}) {
  const conditions = [];
  const parameters = [];

  if (isActive !== undefined) {
    conditions.push("a.is_active = ?");
    parameters.push(isActive ? 1 : 0);
  }

  if (type !== undefined) {
    conditions.push("a.type = ?");
    parameters.push(type);
  }

  if (title !== undefined) {
    conditions.push("a.title LIKE ?");
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
    !Object.hasOwn(ANNOUNCEMENT_SORT_FIELDS, sortBy) ||
    !Object.hasOwn(ANNOUNCEMENT_SORT_ORDERS, sortOrder)
  ) {
    throw new Error(
      "Invalid announcement sort configuration"
    );
  }

  const column = ANNOUNCEMENT_SORT_FIELDS[sortBy];
  const qualifiedColumn = column.includes(".")
    ? column
    : `a.${column}`;

  return `${qualifiedColumn} ${ANNOUNCEMENT_SORT_ORDERS[sortOrder]}`;
}

function getAnnouncementColumns() {
  return `
    a.id,
    a.title,
    a.content,
    a.type,
    a.is_active,
    a.starts_at,
    a.ends_at,
    a.sort_order,
    a.image_media_id,
    a.created_at,
    a.updated_at,
    m.id AS image_id,
    m.secure_url AS image_url,
    m.alt_text AS image_alt_text,
    m.width AS image_width,
    m.height AS image_height
  `;
}

function getAnnouncementJoin() {
  return `
    FROM announcements a
    LEFT JOIN media m
      ON m.id = a.image_media_id
      AND m.is_active = 1
      AND m.resource_type = 'IMAGE'
  `;
}

async function listPublicAnnouncements({ type } = {}) {
  const { whereSql, parameters } =
    buildPublicAnnouncementWhere({ type });
  const [rows] = await pool.execute(
    `
      SELECT
        a.id,
        a.title,
        a.content,
        a.type,
        a.starts_at,
        a.ends_at,
        a.sort_order,
        m.id AS image_id,
        m.secure_url AS image_url,
        m.alt_text AS image_alt_text,
        m.width AS image_width,
        m.height AS image_height
      FROM announcements a
      LEFT JOIN media m
        ON m.id = a.image_media_id
        AND m.is_active = 1
        AND m.resource_type = 'IMAGE'
      ${whereSql}
      ORDER BY
        a.sort_order ASC,
        a.created_at DESC,
        a.id DESC
    `,
    parameters
  );

  return rows;
}

async function listAnnouncements(filters) {
  const { whereSql, parameters } =
    buildAdministrativeWhere(filters);
  const orderSql = getAdministrativeOrder(filters);
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.execute(
    `
      SELECT
        ${getAnnouncementColumns()}
      ${getAnnouncementJoin()}
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
      FROM announcements a
      ${whereSql}
    `,
    parameters
  );

  return {
    announcements: rows,
    totalItems: Number(countRows[0]?.total_items ?? 0),
  };
}

async function findAnnouncementById(announcementId) {
  const [rows] = await pool.execute(
    `
      SELECT
        ${getAnnouncementColumns()}
      ${getAnnouncementJoin()}
      WHERE a.id = ?
      LIMIT 1
    `,
    [announcementId]
  );

  return rows[0] ?? null;
}

async function createAnnouncement({
  title,
  content,
  type,
  startsAt,
  endsAt,
  sortOrder,
  imageMediaId,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO announcements (
        title,
        content,
        type,
        starts_at,
        ends_at,
        sort_order,
        image_media_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      title,
      content,
      type,
      startsAt,
      endsAt,
      sortOrder,
      imageMediaId,
    ]
  );

  return { id: result.insertId };
}

async function updateAnnouncementById({
  announcementId,
  updates,
}) {
  const columnMap = {
    title: "title",
    content: "content",
    type: "type",
    startsAt: "starts_at",
    endsAt: "ends_at",
    sortOrder: "sort_order",
    imageMediaId: "image_media_id",
  };
  const updateEntries = Object.entries(updates);

  if (updateEntries.length === 0) {
    throw new Error(
      "Announcement updates cannot be empty"
    );
  }

  if (
    updateEntries.some(
      ([field]) => !Object.hasOwn(columnMap, field)
    )
  ) {
    throw new Error("Invalid announcement update field");
  }

  const setClause = updateEntries
    .map(([field]) => `${columnMap[field]} = ?`)
    .join(", ");
  const parameters = updateEntries.map(
    ([, value]) => value
  );
  const [result] = await pool.execute(
    `
      UPDATE announcements
      SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [...parameters, announcementId]
  );

  return result.affectedRows === 1;
}

async function updateAnnouncementStatusById({
  announcementId,
  isActive,
}) {
  const [result] = await pool.execute(
    `
      UPDATE announcements
      SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [isActive ? 1 : 0, announcementId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  listPublicAnnouncements,
  listAnnouncements,
  findAnnouncementById,
  createAnnouncement,
  updateAnnouncementById,
  updateAnnouncementStatusById,
};
