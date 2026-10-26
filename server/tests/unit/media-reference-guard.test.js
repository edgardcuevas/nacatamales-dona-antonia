const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MODULES_PATH = path.resolve(
  __dirname,
  "../../src/modules"
);
const MIGRATIONS_PATH = path.resolve(
  __dirname,
  "../../database/migrations"
);

const MEDIA_REPOSITORY_PATH = path.join(
  MODULES_PATH,
  "media/media.repository.js"
);

// The four tables that hold an image reference. Every one of them has to
// be counted by countMediaReferences, otherwise an image that is still in
// use looks free and the delete fails later with a foreign key error
// instead of a clean 409.
const REFERENCING_TABLES = [
  "categories",
  "products",
  "announcements",
  "photos",
];

// A count that lives in the media row would have to be updated every
// time a publication is deleted. It would rot: a stale "in use" would
// keep an image undeletable forever, and a stale "free" would let the
// admin delete an image another row still points to. The count is always
// computed live.
const FORBIDDEN_COUNTER_COLUMNS = [
  "reference_count",
  "references_count",
  "usage_count",
  "used_count",
  "in_use",
];

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_PATH)
    .filter((name) => name.endsWith(".js"));
}

// Returns the body of a function, from its declaration up to the
// closing brace at the same indentation level.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);

  if (start === -1) {
    return null;
  }

  const end = source.indexOf("\n}", start);

  if (end === -1) {
    return null;
  }

  return source.slice(start, end);
}

test("countMediaReferences counts every table that references media", () => {
  const source = readSource(MEDIA_REPOSITORY_PATH);
  const body = extractFunction(
    source,
    "countMediaReferences"
  );

  assert.ok(
    body,
    "countMediaReferences was not found in media.repository.js"
  );

  for (const table of REFERENCING_TABLES) {
    assert.match(
      body,
      new RegExp(`FROM\\s+${table}\\b`),
      `countMediaReferences does not count ${table}, so an image used by a ${table} row would look free`
    );
  }
});

test("every table with a foreign key to media is counted", () => {
  const referencing = new Set();

  for (const name of listMigrationFiles()) {
    const source = readSource(
      path.join(MIGRATIONS_PATH, name)
    );
    let searchFrom = 0;

    for (;;) {
      const index = source.indexOf(
        'inTable("media")',
        searchFrom
      );

      if (index === -1) {
        break;
      }

      const before = source.slice(0, index);
      const altered = before.lastIndexOf("alterTable(");
      const created = before.lastIndexOf("createTable(");

      if (altered === -1 && created === -1) {
        break;
      }

      const offset = Math.max(altered, created);
      const table = before
        .slice(offset)
        .match(/["']([a-z_]+)["']/);

      if (table) {
        referencing.add(table[1]);
      }

      searchFrom = index + 1;
    }
  }

  const missing = REFERENCING_TABLES.filter(
    (table) => !referencing.has(table)
  );

  assert.deepEqual(
    missing,
    [],
    `these tables have a foreign key to media but are not counted: ${missing.join(", ")}`
  );
});

test("no migration stores a reference counter in media", () => {
  for (const name of listMigrationFiles()) {
    const source = readSource(
      path.join(MIGRATIONS_PATH, name)
    );

    for (const column of FORBIDDEN_COUNTER_COLUMNS) {
      assert.doesNotMatch(
        source,
        new RegExp(`["'\`]${column}["'\`]`),
        `migration ${name} adds "${column}" to media: the usage count must be computed live`
      );
    }
  }
});

test("deleting a publication never writes to media", () => {
  const repositories = [
    "categories/category.repository.js",
    "products/product.repository.js",
    "announcements/announcement.repository.js",
    "photos/photos.repository.js",
  ];

  for (const relativePath of repositories) {
    const source = readSource(
      path.join(MODULES_PATH, relativePath)
    );

    // Nothing in these files may write to media: the image row has to
    // survive the deletion of the row that points to it, so it becomes
    // unreferenced and the admin can delete it from the gallery.
    assert.doesNotMatch(
      source,
      /UPDATE\s+media\b/i,
      `${relativePath} updates media: deleting a publication must leave the image row untouched`
    );
    assert.doesNotMatch(
      source,
      /DELETE\s+FROM\s+media\b/i,
      `${relativePath} deletes from media: deleting a publication must leave the image row untouched`
    );
  }
});

test("each publication table deletes with a plain DELETE by id", () => {
  const deletes = {
    "categories/category.repository.js": "categories",
    "products/product.repository.js": "products",
    "announcements/announcement.repository.js": "announcements",
    "photos/photos.repository.js": "photos",
  };

  for (const [relativePath, table] of Object.entries(deletes)) {
    const source = readSource(
      path.join(MODULES_PATH, relativePath)
    );
    const statements =
      source.match(
        new RegExp(
          "DELETE FROM " + table + "[^`]*",
          "g"
        )
      ) ?? [];

    assert.ok(
      statements.length >= 1,
      `${relativePath} has no DELETE FROM ${table} statement`
    );

    for (const statement of statements) {
      assert.match(
        statement,
        /WHERE\s+id\s*=\s*\?/,
        `the DELETE FROM ${table} in ${relativePath} must filter by id with a bound parameter: ${statement}`
      );
    }
  }
});
