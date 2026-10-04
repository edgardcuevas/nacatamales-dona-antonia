const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");

const {
  EXIT_CODES,
  MAX_REMOTE_DELETION_IDS,
  REMOTE_DELETION_CONFIRMATION_PHRASE,
  REMOTE_DELETION_REJECTIONS,
  REMOTE_DELETION_OUTCOMES,
} = require("../../src/modules/videos/video.remote-deletion.constants");

const {
  summarize,
} = require("../../src/modules/videos/video.remote-deletion.service");

const {
  RemoteDeletionRejectionError,
} = require("../../src/modules/videos/video.remote-deletion.service");

const tool = require(
  "../../database/scripts/mark-videos-remote-deleted"
);

const {
  run,
  parseArguments,
  formatSummary,
} = tool;

// Collects everything the tool prints so the assertions can prove no
// sensitive value escapes.
function createIo() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    get output() {
      return lines.join("\n");
    },
  };
}

function createPlan(overrides = {}) {
  const eligible = overrides.eligible ?? [
    {
      videoId: 1,
      outcome: REMOTE_DELETION_OUTCOMES.ELIGIBLE,
      needsDeactivation: false,
    },
    {
      videoId: 2,
      outcome: REMOTE_DELETION_OUTCOMES.ELIGIBLE,
      needsDeactivation: false,
    },
  ];
  const alreadyDeleted = overrides.alreadyDeleted ?? [];
  const rejections = overrides.rejections ?? [];

  return {
    entries: [...eligible, ...alreadyDeleted],
    eligible,
    alreadyDeleted,
    rejections,
  };
}

async function expectToolError(argv, code) {
  await assert.rejects(
    async () => parseArguments(argv),
    (error) => {
      assert.equal(
        error instanceof tool.ToolError,
        true
      );
      assert.equal(error.code, code);
      return true;
    }
  );
}

test("the tool refuses to run without explicit ids", async () => {
  await expectToolError(
    ["--environment", "development"],
    "IDS_REQUIRED"
  );
  await expectToolError([], "ENVIRONMENT_REQUIRED");
  await expectToolError(
    ["--ids", "1,2"],
    "ENVIRONMENT_REQUIRED"
  );
});

test("the tool rejects an empty id list", async () => {
  for (const value of ["", "   "]) {
    await expectToolError(
      ["--environment", "test", "--ids", value],
      "IDS_REQUIRED"
    );
  }
});

test("the tool rejects malformed id lists", async () => {
  const malformed = [
    "0",
    "-1",
    "1.5",
    "abc",
    "1,,2",
    "1;",
    "1 2",
    "+1",
    "0x1",
  ];

  for (const value of malformed) {
    await expectToolError(
      ["--environment", "test", "--ids", value],
      "ID_LIST_MALFORMED"
    );
  }
});

test("the tool rejects ranges and wildcards instead of expanding them", async () => {
  const ambiguous = [
    "1-5",
    "1-",
    "-",
    "*",
    "all",
    "ALL",
    "1..5",
    "1:5",
    "1 to 5",
    "%",
    "1,*",
    "%1%",
  ];

  for (const value of ambiguous) {
    await expectToolError(
      ["--environment", "test", "--ids", value],
      "ID_LIST_MALFORMED"
    );
  }
});

test("the tool rejects duplicate ids", async () => {
  await expectToolError(
    ["--environment", "test", "--ids", "1,1"],
    "DUPLICATE_ID"
  );
  await expectToolError(
    ["--environment", "test", "--ids", "1,2,1"],
    "DUPLICATE_ID"
  );
  // A padded duplicate normalizes to the same id and is still caught.
  await expectToolError(
    ["--environment", "test", "--ids", "7, 07"],
    "DUPLICATE_ID"
  );
});

test("the tool enforces a documented maximum number of ids", async () => {
  const tooMany = Array.from(
    { length: MAX_REMOTE_DELETION_IDS + 1 },
    (_unused, index) => index + 1
  ).join(",");

  await expectToolError(
    ["--environment", "test", "--ids", tooMany],
    "TOO_MANY_IDS"
  );

  const atLimit = Array.from(
    { length: MAX_REMOTE_DELETION_IDS },
    (_unused, index) => index + 1
  ).join(",");

  const parsed = parseArguments([
    "--environment",
    "test",
    "--ids",
    atLimit,
  ]);

  assert.equal(
    parsed.videoIds.length,
    MAX_REMOTE_DELETION_IDS
  );
});

test("the tool rejects unknown options and missing flag values", async () => {
  await expectToolError(
    [
      "--environment",
      "test",
      "--ids",
      "1",
      "--all",
    ],
    "UNKNOWN_OPTION"
  );
  await expectToolError(
    ["--environment"],
    "FLAG_VALUE_MISSING"
  );
  await expectToolError(["--ids"], "FLAG_VALUE_MISSING");
});

test("the tool requires an explicit environment and refuses production", async () => {
  await expectToolError(
    ["--ids", "1"],
    "ENVIRONMENT_REQUIRED"
  );

  await assert.rejects(
    async () =>
      parseArguments([
        "--environment",
        "production",
        "--ids",
        "1",
      ]),
    (error) => {
      assert.equal(
        error.code,
        "ENVIRONMENT_PRODUCTION_DISABLED"
      );
      assert.equal(
        error.exitCode,
        EXIT_CODES.UNSAFE_CONFIGURATION
      );
      return true;
    }
  );

  await expectToolError(
    ["--environment", "staging", "--ids", "1"],
    "ENVIRONMENT_UNKNOWN"
  );
});

test("applying against development requires the exact confirmation phrase", async () => {
  await assert.rejects(
    async () =>
      parseArguments([
        "--environment",
        "development",
        "--ids",
        "1",
        "--apply",
      ]),
    (error) => {
      assert.equal(
        error.code,
        "APPLY_REQUIRES_CONFIRMATION"
      );
      assert.equal(
        error.exitCode,
        EXIT_CODES.UNSAFE_CONFIGURATION
      );
      return true;
    }
  );

  await assert.rejects(
    async () =>
      parseArguments([
        "--environment",
        "development",
        "--ids",
        "1",
        "--apply",
        "--confirm",
        "yes",
      ]),
    (error) => {
      assert.equal(
        error.code,
        "CONFIRMATION_PHRASE_INVALID"
      );
      return true;
    }
  );

  const accepted = parseArguments([
    "--environment",
    "development",
    "--ids",
    "1,2",
    "--apply",
    "--confirm",
    REMOTE_DELETION_CONFIRMATION_PHRASE,
  ]);

  assert.equal(accepted.apply, true);
  assert.deepEqual(accepted.videoIds, [1, 2]);

  // A dry run never needs the phrase.
  const dryRun = parseArguments([
    "--environment",
    "development",
    "--ids",
    "1,2",
  ]);
  assert.equal(dryRun.apply, false);
});

test("a dry run prints the plan and exits zero without writing", async () => {
  const io = createIo();
  let poolRequested = false;

  const { pool, calls } = fakeDatabaseWithRows([
    {
      id: 1,
      provider: "YOUTUBE",
      external_id: "synthetic-one",
      upload_status: "READY",
      privacy_status: "UNLISTED",
      is_active: 1,
      remote_deleted_at: null,
    },
    {
      id: 2,
      provider: "YOUTUBE",
      external_id: "synthetic-two",
      upload_status: "READY",
      privacy_status: "UNLISTED",
      is_active: 1,
      remote_deleted_at: null,
    },
  ]);

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,2",
    ],
    io,
    {
      resolvePool: async () => {
        poolRequested = true;
        return { pool, owned: false };
      },
    }
  );

  assert.equal(poolRequested, true);
  assert.deepEqual(calls.updates, []);
  assert.equal(exitCode, EXIT_CODES.OK);
  assert.match(
    io.output,
    /mode=dry-run/
  );
  assert.match(
    io.output,
    /requested_ids=1,2/
  );
  assert.match(
    io.output,
    /eligible_count=2/
  );
  assert.match(
    io.output,
    /modified_count=0/
  );
  assert.match(
    io.output,
    /transaction=none/
  );
  assert.match(
    io.output,
    /result=DRY_RUN_COMPLETE/
  );
});

test("a rejected dry run exits with the records code and lists only ids and codes", async () => {
  const io = createIo();

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,9",
    ],
    io,
    {
      resolvePool: async () => {
        const { pool } = fakeDatabaseWithRows([
          {
            id: 1,
            provider: "YOUTUBE",
            external_id: "synthetic",
            upload_status: "READY",
            privacy_status: "UNLISTED",
            is_active: 1,
            remote_deleted_at: null,
          },
        ]);
        return { pool, owned: false };
      },
    }
  );

  assert.equal(
    exitCode,
    EXIT_CODES.RECORDS_NOT_ELIGIBLE
  );
  assert.match(
    io.output,
    /rejections=9:RECORD_NOT_FOUND/
  );
  assert.match(io.output, /result=REJECTED/);
});

test("a schema rejection exits with the unsafe configuration code", async () => {
  const io = createIo();

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: {
          async execute() {
            return [
              [
                {
                  COLUMN_NAME: "upload_status",
                  COLUMN_TYPE:
                    "enum('READY','FAILED')",
                  IS_NULLABLE: "NO",
                },
              ],
            ];
          },
        },
        owned: false,
      }),
    }
  );

  assert.equal(
    exitCode,
    EXIT_CODES.UNSAFE_CONFIGURATION
  );
  assert.match(
    io.output,
    new RegExp(
      REMOTE_DELETION_REJECTIONS
        .SCHEMA_MISSING_DELETED_STATUS
    )
  );
});

test("an unexpected failure inside the run exits with the transaction code", async () => {
  const io = createIo();

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1",
      "--apply",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: {
          async getConnection() {
            throw new Error(
              "connection lost"
            );
          },
        },
        owned: false,
      }),
    }
  );

  assert.equal(
    exitCode,
    EXIT_CODES.TRANSACTION_FAILURE
  );
  assert.match(io.output, /result=FAILED/);
  assert.match(
    io.output,
    /exit_code=4/
  );
});

test("an argument failure exits with the invalid input code and prints the usage", async () => {
  const io = createIo();

  const exitCode = await run(
    [
      "--environment",
      "production",
      "--ids",
      "1",
    ],
    io
  );

  assert.equal(
    exitCode,
    EXIT_CODES.UNSAFE_CONFIGURATION
  );
  assert.match(io.output, /Usage:/);
  assert.match(
    io.output,
    /ENVIRONMENT_PRODUCTION_DISABLED/
  );

  const otherIo = createIo();
  const invalidExit = await run(
    ["--environment", "test"],
    otherIo
  );

  assert.equal(
    invalidExit,
    EXIT_CODES.INVALID_INPUT
  );
  assert.match(otherIo.output, /IDS_REQUIRED/);
});

test("the summary never exposes titles, urls, external ids or credentials", () => {
  const plan = createPlan({
    eligible: [
      {
        videoId: 1,
        outcome: REMOTE_DELETION_OUTCOMES.ELIGIBLE,
        needsDeactivation: false,
        // Fields the formatter must never read.
        title: "Receta de nacatamal",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        external_id: "abcdefghijk",
        channel_id: "UC1234567890123456789012",
      },
    ],
  });

  const summary = summarize({
    videoIds: [1],
    plan,
    mode: "apply",
    modifiedIds: [1],
    transaction: "committed",
    deletedAt: new Date(
      "2026-10-03T22:10:03.000Z"
    ),
  });

  const output = formatSummary({
    summary,
    environment: "development",
    mode: "apply",
    plan,
  }).join("\n");

  for (const forbidden of [
    "Receta",
    "http",
    "youtube",
    "abcdefghijk",
    "UC1234567890123456789012",
    "token",
    "password",
  ]) {
    assert.equal(
      output.includes(forbidden),
      false,
      `output must not contain ${forbidden}`
    );
  }

  assert.match(
    output,
    /transaction=committed/
  );
  assert.match(output, /modified_ids=1/);
  assert.match(output, /result=APPLIED/);
  assert.match(
    output,
    /deleted_at=2026-10-03T22:10:03\.000Z/
  );
});

test("the rejection error class is the one the tool maps on", () => {
  const error = new RemoteDeletionRejectionError(
    [
      {
        videoId: 3,
        code: REMOTE_DELETION_REJECTIONS
          .EXTERNAL_ID_MISSING,
      },
    ],
    "RECORD"
  );

  assert.equal(error.kind, "RECORD");
  assert.equal(
    error.name,
    "RemoteDeletionRejectionError"
  );
});

test("the loadable module graph of the tool excludes every provider client", () => {
  const forbidden = Object.keys(
    require.cache
  ).filter(
    (loaded) =>
      loaded.includes("modules\\youtube") ||
      loaded.includes("modules/youtube") ||
      loaded.includes("googleapis")
  );

  assert.deepEqual(forbidden, []);
});

function fakeDatabaseWithRows(rows) {
  const calls = { updates: [], end: 0 };

  const executor = {
    async execute(sql) {
      const statement = String(sql)
        .replace(/\s+/g, " ")
        .trim();

      if (statement.includes("information_schema")) {
        return [
          [
            {
              COLUMN_NAME: "upload_status",
              COLUMN_TYPE:
                "enum('PENDING','UPLOADING','PROCESSING','READY','FAILED','DELETED')",
              IS_NULLABLE: "NO",
            },
            {
              COLUMN_NAME: "remote_deleted_at",
              COLUMN_TYPE: "datetime",
              IS_NULLABLE: "YES",
            },
          ],
        ];
      }

      if (statement.startsWith("SELECT")) {
        return [rows];
      }

      calls.updates.push(statement);
      return [{ affectedRows: 1 }];
    },
  };

  const connection = {
    execute: executor.execute,
    async beginTransaction() {
      calls.beginTransaction =
        (calls.beginTransaction ?? 0) + 1;
    },
    async commit() {
      calls.commit = (calls.commit ?? 0) + 1;
    },
    async rollback() {
      calls.rollback = (calls.rollback ?? 0) + 1;
    },
    release() {},
  };

  return {
    calls,
    pool: {
      execute: executor.execute,
      async getConnection() {
        return connection;
      },
      async end() {
        calls.end += 1;
      },
    },
  };
}

const READY_ROWS = Object.freeze([
  {
    id: 1,
    provider: "YOUTUBE",
    external_id: "synthetic-one",
    upload_status: "READY",
    privacy_status: "UNLISTED",
    is_active: 1,
    remote_deleted_at: null,
  },
  {
    id: 2,
    provider: "YOUTUBE",
    external_id: "synthetic-two",
    upload_status: "READY",
    privacy_status: "UNLISTED",
    is_active: 0,
    remote_deleted_at: null,
  },
]);

// The real resolvePool must be exercised without a database, so the
// environment file and the driver are replaced instead.
function withStubbedEnvironment(runBody) {
  const mysql = require("mysql2/promise");
  const fs = require("node:fs");

  const savedVariables = {};
  for (const name of [
    ...tool.__testing.DATABASE_VARIABLES,
    "NODE_ENV",
  ]) {
    savedVariables[name] = process.env[name];
  }

  const created = [];

  mock.method(fs, "existsSync", () => true);
  mock.method(process, "loadEnvFile", () => {
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = "3306";
    process.env.DB_USER = "stub_user";
    process.env.DB_PASSWORD = "stub_password";
    process.env.DB_NAME =
      runBody.databaseName ?? "stub_development";
  });
  mock.method(mysql, "createPool", (config) => {
    created.push(config);
    return fakeDatabaseWithRows(
      runBody.rows ?? [...READY_ROWS]
    ).pool;
  });

  return runBody
    .execute(created)
    .finally(() => {
      mock.restoreAll();

      for (const [name, value] of Object.entries(
        savedVariables
      )) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });
}

function assertSharedPoolWasNeverLoaded() {
  const sharedPoolKeys = Object.keys(
    require.cache
  ).filter(
    (loaded) =>
      loaded.endsWith(
        "src\\database\\pool.js"
      ) ||
      loaded.endsWith(
        "src/database/pool.js"
      )
  );

  assert.deepEqual(sharedPoolKeys, []);
}

test("development builds its own pool and closes it once", async () => {
  const io = createIo();

  const created = await withStubbedEnvironment({
    databaseName: "stub_development",
    execute: async (pools) => {
      const exitCode = await run(
        [
          "--environment",
          "development",
          "--ids",
          "1,2",
        ],
        io
      );

      assert.equal(
        exitCode,
        EXIT_CODES.OK
      );
      assert.equal(pools.length, 1);
      assert.equal(
        pools[0].database,
        "stub_development"
      );
      assertSharedPoolWasNeverLoaded();

      return pools;
    },
  });

  assert.equal(created.length, 1);
});

test("the test environment builds its own pool and closes it once", async () => {
  const io = createIo();

  await withStubbedEnvironment({
    databaseName: "stub_development_test",
    execute: async (pools) => {
      const exitCode = await run(
        [
          "--environment",
          "test",
          "--ids",
          "1,2",
        ],
        io
      );

      assert.equal(
        exitCode,
        EXIT_CODES.OK
      );
      assert.equal(pools.length, 1);
      assert.equal(
        pools[0].database,
        "stub_development_test"
      );
      assertSharedPoolWasNeverLoaded();
    },
  });
});

test("the development guard still refuses a _test database", async () => {
  const io = createIo();

  await withStubbedEnvironment({
    databaseName: "stub_development_test",
    execute: async (pools) => {
      const exitCode = await run(
        [
          "--environment",
          "development",
          "--ids",
          "1",
        ],
        io
      );

      assert.equal(
        exitCode,
        EXIT_CODES.UNSAFE_CONFIGURATION
      );
      assert.equal(
        pools.length,
        0,
        "no connection may be opened"
      );
      assert.match(
        io.output,
        /DATABASE_SUFFIX_INVALID/
      );
    },
  });
});

test("the test guard still refuses a database without the _test suffix", async () => {
  const io = createIo();

  await withStubbedEnvironment({
    databaseName: "stub_development",
    execute: async (pools) => {
      const exitCode = await run(
        [
          "--environment",
          "test",
          "--ids",
          "1",
        ],
        io
      );

      assert.equal(
        exitCode,
        EXIT_CODES.UNSAFE_CONFIGURATION
      );
      assert.equal(pools.length, 0);
    },
  });
});

test("an incomplete database configuration aborts before connecting", async () => {
  const io = createIo();
  const mysql = require("mysql2/promise");
  const fs = require("node:fs");

  const savedVariables = {};
  for (const name of [
    ...tool.__testing.DATABASE_VARIABLES,
  ]) {
    savedVariables[name] = process.env[name];
  }

  let created = 0;

  mock.method(fs, "existsSync", () => true);
  mock.method(process, "loadEnvFile", () => {
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = "3306";
    process.env.DB_USER = "stub_user";
    process.env.DB_PASSWORD = "stub_password";
    // DB_NAME intentionally left unset.
  });
  mock.method(mysql, "createPool", () => {
    created += 1;
    return {};
  });

  try {
    const exitCode = await run(
      [
        "--environment",
        "development",
        "--ids",
        "1",
      ],
      io
    );

    assert.equal(
      exitCode,
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
    assert.equal(created, 0);
    assert.match(
      io.output,
      /DATABASE_CONFIGURATION_INCOMPLETE/
    );
  } finally {
    mock.restoreAll();

    for (const [name, value] of Object.entries(
      savedVariables
    )) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("the owned pool is closed once on every successful path", async () => {
  const dryRunDatabase = fakeDatabaseWithRows([
    ...READY_ROWS,
  ]);
  const dryRunIo = createIo();

  assert.equal(
    await run(
      [
        "--environment",
        "test",
        "--ids",
        "1,2",
      ],
      dryRunIo,
      {
        resolvePool: async () => ({
          pool: dryRunDatabase.pool,
          owned: true,
        }),
      }
    ),
    EXIT_CODES.OK
  );
  assert.equal(dryRunDatabase.calls.end, 1);

  const applyDatabase = fakeDatabaseWithRows([
    ...READY_ROWS,
  ]);
  const applyIo = createIo();

  assert.equal(
    await run(
      [
        "--environment",
        "test",
        "--ids",
        "1,2",
        "--apply",
      ],
      applyIo,
      {
        resolvePool: async () => ({
          pool: applyDatabase.pool,
          owned: true,
        }),
      }
    ),
    EXIT_CODES.OK
  );
  assert.equal(applyDatabase.calls.end, 1);
  assert.equal(applyDatabase.calls.commit, 1);
  assert.equal(applyDatabase.calls.rollback, undefined);
  assert.equal(applyDatabase.calls.updates.length, 2);
});

test("the owned pool is closed once when the validation rejects after connecting", async () => {
  const database = fakeDatabaseWithRows([
    READY_ROWS[0],
  ]);
  const io = createIo();

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,999999999",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: database.pool,
        owned: true,
      }),
    }
  );

  assert.equal(
    exitCode,
    EXIT_CODES.RECORDS_NOT_ELIGIBLE
  );
  assert.equal(database.calls.end, 1);
  assert.deepEqual(database.calls.updates, []);
});

test("the owned pool is closed once when the transaction fails", async () => {
  const database = fakeDatabaseWithRows([
    READY_ROWS[0],
  ]);
  const io = createIo();

  const failingPool = {
    async getConnection() {
      const connection =
        await database.pool.getConnection();

      return {
        ...connection,
        async execute(sql) {
          const statement = String(sql)
            .replace(/\s+/g, " ")
            .trim();

          if (statement.includes("information_schema")) {
            return connection.execute(sql);
          }

          if (statement.startsWith("SELECT")) {
            return [
              [...READY_ROWS].reverse(),
            ];
          }

          throw new Error(
            "injected transaction failure"
          );
        },
      };
    },
    async end() {
      database.calls.end += 1;
    },
  };

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,2",
      "--apply",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: failingPool,
        owned: true,
      }),
    }
  );

  assert.equal(
    exitCode,
    EXIT_CODES.TRANSACTION_FAILURE
  );
  assert.equal(database.calls.end, 1);
  assert.equal(database.calls.rollback, 1);
  assert.match(
    io.output,
    /failure_code=TRANSACTION_ROLLED_BACK/
  );
});

test("the summary reaches stdout before the pool is closed", async () => {
  const database = fakeDatabaseWithRows([
    ...READY_ROWS,
  ]);
  const io = createIo();
  let linesAtClose = -1;

  const observedPool = {
    ...database.pool,
    async end() {
      linesAtClose = io.lines.length;
      database.calls.end += 1;
    },
  };

  await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,2",
      "--apply",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: observedPool,
        owned: true,
      }),
    }
  );

  assert.equal(database.calls.end, 1);
  assert.ok(linesAtClose > 0);

  const resultLine = io.lines.findIndex((line) =>
    line.startsWith("result=")
  );
  assert.ok(resultLine >= 0);
  assert.ok(
    resultLine < linesAtClose,
    "the result must be printed before the pool closes"
  );
});

test("a failing pool.end() keeps the main result and reports a sanitized close error", async () => {
  const database = fakeDatabaseWithRows([
    ...READY_ROWS,
  ]);
  const io = createIo();

  const failingClosePool = {
    ...database.pool,
    async end() {
      database.calls.end += 1;
      throw new Error(
        "connection close refused for user secret_user"
      );
    },
  };

  const exitCode = await run(
    [
      "--environment",
      "test",
      "--ids",
      "1,2",
    ],
    io,
    {
      resolvePool: async () => ({
        pool: failingClosePool,
        owned: true,
      }),
    }
  );

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.match(io.output, /pool_close=failed/);
  assert.match(
    io.output,
    /failure_code=POOL_CLOSE_FAILED/
  );
  assert.match(
    io.output,
    /result=DRY_RUN_COMPLETE/
  );
  assert.equal(
    io.output.includes("secret_user"),
    false,
    "no credential may reach the output"
  );
});

test("the tool source never forces process.exit()", () => {
  const fs = require("node:fs");
  const path = require("node:path");

  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "database",
      "scripts",
      "mark-videos-remote-deleted.js"
    ),
    "utf8"
  );

  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  assert.equal(
    /process\.exit\s*\(/.test(code),
    false,
    "process.exit() must not be used to hide an open connection"
  );
  assert.equal(
    /setTimeout\s*\(/.test(code),
    false,
    "no artificial timeout may force termination"
  );
  assert.equal(
    code.includes("src/config/env"),
    false,
    "the tool must not import the frozen application config"
  );
});

test("the lifecycle fix leaves the classification of five READY videos untouched", () => {
  const {
    classifyVideo,
  } = require("../../src/modules/videos/video.remote-deletion.service");

  const verdicts = [1, 2, 3, 4, 5].map((id) =>
    classifyVideo({
      id,
      provider: "YOUTUBE",
      external_id: `synthetic-${id}`,
      upload_status: "READY",
      privacy_status: "UNLISTED",
      is_active: id % 2,
      remote_deleted_at: null,
    })
  );

  assert.deepEqual(
    verdicts.map((verdict) => verdict.outcome),
    [1, 2, 3, 4, 5].map(() => "ELIGIBLE")
  );
  assert.deepEqual(
    verdicts.map(
      (verdict) => verdict.needsDeactivation
    ),
    [false, false, false, false, false]
  );
});