const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_TOOL_RESULT_CHARS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);
const {
  serializeAssistantToolResult,
  TRUNCATION_NOTICE,
} = require(
  "../../src/modules/assistant/assistant.tool-result"
);

test("a result at the character limit is passed without truncation", () => {
  const value = "x".repeat(MAX_TOOL_RESULT_CHARS - 2);
  const serialized =
    serializeAssistantToolResult(value);

  assert.equal(serialized.length, MAX_TOOL_RESULT_CHARS);
  assert.equal(JSON.parse(serialized), value);
});

test("an oversized result is valid JSON and explicitly reports truncation", () => {
  const serialized = serializeAssistantToolResult({
    records: ["a".repeat(MAX_TOOL_RESULT_CHARS * 2)],
  });
  const parsed = JSON.parse(serialized);

  assert.ok(serialized.length <= MAX_TOOL_RESULT_CHARS);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.notice, TRUNCATION_NOTICE);
  assert.equal(typeof parsed.preview, "string");
  assert.ok(parsed.preview.length > 0);
});

test("truncation preserves Unicode code points and the global character budget", () => {
  const serialized = serializeAssistantToolResult({
    text: "🌮".repeat(MAX_TOOL_RESULT_CHARS * 2),
  });
  const parsed = JSON.parse(serialized);

  assert.ok(serialized.length <= MAX_TOOL_RESULT_CHARS);
  assert.equal(parsed.truncated, true);
  assert.doesNotMatch(parsed.preview, /�/);
});

test("small object and list results keep their original JSON shape", () => {
  const value = {
    count: 2,
    products: [{ name: "Nacatamal" }],
  };
  const serialized =
    serializeAssistantToolResult(value);

  assert.deepEqual(JSON.parse(serialized), value);
  assert.equal(JSON.parse(serialized).truncated, undefined);
});

test("non-JSON results are surfaced as serialization errors", () => {
  assert.throws(
    () => serializeAssistantToolResult(undefined),
    /must be JSON serializable/
  );
  assert.throws(
    () => serializeAssistantToolResult(1n),
    TypeError
  );

  const circular = {};
  circular.self = circular;

  assert.throws(
    () => serializeAssistantToolResult(circular),
    TypeError
  );
});
