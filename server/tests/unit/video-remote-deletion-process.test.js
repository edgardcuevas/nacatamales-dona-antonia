// Regression tests for the process lifecycle of the maintenance CLI.
//
// The original defect was not a wrong value: it was a process that
// never exited. A unit test with an injected pool cannot catch that,
// because the fake pool holds no open handle. These tests therefore run
// the tool in a real child process whose fake pool deliberately holds
// an open interval, exactly like a mysql2 keep-alive socket, and then
// require the child to terminate on its own.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  after,
  before,
} = require("node:test");
const {
  execFile,
} = require("node:child_process");

const SERVER_ROOT = path.join(__dirname, "..", "..");
const SCRIPT_PATH = path.join(
  SERVER_ROOT,
  "database",
  "scripts",
  "mark-videos-remote-deleted.js"
);

const CHILD_TIMEOUT_MS = 30_000;

let workingDirectory;

// A fake pool that behaves like the real one at the only level that
// matters here: it keeps the event loop busy until end() is called.
const DRIVER_SOURCE = `
const path = require("node:path");

const { run } = require(${JSON.stringify(
  SCRIPT_PATH
)});

const handle = { timer: null };

function openHandle() {
  if (handle.timer === null) {
    handle.timer = setInterval(() => {}, 1000);
  }
}

function closeHandle() {
  if (handle.timer !== null) {
    clearInterval(handle.timer);
    handle.timer = null;
  }
}

let endCalls = 0;

const readyRows = [1, 2].map((id) => ({
  id,
  provider: "YOUTUBE",
  external_id: "synthetic-" + id,
  upload_status: "READY",
  privacy_status: "UNLISTED",
  is_active: id % 2,
  remote_deleted_at: null,
}));

async function execute(sql) {
  const statement = String(sql).replace(/\\s+/g, " ").trim();

  if (statement.includes("information_schema")) {
    return [[
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
    ]];
  }

  if (statement.startsWith("SELECT")) {
    return [readyRows];
  }

  return [{ affectedRows: 1 }];
}

const connection = {
  execute,
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
};

const pool = {
  execute,
  async getConnection() {
    return connection;
  },
  async end() {
    endCalls += 1;
    closeHandle();
  },
};

const io = { log: (line) => console.log(line) };

const argv = JSON.parse(process.argv[2]);

run(argv, io, {
  // The handle is opened only when the tool actually creates a pool,
  // so an invalid argument list leaves nothing to keep the loop alive.
  resolvePool: async () => {
    openHandle();
    return { pool, owned: true };
  },
})
  .then((exitCode) => {
    console.log("driver_exit_code=" + exitCode);
    console.log("driver_pool_end_calls=" + endCalls);

    const loaded = Object.keys(require.cache).filter(
      (entry) =>
        entry.includes("modules\\\\youtube") ||
        entry.includes("modules/youtube") ||
        entry.includes("googleapis") ||
        entry.endsWith("src\\\\database\\\\pool.js") ||
        entry.endsWith("src/database/pool.js")
    );
    console.log(
      "driver_forbidden_modules=" + JSON.stringify(loaded)
    );

    // The tool already closed the pool; this only propagates the exit
    // code the same way the real entry point does.
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.log("driver_error=" + error.message);
    process.exitCode = 70;
  });
`;

before(() => {
  workingDirectory =
    fs.mkdtempSync(
      path.join(os.tmpdir(), "remote-deletion-driver-")
    );

  fs.writeFileSync(
    path.join(workingDirectory, "driver.js"),
    DRIVER_SOURCE,
    "utf8"
  );
});

after(() => {
  fs.rmSync(workingDirectory, {
    recursive: true,
    force: true,
  });
});

// execFile resolves only when the child exits on its own. If it were
// killed by the timeout the callback reports killed + signal, which is
// exactly the failure this suite exists to detect.
function spawnDriver(argv) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        path.join(workingDirectory, "driver.js"),
        JSON.stringify(argv),
      ],
      {
        cwd: workingDirectory,
        timeout: CHILD_TIMEOUT_MS,
        killSignal: "SIGTERM",
      },
      (error, stdout, stderr) => {
        resolve({
          killed:
            error?.killed === true,
          signal: error?.signal ?? null,
          exitCode: error?.code ?? 0,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        });
      }
    );
  });
}

function field(stdout, name) {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) =>
      candidate.startsWith(`${name}=`)
    );

  return line === undefined
    ? null
    : line.slice(name.length + 1);
}

test("the CLI process terminates by itself after a valid dry run", async () => {
  const result = await spawnDriver([
    "--environment",
    "test",
    "--ids",
    "1,2",
  ]);

  assert.equal(
    result.killed,
    false,
    "the child must not be killed by the timeout"
  );
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 0);
  assert.ok(
    result.durationMs < 20_000,
    `the child took ${result.durationMs}ms to exit`
  );

  assert.equal(
    field(result.stdout, "mode"),
    "dry-run"
  );
  assert.equal(
    field(result.stdout, "result"),
    "DRY_RUN_COMPLETE"
  );
  assert.equal(
    field(result.stdout, "driver_exit_code"),
    "0"
  );
  assert.equal(
    field(result.stdout, "driver_pool_end_calls"),
    "1"
  );
  assert.equal(
    field(result.stdout, "driver_forbidden_modules"),
    "[]"
  );
});

test("the CLI process terminates with the argument error code", async () => {
  const result = await spawnDriver([
    "--environment",
    "test",
  ]);

  assert.equal(result.killed, false);
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 1);
  assert.equal(
    field(result.stdout, "driver_exit_code"),
    "1"
  );
  assert.equal(
    field(result.stdout, "driver_pool_end_calls"),
    "0",
    "no pool is created when the arguments are invalid"
  );
});

test("the CLI process terminates with the unsafe configuration code for production", async () => {
  const result = await spawnDriver([
    "--environment",
    "production",
    "--ids",
    "1",
  ]);

  assert.equal(result.killed, false);
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 2);
  assert.equal(
    field(result.stdout, "driver_exit_code"),
    "2"
  );
  assert.equal(
    field(result.stdout, "driver_pool_end_calls"),
    "0"
  );
});

test("the CLI process terminates after a simulated apply and closes the pool once", async () => {
  const result = await spawnDriver([
    "--environment",
    "test",
    "--ids",
    "1,2",
    "--apply",
  ]);

  assert.equal(result.killed, false);
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 0);
  assert.equal(
    field(result.stdout, "result"),
    "APPLIED"
  );
  assert.equal(
    field(result.stdout, "transaction"),
    "committed"
  );
  assert.equal(
    field(result.stdout, "driver_pool_end_calls"),
    "1"
  );
});

test("the driver never loads a provider client or the shared pool", async () => {
  const result = await spawnDriver([
    "--environment",
    "test",
    "--ids",
    "1",
  ]);

  assert.equal(
    field(result.stdout, "driver_forbidden_modules"),
    "[]"
  );
  assert.equal(
    result.stdout.includes("http"),
    false
  );
  assert.equal(
    result.stdout.includes("synthetic"),
    false
  );
});