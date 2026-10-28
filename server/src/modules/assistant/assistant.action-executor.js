const { isDeepStrictEqual } = require("node:util");

const actionRegistry = require(
  "./assistant.action-registry"
);
const {
  MAX_TOOL_HANDLER_TIMEOUT_MS,
} = require("./assistant.constants");

class AssistantActionExecutionError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "AssistantActionExecutionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function createNotConfirmableError() {
  return new AssistantActionExecutionError(
    409,
    "ASSISTANT_ACTION_NOT_CONFIRMABLE",
    "This action can no longer be confirmed"
  );
}

function createConflictError() {
  return new AssistantActionExecutionError(
    409,
    "ASSISTANT_ACTION_CONFLICT",
    "The target changed after this action was proposed"
  );
}

function serializeResult(result) {
  const json = JSON.stringify(result);

  if (json === undefined) {
    throw new Error(
      "Assistant action result must be JSON serializable"
    );
  }

  return JSON.parse(json);
}

function executeWithTimeout(work, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AssistantActionExecutionError(
          409,
          "ASSISTANT_ACTION_UNKNOWN",
          "The action may have been applied. Verify its status before trying again"
        )
      );
    }, timeoutMs);

    timer.unref?.();

    Promise.resolve()
      .then(work)
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

async function executePendingActionWork({
  action,
  role,
  registry = actionRegistry,
}) {
  const definition = registry.getActionDefinition(
    action.toolName
  );

  if (
    !definition ||
    definition.mode !== "write" ||
    definition.name !== action.toolName ||
    definition.targetType !== action.targetType ||
    !definition.allowedRoles.includes(role)
  ) {
    throw createNotConfirmableError();
  }

  const normalizedArguments =
    definition.validateArguments(action.arguments);

  if (
    normalizedArguments === null ||
    normalizedArguments === undefined ||
    !isDeepStrictEqual(
      normalizedArguments,
      action.arguments
    )
  ) {
    throw createNotConfirmableError();
  }

  const target = await definition.getTargetById(
    action.targetId
  );

  if (
    target === null ||
    target === undefined ||
    definition.getTargetLabel(target) !==
      action.targetLabel ||
    !isDeepStrictEqual(
      definition.getSnapshot(target),
      action.before
    )
  ) {
    throw createConflictError();
  }

  const domainResult = await definition.execute({
    targetId: action.targetId,
    arguments: normalizedArguments,
    target,
  });
  const result = serializeResult(
    definition.toResult({
      action,
      target,
      arguments: normalizedArguments,
      domainResult,
    })
  );
  const message = definition.toAssistantMessage({
    action,
    result,
    domainResult,
  });

  if (
    typeof message !== "string" ||
    message.trim() === ""
  ) {
    throw new Error(
      "Assistant action result message must be a non-empty string"
    );
  }

  return { result, message };
}

function executePendingAction(input) {
  return executeWithTimeout(
    () => executePendingActionWork(input),
    MAX_TOOL_HANDLER_TIMEOUT_MS
  );
}

module.exports = {
  AssistantActionExecutionError,
  executePendingAction,
};
