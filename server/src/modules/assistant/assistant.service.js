const AppError = require("../../errors/app-error");
const env = require("../../config/env");

const assistantProvider = require("./assistant.provider");
const assistantRepository = require("./assistant.repository");
const assistantToolRegistry = require("./assistant.tools");
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

  return {
    enabled: true,
    provider: provider.id,
    model: provider.model,
    capabilities: provider.capabilities,
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

async function sendMessage({ currentUser, input }) {
  const provider = getProvider();
  const userId = currentUser.id;

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
  });

  const startedAt = Date.now();
  let result;
  let providerFailure = null;

  try {
    result = await runAssistantToolTurn({
      provider,
      toolRegistry: assistantToolRegistry,
      role: currentUser.role,
      systemInstruction,
      messages: [
        ...history,
        { role: "user", content: input.message },
      ],
    });
  } catch (error) {
    providerFailure = error;
  }

  const latencyMs = Date.now() - startedAt;

  if (providerFailure !== null) {
    await recordUsageEvent({
      userId,
      conversationId: conversation?.id ?? null,
      provider: provider.id,
      model: provider.model,
      status: mapProviderStatus(providerFailure),
      errorCode: mapProviderErrorCode(providerFailure),
      inputTokens: null,
      outputTokens: null,
      latencyMs,
    });

    throw mapProviderError(providerFailure);
  }

  if (result.blocked) {
    await recordUsageEvent({
      userId,
      conversationId: conversation?.id ?? null,
      provider: provider.id,
      model: result.model ?? provider.model,
      status: "BLOCKED",
      errorCode: null,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      latencyMs,
    });

    throw createProviderError();
  }

  const userMessage = {
    role: "user",
    content: input.message,
  };
  const assistantMessage = {
    role: "assistant",
    content: result.text,
    provider: provider.id,
    model: result.model ?? provider.model,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };

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
      provider: provider.id,
      model: assistantMessage.model,
      status: "SUCCESS",
      errorCode: null,
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
      reply: assistantMessage,
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
      provider: provider.id,
      model: assistantMessage.model,
      status: "SUCCESS",
      errorCode: null,
      inputTokens: assistantMessage.inputTokens,
      outputTokens: assistantMessage.outputTokens,
      latencyMs,
    });

    throw error;
  }

  await recordUsageEvent({
    userId,
    conversationId: created.conversationId,
    provider: provider.id,
    model: assistantMessage.model,
    status: "SUCCESS",
    errorCode: null,
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
    reply: assistantMessage,
    prunedConversationId:
      created.prunedConversationIds[0] ?? null,
  };
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

  return {
    days: query.days,
    totals: {
      queries: aggregates.totals.totalQueries,
      failed: aggregates.totals.failedQueries,
      inputTokens: aggregates.totals.inputTokens,
      outputTokens: aggregates.totals.outputTokens,
    },
    byModel: aggregates.byModel,
    byDay: aggregates.byDay,
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
