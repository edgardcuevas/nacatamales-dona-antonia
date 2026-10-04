// Maintenance tool: marks local videos as DELETED when their remote
// YouTube resource is no longer available.
//
// Safety model:
//   - dry-run by default, no UPDATE without --apply;
//   - development additionally requires the exact confirmation phrase;
//   - production is refused outright;
//   - explicit local ids only, no ranges, no wildcards, no "all";
//   - one transaction for the whole batch, all or nothing;
//   - never deletes a row and never contacts the provider.
//
// Usage:
//   npm run videos:mark-remote-deleted -- \
//     --environment development --ids 1,2,3 --apply \
//     --confirm MARK_REMOTE_DELETED

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const {
  REMOTE_DELETION_ENVIRONMENTS,
  REMOTE_DELETION_REFUSED_ENVIRONMENTS,
  REMOTE_DELETION_CONFIRMATION_PHRASE,
  REMOTE_DELETION_OPERATION,
  REMOTE_DELETION_ACTOR,
  REMOTE_DELETION_OUTCOMES,
  MAX_REMOTE_DELETION_IDS,
  EXIT_CODES,
  EXIT_CODE_DESCRIPTIONS,
} = require("../../src/modules/videos/video.remote-deletion.constants");

const {
  RemoteDeletionRejectionError,
  planRemoteDeletions,
  applyRemoteDeletions,
  summarize,
} = require("../../src/modules/videos/video.remote-deletion.service");

const SERVER_ROOT = path.join(__dirname, "..", "..");

const ENVIRONMENT_FILES = Object.freeze({
  development: ".env",
  test: ".env.test",
});

const DATABASE_VARIABLES = Object.freeze([
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
]);

const TEST_DATABASE_SUFFIX = "_test";

const USAGE = [
  "Usage:",
  "  node database/scripts/mark-videos-remote-deleted.js \\",
  "    --environment <development|test> --ids <id,id,...> \\",
  "    [--apply] [--confirm MARK_REMOTE_DELETED]",
  "",
  "Modes:",
  "  dry-run (default)  read-only, reports what would change",
  "  --apply            writes inside one transaction",
  "",
  "Exit codes:",
  ...Object.entries(EXIT_CODE_DESCRIPTIONS).map(
    ([code, description]) =>
      `  ${code}  ${description}`
  ),
].join("\n");

// Each failure carries the exit code it must produce, so the mapping
// lives next to the check that can trigger it.
class ToolError extends Error {
  constructor(code, exitCode) {
    super(code);
    this.name = "ToolError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, exitCode) {
  throw new ToolError(code, exitCode);
}

// Digits only. This single rule is what rejects 0 as a value, ranges
// like 1-5, decimals, wildcards, "all" and free text.
const POSITIVE_INTEGER_PATTERN = /^\d+$/;

function parseVideoIds(rawValue) {
  if (
    typeof rawValue !== "string" ||
    rawValue.trim() === ""
  ) {
    return fail(
      "IDS_REQUIRED",
      EXIT_CODES.INVALID_INPUT
    );
  }

  const videoIds = [];
  const seen = new Set();

  for (const token of rawValue.split(",")) {
    const trimmed = token.trim();

    if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
      return fail(
        "ID_LIST_MALFORMED",
        EXIT_CODES.INVALID_INPUT
      );
    }

    const videoId = Number(trimmed);

    if (
      !Number.isSafeInteger(videoId) ||
      videoId < 1
    ) {
      return fail(
        "ID_LIST_MALFORMED",
        EXIT_CODES.INVALID_INPUT
      );
    }

    if (seen.has(videoId)) {
      return fail(
        "DUPLICATE_ID",
        EXIT_CODES.INVALID_INPUT
      );
    }

    seen.add(videoId);
    videoIds.push(videoId);
  }

  if (videoIds.length > MAX_REMOTE_DELETION_IDS) {
    return fail(
      "TOO_MANY_IDS",
      EXIT_CODES.INVALID_INPUT
    );
  }

  return videoIds;
}

function parseEnvironment(rawValue) {
  if (
    typeof rawValue !== "string" ||
    rawValue.trim() === ""
  ) {
    return fail(
      "ENVIRONMENT_REQUIRED",
      EXIT_CODES.INVALID_INPUT
    );
  }

  const environment = rawValue.trim();

  if (
    REMOTE_DELETION_REFUSED_ENVIRONMENTS.includes(
      environment
    )
  ) {
    return fail(
      "ENVIRONMENT_PRODUCTION_DISABLED",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  if (
    !REMOTE_DELETION_ENVIRONMENTS.includes(
      environment
    )
  ) {
    return fail(
      "ENVIRONMENT_UNKNOWN",
      EXIT_CODES.INVALID_INPUT
    );
  }

  return environment;
}

function parseArguments(argv) {
  const parsed = {
    environment: null,
    videoIds: null,
    apply: false,
    confirm: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--environment":
      case "--ids":
      case "--confirm": {
        const value = argv[index + 1];

        if (value === undefined) {
          return fail(
            "FLAG_VALUE_MISSING",
            EXIT_CODES.INVALID_INPUT
          );
        }

        index += 1;

        if (token === "--environment") {
          parsed.environment =
            parseEnvironment(value);
        } else if (token === "--ids") {
          parsed.videoIds =
            parseVideoIds(value);
        } else {
          parsed.confirm = value;
        }

        break;
      }

      case "--apply": {
        parsed.apply = true;
        break;
      }

      default: {
        return fail(
          "UNKNOWN_OPTION",
          EXIT_CODES.INVALID_INPUT
        );
      }
    }
  }

  if (parsed.environment === null) {
    return fail(
      "ENVIRONMENT_REQUIRED",
      EXIT_CODES.INVALID_INPUT
    );
  }

  if (parsed.videoIds === null) {
    return fail(
      "IDS_REQUIRED",
      EXIT_CODES.INVALID_INPUT
    );
  }

  if (
    parsed.confirm !== null &&
    parsed.confirm !==
      REMOTE_DELETION_CONFIRMATION_PHRASE
  ) {
    return fail(
      "CONFIRMATION_PHRASE_INVALID",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  // Writing to development needs the phrase on top of --apply. The
  // test environment is disposable and isolated, so --apply alone is
  // enough there.
  if (
    parsed.apply &&
    parsed.environment === "development" &&
    parsed.confirm !==
      REMOTE_DELETION_CONFIRMATION_PHRASE
  ) {
    return fail(
      "APPLY_REQUIRES_CONFIRMATION",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  return parsed;
}

function readDatabaseVariable(name) {
  const value = process.env[name];

  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return fail(
      "DATABASE_CONFIGURATION_INCOMPLETE",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  return value.trim();
}

// process.loadEnvFile does not overwrite variables that already exist,
// so the database variables are cleared first. Without this, a DB_NAME
// inherited from the shell could silently redirect the run to another
// database than the file names.
function loadEnvironmentFile(environment) {
  const fileName = ENVIRONMENT_FILES[environment];
  const absolutePath = path.join(
    SERVER_ROOT,
    fileName
  );

  if (!fs.existsSync(absolutePath)) {
    return fail(
      "ENVIRONMENT_FILE_MISSING",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  for (const name of DATABASE_VARIABLES) {
    delete process.env[name];
  }

  // Pinned so the run is deterministic regardless of the shell.
  process.env.NODE_ENV = environment;

  process.loadEnvFile(absolutePath);

  const databaseName = readDatabaseVariable(
    "DB_NAME"
  );

  if (environment === "test") {
    if (
      !databaseName
        .toLowerCase()
        .endsWith(TEST_DATABASE_SUFFIX)
    ) {
      return fail(
        "DATABASE_SUFFIX_INVALID",
        EXIT_CODES.UNSAFE_CONFIGURATION
      );
    }
  } else if (
    databaseName
      .toLowerCase()
      .endsWith(TEST_DATABASE_SUFFIX)
  ) {
    return fail(
      "DATABASE_SUFFIX_INVALID",
      EXIT_CODES.UNSAFE_CONFIGURATION
    );
  }

  return { fileName, databaseName };
}

// The pool always belongs to this process. The shared application pool
// in src/database/pool.js is deliberately never imported: it is a
// singleton that other modules and tests require, it enables TCP
// keep-alive, and closing it here would reach beyond the tool. That
// keep-alive is also what used to keep the event loop alive after the
// dry-run had finished, leaving the CLI hanging forever.
function createOwnedPool(databaseName) {
  return mysql.createPool({
    host: readDatabaseVariable("DB_HOST"),
    port: Number(
      readDatabaseVariable("DB_PORT")
    ),
    database: databaseName,
    user: readDatabaseVariable("DB_USER"),
    password: readDatabaseVariable(
      "DB_PASSWORD"
    ),
    waitForConnections: true,
    connectionLimit: 2,
  });
}

// Returns a pool the caller must always close. src/config/env.js is
// not required either: it freezes the whole application configuration
// at require time, which is exactly the kind of cross-environment
// coupling this tool avoids, and the tool only needs the DB_*
// variables of the explicitly selected file.
function resolvePool(environment) {
  const context = loadEnvironmentFile(environment);

  return {
    pool: createOwnedPool(context.databaseName),
    owned: true,
    ...context,
  };
}

function formatList(values) {
  return values.length > 0
    ? values.join(",")
    : "none";
}

// Sanitized by construction: only counts, local ids and outcome codes
// leave the tool. No title, url, external_id, channel id, token or
// credential is ever read into the summary.
function formatSummary({
  summary,
  environment,
  mode,
  plan,
}) {
  const lines = [
    `operation=${REMOTE_DELETION_OPERATION}`,
    `environment=${environment}`,
    `mode=${mode}`,
    `requested_count=${summary.requestedCount}`,
    `requested_ids=${formatList(
      summary.requestedIds
    )}`,
    `eligible_count=${summary.eligibleCount}`,
    `already_deleted_count=${summary.alreadyDeletedCount}`,
    `modified_count=${summary.modifiedCount}`,
    `modified_ids=${formatList(
      summary.modifiedIds
    )}`,
  ];

  if (plan) {
    lines.push(
      `per_video=${formatList(
        plan.entries.map(
          (entry) =>
            `${entry.videoId}:${entry.outcome}`
        )
      )}`
    );
  }

  if (summary.rejections.length > 0) {
    lines.push(
      `rejections=${formatList(
        summary.rejections.map(
          (rejection) =>
            `${rejection.videoId}:${rejection.code}`
        )
      )}`
    );
  }

  lines.push(
    `transaction=${summary.transaction}`,
    `deleted_at=${
      summary.deletedAt === null
        ? "none"
        : summary.deletedAt.toISOString()
    }`,
    `actor=${REMOTE_DELETION_ACTOR}`,
    `result=${
      summary.transaction === "committed"
        ? "APPLIED"
        : summary.rejections.length > 0
          ? "REJECTED"
          : "DRY_RUN_COMPLETE"
    }`
  );

  return lines;
}

function formatErrorLines(error) {
  return [
    `result=FAILED`,
    `failure_code=${error.code}`,
    `exit_code=${error.exitCode}`,
  ];
}

async function run(
  argv,
  io = console,
  // Narrow testability seam. The default resolves the real pool, so a
  // CLI invocation is unchanged.
  overrides = {}
) {
  const resolveTargetPool =
    overrides.resolvePool ?? resolvePool;

  let options;

  try {
    options = parseArguments(argv);
  } catch (error) {
    if (!(error instanceof ToolError)) {
      throw error;
    }

    io.log(USAGE);
    formatErrorLines(error).forEach((line) =>
      io.log(line)
    );

    return error.exitCode;
  }

  const mode = options.apply ? "apply" : "dry-run";

  let pool;

  try {
    const resolved = await resolveTargetPool(
      options.environment
    );
    pool = resolved.pool;

    if (options.apply) {
      const summary =
        await applyRemoteDeletions({
          videoIds: options.videoIds,
          pool,
        });

      formatSummary({
        summary,
        environment: options.environment,
        mode,
        plan: null,
      }).forEach((line) => io.log(line));

      return EXIT_CODES.OK;
    }

    const plan = await planRemoteDeletions({
      videoIds: options.videoIds,
      pool,
    });

    const summary = summarize({
      videoIds: options.videoIds,
      plan,
      mode,
      modifiedIds: [],
      transaction: "none",
      deletedAt: null,
    });

    formatSummary({
      summary,
      environment: options.environment,
      mode,
      plan,
    }).forEach((line) => io.log(line));

    if (plan.rejections.length > 0) {
      return EXIT_CODES.RECORDS_NOT_ELIGIBLE;
    }

    return EXIT_CODES.OK;
  } catch (error) {
    if (
      error instanceof
      RemoteDeletionRejectionError
    ) {
      io.log(`result=REJECTED`);
      io.log(
        `rejections=${formatList(
          error.rejections.map(
            (rejection) =>
              `${rejection.videoId}:${rejection.code}`
          )
        )}`
      );
      io.log(
        `actor=${REMOTE_DELETION_ACTOR}`
      );

      return error.kind === "SCHEMA"
        ? EXIT_CODES.UNSAFE_CONFIGURATION
        : EXIT_CODES.RECORDS_NOT_ELIGIBLE;
    }

    if (error instanceof ToolError) {
      formatErrorLines(error).forEach((line) =>
        io.log(line)
      );

      return error.exitCode;
    }

    io.log(`result=FAILED`);
    io.log(
      `failure_code=${
        error.transaction === "rolled_back"
          ? "TRANSACTION_ROLLED_BACK"
          : "UNEXPECTED_FAILURE"
      }`
    );
    io.log(`exit_code=${EXIT_CODES.TRANSACTION_FAILURE}`);

    return EXIT_CODES.TRANSACTION_FAILURE;
  } finally {
    // Every pool this script creates is closed here, once, whether the
    // run succeeded or failed. The summary is already on stdout by
    // this point, so the complete result always reaches the terminal
    // before the connection goes away. No process.exit() and no
    // artificial timeout: ending the pool is what lets the event loop
    // drain on its own.
    await closeOwnedPool(pool, io);
  }
}

async function closeOwnedPool(pool, io) {
  if (!pool) {
    return;
  }

  try {
    await pool.end();
  } catch {
    // The main result is already decided and must not be discarded
    // because the connection could not be closed.
    io.log("pool_close=failed");
    io.log("failure_code=POOL_CLOSE_FAILED");
  }
}

module.exports = {
  run,
  parseArguments,
  parseVideoIds,
  formatSummary,
  ToolError,
  __testing: {
    USAGE,
    ENVIRONMENT_FILES,
    DATABASE_VARIABLES,
    TEST_DATABASE_SUFFIX,
    POSITIVE_INTEGER_PATTERN,
    MAX_REMOTE_DELETION_IDS,
    REMOTE_DELETION_CONFIRMATION_PHRASE,
    REMOTE_DELETION_OUTCOMES,
    loadEnvironmentFile,
  },
};

if (require.main === module) {
  run(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.exitCode =
        EXIT_CODES.TRANSACTION_FAILURE;
    });
}