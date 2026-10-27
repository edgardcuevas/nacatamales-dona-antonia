const TOOL_ROLES = Object.freeze([
  "ADMIN",
  "EDITOR",
]);
const {
  MAX_TOOL_HANDLER_TIMEOUT_MS,
} = require("./assistant.constants");
const {
  serializeAssistantToolResult,
} = require("./assistant.tool-result");

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const TOOL_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
]);
const TOOL_ERROR_CODES = Object.freeze({
  UNKNOWN_TOOL: "UNKNOWN_TOOL",
  FORBIDDEN_TOOL: "FORBIDDEN_TOOL",
  INVALID_TOOL_ARGUMENTS: "INVALID_TOOL_ARGUMENTS",
  TIMEOUT: "TOOL_TIMEOUT",
});

class AssistantToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AssistantToolError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function cloneSchema(schema) {
  if (Array.isArray(schema)) {
    return schema.map(cloneSchema);
  }

  if (isPlainObject(schema)) {
    return Object.fromEntries(
      Object.entries(schema).map(([key, value]) => [
        key,
        cloneSchema(value),
      ])
    );
  }

  return schema;
}

function assertSchema(schema, path = "parameters") {
  if (
    !isPlainObject(schema) ||
    !TOOL_SCHEMA_TYPES.has(schema.type)
  ) {
    throw new TypeError(
      `Invalid assistant tool schema at ${path}`
    );
  }

  const allowedSchemaKeys =
    schema.type === "object"
      ? new Set([
          "type",
          "properties",
          "required",
          "additionalProperties",
        ])
      : schema.type === "array"
        ? new Set(["type", "items"])
        : new Set(["type", "enum"]);

  if (
    Object.keys(schema).some(
      (key) => !allowedSchemaKeys.has(key)
    )
  ) {
    throw new TypeError(
      `Unsupported assistant tool schema field at ${path}`
    );
  }

  if (schema.enum !== undefined) {
    if (
      !Array.isArray(schema.enum) ||
      schema.enum.length === 0 ||
      schema.enum.some(
        (value) =>
          value === null ||
          typeof value === "object" ||
          !["string", "number", "boolean"].includes(
            typeof value
          )
      )
    ) {
      throw new TypeError(
        `Invalid assistant tool enum at ${path}`
      );
    }

    if (
      schema.enum.some((value) => {
        if (schema.type === "integer") {
          return !Number.isSafeInteger(value);
        }
        if (schema.type === "number") {
          return (
            typeof value !== "number" ||
            !Number.isFinite(value)
          );
        }
        return typeof value !== schema.type;
      })
    ) {
      throw new TypeError(
        `Assistant tool enum values must match ${schema.type} at ${path}`
      );
    }
  }

  if (schema.type === "object") {
    if (
      !isPlainObject(schema.properties) ||
      schema.additionalProperties !== false ||
      (schema.required !== undefined &&
        (!Array.isArray(schema.required) ||
          schema.required.some(
            (key) =>
              typeof key !== "string" ||
              !Object.hasOwn(schema.properties, key)
          )))
    ) {
      throw new TypeError(
        `Assistant tool objects must declare properties, required fields and additionalProperties: false at ${path}`
      );
    }

    for (const [key, propertySchema] of Object.entries(
      schema.properties
    )) {
      assertSchema(propertySchema, `${path}.${key}`);
    }

    return;
  }

  if (schema.type === "array") {
    assertSchema(schema.items, `${path}[]`);
    return;
  }

  if (
    schema.properties !== undefined ||
    schema.items !== undefined ||
    schema.required !== undefined ||
    schema.additionalProperties !== undefined
  ) {
    throw new TypeError(
      `Invalid assistant tool schema fields at ${path}`
    );
  }
}

function matchesSchema(value, schema) {
  if (
    schema.enum &&
    !schema.enum.some((item) => item === value)
  ) {
    return false;
  }

  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) {
        return false;
      }

      if (
        Object.keys(value).some(
          (key) => !Object.hasOwn(schema.properties, key)
        )
      ) {
        return false;
      }

      if (
        (schema.required ?? []).some(
          (key) => !Object.hasOwn(value, key)
        )
      ) {
        return false;
      }

      return Object.entries(value).every(
        ([key, child]) =>
          matchesSchema(child, schema.properties[key])
      );
    }

    case "array":
      return (
        Array.isArray(value) &&
        value.every((item) =>
          matchesSchema(item, schema.items)
        )
      );

    case "string":
      return typeof value === "string";

    case "boolean":
      return typeof value === "boolean";

    case "integer":
      return Number.isSafeInteger(value);

    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value)
      );

    default:
      return false;
  }
}

function assertRole(role) {
  if (!TOOL_ROLES.includes(role)) {
    throw new TypeError(
      "A valid assistant tool role is required"
    );
  }
}

function normalizeTool(definition) {
  if (!isPlainObject(definition)) {
    throw new TypeError(
      "Assistant tool definitions must be plain objects"
    );
  }

  const allowedDefinitionKeys = new Set([
    "name",
    "description",
    "parameters",
    "allowedRoles",
    "mode",
    "handler",
  ]);

  if (
    Object.keys(definition).some(
      (key) => !allowedDefinitionKeys.has(key)
    )
  ) {
    throw new TypeError(
      "Assistant tool definitions contain unsupported fields"
    );
  }

  const {
    name,
    description,
    parameters,
    allowedRoles,
    mode,
    handler,
  } = definition;

  if (
    typeof name !== "string" ||
    !TOOL_NAME_PATTERN.test(name)
  ) {
    throw new TypeError(
      "Assistant tool names must be lowercase identifiers"
    );
  }

  if (
    typeof description !== "string" ||
    description.trim() === ""
  ) {
    throw new TypeError(
      `Assistant tool ${name} needs a description`
    );
  }

  if (mode !== "read") {
    throw new TypeError(
      `Assistant tool ${name} must use read mode`
    );
  }

  if (
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    allowedRoles.some(
      (role) => !TOOL_ROLES.includes(role)
    ) ||
    new Set(allowedRoles).size !== allowedRoles.length
  ) {
    throw new TypeError(
      `Assistant tool ${name} needs valid, unique allowed roles`
    );
  }

  if (typeof handler !== "function") {
    throw new TypeError(
      `Assistant tool ${name} needs a handler`
    );
  }

  assertSchema(parameters);

  return Object.freeze({
    name,
    description: description.trim(),
    parameters: deepFreeze(cloneSchema(parameters)),
    allowedRoles: Object.freeze([...allowedRoles]),
    mode,
    handler,
  });
}

function executeWithTimeout(
  handler,
  toolArguments,
  timeoutMs
) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AssistantToolError(
          TOOL_ERROR_CODES.TIMEOUT,
          "The assistant tool took too long"
        )
      );
    }, timeoutMs);

    timer.unref?.();

    Promise.resolve()
      .then(() => handler(toolArguments))
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

function createAssistantToolRegistry(
  definitions = [],
  { handlerTimeoutMs = MAX_TOOL_HANDLER_TIMEOUT_MS } = {}
) {
  if (!Array.isArray(definitions)) {
    throw new TypeError(
      "Assistant tool definitions must be an array"
    );
  }

  if (
    !Number.isSafeInteger(handlerTimeoutMs) ||
    handlerTimeoutMs <= 0
  ) {
    throw new TypeError(
      "A positive assistant tool timeout is required"
    );
  }

  const tools = new Map();

  for (const definition of definitions) {
    const tool = normalizeTool(definition);

    if (tools.has(tool.name)) {
      throw new TypeError(
        `Duplicate assistant tool name: ${tool.name}`
      );
    }

    tools.set(tool.name, tool);
  }

  function getToolDeclarations(role) {
    assertRole(role);

    return Object.freeze(
      [...tools.values()]
        .filter((tool) =>
          tool.allowedRoles.includes(role)
        )
        .map((tool) =>
          deepFreeze({
            name: tool.name,
            description: tool.description,
            parameters: cloneSchema(tool.parameters),
          })
        )
    );
  }

  function validateToolCall({
    name,
    arguments: toolArguments,
    role,
  } = {}) {
    assertRole(role);

    if (typeof name !== "string" || !tools.has(name)) {
      throw new AssistantToolError(
        TOOL_ERROR_CODES.UNKNOWN_TOOL,
        "The requested assistant tool is not available"
      );
    }

    const tool = tools.get(name);

    if (!tool.allowedRoles.includes(role)) {
      throw new AssistantToolError(
        TOOL_ERROR_CODES.FORBIDDEN_TOOL,
        "The current user cannot use this assistant tool"
      );
    }

    if (
      tool.mode !== "read" ||
      !matchesSchema(toolArguments, tool.parameters)
    ) {
      throw new AssistantToolError(
        TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS,
        "The assistant tool arguments are invalid"
      );
    }

    return true;
  }

  async function executeToolCall(toolCall = {}) {
    validateToolCall(toolCall);
    const { name, arguments: toolArguments } = toolCall;
    const tool = tools.get(name);
    const result = await executeWithTimeout(
      tool.handler,
      deepFreeze(cloneSchema(toolArguments)),
      handlerTimeoutMs
    );

    return serializeAssistantToolResult(result);
  }

  return Object.freeze({
    getToolDeclarations,
    validateToolCall,
    executeToolCall,
  });
}

module.exports = {
  AssistantToolError,
  TOOL_ERROR_CODES,
  createAssistantToolRegistry,
};
