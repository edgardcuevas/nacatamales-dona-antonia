const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AssistantToolError,
  TOOL_ERROR_CODES,
  createAssistantToolRegistry,
} = require(
  "../../src/modules/assistant/assistant.tool-registry"
);

const PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    categoryId: {
      type: "integer",
    },
    includeInactive: {
      type: "boolean",
    },
  },
  required: ["categoryId"],
  additionalProperties: false,
});

function createTool(overrides = {}) {
  return {
    name: "count_products",
    description: "Count products in the selected category",
    parameters: PARAMETERS,
    allowedRoles: ["ADMIN", "EDITOR"],
    mode: "read",
    handler: async () => ({ total: 3 }),
    ...overrides,
  };
}

test("an empty registry exposes no tools", () => {
  const registry = createAssistantToolRegistry();

  assert.deepEqual(
    registry.getToolDeclarations("ADMIN"),
    []
  );
  assert.deepEqual(
    registry.getToolDeclarations("EDITOR"),
    []
  );
});

test("tool declarations are immutable and never expose handlers", () => {
  const registry = createAssistantToolRegistry([
    createTool(),
    createTool({
      name: "admin_only_lookup",
      allowedRoles: ["ADMIN"],
    }),
  ]);

  const editorDeclarations =
    registry.getToolDeclarations("EDITOR");
  const adminDeclarations =
    registry.getToolDeclarations("ADMIN");

  assert.deepEqual(
    editorDeclarations.map((tool) => tool.name),
    ["count_products"]
  );
  assert.deepEqual(
    adminDeclarations.map((tool) => tool.name),
    ["count_products", "admin_only_lookup"]
  );
  assert.equal(
    Object.hasOwn(editorDeclarations[0], "handler"),
    false
  );
  assert.equal(Object.isFrozen(editorDeclarations), true);
  assert.equal(
    Object.isFrozen(editorDeclarations[0].parameters),
    true
  );
  assert.throws(
    () => registry.getToolDeclarations("admin"),
    TypeError
  );
});

test("execution revalidates role and passes only validated frozen arguments", async () => {
  let receivedArguments;
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async (arguments_) => {
        receivedArguments = arguments_;
        return { total: 3 };
      },
    }),
  ]);
  const input = {
    categoryId: 7,
    includeInactive: false,
  };

  const result = await registry.executeToolCall({
    name: "count_products",
    arguments: input,
    role: "EDITOR",
  });

  assert.deepEqual(JSON.parse(result), { total: 3 });
  assert.deepEqual(receivedArguments, input);
  assert.equal(Object.isFrozen(receivedArguments), true);
});

test("execution rejects unknown tools, unauthorized roles and invalid arguments", async () => {
  const registry = createAssistantToolRegistry([
    createTool({
      allowedRoles: ["ADMIN"],
    }),
  ]);

  await assert.rejects(
    registry.executeToolCall({
      name: "not_registered",
      arguments: { categoryId: 1 },
      role: "ADMIN",
    }),
    (error) =>
      error instanceof AssistantToolError &&
      error.code === TOOL_ERROR_CODES.UNKNOWN_TOOL
  );

  await assert.rejects(
    registry.executeToolCall({
      name: "count_products",
      arguments: { categoryId: 1 },
      role: "EDITOR",
    }),
    (error) =>
      error instanceof AssistantToolError &&
      error.code === TOOL_ERROR_CODES.FORBIDDEN_TOOL
  );

  for (const arguments_ of [
    { categoryId: 1, unexpected: true },
    { categoryId: "1" },
    { categoryId: 1, includeInactive: "false" },
    {},
    null,
  ]) {
    await assert.rejects(
      registry.executeToolCall({
        name: "count_products",
        arguments: arguments_,
        role: "ADMIN",
      }),
      (error) =>
        error instanceof AssistantToolError &&
        error.code ===
          TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS
    );
  }
});

test("nested arguments are checked against their exact schema", async () => {
  let handlerCalls = 0;
  const registry = createAssistantToolRegistry([
    createTool({
      parameters: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              active: { type: "boolean" },
            },
            required: ["active"],
            additionalProperties: false,
          },
        },
        required: ["filters"],
        additionalProperties: false,
      },
      handler: async () => {
        handlerCalls += 1;
        return { total: 0 };
      },
    }),
  ]);

  await registry.executeToolCall({
    name: "count_products",
    arguments: { filters: { active: true } },
    role: "ADMIN",
  });

  await assert.rejects(
    registry.executeToolCall({
      name: "count_products",
      arguments: {
        filters: { active: true, deleted: true },
      },
      role: "ADMIN",
    }),
    (error) =>
      error.code ===
      TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS
  );

  assert.equal(handlerCalls, 1);
});

test("every executed tool result is serialized and bounded", async () => {
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async () => ({
        description: "a".repeat(7_000),
      }),
    }),
  ]);

  const result = await registry.executeToolCall({
    name: "count_products",
    arguments: { categoryId: 1 },
    role: "ADMIN",
  });
  const parsed = JSON.parse(result);

  assert.ok(result.length <= 6_000);
  assert.equal(parsed.truncated, true);
  assert.match(parsed.notice, /truncado/);
});

test("registry rejects duplicate names, write modes and permissive schemas", () => {
  assert.throws(
    () =>
      createAssistantToolRegistry([
        createTool(),
        createTool(),
      ]),
    /Duplicate assistant tool name/
  );

  assert.throws(
    () =>
      createAssistantToolRegistry([
        createTool({ mode: "write" }),
      ]),
    /must use read mode/
  );

  assert.throws(
    () =>
      createAssistantToolRegistry([
        createTool({
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
        }),
      ]),
    /additionalProperties: false/
  );

  assert.throws(
    () =>
      createAssistantToolRegistry([
        createTool({
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
            anyOf: [],
          },
        }),
      ]),
    /Unsupported assistant tool schema field/
  );

  assert.throws(
    () =>
      createAssistantToolRegistry([
        createTool({ writeHandler: async () => {} }),
      ]),
    /unsupported fields/
  );
});
