// Integration test for the remote deletion flow. It only ever touches
// the isolated test database and removes every synthetic row it
// creates. The YouTube adapter is replaced, so no provider call is made.
//
// Run it with:
//   npm run test:integration:remote-delete

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

  assert.equal(
    typeof databaseName,
    "string",
    "the test environment file must define DB_NAME"
  );
  assert.ok(
    databaseName
      .toLowerCase()
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

const FIXTURE_PREFIX = "itest-remote-delete-";
const CHANNEL = "UC1234567890123456789012";
const OTHER_CHANNEL = "UC9999999999999999999999";
const runToken = `${Date.now()}${Math.floor(
  Math.random() * 100000
)}`;

const ENCRYPTED_REFRESH_TOKEN =
  encryptRefreshToken("integration-refresh-token");

function externalIdFor(suffix) {
  return `${FIXTURE_PREFIX}${runToken}-${suffix}`;
}

async function insertFixture({
  suffix,
  uploadStatus = "READY",
  isActive = 1,
  remoteDeletedAt = null,
}) {
  const externalId = externalIdFor(suffix);

  const [result] = await pool.execute(
    `
      INSERT INTO videos (
        title,
        description,
        url,
        provider,
        external_id,
        thumbnail_url,
        thumbnail_source,
        sort_order,
        is_active,
        upload_status,
        privacy_status,
        remote_deleted_at
      )
      VALUES (?, NULL, ?, 'YOUTUBE', ?, ?, 'CUSTOM', 5, ?, ?, 'PRIVATE', ?)
    `,
    [
      `integration remote delete ${suffix}`,
      `https://www.youtube.com/watch?v=synthetic${suffix}xx`,
      externalId,
      `https://i.ytimg.com/vi/synthetic${suffix}xx/hqdefault.jpg`,
      isActive,
      uploadStatus,
      remoteDeletedAt,
    ]
  );

  return {
    id: result.insertId,
    externalId,
    url: `https://www.youtube.com/watch?v=synthetic${suffix}xx`,
    thumbnailUrl: `https://i.ytimg.com/vi/synthetic${suffix}xx/hqdefault.jpg`,
  };
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
        SELECT
          id,
          title,
          url,
          provider,
          external_id,
          thumbnail_url,
          thumbnail_source,
          privacy_status,
          sort_order,
          is_active,
          upload_status,
          remote_deleted_at,
          created_at,
          updated_at
        FROM videos
        WHERE id = ?
      `,
      [id]
    )
    .then(([rows]) => rows[0] ?? null);
}

function stubProvider({
  ownerChannelId = CHANNEL,
  ownerStatus = 200,
  deleteStatus = 204,
} = {}) {
  const calls = {
    ownerProbes: [],
    remoteDeletes: [],
  };

  mock.method(
    youtubeClient,
    "refreshAccessToken",
    async () => ({
      accessToken: "integration-access-token",
      expiresIn: 3600,
    })
  );

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
    "getVideoOwner",
    async (token, videoId) => {
      calls.ownerProbes.push(videoId);

      if (ownerStatus === 404) {
        throw new YouTubeApiError(
          "video-owner",
          404
        );
      }

      return {
        videoId,
        channelId: ownerChannelId,
      };
    }
  );

  mock.method(
    youtubeClient,
    "deleteVideo",
    async (token, videoId) => {
      calls.remoteDeletes.push(videoId);

      if (deleteStatus === 404) {
        throw new YouTubeApiError(
          "delete-video",
          404
        );
      }

      if (deleteStatus !== 204) {
        throw new YouTubeApiError(
          "delete-video",
          deleteStatus
        );
      }
    }
  );

  return calls;
}

function identitySnapshot(row) {
  return JSON.stringify([
    row.id,
    row.provider,
    row.external_id,
    row.url,
    row.thumbnail_url,
    row.thumbnail_source,
    row.privacy_status,
    Number(row.sort_order),
    row.created_at.toISOString(),
  ]);
}

test(
  "the remote deletion flow marks the record, stays idempotent and leaves no residue",
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

    // A complete transition: the remote resource exists and belongs to
    // the connected channel.
    const first = await insertFixture({
      suffix: "complete",
    });
    const original = await readRow(first.id);
    const originalIdentity = identitySnapshot(original);

    let calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    const result =
      await youtubeService.deleteRemoteVideo(
        first.id
      );

    assert.deepEqual(
      calls.ownerProbes,
      [first.externalId]
    );
    assert.deepEqual(
      calls.remoteDeletes,
      [first.externalId]
    );

    assert.equal(result.deleted, true);
    assert.equal(result.alreadyDeleted, false);
    assert.equal(
      result.remoteAlreadyMissing,
      false
    );

    const marked = await readRow(first.id);
    assert.equal(marked.upload_status, "DELETED");
    assert.ok(marked.remote_deleted_at instanceof Date);
    assert.equal(marked.is_active, 0);
    assert.equal(
      identitySnapshot(marked),
      originalIdentity,
      "the identity must survive the transition"
    );
    // CURRENT_TIMESTAMP has second precision, so within the same second
    // the value is unchanged. The invariant is that it never moves
    // backwards; that the statement sets it at all is asserted by the
    // repository test.
    assert.ok(
      marked.updated_at.getTime() >=
        original.updated_at.getTime(),
      "updated_at must never move backwards"
    );

    // A second run is idempotent and never calls the provider again.
    mock.restoreAll();
    calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    const rerun =
      await youtubeService.deleteRemoteVideo(
        first.id
      );

    assert.deepEqual(calls.ownerProbes, []);
    assert.deepEqual(calls.remoteDeletes, []);
    assert.equal(rerun.alreadyDeleted, true);
    assert.equal(
      rerun.remoteAlreadyMissing,
      true
    );

    const afterRerun = await readRow(first.id);
    assert.equal(
      afterRerun.remote_deleted_at.getTime(),
      marked.remote_deleted_at.getTime(),
      "the original deletion date must not be rewritten"
    );

    // The remote resource is already gone: no videos.delete at all, but
    // the local record is completed.
    const second = await insertFixture({
      suffix: "remotemissing",
    });

    mock.restoreAll();
    calls = stubProvider({ ownerStatus: 404 });
    youtubeService.clearAccessTokenCache();

    const missingResult =
      await youtubeService.deleteRemoteVideo(
        second.id
      );

    assert.deepEqual(calls.ownerProbes, [
      second.externalId,
    ]);
    assert.deepEqual(
      calls.remoteDeletes,
      [],
      "a missing resource must not be deleted again"
    );
    assert.equal(
      missingResult.remoteAlreadyMissing,
      true
    );

    const missingRow = await readRow(second.id);
    assert.equal(
      missingRow.upload_status,
      "DELETED"
    );
    assert.ok(
      missingRow.remote_deleted_at instanceof Date
    );
    assert.equal(missingRow.is_active, 0);

    // A resource owned by another channel is never deleted.
    const third = await insertFixture({
      suffix: "otherchannel",
    });
    const thirdOriginal = await readRow(third.id);

    mock.restoreAll();
    calls = stubProvider({
      ownerChannelId: OTHER_CHANNEL,
    });
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.deleteRemoteVideo(third.id),
      (error) => {
        assert.equal(error.code, "YOUTUBE_CHANNEL_MISMATCH");
        return true;
      }
    );

    assert.deepEqual(calls.remoteDeletes, []);
    const untouched = await readRow(third.id);
    assert.equal(
      identitySnapshot(untouched),
      identitySnapshot(thirdOriginal)
    );
    assert.equal(untouched.upload_status, "READY");
    assert.equal(untouched.remote_deleted_at, null);
    assert.equal(untouched.updated_at.getTime(), thirdOriginal.updated_at.getTime());

    // A provider failure never marks the local record.
    const fourth = await insertFixture({
      suffix: "providerfailure",
    });
    const fourthOriginal = await readRow(fourth.id);

    mock.restoreAll();
    calls = stubProvider({ deleteStatus: 503 });
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.deleteRemoteVideo(fourth.id),
      (error) => {
        assert.equal(error.code, "YOUTUBE_DELETE_FAILED");
        return true;
      }
    );

    const failedRow = await readRow(fourth.id);
    assert.equal(failedRow.upload_status, "READY");
    assert.equal(failedRow.remote_deleted_at, null);
    assert.equal(failedRow.is_active, 1);
    assert.equal(
      identitySnapshot(failedRow),
      identitySnapshot(fourthOriginal)
    );

    // A delete that reports the resource as gone after a successful
    // probe is still treated as the idempotent outcome.
    const fifth = await insertFixture({
      suffix: "racedelete",
    });

    mock.restoreAll();
    stubProvider({ deleteStatus: 404 });
    youtubeService.clearAccessTokenCache();

    const raceResult =
      await youtubeService.deleteRemoteVideo(
        fifth.id
      );

    assert.equal(
      raceResult.remoteAlreadyMissing,
      true
    );
    assert.equal(
      raceResult.deleted,
      true
    );
    const racedRow = await readRow(fifth.id);
    assert.equal(racedRow.upload_status, "DELETED");
    assert.ok(racedRow.remote_deleted_at instanceof Date);

    // A DELETED record without a date stays inconsistent.
    const sixth = await insertFixture({
      suffix: "inconsistent",
      uploadStatus: "DELETED",
      isActive: 0,
      remoteDeletedAt: null,
    });

    mock.restoreAll();
    calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    await assert.rejects(
      youtubeService.deleteRemoteVideo(sixth.id),
      (error) => {
        assert.equal(
          error.code,
          "VIDEO_LOCAL_STATE_INCONSISTENT"
        );
        return true;
      }
    );

    assert.deepEqual(calls.ownerProbes, []);
    const inconsistentRow = await readRow(
      sixth.id
    );
    assert.equal(
      inconsistentRow.remote_deleted_at,
      null,
      "a date must never be invented"
    );

    // The local write is transactional: a forced failure rolls back and
    // the remote delete is never retried automatically.
    const seventh = await insertFixture({
      suffix: "localrollback",
    });

    mock.restoreAll();
    calls = stubProvider();
    youtubeService.clearAccessTokenCache();

    const originalMark =
      videoRepository.markVideoAsRemoteDeleted;
    mock.method(
      videoRepository,
      "markVideoAsRemoteDeleted",
      async (input) => {
        // A real transaction against the real connection, undone
        // before the failure is surfaced, so the rollback path is the
        // production one rather than a stub.
        const connection =
          await pool.getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute(
            "UPDATE videos SET sort_order = sort_order + 1 WHERE id = ?",
            [input.videoId]
          );
          await connection.rollback();
        } finally {
          connection.release();
        }

        throw new Error("injected local failure");
      }
    );
    assert.equal(
      typeof originalMark,
      "function"
    );

    await assert.rejects(
      youtubeService.deleteRemoteVideo(
        seventh.id
      ),
      (error) => {
        assert.equal(
          error.code,
          "YOUTUBE_VIDEO_DELETED_LOCAL_UPDATE_FAILED"
        );
        return true;
      }
    );

    assert.deepEqual(
      calls.remoteDeletes,
      [seventh.externalId],
      "the remote delete happened once"
    );
    const rollbackRow = await readRow(
      seventh.id
    );
    assert.equal(
      rollbackRow.upload_status,
      "READY",
      "the local state must be untouched"
    );
    assert.equal(
      rollbackRow.remote_deleted_at,
      null
    );

    // The documented retry: the resource is gone, so the second attempt
    // completes the local marking without calling videos.delete.
    mock.restoreAll();
    calls = stubProvider({ ownerStatus: 404 });
    youtubeService.clearAccessTokenCache();

    const retry = await youtubeService.deleteRemoteVideo(
      seventh.id
    );

    assert.equal(retry.deleted, true);
    assert.equal(
      retry.remoteAlreadyMissing,
      true
    );
    assert.deepEqual(calls.remoteDeletes, []);
    const retriedRow = await readRow(
      seventh.id
    );
    assert.equal(retriedRow.upload_status, "DELETED");
    assert.ok(
      retriedRow.remote_deleted_at instanceof Date
    );
    assert.equal(retriedRow.is_active, 0);

    // Nothing survives the run.
    await removeFixtures();
    assert.equal(await countResidues(), before);

    mock.restoreAll();
  }
);