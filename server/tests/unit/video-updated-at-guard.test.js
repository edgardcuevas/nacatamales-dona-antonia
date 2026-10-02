const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_PATH = path.resolve(
  __dirname,
  "../../src/modules/videos/video.repository.js"
);

const SOURCE = fs.readFileSync(REPOSITORY_PATH, "utf8");

// videos.updated_at has no "ON UPDATE CURRENT_TIMESTAMP" column
// attribute, so every write is responsible for bumping it by hand.
// An UPDATE that forgets it silently freezes the public updatedAt that
// the thumbnail cache-busting relies on, and the failure is invisible:
// nothing errors and the only symptom is a stale image in visitors'
// browsers. This guard turns that into a CI failure.
//
// The scan is textual on purpose. These statements are plain template
// literals with no interpolation and no nested backticks, so the text
// between "UPDATE videos" and the next backtick is the whole statement.
function extractUpdateStatements(source) {
  const statements = [];
  const marker = "UPDATE videos";
  let searchFrom = 0;

  for (;;) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) {
      return statements;
    }

    const end = source.indexOf("`", start);
    assert.notEqual(
      end,
      -1,
      "an UPDATE videos statement is not a plain template literal"
    );

    statements.push({
      offset: start,
      sql: source.slice(start, end),
    });
    searchFrom = end;
  }
}

test("video repository contains UPDATE videos statements to guard", () => {
  const statements = extractUpdateStatements(SOURCE);

  assert.ok(
    statements.length >= 3,
    `expected at least 3 UPDATE videos statements, found ${statements.length}`
  );
});

test("every UPDATE videos statement bumps updated_at", () => {
  const statements = extractUpdateStatements(SOURCE);

  for (const statement of statements) {
    assert.match(
      statement.sql,
      /updated_at\s*=\s*CURRENT_TIMESTAMP/,
      `an UPDATE videos statement near offset ${statement.offset} does not set updated_at: ${statement.sql}`
    );
  }
});

test("no UPDATE videos statement writes updated_at through user input", () => {
  const statements = extractUpdateStatements(SOURCE);

  for (const statement of statements) {
    // The timestamp must be a literal, never a bound parameter, or a
    // caller could control it.
    assert.doesNotMatch(
      statement.sql,
      /updated_at\s*=\s*\?/
    );
    assert.doesNotMatch(
      statement.sql,
      /updated_at\s*=\s*\$\{/
    );
  }
});

test("updated_at is never a column in an INSERT column list", () => {
  // created_at and updated_at must keep their column defaults. An
  // explicit INSERT value would be copied instead of computed.
  const insertStatements =
    SOURCE.match(/INSERT INTO videos \([^)]*\)/g) ?? [];

  for (const statement of insertStatements) {
    assert.doesNotMatch(
      statement,
      /updated_at/
    );
  }
});