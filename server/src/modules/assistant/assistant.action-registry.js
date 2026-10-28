const { isDeepStrictEqual } = require("node:util");

const ACTION_ROLES = Object.freeze(["ADMIN", "EDITOR"]);
const ACTION_TARGET_TYPES = new Set([
  "product",
  "announcement",
  "video",
  "category",
]);
const ACTION_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ACTION_DEFINITIONS = require(
  "./assistant.action-tools"
);

function normalizeActionDefinition(definition) {
  const {
    name,
    mode,
    targetType,
    description,
    parameters,
    allowedRoles,
    validateArguments,
    getTargetId,
    getTargetById,
    getTargetLabel,
    getSnapshot,
    createSummary,
    getChanges,
    getWarnings,
    execute,
    toResult,
    toAssistantMessage,
  } = definition;

  if (
    typeof name !== "string" ||
    !ACTION_NAME_PATTERN.test(name)
  ) {
    throw new TypeError(
      "Assistant action names must be lowercase identifiers"
    );
  }

  if (mode !== "write") {
    throw new TypeError(
      `Assistant action ${name} must use write mode`
    );
  }

  if (!ACTION_TARGET_TYPES.has(targetType)) {
    throw new TypeError(
      `Assistant action ${name} has an invalid target type`
    );
  }

  if (
    typeof description !== "string" ||
    description.trim() === ""
  ) {
    throw new TypeError(
      `Assistant action ${name} needs a description`
    );
  }

  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters) ||
    parameters.type !== "object" ||
    !parameters.properties ||
    typeof parameters.properties !== "object" ||
    Array.isArray(parameters.properties) ||
    parameters.additionalProperties !== false
  ) {
    throw new TypeError(
      `Assistant action ${name} needs an object parameter schema`
    );
  }

  if (
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    allowedRoles.some(
      (role) => !ACTION_ROLES.includes(role)
    ) ||
    new Set(allowedRoles).size !== allowedRoles.length
  ) {
    throw new TypeError(
      `Assistant action ${name} needs valid, unique allowed roles`
    );
  }

  const handlers = {
    validateArguments,
    getTargetId,
    getTargetById,
    getTargetLabel,
    getSnapshot,
    createSummary,
    getChanges,
    getWarnings,
    execute,
    toResult,
    toAssistantMessage,
  };

  if (
    Object.entries(handlers).some(
      ([, handler]) => typeof handler !== "function"
    )
  ) {
    throw new TypeError(
      `Assistant action ${name} needs all execution handlers`
    );
  }

  return Object.freeze({
    name,
    mode,
    targetType,
    description: description.trim(),
    parameters: structuredClone(parameters),
    allowedRoles: Object.freeze([...allowedRoles]),
    ...handlers,
  });
}

function createAssistantActionRegistry(definitions = []) {
  if (!Array.isArray(definitions)) {
    throw new TypeError(
      "Assistant action definitions must be an array"
    );
  }

  const actions = new Map();

  for (const definition of definitions) {
    const action = normalizeActionDefinition(definition);

    if (actions.has(action.name)) {
      throw new TypeError(
        `Duplicate assistant action name: ${action.name}`
      );
    }

    actions.set(action.name, action);
  }

  function getActionDeclarations(role) {
    if (!ACTION_ROLES.includes(role)) {
      throw new TypeError(
        "A valid assistant action role is required"
      );
    }

    return Object.freeze(
      [...actions.values()]
        .filter((action) =>
          action.allowedRoles.includes(role)
        )
        .map((action) =>
          Object.freeze({
            name: action.name,
            description: action.description,
            parameters: structuredClone(
              action.parameters
            ),
          })
        )
    );
  }

  function validateActionCall({
    name,
    arguments: actionArguments,
    role,
  } = {}) {
    if (!ACTION_ROLES.includes(role)) {
      throw new TypeError(
        "A valid assistant action role is required"
      );
    }

    const action = actions.get(name);

    if (
      !action ||
      !action.allowedRoles.includes(role)
    ) {
      return null;
    }

    const normalizedArguments =
      action.validateArguments(actionArguments);

    if (
      normalizedArguments === null ||
      normalizedArguments === undefined ||
      !isDeepStrictEqual(
        normalizedArguments,
        actionArguments
      )
    ) {
      return null;
    }

    return {
      name: action.name,
      arguments: normalizedArguments,
    };
  }

  return Object.freeze({
    getActionDefinition(name) {
      return actions.get(name) ?? null;
    },
    getActionDeclarations,
    validateActionCall,
  });
}

const assistantActionRegistry =
  createAssistantActionRegistry(ACTION_DEFINITIONS);

module.exports = {
  createAssistantActionRegistry,
  getActionDefinition:
    assistantActionRegistry.getActionDefinition,
  getActionDeclarations:
    assistantActionRegistry.getActionDeclarations,
  validateActionCall:
    assistantActionRegistry.validateActionCall,
};
