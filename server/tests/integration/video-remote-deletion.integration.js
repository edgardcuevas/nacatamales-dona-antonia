// Integration test for the remote deletion maintenance tool. It only
// ever runs against the isolated test database and removes every
// synthetic row it creates.
//
// Run it with:
//   npm run test:integration:remote-deletion
//
// The file is deliberately not named *.test.js so the unit suite stays
// runnable without a database.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFile } = require("node:child_process");

const SERVER_ROOT = path.join(__dirname, "..", "..");
const SCRIPT_PATH = path.join(
  SERVER_ROOT,
  "database",
  "scripts",
  "mark-videos-remote-deleted.js"
);

const FIXTURE_PREFIX =
  "itest-remote-deleted-";
const TEST_DATABASE_SUFFIX = "_test";

function readDatabaseNameFromEnvFile(fileName) {
  const fs = require("node:fs");
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

  if (!match) {
    return null;
  }

  return match[1]
    .replace(/^["']|["']$/g, "")
    .trim();
}

// Guards before any fixture is written. Running this against a real
// database would be the one mistake that cannot be undone.
function assertIsolatedTestDatabase() {
  const databaseName =
    readDatabaseNameFromEnvFile(".env.test");

  assert.equal(
    typeof databaseName,
    "string",
    "the test environment file must define DB_NAME"
  );
  assert.ok(
    databaseName
      .toLowerCase()
      .endsWith(TEST_DATABASE_SUFFIX),
    "the integration test refuses to run against a database without the _test suffix"
  );

  const developmentDatabaseName =
    readDatabaseNameFromEnvFile(".env");

  assert.notEqual(
    databaseName.toLowerCase(),
    String(developmentDatabaseName).toLowerCase(),
    "the integration test refuses to run against the development database"
  );

  return databaseName;
}

const mysql = require("mysql2/promise");

const databaseName = assertIsolatedTestDatabase();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 2,
});

const runToken = `${Date.now()}${Math.floor(
  Math.random() * 100000
)}`;

function externalIdFor(suffix) {
  return `${FIXTURE_PREFIX}${runToken}-${suffix}`;
}

async function createFixtures(tag = "main") {
  const seeds = [
    {
      suffix: "a",
      uploadStatus: "READY",
      isActive: 1,
    },
    {
      suffix: "b",
      uploadStatus: "READY",
      isActive: 1,
    },
    {
      suffix: "c",
      uploadStatus: "READY",
      isActive: 1,
    },
    {
      suffix: "d",
      uploadStatus: "READY",
      isActive: 1,
    },
  ].filter((seed) =>
    tag === "main" || seed.suffix === "a" ||
    seed.suffix === "b"
  );

  const created = [];

  for (const seed of seeds) {
    const externalId = externalIdFor(
      `${tag}-${seed.suffix}`
    );

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
          privacy_status
        )
        VALUES (?, NULL, ?, 'YOUTUBE', ?, ?, 'CUSTOM', 7, ?, ?, 'PUBLIC')
      `,
      [
        `integration fixture ${seed.suffix}`,
        `https://www.youtube.com/watch?v=synthetic${seed.suffix}`,
        externalId,
        `https://i.ytimg.com/vi/synthetic${seed.suffix}/hqdefault.jpg`,
        seed.isActive,
        seed.uploadStatus,
      ]
    );

    created.push({
      id: result.insertId,
      externalId,
      url: `https://www.youtube.com/watch?v=synthetic${seed.suffix}`,
      thumbnailUrl: `https://i.ytimg.com/vi/synthetic${seed.suffix}/hqdefault.jpg`,
    });
  }

  return created;
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
          provider,
          external_id,
          url,
          thumbnail_url,
          thumbnail_source,
          privacy_status,
          sort_order,
          is_active,
          upload_status,
          remote_deleted_at,
          created_at
        FROM videos
        WHERE id = ?
      `,
      [id]
    )
    .then(([rows]) => rows[0] ?? null);
}

async function invokeTool(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT_PATH, ...args],
      { cwd: SERVER_ROOT },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error?.code ?? 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

function parseKeyValues(stdout) {
  const values = {};

  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf("=");

    if (separator > 0) {
      values[
        line.slice(0, separator).trim()
      ] = line.slice(separator + 1).trim();
    }
  }

  return values;
}

function assertOutputIsSanitized(stdout) {
  for (const forbidden of [
    "synthetic",
    "http",
    "youtu",
    "integration fixture",
  ]) {
    assert.equal(
      stdout.toLowerCase().includes(forbidden),
      false,
      `the tool output must not contain ${forbidden}`
    );
  }
}

test(
  "the tool marks videos as DELETED on the test database only",
  { timeout: 120_000 },
  async (t) => {
    const before = await countResidues();

    t.after(async () => {
      await removeFixtures();
      await pool.end();

      assert.equal(
        await (async () => {
          const check =
            mysql.createPool({
              host: process.env.DB_HOST,
              port: Number(
                process.env.DB_PORT
              ),
              database: process.env.DB_NAME,
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              connectionLimit: 1,
            });
          const [rows] =
            await check.execute(
              "SELECT COUNT(*) AS total FROM videos WHERE external_id LIKE ?",
              [`${FIXTURE_PREFIX}%`]
            );
          await check.end();

          return Number(rows[0].total);
        })(),
        before,
        "every synthetic row must be removed"
      );
    });

    const fixtures = await createFixtures();
    const [first, second, third, fourth] =
      fixtures;

    // A dry run must not write anything.
    const dryRun = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${first.id},${second.id},${third.id}`,
    ]);

    assert.equal(dryRun.exitCode, 0);
    assertOutputIsSanitized(dryRun.stdout);

    const dryRunValues = parseKeyValues(
      dryRun.stdout
    );
    assert.equal(
      dryRunValues.mode,
      "dry-run"
    );
    assert.equal(dryRunValues.eligible_count, "3");
    assert.equal(dryRunValues.modified_count, "0");
    assert.equal(
      dryRunValues.transaction,
      "none"
    );
    assert.equal(
      dryRunValues.result,
      "DRY_RUN_COMPLETE"
    );

    for (const fixture of [
      first,
      second,
      third,
    ]) {
      const row = await readRow(fixture.id);
      assert.equal(
        row.upload_status,
        "READY"
      );
      assert.equal(
        row.remote_deleted_at,
        null
      );
      assert.equal(row.is_active, 1);
    }

    // An unknown id rejects the whole batch.
    const rejected = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${first.id},999999999`,
    ]);

    assert.equal(rejected.exitCode, 3);
    assert.match(
      rejected.stdout,
      /RECORD_NOT_FOUND/
    );

    for (const fixture of [
      first,
      second,
      third,
    ]) {
      const row = await readRow(fixture.id);
      assert.equal(
        row.upload_status,
        "READY"
      );
    }

    // The transactional run.
    const original = await readRow(first.id);
    const applied = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${first.id},${second.id},${third.id}`,
      "--apply",
    ]);

    assert.equal(applied.exitCode, 0);
    assertOutputIsSanitized(applied.stdout);

    const appliedValues = parseKeyValues(
      applied.stdout
    );
    assert.equal(appliedValues.mode, "apply");
    assert.equal(appliedValues.modified_count, "3");
    assert.equal(
      appliedValues.transaction,
      "committed"
    );
    assert.equal(appliedValues.result, "APPLIED");

    const timestamps = new Set();

    for (const fixture of [
      first,
      second,
      third,
    ]) {
      const row = await readRow(fixture.id);

      assert.equal(
        row.upload_status,
        "DELETED"
      );
      assert.ok(
        row.remote_deleted_at instanceof Date,
        "remote_deleted_at must be persisted"
      );
      timestamps.add(
        row.remote_deleted_at.getTime()
      );
      assert.equal(row.is_active, 0);

      // Identity and editorial data must survive untouched.
      assert.equal(row.provider, "YOUTUBE");
      assert.equal(
        row.external_id,
        fixture.externalId
      );
      assert.equal(row.url, fixture.url);
      assert.equal(
        row.thumbnail_url,
        fixture.thumbnailUrl
      );
      assert.equal(
        row.thumbnail_source,
        "CUSTOM"
      );
      assert.equal(
        row.privacy_status,
        "PUBLIC"
      );
      assert.equal(row.sort_order, 7);
    }

    assert.equal(
      timestamps.size,
      1,
      "one run must stamp one logical timestamp"
    );

    const marked = await readRow(first.id);
    assert.equal(
      marked.created_at.getTime(),
      original.created_at.getTime()
    );

    // Idempotency: a second run changes nothing.
    const rerun = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${first.id},${second.id},${third.id}`,
      "--apply",
    ]);

    assert.equal(rerun.exitCode, 0);
    const rerunValues = parseKeyValues(
      rerun.stdout
    );
    assert.equal(rerunValues.modified_count, "0");
    assert.equal(
      rerunValues.already_deleted_count,
      "3"
    );

    const afterRerun = await readRow(
      first.id
    );
    assert.equal(
      afterRerun.remote_deleted_at.getTime(),
      marked.remote_deleted_at.getTime(),
      "the original deletion date must never be overwritten"
    );

    // A DELETED row that is somehow still active is only
    // deactivated, never re-stamped.
    await pool.execute(
      "UPDATE videos SET is_active = 1 WHERE id = ?",
      [fourth.id]
    );
    await pool.execute(
      `
        UPDATE videos
        SET upload_status = 'DELETED',
            remote_deleted_at = ?
        WHERE id = ?
      `,
      [
        new Date("2026-01-02T03:04:05.000Z"),
        fourth.id,
      ]
    );

    const beforeRepair = await readRow(
      fourth.id
    );
    assert.equal(
      beforeRepair.is_active,
      1
    );

    const repair = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${fourth.id}`,
      "--apply",
    ]);

    assert.equal(repair.exitCode, 0);
    const afterRepair = await readRow(
      fourth.id
    );
    assert.equal(afterRepair.is_active, 0);
    assert.equal(
      afterRepair.remote_deleted_at.getTime(),
      beforeRepair.remote_deleted_at.getTime()
    );

    // A DELETED row without a date is an inconsistent state and is
    // refused instead of being given an invented date.
    await pool.execute(
      `
        UPDATE videos
        SET upload_status = 'DELETED',
            remote_deleted_at = NULL
        WHERE id = ?
      `,
      [fourth.id]
    );

    const inconsistent = await invokeTool([
      "--environment",
      "test",
      "--ids",
      `${fourth.id}`,
      "--apply",
    ]);

    assert.equal(inconsistent.exitCode, 3);
    assert.match(
      inconsistent.stdout,
      /DELETED_WITHOUT_TIMESTAMP/
    );

    // A real transaction rollback: the second write fails and the
    // first one must not survive.
    const {
      applyRemoteDeletions,
    } = require("../../src/modules/videos/video.remote-deletion.service");

    const rollbackSeeds = await createFixtures(
      "rollback"
    );
    const [rollbackFirst, rollbackSecond] =
      rollbackSeeds;

    const failingPool = {
      async getConnection() {
        const connection =
          await pool.getConnection();

        return {
          execute: (sql, parameters) => {
            const statement = String(sql)
              .replace(/\s+/g, " ")
              .trim();

            if (
              statement.includes(
                "upload_status = 'DELETED'"
              ) &&
              parameters[1] ===
                rollbackSecond.id
            ) {
              return Promise.reject(
                new Error(
                  "injected write failure"
                )
              );
            }

            return connection.execute(
              sql,
              parameters
            );
          },
          beginTransaction: () =>
            connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
        };
      },
    };

    await assert.rejects(
      applyRemoteDeletions({
        videoIds: [
          rollbackFirst.id,
          rollbackSecond.id,
        ],
        pool: failingPool,
      }),
      (error) => {
        assert.equal(
          error.message,
          "injected write failure"
        );
        assert.equal(
          error.transaction,
          "rolled_back"
        );
        return true;
      }
    );

    for (const fixture of [
      rollbackFirst,
      rollbackSecond,
    ]) {
      const row = await readRow(fixture.id);
      assert.equal(
        row.upload_status,
        "READY",
        "the rollback must leave every row untouched"
      );
      assert.equal(
        row.remote_deleted_at,
        null
      );
      assert.equal(row.is_active, 1);
    }

    await removeFixtures();

    assert.equal(
      await countResidues(),
      before,
      "no synthetic row may survive the run"
    );

    assert.equal(
      databaseName
        .toLowerCase()
        .endsWith(TEST_DATABASE_SUFFIX),
      true
    );
  }
);