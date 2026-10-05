// Integration test for the thumbnail reconciliation. Only the isolated
// test database is touched, every row is synthetic, the provider is
// replaced, and nothing is left behind.
//
// Run it with:
//   npm run test:integration:thumbnail-reconcile

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { mock } = require("node:test");

const SERVER_ROOT = path.join(__dirname, "..", "..");
const TEST_DATABASE_SUFFIX = "_test";

function readDatabaseNameFromEnvFile(fileName) {
  const absolutePath = path.join(
    SERVER_ROOT,
    fileName
  );

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const match = fs
    .readFileSync(absolutePath, "utf8")
    .match(/^\s*DB_NAME\s*=\s*(.*?)\s*$/m);

  return match
    ? match[1].replace(/^["']|["']$/g, "").trim()
    : null;
}

function assertIsolatedTestDatabase() {
  const databaseName =
    readDatabaseNameFromEnvFile(".env.test");
  const developmentDatabaseName =
    readDatabaseNameFromEnvFile(".env");

  assert.ok(
    databaseName
      ?.toLowerCase()
      .endsWith(TEST_DATABASE_SUFFIX),
    "this integration test refuses to run without the _test suffix"
  );
  assert.notEqual(
    databaseName.toLowerCase(),
    String(developmentDatabaseName).toLowerCase(),
    "this integration test refuses to run against development"
  );

  return databaseName;
}

assertIsolatedTestDatabase();

const mysql = require("mysql2/promise");
const {
  youtubeClient,
  YouTubeApiError,
} = require("../../src/config/youtube");
const videoRepository = require(
  "../../src/modules/videos/video.repository"
);
const videoService = require(
  "../../src/modules/videos/video.service"
);
const youtubeConnectionRepository = require(
  "../../src/modules/youtube/youtube-connection.repository"
);
const youtubeService = require(
  "../../src/modules/youtube/youtube.service"
);
const {
  encryptRefreshToken,
} = require("../../src/modules/youtube/youtube-token-crypto");

const pool = require("../../src/database/pool");

const FIXTURE_PREFIX = "itest-reconcile-";
const CHANNEL = "UC1234567890123456789012";
const OTHER_CHANNEL = "UC9999999999999999999999";
const HOST = "https://i.ytimg.com";
const runToken = `${Date.now()}${Math.floor(
  Math.random() * 100000
)}`;

const ENCRYPTED_REFRESH_TOKEN =
  encryptRefreshToken("integration-refresh-token");

function identityOf(row) {
  return JSON.stringify([
    row.id,
    row.provider,
    row.external_id,
    row.url,
    row.upload_status,
    row.privacy_status,
    Number(row.is_active),
    row.remote_deleted_at === null
      ? "NULL"
      : "SET",
    row.created_at.toISOString(),
    Number(row.sort_order),
  ]);
}

async function insertFixture(suffix) {
  const externalId = `${FIXTURE_PREFIX}${runToken}-${suffix}`;

  const [result] = await pool.execute(
    `
      INSERT INTO videos (
        title, description, url, provider, external_id,
        thumbnail_url, thumbnail_source, sort_order,
        is_active, upload_status, privacy_status
      )
      VALUES (?, NULL, ?, 'YOUTUBE', ?, ?, 'YOUTUBE_DEFAULT', 3, 1, 'READY', 'PUBLIC')
    `,
    [
      `integration reconcile ${suffix}`,
      `https://www.youtube.com/watch?v=synthetic${suffix}xx`,
      externalId,
      `${HOST}/vi/synthetic${suffix}xx/hqdefault.jpg`,
    ]
  );

  return result.insertId;
}

async function removeFixtures() {
  await pool.execute(
    "DELETE FROM videos WHERE external_id LIKE ?",
    [`${FIXTURE_PREFIX}${runToken}-%`]
  );
}

async function countResidues() {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM videos WHERE external_id LIKE ?",
    [`${FIXTURE_PREFIX}%`]
  );

  return Number(rows[0].total);
}

function readRow(id) {
  return pool
    .execute(
      `
        SELECT id, provider, external_id, url,
               thumbnail_url, thumbnail_source, sort_order,
               is_active, upload_status, privacy_status,
               remote_deleted_at, created_at, updated_at
        FROM videos WHERE id = ?
      `,
      [id]
    )
    .then(([rows]) => rows[0] ?? null);
}

function stubProvider({
  channelId = CHANNEL,
  thumbnailUrl = `${HOST}/vi/x/maxresdefault.jpg`,
  thumbnailVariant = "maxres",
  throws = null,
} = {}) {
  const calls = { reads: 0, writes: 0 };

  mock.method(
    youtubeConnectionRepository,
    "getConnection",
    async () => ({
      id: 1,
      channel_id: CHANNEL,
      encrypted_refresh_token: ENCRYPTED_REFRESH_TOKEN,
      token_expires_at: null,
    })
  );

  mock.method(
    youtubeConnectionRepository,
    "updateTokenExpiry",
    async () => true
  );

  mock.method(
    youtubeClient,
    "refreshAccessToken",
    async () => ({
      accessToken: "integration-access-token",
      expiresIn: 3600,
    })
  );

  mock.method(
    youtubeClient,
    "getVideoThumbnailState",
    async () => {
      calls.reads += 1;
      if (throws) {
        throw throws;
      }
      return {
        videoId: "synthetic",
        channelId,
        thumbnailUrl,
        thumbnailVariant,
      };
    }
  );

  for (const write of [
    "setVideoThumbnail",
    "deleteVideo",
    "uploadVideo",
  ]) {
    mock.method(youtubeClient, write, async () => {
      calls.writes += 1;
      throw new Error(
        `${write} must never be called`
      );
    });
  }

  return calls;
}

test(
  "the reconciliation updates only the thumbnail fields and leaves no residue",
  { timeout: 120_000 },
  async (t) => {
    const before = await countResidues();

    t.after(async () => {
      mock.restoreAll();
      await removeFixtures();
      youtubeService.clearAccessTokenCache();
      await pool.end();

      const check = mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectionLimit: 1,
      });
      const [rows] = await check.execute(
        "SELECT COUNT(*) AS total FROM videos WHERE external_id LIKE ?",
        [`${FIXTURE_PREFIX}%`]
      );
      await check.end();

      assert.equal(
        Number(rows[0].total),
        before,
        "every synthetic row must be removed"
      );
    });

    // Complete reconciliation against a matching remote.
    const first = await insertFixture("complete");
    const original = await readRow(first);
    const originalIdentity = identityOf(original);

    let calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    const result =
      await youtubeService.reconcileRemoteThumbnail({
        videoId: first,
      });

    assert.equal(calls.reads, 1);
    assert.equal(calls.writes, 0);
    assert.equal(result.reconciled, true);
    assert.equal(
      result.remoteThumbnailVariant,
      "maxres"
    );

    const reconciled = await readRow(first);
    assert.equal(
      reconciled.thumbnail_source,
      "CUSTOM"
    );
    assert.equal(
      reconciled.thumbnail_url,
      `${HOST}/vi/x/maxresdefault.jpg`
    );
    assert.equal(
      identityOf(reconciled),
      originalIdentity,
      "identity must be untouched"
    );
    assert.ok(
      reconciled.updated_at.getTime() >=
        original.updated_at.getTime()
    );

    // A second run finds the marker already CUSTOM and reports the
    // state change instead of overwriting.
    mock.restoreAll();
    calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: first,
      }),
      (error) => {
        assert.equal(
          error.code,
          "RECONCILIATION_STATE_CHANGED"
        );
        return true;
      }
    );

    const afterSecond = await readRow(first);
    assert.equal(
      identityOf(afterSecond),
      originalIdentity
    );
    assert.equal(
      afterSecond.thumbnail_source,
      "CUSTOM"
    );

    // A remote video owned by another channel writes nothing.
    const second = await insertFixture("otherchannel");
    const secondOriginal = await readRow(second);

    mock.restoreAll();
    calls = stubProvider({ channelId: OTHER_CHANNEL });
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: second,
      }),
      (error) => {
        assert.equal(
          error.code,
          "YOUTUBE_CHANNEL_MISMATCH"
        );
        return true;
      }
    );

    const untouched = await readRow(second);
    assert.equal(identityOf(untouched), identityOf(secondOriginal));
    assert.equal(
      untouched.thumbnail_source,
      "YOUTUBE_DEFAULT"
    );
    assert.equal(
      untouched.updated_at.getTime(),
      secondOriginal.updated_at.getTime()
    );

    // A remote video that no longer exists writes nothing.
    const third = await insertFixture("remotemissing");
    const thirdOriginal = await readRow(third);

    mock.restoreAll();
    calls = stubProvider({
      throws: new YouTubeApiError(
        "thumbnail-state",
        404
      ),
    });
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: third,
      }),
      (error) => {
        assert.equal(
          error.code,
          "VIDEO_REMOTE_NOT_FOUND"
        );
        return true;
      }
    );

    assert.equal(
      identityOf(await readRow(third)),
      identityOf(thirdOriginal)
    );

    // A remote failure leaves the row exactly as it was.
    const fourth = await insertFixture("providerfailure");
    const fourthOriginal = await readRow(fourth);

    mock.restoreAll();
    calls = stubProvider({
      throws: new YouTubeApiError(
        "thumbnail-state",
        503
      ),
    });
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: fourth,
      }),
      (error) => {
        assert.equal(
          error.code,
          "YOUTUBE_REMOTE_QUERY_FAILED"
        );
        return true;
      }
    );

    const failed = await readRow(fourth);
    assert.equal(identityOf(failed), identityOf(fourthOriginal));
    assert.equal(
      failed.thumbnail_source,
      "YOUTUBE_DEFAULT"
    );

    // A DELETED fixture is refused before any provider call.
    const fifth = await insertFixture("deleted");
    await pool.execute(
      "UPDATE videos SET upload_status = 'DELETED', remote_deleted_at = NOW() WHERE id = ?",
      [fifth]
    );

    mock.restoreAll();
    calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.reconcileRemoteThumbnail({
        videoId: fifth,
      }),
      (error) => {
        assert.equal(
          error.code,
          "VIDEO_REMOTE_DELETED"
        );
        return true;
      }
    );

    assert.equal(calls.reads, 0);
    assert.equal(calls.writes, 0);

    // Nothing survives the run.
    await removeFixtures();
    assert.equal(await countResidues(), before);

    mock.restoreAll();
  }
);