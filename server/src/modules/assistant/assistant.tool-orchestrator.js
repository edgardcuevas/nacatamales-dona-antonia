const {
  MAX_PROVIDER_CALLS_PER_MESSAGE,
  MAX_TOOL_EXECUTIONS_PER_MESSAGE,
} = require("./assistant.constants");
const {
  AssistantToolError,
  TOOL_ERROR_CODES,
} = require("./assistant.tool-registry");
const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
} = require("./assistant.provider-error");

function createInvalidToolRequestError() {
  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
  );
}

function aggregateUsage(results) {
  const fields = [
    ["inputTokens", "inputTokens"],
    ["outputTokens", "outputTokens"],
  ];

  return Object.fromEntries(
    fields.map(([target, source]) => {
      const values = results.map(
        (result) => result.usage?.[source]
      );
      const complete = values.every(
        (value) =>
          Number.isSafeInteger(value) && value >= 0
      );

      return [
        target,
        complete
          ? values.reduce((total, value) => total + value, 0)
          : null,
      ];
    })
  );
}

async function runAssistantToolTurn({
  provider,
  toolRegistry,
  role,
  systemInstruction,
  messages,
  maxOutputTokens,
  timeoutMs,
}) {
  if (
    !provider ||
    typeof provider.chat !== "function" ||
    !toolRegistry ||
    typeof toolRegistry.getToolDeclarations !==
      "function" ||
    typeof toolRegistry.validateToolCall !== "function" ||
    typeof toolRegistry.executeToolCall !== "function"
  ) {
    throw new TypeError(
      "A provider and assistant tool registry are required"
    );
  }

  const tools = toolRegistry.getToolDeclarations(role);
  const providerMessages = [...messages];
  const providerResults = [];
  let toolExecutions = 0;

  for (
    let providerCalls = 1;
    providerCalls <= MAX_PROVIDER_CALLS_PER_MESSAGE;
    providerCalls += 1
  ) {
    const result = await provider.chat({
      systemInstruction,
      messages: providerMessages,
      tools,
      maxOutputTokens,
      timeoutMs,
    });

    providerResults.push(result);

    if (result.blocked) {
      return {
        ...result,
        usage: aggregateUsage(providerResults),
      };
    }

    const toolCalls = result.toolCalls ?? [];

    if (!Array.isArray(toolCalls)) {
      throw createInvalidToolRequestError();
    }

    if (toolCalls.length === 0) {
      return {
        ...result,
        usage: aggregateUsage(providerResults),
      };
    }

    if (
      providerCalls === MAX_PROVIDER_CALLS_PER_MESSAGE ||
      toolExecutions + toolCalls.length >
        MAX_TOOL_EXECUTIONS_PER_MESSAGE
    ) {
      throw createInvalidToolRequestError();
    }

    try {
      for (const toolCall of toolCalls) {
        toolRegistry.validateToolCall({
          ...toolCall,
          role,
        });
      }
    } catch (error) {
      if (error instanceof AssistantToolError) {
        throw createInvalidToolRequestError();
      }
      throw error;
    }

    providerMessages.push({
      role: "assistant",
      content: result.text ?? "",
      toolCalls,
    });

    for (const toolCall of toolCalls) {
      let content;

      try {
        content = await toolRegistry.executeToolCall({
          ...toolCall,
          role,
        });
      } catch (error) {
        if (error instanceof AssistantToolError) {
          if (error.code === TOOL_ERROR_CODES.TIMEOUT) {
            throw new AssistantProviderError(
              ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
              { retryable: true }
            );
          }

          throw createInvalidToolRequestError();
        }
        throw error;
      }

      toolExecutions += 1;
      providerMessages.push({
        role: "tool",
        name: toolCall.name,
        content,
        ...(toolCall.id === undefined
          ? {}
          : { id: toolCall.id }),
      });
    }
  }

  throw createInvalidToolRequestError();
}

module.exports = {
  runAssistantToolTurn,
};
