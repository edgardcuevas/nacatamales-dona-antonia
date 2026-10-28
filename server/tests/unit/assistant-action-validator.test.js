const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require(
  "../../src/errors/app-error"
);
const {
  parseActionToken,
  assertEmptyActionBody,
  validateAssistantActionToken,
  validateEmptyAssistantActionBody,
} = require(
  "../../src/modules/assistant/assistant.action.validator"
);

test("action tokens must be base64url encodings of 32 bytes", () => {
  const token = "A".repeat(43);
  assert.equal(parseActionToken(token), token);

  for (const invalid of [
    undefined,
    "",
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}!`,
  ]) {
    assert.throws(
      () => parseActionToken(invalid),
      (error) =>
        error instanceof AppError &&
        error.statusCode === 404 &&
        error.code === "ASSISTANT_ACTION_NOT_FOUND"
    );
  }
});

test("confirm and cancel accept only an empty object body", () => {
  assert.doesNotThrow(() => assertEmptyActionBody({}));

  for (const invalid of [
    undefined,
    null,
    [],
    { targetId: 12 },
  ]) {
    assert.throws(
      () => assertEmptyActionBody(invalid),
      AppError
    );
  }
});

test("action validators attach parsed values to the request", () => {
  const tokenRequest = {
    params: { token: "A".repeat(43) },
  };
  let tokenNext;
  validateAssistantActionToken(
    tokenRequest,
    {},
    (error) => {
      tokenNext = error;
    }
  );
  assert.equal(tokenNext, undefined);
  assert.equal(
    tokenRequest.assistantActionToken,
    tokenRequest.params.token
  );

  const bodyRequest = { body: {} };
  let bodyNext;
  validateEmptyAssistantActionBody(
    bodyRequest,
    {},
    (error) => {
      bodyNext = error;
    }
  );
  assert.equal(bodyNext, undefined);
});
