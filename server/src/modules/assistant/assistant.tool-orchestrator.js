const {
  MAX_PROVIDER_CALLS_PER_MESSAGE,
  MAX_TOOL_EXECUTIONS_PER_MESSAGE,
  MAX_TOOL_MISUSE_CORRECTIONS,
} = require("./assistant.constants");
const {
  AssistantToolError,
  TOOL_ERROR_CODES,
} = require("./assistant.tool-registry");
const {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
} = require("./assistant.provider-error");

const FEEDBACK_CODES = Object.freeze({
  UNKNOWN_TOOL: "UNKNOWN_TOOL",
  FORBIDDEN_TOOL: "FORBIDDEN_TOOL",
  INVALID_TOOL_ARGUMENTS: "INVALID_TOOL_ARGUMENTS",
  TOOL_LIMIT: "TOOL_LIMIT",
  ACTION_ALONE: "ACTION_ALONE",
});

const FEEDBACK_MESSAGES = Object.freeze({
  UNKNOWN_TOOL:
    "Esa herramienta no existe. Usá solo las que están declaradas.",
  FORBIDDEN_TOOL:
    "Tu rol no puede usar esa herramienta.",
  INVALID_TOOL_ARGUMENTS:
    "Los argumentos no cumplen el esquema de la herramienta.",
  TOOL_LIMIT:
    "Hacé una sola operación por turno.",
  ACTION_ALONE:
    "La acción quedó descartada porque no se propone junto con lecturas. Proponela sola en el siguiente turno, usando los datos ya obtenidos.",
});

function createInvalidToolRequestError() {
  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.INVALID_RESPONSE
  );
}

function createToolMisuseError() {
  return new AssistantProviderError(
    ASSISTANT_PROVIDER_ERROR_CODES.TOOL_MISUSE
  );
}

function toolFeedback(code) {
  return JSON.stringify({
    error: code,
    message: FEEDBACK_MESSAGES[code],
  });
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
  actionRegistry,
  role,
  systemInstruction,
  messages,
  maxOutputTokens,
  timeoutMs,
  streamFinal = false,
  onTextChunk,
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

  if (
    streamFinal &&
    (typeof provider.chatStream !== "function" ||
      typeof onTextChunk !== "function")
  ) {
    throw new TypeError(
      "A streaming provider and text chunk callback are required"
    );
  }

  const tools = toolRegistry.getToolDeclarations(role);
  const actionTools = actionRegistry
    ? actionRegistry.getActionDeclarations(role)
    : [];
  const toolNames = new Set();

  for (const tool of [...tools, ...actionTools]) {
    if (toolNames.has(tool.name)) {
      throw new TypeError(
        `Duplicate assistant tool name: ${tool.name}`
      );
    }
    toolNames.add(tool.name);
  }

  const toolDeclarations = [...tools, ...actionTools];
  const providerMessages = [...messages];
  const providerResults = [];
  let toolExecutions = 0;
  let misuseCorrections = 0;

  function pushAssistantRound(result, toolCalls) {
    providerMessages.push({
      role: "assistant",
      content: result.text ?? "",
      toolCalls,
    });
  }

  function pushToolMessage(toolCall, content) {
    providerMessages.push({
      role: "tool",
      name: toolCall.name,
      content,
      ...(toolCall.id === undefined
        ? {}
        : { id: toolCall.id }),
    });
  }

  function validateReadCall(toolCall) {
    try {
      toolRegistry.validateToolCall({
        ...toolCall,
        role,
      });
      return null;
    } catch (error) {
      if (error instanceof AssistantToolError) {
        return error.code;
      }

      throw error;
    }
  }

  async function executeReadCall(toolCall) {
    try {
      return await toolRegistry.executeToolCall({
        ...toolCall,
        role,
      });
    } catch (error) {
      if (
        error instanceof AssistantToolError &&
        error.code === TOOL_ERROR_CODES.TIMEOUT
      ) {
        throw new AssistantProviderError(
          ASSISTANT_PROVIDER_ERROR_CODES.TIMEOUT,
          { retryable: true }
        );
      }

      throw error;
    }
  }

  async function requestRound() {
    const input = {
      systemInstruction,
      messages: providerMessages,
      tools: toolDeclarations,
      maxOutputTokens,
      timeoutMs,
    };

    return streamFinal
      ? provider.chatStream(input, onTextChunk)
      : provider.chat(input);
  }

  function finalize(result) {
    return {
      ...result,
      usage: aggregateUsage(providerResults),
      providerCalls: providerResults.length,
    };
  }

  for (
    let providerCalls = 1;
    providerCalls <= MAX_PROVIDER_CALLS_PER_MESSAGE;
    providerCalls += 1
  ) {
    const result = await requestRound();

    providerResults.push(result);

    if (result.blocked) {
      return finalize(result);
    }

    const toolCalls = result.toolCalls ?? [];

    if (!Array.isArray(toolCalls)) {
      throw createInvalidToolRequestError();
    }

    if (toolCalls.length === 0) {
      return finalize(result);
    }

    const actionCalls = actionRegistry
      ? toolCalls.filter((toolCall) =>
          actionRegistry.getActionDefinition(
            toolCall?.name
          )
        )
      : [];
    const readCalls = toolCalls.filter(
      (toolCall) => !actionCalls.includes(toolCall)
    );
    const canCorrect =
      misuseCorrections < MAX_TOOL_MISUSE_CORRECTIONS &&
      providerCalls < MAX_PROVIDER_CALLS_PER_MESSAGE;

    const feedBack = ({ notices }) => {
      if (!canCorrect) {
        throw createToolMisuseError();
      }

      misuseCorrections += 1;
      pushAssistantRound(result, toolCalls);

      for (const [toolCall, code] of notices) {
        pushToolMessage(toolCall, toolFeedback(code));
      }
    };

    if (readCalls.length === 0) {
      const notices = [];
      let validatedAction = null;

      if (toolCalls.length !== 1) {
        for (const toolCall of toolCalls) {
          notices.push([
            toolCall,
            FEEDBACK_CODES.TOOL_LIMIT,
          ]);
        }
      } else {
        const definition =
          actionRegistry.getActionDefinition(
            actionCalls[0].name
          );
        const allowed =
          definition.allowedRoles.includes(role);

        validatedAction = allowed
          ? actionRegistry.validateActionCall({
              ...actionCalls[0],
              role,
            })
          : null;

        if (!validatedAction) {
          notices.push([
            actionCalls[0],
            allowed
              ? FEEDBACK_CODES.INVALID_TOOL_ARGUMENTS
              : FEEDBACK_CODES.FORBIDDEN_TOOL,
          ]);
        }
      }

      if (notices.length === 0) {
        return {
          ...finalize(result),
          pendingActionRequest: validatedAction,
        };
      }

      feedBack({ notices });
      continue;
    }

    if (actionCalls.length > 0) {
      const invalidReads = [];

      for (const readCall of readCalls) {
        const code = validateReadCall(readCall);

        if (code !== null) {
          invalidReads.push([readCall, code]);
        }
      }

      if (invalidReads.length > 0) {
        feedBack({ notices: invalidReads });
        continue;
      }

      if (!canCorrect) {
        throw createToolMisuseError();
      }

      misuseCorrections += 1;
      pushAssistantRound(result, toolCalls);

      for (const toolCall of toolCalls) {
        if (actionCalls.includes(toolCall)) {
          pushToolMessage(
            toolCall,
            toolFeedback(FEEDBACK_CODES.ACTION_ALONE)
          );
          continue;
        }

        const content = await executeReadCall(toolCall);
        toolExecutions += 1;
        pushToolMessage(toolCall, content);
      }

      continue;
    }

    const invalidReads = [];

    for (const readCall of readCalls) {
      const code = validateReadCall(readCall);

      if (code !== null) {
        invalidReads.push([readCall, code]);
      }
    }

    if (invalidReads.length > 0) {
      feedBack({ notices: invalidReads });
      continue;
    }

    if (
      providerCalls === MAX_PROVIDER_CALLS_PER_MESSAGE ||
      toolExecutions + toolCalls.length >
        MAX_TOOL_EXECUTIONS_PER_MESSAGE
    ) {
      feedBack({
        notices: toolCalls.map((toolCall) => [
          toolCall,
          FEEDBACK_CODES.TOOL_LIMIT,
        ]),
      });
      continue;
    }

    pushAssistantRound(result, toolCalls);

    for (const toolCall of toolCalls) {
      const content = await executeReadCall(toolCall);
      toolExecutions += 1;
      pushToolMessage(toolCall, content);
    }
  }

  throw createToolMisuseError();
}

module.exports = {
  runAssistantToolTurn,
};
