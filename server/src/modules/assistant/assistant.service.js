const AppError = require("../../errors/app-error");
const env = require("../../config/env");

const assistantProvider = require("./assistant.provider");
const assistantRepository = require("./assistant.repository");
const assistantToolRegistry = require("./assistant.tools");
const assistantActionRegistry = require(
  "./assistant.action-registry"
);
const assistantActionService = require(
  "./assistant.action.service"
);
const {
  runAssistantToolTurn,
} = require("./assistant.tool-orchestrator");
const {
  buildSystemInstruction,
} = require("./assistant.prompt");
const {
  isConversationFull,
} = require("./assistant.retention");
const {
  assistantQuota,
} = require("./assistant.quota");

const {
  HISTORY_MESSAGE_LIMIT,
  HISTORY_CHAR_LIMIT,
  MAX_CONVERSATION_TITLE_LENGTH,
} = require("./assistant.constants");

let providerInstance = null;

function isEnabled() {
  return env.assistant.enabled === true;
}

function getProvider() {
  if (!isEnabled()) {
    throw new AppError(
      503,
      "ASSISTANT_DISABLED",
      "The assistant is not configured"
    );
  }

  if (providerInstance === null) {
    providerInstance =
      assistantProvider.createAssistantProvider(
        env.assistant
      );
  }

  return providerInstance;
}

function createConversationNotFoundError() {
  return new AppError(
    404,
    "ASSISTANT_CONVERSATION_NOT_FOUND",
    "The requested conversation does not exist"
  );
}

function createProviderError() {
  return new AppError(
    502,
    "ASSISTANT_PROVIDER_ERROR",
    "The assistant could not answer that message"
  );
}

// El proveedor se quedo sin tokens de salida antes de escribir la respuesta
// (en un modelo que razona, el razonamiento consume el mismo presupuesto).
// Es distinguible de un fallo generico para que el cliente pueda pedir algo
// mas corto en vez de reintentar a ciegas.
function createResponseTruncatedError() {
  return new AppError(
    502,
    "ASSISTANT_RESPONSE_TRUNCATED",
    "The assistant answer was truncated before it could finish"
  );
}

function createToolMisuseError() {
  return new AppError(
    502,
    "ASSISTANT_TOOL_MISUSE",
    "The assistant requested an operation it cannot perform"
  );
}

function createQuotaExceededError() {
  return new AppError(
    429,
    "ASSISTANT_QUOTA_EXCEEDED",
    "The assistant reached its daily provider call quota"
  );
}

function createRateLimitedError() {
  return new AppError(
    429,
    "ASSISTANT_RATE_LIMITED",
    "The assistant provider is rate limiting requests"
  );
}

function mapProviderStatus(error) {
  if (
    error instanceof
    assistantProvider.AssistantProviderError &&
    error.code === "TIMEOUT"
  ) {
    return "TIMEOUT";
  }

  return "PROVIDER_ERROR";
}

function mapProviderErrorCode(error) {
  if (
    error instanceof
    assistantProvider.AssistantProviderError
  ) {
    return error.code;
  }

  return "INTERNAL_ERROR";
}

function getResultProvider(result, fallbackProvider) {
  if (
    Array.isArray(result.providers) &&
    result.providers.length > 0
  ) {
    return [...new Set(result.providers)].join("+");
  }

  return result.provider ?? fallbackProvider.id;
}

function getFailureProvider(error, fallbackProvider) {
  if (
    Array.isArray(error.providers) &&
    error.providers.length > 0
  ) {
    return [...new Set(error.providers)].join("+");
  }

  return error.provider ?? fallbackProvider.id;
}

async function recordUsageEvent(payload) {
  try {
    await assistantRepository.insertUsageEvent(
      payload
    );
  } catch (error) {
    console.error(
      "Assistant usage event failed:",
      error?.code ?? error?.name ?? "unknown"
    );
  }
}

async function cleanupUnpublishedAction({
  pendingAction,
  currentUser,
}) {
  if (!pendingAction?.token) {
    return;
  }

  try {
    await assistantActionService.cancelAction({
      currentUser,
      token: pendingAction.token,
    });
  } catch (error) {
    console.error(
      "Assistant action cleanup failed:",
      error?.code ?? error?.name ?? "unknown"
    );
  }
}

async function cleanupEmptyConversation({
  conversationId,
  userId,
}) {
  if (conversationId === null) {
    return;
  }

  try {
    await assistantRepository.deleteConversationByIdForUser({
      conversationId,
      userId,
    });
  } catch (error) {
    console.error(
      "Assistant conversation cleanup failed:",
      error?.code ?? error?.name ?? "unknown"
    );
  }
}

async function saveActionProposalTurn({
  currentUser,
  input,
  existingConversation,
  provider,
  result,
  latencyMs,
}) {
  const userId = currentUser.id;
  const resultProvider = getResultProvider(
    result,
    provider
  );
  const title = existingConversation
    ? existingConversation.title ?? null
    : buildConversationTitle(input.message);
  let conversationId =
    existingConversation?.id ?? null;
  let prunedConversationId = null;
  let createdConversation = false;
  let proposal;

  try {
    if (conversationId === null) {
      const created =
        await assistantRepository.createConversationShell({
          userId,
          title,
        });
      conversationId = created.conversationId;
      prunedConversationId =
        created.prunedConversationIds[0] ?? null;
      createdConversation = true;
    }

    proposal = await assistantActionService.proposeAction({
      currentUser,
      conversationId,
      toolName: result.pendingActionRequest.name,
      arguments:
        result.pendingActionRequest.arguments,
    });
  } catch (error) {
    if (createdConversation) {
      await cleanupEmptyConversation({
        conversationId,
        userId,
      });
    }

    await recordUsageEvent({
      userId,
      conversationId:
        existingConversation?.id ?? null,
      provider: resultProvider,
      model: result.model ?? provider.model,
      status: "SUCCESS",
      errorCode: null,
      providerCalls: result.providerCalls ?? null,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      latencyMs,
    });
    throw error;
  }

  let replyContent;

  if (proposal.status === "CREATED") {
    replyContent =
      "Preparé la acción. Confirmala para aplicarla.";
  } else if (proposal.status === "PENDING_LIMIT") {
    replyContent =
      "Tenés demasiadas confirmaciones pendientes. Confirmá o cancelá una antes de pedir otra.";
  } else if (proposal.status === "NOT_APPLICABLE") {
    replyContent = proposal.message;
  } else {
    replyContent =
      "No encontré el objetivo solicitado. Aclarame cuál querés cambiar.";
  }

  const assistantMessage = {
    role: "assistant",
    content: replyContent,
    provider: resultProvider,
    model: result.model ?? provider.model,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };

  try {
    const appended =
      await assistantRepository.appendActionTurnToConversation(
        {
          conversationId,
          userId,
          userMessage: {
            role: "user",
            content: input.message,
          },
          assistantMessage,
        }
      );

    if (!appended) {
      throw createConversationNotFoundError();
    }
  } catch (error) {
    await cleanupUnpublishedAction({
      pendingAction: proposal.pendingAction,
      currentUser,
    });

    if (createdConversation) {
      await cleanupEmptyConversation({
        conversationId,
        userId,
      });
    }

    await recordUsageEvent({
      userId,
      conversationId:
        existingConversation?.id ?? null,
      provider: resultProvider,
      model: assistantMessage.model,
      status: "SUCCESS",
      errorCode: null,
      providerCalls: result.providerCalls ?? null,
      inputTokens: assistantMessage.inputTokens,
      outputTokens: assistantMessage.outputTokens,
      latencyMs,
    });
    throw error;
  }

  await recordUsageEvent({
    userId,
    conversationId,
    provider: resultProvider,
    model: assistantMessage.model,
    status: "SUCCESS",
    errorCode: null,
    providerCalls: result.providerCalls ?? null,
    inputTokens: assistantMessage.inputTokens,
    outputTokens: assistantMessage.outputTokens,
    latencyMs,
  });

  return {
    conversation: {
      id: conversationId,
      title,
    },
    userMessage: {
      role: "user",
      content: input.message,
    },
    reply: assistantMessage,
    prunedConversationId,
    ...(proposal.pendingAction
      ? { pendingAction: proposal.pendingAction }
      : {}),
  };
}

function mapProviderError(error) {
  if (
    error instanceof
    assistantProvider.AssistantProviderError
  ) {
    if (error.code === "TIMEOUT") {
      return new AppError(
        504,
        "ASSISTANT_TIMEOUT",
        "The assistant took too long to answer"
      );
    }

    if (error.code === "TOOL_MISUSE") {
      return createToolMisuseError();
    }

    if (error.code === "OUTPUT_TRUNCATED") {
      return createResponseTruncatedError();
    }

    if (error.code === "RATE_LIMITED") {
      return createRateLimitedError();
    }

    return createProviderError();
  }

  return error;
}

function toIsoString(value) {
  const date =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid assistant date record");
  }

  return date.toISOString();
}

function toConversation(conversation) {
  return {
    id: Number(conversation.id),
    title: conversation.title ?? null,
    createdAt: toIsoString(conversation.created_at),
    updatedAt: toIsoString(conversation.updated_at),
  };
}

function toMessage(message) {
  return {
    id: Number(message.id),
    role: message.role,
    content: message.content,
    provider: message.provider ?? null,
    model: message.model ?? null,
    inputTokens:
      message.input_tokens === null ||
      message.input_tokens === undefined
        ? null
        : Number(message.input_tokens),
    outputTokens:
      message.output_tokens === null ||
      message.output_tokens === undefined
        ? null
        : Number(message.output_tokens),
    createdAt: toIsoString(message.created_at),
  };
}

function buildConversationTitle(message) {
  return Array.from(message)
    .slice(0, MAX_CONVERSATION_TITLE_LENGTH)
    .join("");
}

// El historial enviado al modelo se recorta dos veces: por cantidad de
// mensajes y por caracteres. Se descartan los mas viejos, nunca el
// mensaje nuevo del usuario.
function trimHistory(messages) {
  const limited = messages.slice(
    -HISTORY_MESSAGE_LIMIT
  );
  let totalChars = limited.reduce(
    (total, message) =>
      total + message.content.length,
    0
  );
  let firstKept = 0;

  while (
    firstKept < limited.length &&
    totalChars > HISTORY_CHAR_LIMIT
  ) {
    totalChars -= limited[firstKept].content.length;
    firstKept += 1;
  }

  return limited
    .slice(firstKept)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function getStatus() {
  if (!isEnabled()) {
    return { enabled: false };
  }

  const provider = getProvider();
  const fallback = provider.fallback ?? {
    enabled: false,
    model: null,
  };
  const fallbackEnabled = fallback.enabled === true;

  return {
    enabled: true,
    provider: provider.id,
    model: provider.model,
    capabilities: provider.capabilities,
    fallback: {
      enabled: fallbackEnabled,
      provider: fallbackEnabled
        ? fallback.provider ?? null
        : null,
      model: fallbackEnabled
        ? fallback.model ?? null
        : null,
    },
    quota: assistantQuota.current(),
  };
}

async function listConversations({
  currentUser,
  query,
}) {
  const rows =
    await assistantRepository.listConversationsByUser(
      {
        userId: currentUser.id,
        limit: query.limit,
      }
    );

  return {
    conversations: rows.map(toConversation),
  };
}

async function listMessages({
  currentUser,
  conversationId,
  query,
}) {
  const conversation =
    await assistantRepository.findConversationByIdForUser(
      {
        conversationId,
        userId: currentUser.id,
      }
    );

  if (!conversation) {
    throw createConversationNotFoundError();
  }

  const messages =
    await assistantRepository.listRecentMessages({
      conversationId,
      limit: query.limit,
    });

  return { messages: messages.map(toMessage) };
}

async function deleteConversation({
  currentUser,
  conversationId,
}) {
  const deleted =
    await assistantRepository.deleteConversationByIdForUser(
      {
        conversationId,
        userId: currentUser.id,
      }
    );

  if (!deleted) {
    throw createConversationNotFoundError();
  }

  return { conversationId, deleted: true };
}

async function sendMessage({
  currentUser,
  input,
  onTextChunk,
}) {
  const provider = getProvider();
  const userId = currentUser.id;

  if (assistantQuota.current().exhausted) {
    throw createQuotaExceededError();
  }

  let conversation = null;
  let history = [];

  if (input.conversationId !== null) {
    conversation =
      await assistantRepository.findConversationByIdForUser(
        {
          conversationId: input.conversationId,
          userId,
        }
      );

    if (!conversation) {
      throw createConversationNotFoundError();
    }

    const messageCount =
      await assistantRepository.countMessagesByConversation(
        conversation.id
      );

    if (isConversationFull(messageCount)) {
      throw new AppError(
        409,
        "ASSISTANT_CONVERSATION_FULL",
        "This conversation reached its message limit"
      );
    }

    const stored =
      await assistantRepository.listRecentMessages({
        conversationId: conversation.id,
        limit: HISTORY_MESSAGE_LIMIT,
      });

    history = trimHistory(stored);
  }

  const systemInstruction = buildSystemInstruction({
    role: currentUser.role,
    pushEnabled: env.webPush.enabled,
    actionToolsEnabled:
      assistantActionRegistry.getActionDeclarations(
        currentUser.role
      ).length > 0,
  });

  const startedAt = Date.now();
  let result;
  let providerFailure = null;

  try {
    result = await runAssistantToolTurn({
      provider,
      toolRegistry: assistantToolRegistry,
      actionRegistry: assistantActionRegistry,
      role: currentUser.role,
      systemInstruction,
      messages: [
        ...history,
        { role: "user", content: input.message },
      ],
      streamFinal: onTextChunk !== undefined,
      onTextChunk,
    });
  } catch (error) {
    providerFailure = error;
  }

  const latencyMs = Date.now() - startedAt;

  if (providerFailure !== null) {
    assistantQuota.record(
      providerFailure.providerCalls
    );
    await recordUsageEvent({
      userId,
      conversationId: conversation?.id ?? null,
      provider: getFailureProvider(
        providerFailure,
        provider
      ),
      model: providerFailure.model ?? provider.model,
      status: mapProviderStatus(providerFailure),
      errorCode: mapProviderErrorCode(providerFailure),
      providerCalls:
        providerFailure.providerCalls ?? null,
      inputTokens: null,
      outputTokens: null,
      latencyMs,
    });

    throw mapProviderError(providerFailure);
  }

  assistantQuota.record(result.providerCalls);
  const resultProvider = getResultProvider(
    result,
    provider
  );

  if (result.blocked) {
    await recordUsageEvent({
      userId,
      conversationId: conversation?.id ?? null,
      provider: resultProvider,
      model: result.model ?? provider.model,
      status: "BLOCKED",
      errorCode: null,
      providerCalls: result.providerCalls ?? null,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      latencyMs,
    });

    throw createProviderError();
  }

  if (result.pendingActionRequest) {
    return saveActionProposalTurn({
      currentUser,
      input,
      existingConversation: conversation,
      provider,
      result,
      latencyMs,
    });
  }

  const userMessage = {
    role: "user",
    content: input.message,
  };
  const assistantMessage = {
    role: "assistant",
    content: result.text,
    provider: resultProvider,
    model: result.model ?? provider.model,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };
  // La bandera solo viaja cuando aplica: el resto del contrato de `reply` no
  // cambia y el mensaje persistido conserva sus columnas.
  const reply =
    result.truncated === true
      ? { ...assistantMessage, truncated: true }
      : assistantMessage;
  const usageErrorCode =
    result.truncated === true ? "OUTPUT_TRUNCATED" : null;

  if (conversation !== null) {
    const appended =
      await assistantRepository.appendMessagesToConversation(
        {
          conversationId: conversation.id,
          userId,
          userMessage,
          assistantMessage,
        }
      );

    if (!appended) {
      throw createConversationNotFoundError();
    }

    await recordUsageEvent({
      userId,
      conversationId: conversation.id,
      provider: resultProvider,
      model: assistantMessage.model,
      status: "SUCCESS",
      errorCode: usageErrorCode,
      providerCalls: result.providerCalls ?? null,
      inputTokens: assistantMessage.inputTokens,
      outputTokens: assistantMessage.outputTokens,
      latencyMs,
    });

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title ?? null,
      },
      userMessage: {
        role: userMessage.role,
        content: userMessage.content,
      },
      reply,
      prunedConversationId: null,
    };
  }

  const title = buildConversationTitle(input.message);
  let created;

  try {
    created =
      await assistantRepository.createConversationWithMessages(
        {
          userId,
          title,
          userMessage,
          assistantMessage,
        }
      );
  } catch (error) {
    await recordUsageEvent({
      userId,
      conversationId: null,
      provider: resultProvider,
      model: assistantMessage.model,
      status: "SUCCESS",
      errorCode: usageErrorCode,
      providerCalls: result.providerCalls ?? null,
      inputTokens: assistantMessage.inputTokens,
      outputTokens: assistantMessage.outputTokens,
      latencyMs,
    });

    throw error;
  }

  await recordUsageEvent({
    userId,
    conversationId: created.conversationId,
    provider: resultProvider,
    model: assistantMessage.model,
    status: "SUCCESS",
    errorCode: usageErrorCode,
    providerCalls: result.providerCalls ?? null,
    inputTokens: assistantMessage.inputTokens,
    outputTokens: assistantMessage.outputTokens,
    latencyMs,
  });

  return {
    conversation: {
      id: created.conversationId,
      title,
    },
    userMessage: {
      role: userMessage.role,
      content: userMessage.content,
    },
    reply,
    prunedConversationId:
      created.prunedConversationIds[0] ?? null,
  };
}

function estimateCostUsd({
  inputTokens,
  outputTokens,
}) {
  const { priceInputPerM, priceOutputPerM } =
    env.assistant;

  if (priceInputPerM <= 0 && priceOutputPerM <= 0) {
    return null;
  }

  const cost =
    (inputTokens / 1_000_000) * priceInputPerM +
    (outputTokens / 1_000_000) * priceOutputPerM;

  return Number(cost.toFixed(6));
}

async function getUsage({ currentUser, query }) {
  if (currentUser.role !== "ADMIN") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action"
    );
  }

  const since = new Date(
    Date.now() - query.days * 24 * 60 * 60 * 1000
  );

  const aggregates =
    await assistantRepository.getUsageAggregates({
      since,
    });
  const includesNonGeminiUsage = aggregates.byModel.some(
    ({ provider: providerName }) =>
      providerName !== "gemini"
  );

  return {
    days: query.days,
    totals: {
      queries: aggregates.totals.totalQueries,
      failed: aggregates.totals.failedQueries,
      providerCalls: aggregates.totals.providerCalls,
      inputTokens: aggregates.totals.inputTokens,
      outputTokens: aggregates.totals.outputTokens,
      estimatedCostUsd: includesNonGeminiUsage
        ? null
        : estimateCostUsd(aggregates.totals),
    },
    byModel: aggregates.byModel,
    byDay: aggregates.byDay,
    quota: assistantQuota.current(),
  };
}

module.exports = {
  getStatus,
  listConversations,
  listMessages,
  deleteConversation,
  sendMessage,
  getUsage,
  trimHistory,
};
