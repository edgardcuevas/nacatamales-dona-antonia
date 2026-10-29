const { randomBytes } = require("node:crypto");

const AppError = require("../../errors/app-error");

const assistantRepository = require(
  "./assistant.repository"
);
const actionRegistry = require(
  "./assistant.action-registry"
);
const actionRepository = require(
  "./assistant.action.repository"
);
const {
  AssistantActionExecutionError,
  executePendingAction,
} = require("./assistant.action-executor");

const ACTION_ROLES = new Set(["ADMIN", "EDITOR"]);

function assertActionRole(currentUser) {
  if (!ACTION_ROLES.has(currentUser?.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action"
    );
  }
}

function createNotFoundError() {
  return new AppError(
    404,
    "ASSISTANT_ACTION_NOT_FOUND",
    "The requested action does not exist"
  );
}

function createExpiredError() {
  return new AppError(
    410,
    "ASSISTANT_ACTION_EXPIRED",
    "This action has expired"
  );
}

function createInProgressError() {
  return new AppError(
    409,
    "ASSISTANT_ACTION_IN_PROGRESS",
    "This action is already being confirmed"
  );
}

function createNotConfirmableError() {
  return new AppError(
    409,
    "ASSISTANT_ACTION_NOT_CONFIRMABLE",
    "This action can no longer be confirmed"
  );
}

function createConflictError() {
  return new AppError(
    409,
    "ASSISTANT_ACTION_CONFLICT",
    "The target changed after this action was proposed"
  );
}

function createUnknownExecutionError() {
  return new AppError(
    409,
    "ASSISTANT_ACTION_UNKNOWN",
    "The action may have been applied. Verify its status before trying again"
  );
}

function createStateError() {
  return new AppError(
    500,
    "ASSISTANT_ACTION_STATE_ERROR",
    "The assistant action state could not be updated"
  );
}

function toIsoString(value) {
  const date =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid assistant action date record");
  }

  return date.toISOString();
}

function toPublicAction(action) {
  return {
    id: action.id,
    tool: action.toolName,
    summary: action.summary,
    target: {
      type: action.targetType,
      id: action.targetId,
      label: action.targetLabel,
    },
    status: action.status,
    expiresAt: toIsoString(action.expiresAt),
    finishedAt: action.finishedAt
      ? toIsoString(action.finishedAt)
      : null,
  };
}

function createProviderRequestError() {
  return new AppError(
    502,
    "ASSISTANT_PROVIDER_ERROR",
    "The assistant could not answer that message"
  );
}

function isPlainObject(value) {
  if (
    !value ||
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

async function proposeAction({
  currentUser,
  conversationId,
  toolName,
  arguments: toolArguments,
}) {
  assertActionRole(currentUser);

  const validatedCall =
    actionRegistry.validateActionCall({
      name: toolName,
      arguments: toolArguments,
      role: currentUser.role,
    });

  if (!validatedCall) {
    throw createProviderRequestError();
  }

  const definition =
    actionRegistry.getActionDefinition(toolName);
  const targetId = definition.getTargetId(
    validatedCall.arguments
  );

  if (
    !Number.isSafeInteger(targetId) ||
    targetId < 1
  ) {
    throw createProviderRequestError();
  }

  let target;

  try {
    target = await definition.getTargetById(targetId);
  } catch (error) {
    if (
      error instanceof AppError &&
      error.statusCode === 404
    ) {
      return { status: "TARGET_NOT_FOUND" };
    }

    throw error;
  }

  if (!target) {
    return { status: "TARGET_NOT_FOUND" };
  }

  const proposalRejectionMessage =
    definition.getProposalRejectionMessage({
      target,
      arguments: validatedCall.arguments,
    });

  if (proposalRejectionMessage !== null) {
    if (
      typeof proposalRejectionMessage !== "string" ||
      proposalRejectionMessage.trim() === "" ||
      proposalRejectionMessage.length > 500
    ) {
      throw new Error(
        "Assistant action proposal rejection is invalid"
      );
    }

    return {
      status: "NOT_APPLICABLE",
      message: proposalRejectionMessage,
    };
  }

  const targetLabel = definition.getTargetLabel(target);
  const before = definition.getSnapshot(target);
  const summary = definition.createSummary({
    target,
    arguments: validatedCall.arguments,
  });
  const changes = definition.getChanges({
    target,
    arguments: validatedCall.arguments,
  });
  const warnings = definition.getWarnings({
    target,
    arguments: validatedCall.arguments,
  });

  if (
    typeof targetLabel !== "string" ||
    targetLabel.trim() === "" ||
    typeof summary !== "string" ||
    summary.trim() === "" ||
    summary.length > 255 ||
    !isPlainObject(before) ||
    !Array.isArray(changes) ||
    !Array.isArray(warnings) ||
    warnings.some(
      (warning) =>
        typeof warning !== "string" ||
        warning.trim() === ""
    )
  ) {
    throw new Error(
      "Assistant action proposal details are invalid"
    );
  }

  const token = randomBytes(32).toString("base64url");
  const created =
    await actionRepository.createPendingAction({
      token,
      userId: currentUser.id,
      conversationId,
      toolName,
      targetType: definition.targetType,
      targetId,
      targetLabel,
      arguments: validatedCall.arguments,
      before,
      summary,
    });

  if (created.status === "PENDING_LIMIT") {
    return { status: "PENDING_LIMIT" };
  }

  if (created.status === "USER_NOT_FOUND") {
    throw new AppError(
      401,
      "AUTHENTICATION_STALE",
      "The authenticated user is no longer available"
    );
  }

  if (created.status === "CONVERSATION_NOT_FOUND") {
    throw new AppError(
      404,
      "ASSISTANT_CONVERSATION_NOT_FOUND",
      "The requested conversation does not exist"
    );
  }

  if (created.status !== "CREATED") {
    throw new Error(
      "Assistant action proposal was not created"
    );
  }

  return {
    status: "CREATED",
    pendingAction: {
      token,
      tool: toolName,
      summary,
      target: {
        type: definition.targetType,
        id: targetId,
        label: targetLabel,
      },
      changes,
      warnings,
      expiresAt: toIsoString(created.expiresAt),
    },
  };
}

function errorForCurrentState(action) {
  if (action.status === "EXECUTING") {
    return createInProgressError();
  }

  if (action.status === "EXPIRED") {
    return createExpiredError();
  }

  if (action.status === "FAILED") {
    if (action.errorCode === "ASSISTANT_ACTION_UNKNOWN") {
      return createUnknownExecutionError();
    }

    if (action.errorCode === "ASSISTANT_ACTION_CONFLICT") {
      return createConflictError();
    }
  }

  if (
    action.status === "CANCELLED" ||
    action.status === "FAILED"
  ) {
    return createNotConfirmableError();
  }

  return createStateError();
}

function mapExecutionError(error) {
  if (error instanceof AssistantActionExecutionError) {
    return error;
  }

  if (
    error instanceof AppError &&
    error.statusCode < 500
  ) {
    return new AssistantActionExecutionError(
      409,
      "ASSISTANT_ACTION_FAILED",
      "The requested change could not be applied"
    );
  }

  return null;
}

async function appendActionResultMessage({
  action,
  currentUser,
  message,
}) {
  if (action.conversationId === null) {
    return;
  }

  try {
    await assistantRepository.appendAssistantMessageToConversation(
      {
        conversationId: action.conversationId,
        userId: currentUser.id,
        message: {
          role: "assistant",
          content: message,
        },
      }
    );
  } catch (error) {
    console.error(
      "Assistant action result message failed:",
      error?.code ?? error?.name ?? "unknown"
    );
  }
}

function buildConfirmResponse({
  action,
  result,
  alreadyExecuted,
}) {
  return {
    action: toPublicAction(action),
    result,
    alreadyExecuted,
  };
}

async function confirmAction({ currentUser, token }) {
  assertActionRole(currentUser);

  const claim = await actionRepository.claimPendingAction({
    token,
    userId: currentUser.id,
  });

  if (!claim.action) {
    throw createNotFoundError();
  }

  if (!claim.claimed) {
    if (claim.action.status === "EXECUTED") {
      return buildConfirmResponse({
        action: claim.action,
        result: claim.action.result,
        alreadyExecuted: true,
      });
    }

    throw errorForCurrentState(claim.action);
  }

  let execution;

  try {
    execution = await executePendingAction({
      action: claim.action,
      role: currentUser.role,
    });
  } catch (error) {
    const mappedError = mapExecutionError(error);

    if (!mappedError) {
      throw error;
    }

    const markedFailed =
      await actionRepository.markActionFailed({
        actionId: claim.action.id,
        userId: currentUser.id,
        errorCode: mappedError.code,
      });

    if (!markedFailed) {
      throw createStateError();
    }

    throw new AppError(
      mappedError.statusCode,
      mappedError.code,
      mappedError.message
    );
  }

  const markedExecuted =
    await actionRepository.markActionExecuted({
      actionId: claim.action.id,
      userId: currentUser.id,
      result: execution.result,
    });

  if (!markedExecuted) {
    const currentAction =
      await actionRepository.findActionByTokenForUser({
        token,
        userId: currentUser.id,
      });

    if (currentAction?.status === "FAILED") {
      throw errorForCurrentState(currentAction);
    }

    throw createStateError();
  }

  const completedAction = {
    ...claim.action,
    status: "EXECUTED",
    result: execution.result,
    finishedAt: new Date(),
  };

  await appendActionResultMessage({
    action: completedAction,
    currentUser,
    message: execution.message,
  });

  return buildConfirmResponse({
    action: completedAction,
    result: execution.result,
    alreadyExecuted: false,
  });
}

async function cancelAction({ currentUser, token }) {
  assertActionRole(currentUser);

  const cancellation =
    await actionRepository.cancelPendingAction({
      token,
      userId: currentUser.id,
    });

  if (!cancellation.action) {
    throw createNotFoundError();
  }

  if (
    cancellation.action.status === "CANCELLED"
  ) {
    return {
      action: toPublicAction(cancellation.action),
      cancelled: cancellation.cancelled,
    };
  }

  throw errorForCurrentState(cancellation.action);
}

module.exports = {
  proposeAction,
  confirmAction,
  cancelAction,
  toPublicAction,
};
