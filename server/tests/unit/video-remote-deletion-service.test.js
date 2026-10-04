const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REMOTE_DELETION_REJECTIONS,
  REMOTE_DELETION_OUTCOMES,
} = require("../../src/modules/videos/video.remote-deletion.constants");

const {
  RemoteDeletionRejectionError,
  classifyVideo,
  planRemoteDeletions,
  applyRemoteDeletions,
} = require("../../src/modules/videos/video.remote-deletion.service");

const DELETED_MARK_SQL_PREFIX =
  "UPDATE videos SET upload_status = 'DELETED'";
const DEACTIVATE_MARK_SQL_PREFIX =
  "UPDATE videos SET is_active = 0";

// The exact columns the transition is forbidden to touch. provider,
// external_id, url, privacy_status, thumbnail_source, thumbnail_url
// and created_at must never appear in an UPDATE.
const PRESERVED_COLUMNS = Object.freeze([
  "provider",
  "external_id",
  "url",
  "privacy_status",
  "thumbnail_source",
  "thumbnail_url",
  "created_at",
]);

const MIGRATED_SCHEMA = Object.freeze({
  hasRemoteDeletedAt: true,
  remoteDeletedAtNullable: true,
  enumAdmitsDeleted: true,
});

function normalize(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createRawVideo(overrides = {}) {
  return {
    id: 11,
    provider: "YOUTUBE",
    external_id: "synthetic-external-id",
    upload_status: "READY",
    privacy_status: "UNLISTED",
    is_active: 1,
    remote_deleted_at: null,
    ...overrides,
  };
}

// A stand-in for the mysql pool that records every statement. It only
// understands the handful of shapes the remote deletion repository
// issues, which keeps the test independent of SQL text details.
function createFakeDatabase({
  rows = [],
  schema = MIGRATED_SCHEMA,
  failUpdateAt = null,
} = {}) {
  const calls = {
    schemaQueries: 0,
    selects: [],
    updates: [],
    beginTransaction: 0,
    commit: 0,
    rollback: 0,
    release: 0,
  };

  const executor = {
    async execute(sql, parameters = []) {
      const statement = normalize(sql);

      if (statement.includes("information_schema")) {
        calls.schemaQueries += 1;

        const columns = [
          {
            COLUMN_NAME: "upload_status",
            COLUMN_TYPE: schema.enumAdmitsDeleted
              ? "enum('PENDING','UPLOADING','PROCESSING','READY','FAILED','DELETED')"
              : "enum('PENDING','UPLOADING','PROCESSING','READY','FAILED')",
            IS_NULLABLE: "NO",
          },
        ];

        if (schema.hasRemoteDeletedAt) {
          columns.push({
            COLUMN_NAME: "remote_deleted_at",
            COLUMN_TYPE: "datetime",
            IS_NULLABLE: schema
              .remoteDeletedAtNullable
              ? "YES"
              : "NO",
          });
        }

        return [columns];
      }

      if (statement.startsWith("SELECT")) {
        calls.selects.push({
          statement,
          parameters: [...parameters],
        });
        return [rows];
      }

      if (
        statement.startsWith(
          DELETED_MARK_SQL_PREFIX
        ) ||
        statement.startsWith(
          DEACTIVATE_MARK_SQL_PREFIX
        )
      ) {
        if (
          failUpdateAt !== null &&
          calls.updates.length === failUpdateAt
        ) {
          throw new Error(
            "simulated write failure"
          );
        }

        calls.updates.push({
          statement,
          parameters: [...parameters],
        });

        return [{ affectedRows: 1 }];
      }

      throw new Error(
        `unexpected statement: ${statement}`
      );
    },
  };

  const connection = {
    execute: executor.execute,
    async beginTransaction() {
      calls.beginTransaction += 1;
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
  };

  const pool = {
    execute: executor.execute,
    async getConnection() {
      return connection;
    },
  };

  return { pool, calls };
}

test("classifyVideo marks a healthy READY record as eligible", () => {
  assert.deepEqual(
    classifyVideo(createRawVideo()),
    {
      outcome: REMOTE_DELETION_OUTCOMES.ELIGIBLE,
      needsDeactivation: false,
    }
  );
});

test("classifyVideo rejects a missing record, a foreign provider, a missing external id and an unknown status", () => {
  assert.deepEqual(classifyVideo(null), {
    rejection:
      REMOTE_DELETION_REJECTIONS.RECORD_NOT_FOUND,
  });
  assert.deepEqual(
    classifyVideo(
      createRawVideo({ provider: "VIMEO" })
    ),
    {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .PROVIDER_NOT_YOUTUBE,
    }
  );
  assert.deepEqual(
    classifyVideo(
      createRawVideo({ external_id: "  " })
    ),
    {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .EXTERNAL_ID_MISSING,
    }
  );
  assert.deepEqual(
    classifyVideo(
      createRawVideo({
        upload_status: "ARCHIVED",
      })
    ),
    {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .UNKNOWN_UPLOAD_STATUS,
    }
  );
});

test("classifyVideo separates an already DELETED record from an inconsistent one", () => {
  assert.deepEqual(
    classifyVideo(
      createRawVideo({
        upload_status: "DELETED",
        is_active: 0,
        remote_deleted_at: new Date(
          "2026-01-02T03:04:05.000Z"
        ),
      })
    ),
    {
      outcome:
        REMOTE_DELETION_OUTCOMES.ALREADY_DELETED,
      needsDeactivation: false,
    }
  );

  // A DELETED row that is somehow still active is repairable, and
  // that repair is the only write allowed on it.
  assert.deepEqual(
    classifyVideo(
      createRawVideo({
        upload_status: "DELETED",
        is_active: 1,
        remote_deleted_at: new Date(
          "2026-01-02T03:04:05.000Z"
        ),
      })
    ),
    {
      outcome:
        REMOTE_DELETION_OUTCOMES.ALREADY_DELETED,
      needsDeactivation: true,
    }
  );

  assert.deepEqual(
    classifyVideo(
      createRawVideo({
        upload_status: "DELETED",
        remote_deleted_at: null,
      })
    ),
    {
      rejection:
        REMOTE_DELETION_REJECTIONS
          .DELETED_WITHOUT_TIMESTAMP,
    }
  );
});

test("planRemoteDeletions reads only and never issues an UPDATE", async () => {
  const { pool, calls } = createFakeDatabase({
    rows: [
      createRawVideo({ id: 1 }),
      createRawVideo({ id: 2 }),
    ],
  });

  const plan = await planRemoteDeletions({
    videoIds: [1, 2],
    pool,
  });

  assert.deepEqual(calls.updates, []);
  assert.equal(calls.schemaQueries, 1);
  assert.equal(calls.selects.length, 1);
  assert.deepEqual(calls.selects[0].parameters, [
    1, 2,
  ]);
  assert.deepEqual(plan.eligible, [
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
  ]);
  assert.deepEqual(plan.rejections, []);
});

test("planRemoteDeletions refuses a schema without the DELETED support", async () => {
  const missingColumn = createFakeDatabase({
    rows: [],
    schema: {
      hasRemoteDeletedAt: false,
      remoteDeletedAtNullable: true,
      enumAdmitsDeleted: true,
    },
  });

  await assert.rejects(
    planRemoteDeletions({
      videoIds: [1],
      pool: missingColumn.pool,
    }),
    (error) => {
      assert.ok(
        error instanceof
          RemoteDeletionRejectionError
      );
      assert.equal(error.kind, "SCHEMA");
      assert.deepEqual(
        error.rejections.map(
          (rejection) => rejection.code
        ),
        [
          REMOTE_DELETION_REJECTIONS
            .SCHEMA_MISSING_REMOTE_DELETED_AT,
        ]
      );
      return true;
    }
  );
  assert.deepEqual(missingColumn.calls.updates, []);

  const missingEnum = createFakeDatabase({
    rows: [],
    schema: {
      hasRemoteDeletedAt: true,
      remoteDeletedAtNullable: true,
      enumAdmitsDeleted: false,
    },
  });

  await assert.rejects(
    planRemoteDeletions({
      videoIds: [1],
      pool: missingEnum.pool,
    }),
    (error) => {
      assert.equal(error.kind, "SCHEMA");
      assert.deepEqual(
        error.rejections.map(
          (rejection) => rejection.code
        ),
        [
          REMOTE_DELETION_REJECTIONS
            .SCHEMA_MISSING_DELETED_STATUS,
        ]
      );
      return true;
    }
  );
});

test("planRemoteDeletions reports every offending id and keeps the rest classified", async () => {
  const { pool } = createFakeDatabase({
    rows: [
      createRawVideo({ id: 2 }),
      createRawVideo({
        id: 4,
        provider: "VIMEO",
      }),
    ],
  });

  const plan = await planRemoteDeletions({
    videoIds: [1, 2, 3, 4],
    pool,
  });

  assert.deepEqual(plan.rejections, [
    {
      videoId: 1,
      code: REMOTE_DELETION_REJECTIONS
        .RECORD_NOT_FOUND,
    },
    {
      videoId: 3,
      code: REMOTE_DELETION_REJECTIONS
        .RECORD_NOT_FOUND,
    },
    {
      videoId: 4,
      code: REMOTE_DELETION_REJECTIONS
        .PROVIDER_NOT_YOUTUBE,
    },
  ]);
  assert.deepEqual(
    plan.eligible.map(
      (entry) => entry.videoId
    ),
    [2]
  );
});

test("applyRemoteDeletions marks the record and preserves every other column", async () => {
  const { pool, calls } = createFakeDatabase({
    rows: [createRawVideo({ id: 7 })],
  });
  const deletedAt = new Date(
    "2026-10-03T22:10:03.000Z"
  );

  const summary = await applyRemoteDeletions({
    videoIds: [7],
    pool,
    now: () => deletedAt,
  });

  assert.equal(calls.updates.length, 1);
  const update = calls.updates[0];

  assert.ok(
    update.statement.startsWith(
      DELETED_MARK_SQL_PREFIX
    )
  );
  assert.match(update.statement, /remote_deleted_at = \?/);
  assert.match(update.statement, /is_active = 0/);
  assert.match(update.statement, /updated_at = CURRENT_TIMESTAMP/);
  assert.match(update.statement, /WHERE id = \?$/);

  for (const column of PRESERVED_COLUMNS) {
    assert.equal(
      update.statement.includes(column),
      false,
      `${column} must not appear in the update`
    );
  }

  assert.deepEqual(update.parameters, [
    deletedAt,
    7,
  ]);
  assert.deepEqual(summary.modifiedIds, [7]);
  assert.equal(summary.transaction, "committed");
  assert.equal(summary.deletedAt, deletedAt);
  assert.deepEqual(summary.rejections, []);
});

test("applyRemoteDeletions runs the whole batch in one transaction", async () => {
  const { pool, calls } = createFakeDatabase({
    rows: [
      createRawVideo({ id: 1 }),
      createRawVideo({ id: 2 }),
      createRawVideo({ id: 3 }),
    ],
  });

  const summary = await applyRemoteDeletions({
    videoIds: [1, 2, 3],
    pool,
  });

  assert.equal(calls.beginTransaction, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.rollback, 0);
  assert.equal(calls.release, 1);
  assert.equal(calls.updates.length, 3);
  assert.deepEqual(summary.modifiedIds, [1, 2, 3]);

  // One logical timestamp for every row of the run.
  const timestamps = new Set(
    calls.updates.map(
      (update) => update.parameters[0].getTime()
    )
  );
  assert.equal(timestamps.size, 1);
});

test("applyRemoteDeletions aborts the batch when any id fails validation", async () => {
  const scenarios = [
    {
      name: "a missing record",
      rows: [createRawVideo({ id: 1 })],
      expectedCode:
        REMOTE_DELETION_REJECTIONS.RECORD_NOT_FOUND,
    },
    {
      name: "a record without external id",
      rows: [
        createRawVideo({ id: 1 }),
        createRawVideo({
          id: 2,
          external_id: "",
        }),
      ],
      expectedCode:
        REMOTE_DELETION_REJECTIONS
          .EXTERNAL_ID_MISSING,
    },
    {
      name: "a DELETED record without a date",
      rows: [
        createRawVideo({ id: 1 }),
        createRawVideo({
          id: 2,
          upload_status: "DELETED",
          remote_deleted_at: null,
        }),
      ],
      expectedCode:
        REMOTE_DELETION_REJECTIONS
          .DELETED_WITHOUT_TIMESTAMP,
    },
    {
      name: "a record from another provider",
      rows: [
        createRawVideo({ id: 1 }),
        createRawVideo({
          id: 2,
          provider: "VIMEO",
        }),
      ],
      expectedCode:
        REMOTE_DELETION_REJECTIONS
          .PROVIDER_NOT_YOUTUBE,
    },
  ];

  for (const scenario of scenarios) {
    const { pool, calls } = createFakeDatabase({
      rows: scenario.rows,
    });

    await assert.rejects(
      applyRemoteDeletions({
        videoIds: [1, 2],
        pool,
      }),
      (error) => {
        assert.ok(
          error instanceof
            RemoteDeletionRejectionError
        );
        assert.equal(error.kind, "RECORD");
        assert.deepEqual(
          error.rejections,
          [
            {
              videoId: 2,
              code: scenario.expectedCode,
            },
          ]
        );
        return true;
      },
      `expected rejection for ${scenario.name}`
    );

    assert.deepEqual(calls.updates, []);
    assert.equal(calls.commit, 0);
    assert.equal(calls.rollback, 1);
    assert.equal(calls.release, 1);
  }
});

test("applyRemoteDeletions rolls everything back when a write fails midway", async () => {
  const { pool, calls } = createFakeDatabase({
    rows: [
      createRawVideo({ id: 1 }),
      createRawVideo({ id: 2 }),
      createRawVideo({ id: 3 }),
    ],
    failUpdateAt: 1,
  });

  await assert.rejects(
    applyRemoteDeletions({
      videoIds: [1, 2, 3],
      pool,
    }),
    (error) => {
      assert.equal(
        error.message,
        "simulated write failure"
      );
      assert.equal(
        error.transaction,
        "rolled_back"
      );
      return true;
    }
  );

  assert.equal(calls.beginTransaction, 1);
  assert.equal(calls.commit, 0);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.release, 1);
  assert.equal(calls.updates.length, 1);
});

test("applyRemoteDeletions leaves an already DELETED record untouched and keeps its original date", async () => {
  const originalDate = new Date(
    "2026-01-02T03:04:05.000Z"
  );
  const { pool, calls } = createFakeDatabase({
    rows: [
      createRawVideo({
        id: 5,
        upload_status: "DELETED",
        is_active: 0,
        remote_deleted_at: originalDate,
      }),
    ],
  });

  const summary = await applyRemoteDeletions({
    videoIds: [5],
    pool,
    now: () =>
      new Date("2026-10-03T22:10:03.000Z"),
  });

  assert.deepEqual(calls.updates, []);
  assert.deepEqual(summary.modifiedIds, []);
  assert.deepEqual(summary.rejections, []);
  assert.equal(summary.alreadyDeletedCount, 1);
  assert.equal(summary.transaction, "committed");

  // A second run over the same row must behave identically.
  const rerun = createFakeDatabase({
    rows: [
      createRawVideo({
        id: 5,
        upload_status: "DELETED",
        is_active: 0,
        remote_deleted_at: originalDate,
      }),
    ],
  });

  const secondSummary =
    await applyRemoteDeletions({
      videoIds: [5],
      pool: rerun.pool,
      now: () =>
        new Date("2026-10-04T00:00:00.000Z"),
    });

  assert.deepEqual(rerun.calls.updates, []);
  assert.deepEqual(
    secondSummary.modifiedIds,
    []
  );
});

test("applyRemoteDeletions only deactivates an already DELETED record that is still active", async () => {
  const { pool, calls } = createFakeDatabase({
    rows: [
      createRawVideo({
        id: 6,
        upload_status: "DELETED",
        is_active: 1,
        remote_deleted_at: new Date(
          "2026-01-02T03:04:05.000Z"
        ),
      }),
    ],
  });

  const summary = await applyRemoteDeletions({
    videoIds: [6],
    pool,
    now: () =>
      new Date("2026-10-03T22:10:03.000Z"),
  });

  assert.equal(calls.updates.length, 1);
  assert.ok(
    calls.updates[0].statement.startsWith(
      DEACTIVATE_MARK_SQL_PREFIX
    )
  );
  assert.match(
    calls.updates[0].statement,
    /upload_status = 'DELETED'\s*$/
  );
  assert.deepEqual(calls.updates[0].parameters, [6]);
  assert.deepEqual(summary.modifiedIds, [6]);
});

test("the remote deletion module graph never loads a YouTube or Google client", () => {
  const loadedPaths = Object.keys(
    require.cache
  );

  const forbidden = loadedPaths.filter(
    (loaded) =>
      loaded.includes("youtube") ||
      loaded.includes("googleapis") ||
      loaded.includes("google-auth")
  );

  assert.deepEqual(forbidden, []);
});