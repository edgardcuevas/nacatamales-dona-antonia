// Repository level tests for the transactional DELETED mark. The pool
// is replaced by a recorder, so no MySQL server is involved.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  mock,
} = require("node:test");

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "video_remote_delete_repository_test",
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
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
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

const pool = require("../../src/database/pool");
const videoRepository = require(
  "../../src/modules/videos/video.repository"
);

const DELETED_AT = new Date(
  "2026-10-04T05:17:51.306Z"
);

// Columns the transition must never write.
const PRESERVED_COLUMNS = Object.freeze([
  "provider",
  "external_id",
  "url",
  "privacy_status",
  "thumbnail_source",
  "thumbnail_url",
  "created_at",
  "sort_order",
  "title",
  "description",
]);

function createConnection({
  affectedRows = 1,
  failOnExecute = false,
} = {}) {
  const calls = {
    begin: 0,
    commit: 0,
    rollback: 0,
    release: 0,
    statements: [],
  };

  return {
    calls,
    connection: {
      async beginTransaction() {
        calls.begin += 1;
      },
      async execute(sql, parameters) {
        calls.statements.push({
          sql: String(sql)
            .replace(/\s+/g, " ")
            .trim(),
          parameters: [...parameters],
        });

        if (failOnExecute) {
          throw new Error("MySQL write failed");
        }

        return [{ affectedRows }];
      },
      async commit() {
        calls.commit += 1;
      },
      async rollback() {
        calls.rollback += 1;
      },
      release() {
        calls.release += 1;
      },
    },
  };
}

function stubPool(connection) {
  mock.method(pool, "getConnection", async () => connection);
}

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await pool.end();
});

test("the mark writes only the authorized columns and sets updated_at by hand", async () => {
  const { calls, connection } = createConnection();
  stubPool(connection);

  const marked = await videoRepository
    .markVideoAsRemoteDeleted({
      videoId: 7,
      remoteDeletedAt: DELETED_AT,
    });

  assert.equal(marked, true);
  assert.equal(calls.statements.length, 1);

  const { sql, parameters } = calls.statements[0];

  assert.match(
    sql,
    /UPDATE videos SET upload_status = 'DELETED'/
  );
  assert.match(
    sql,
    /remote_deleted_at = \?/
  );
  assert.match(sql, /is_active = 0/);
  assert.match(
    sql,
    /updated_at = CURRENT_TIMESTAMP/
  );
  assert.match(sql, /WHERE id = \?$/);

  for (const column of PRESERVED_COLUMNS) {
    assert.equal(
      sql.includes(column),
      false,
      `${column} must not be written by the transition`
    );
  }

  assert.deepEqual(parameters, [DELETED_AT, 7]);
  assert.equal(calls.begin, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.rollback, 0);
  assert.equal(calls.release, 1);
});

test("a row that no longer matches rolls the transaction back", async () => {
  const { calls, connection } = createConnection({
    affectedRows: 0,
  });
  stubPool(connection);

  await assert.rejects(
    videoRepository.markVideoAsRemoteDeleted({
      videoId: 7,
      remoteDeletedAt: DELETED_AT,
    })
  );

  assert.equal(calls.begin, 1);
  assert.equal(calls.commit, 0);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.release, 1);
});

test("a write failure rolls back and never commits", async () => {
  const { calls, connection } = createConnection({
    failOnExecute: true,
  });
  stubPool(connection);

  await assert.rejects(
    videoRepository.markVideoAsRemoteDeleted({
      videoId: 7,
      remoteDeletedAt: DELETED_AT,
    }),
    /MySQL write failed/
  );

  assert.equal(calls.commit, 0);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.release, 1);
});

test("a rollback failure does not hide the original cause", async () => {
  const { calls, connection } = createConnection({
    failOnExecute: true,
  });

  connection.rollback = async () => {
    calls.rollback += 1;
    throw new Error("rollback also failed");
  };

  stubPool(connection);

  await assert.rejects(
    videoRepository.markVideoAsRemoteDeleted({
      videoId: 7,
      remoteDeletedAt: DELETED_AT,
    }),
    /MySQL write failed/
  );

  assert.equal(calls.release, 1);
});

test("the connection is always released, even on success", async () => {
  const { calls, connection } = createConnection();
  stubPool(connection);

  await videoRepository.markVideoAsRemoteDeleted({
    videoId: 7,
    remoteDeletedAt: DELETED_AT,
  });

  assert.equal(calls.release, 1);
});

test("a date instance is passed through so the batch keeps one logical timestamp", async () => {
  const { calls, connection } = createConnection();
  stubPool(connection);

  await videoRepository.markVideoAsRemoteDeleted({
    videoId: 7,
    remoteDeletedAt: DELETED_AT,
  });

  assert.ok(calls.statements[0].parameters[0] instanceof Date);
  assert.equal(
    calls.statements[0].parameters[0].getTime(),
    DELETED_AT.getTime()
  );
});