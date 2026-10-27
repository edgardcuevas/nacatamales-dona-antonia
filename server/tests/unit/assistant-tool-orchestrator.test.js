const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AssistantProviderError,
} = require(
  "../../src/modules/assistant/assistant.provider-error"
);
const {
  createAssistantToolRegistry,
} = require(
  "../../src/modules/assistant/assistant.tool-registry"
);
const {
  runAssistantToolTurn,
} = require(
  "../../src/modules/assistant/assistant.tool-orchestrator"
);

const EMPTY_PARAMETERS = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

function createTool({
  name = "lookup_schedule",
  allowedRoles = ["ADMIN", "EDITOR"],
  handler = async () => ({ schedule: "8:00-17:00" }),
} = {}) {
  return {
    name,
    description: "Read a schedule",
    parameters: EMPTY_PARAMETERS,
    allowedRoles,
    mode: "read",
    handler,
  };
}

function functionCall(name = "lookup_schedule") {
  return { name, arguments: {} };
}

function response({
  text = "",
  toolCalls = [],
  inputTokens = 4,
  outputTokens = 2,
} = {}) {
  return {
    text,
    toolCalls,
    model: "gemini-test",
    usage: { inputTokens, outputTokens },
    finishReason: "STOP",
    blocked: false,
  };
}

test("a registered tool call runs once and returns a final answer", async () => {
  const providerInputs = [];
  const registry = createAssistantToolRegistry([
    createTool(),
  ]);
  const replies = [
    response({ toolCalls: [functionCall()] }),
    response({
      text: "El horario es de 8:00 a 17:00.",
      inputTokens: 10,
      outputTokens: 5,
    }),
  ];
  const provider = {
    chat: async (input) => {
      providerInputs.push(input);
      return replies.shift();
    },
  };

  const result = await runAssistantToolTurn({
    provider,
    toolRegistry: registry,
    role: "EDITOR",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "¿Horario?" }],
  });

  assert.equal(result.text, "El horario es de 8:00 a 17:00.");
  assert.deepEqual(result.usage, {
    inputTokens: 14,
    outputTokens: 7,
  });
  assert.deepEqual(
    providerInputs[0].tools.map((tool) => tool.name),
    ["lookup_schedule"]
  );
  assert.deepEqual(providerInputs[1].messages.slice(1), [
    {
      role: "assistant",
      content: "",
      toolCalls: [functionCall()],
    },
    {
      role: "tool",
      name: "lookup_schedule",
      content: '{"schedule":"8:00-17:00"}',
    },
  ]);
});

test("tool calls execute sequentially and pass the current role to the registry", async () => {
  const executionOrder = [];
  const registry = createAssistantToolRegistry([
    createTool({
      name: "first_read",
      handler: async () => {
        executionOrder.push("first");
        return { value: 1 };
      },
    }),
    createTool({
      name: "second_read",
      handler: async () => {
        executionOrder.push("second");
        return { value: 2 };
      },
    }),
  ]);
  let providerCalls = 0;
  const provider = {
    chat: async () => {
      providerCalls += 1;
      return providerCalls === 1
        ? response({
            toolCalls: [
              functionCall("first_read"),
              functionCall("second_read"),
            ],
          })
        : response({ text: "Listo." });
    },
  };

  await runAssistantToolTurn({
    provider,
    toolRegistry: registry,
    role: "ADMIN",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "Consulta" }],
  });

  assert.deepEqual(executionOrder, ["first", "second"]);
  assert.equal(providerCalls, 2);
});

test("unauthorized and unknown tool requests fail before any handler runs", async () => {
  let handlerCalls = 0;
  const registry = createAssistantToolRegistry([
    createTool({
      allowedRoles: ["ADMIN"],
      handler: async () => {
        handlerCalls += 1;
        return { value: "private" };
      },
    }),
  ]);
  const provider = {
    chat: async () =>
      response({ toolCalls: [functionCall()] }),
  };

  await assert.rejects(
    runAssistantToolTurn({
      provider,
      toolRegistry: registry,
      role: "EDITOR",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    AssistantProviderError
  );

  assert.equal(handlerCalls, 0);

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () =>
          response({
            toolCalls: [functionCall("not_registered")],
          }),
      },
      toolRegistry: registry,
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    AssistantProviderError
  );
  assert.equal(handlerCalls, 0);
});

test("the per-message execution limit rejects a whole batch before execution", async () => {
  let handlerCalls = 0;
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async () => {
        handlerCalls += 1;
        return { value: true };
      },
    }),
  ]);

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () =>
          response({
            toolCalls: [
              functionCall(),
              functionCall(),
              functionCall(),
            ],
          }),
      },
      toolRegistry: registry,
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    AssistantProviderError
  );

  assert.equal(handlerCalls, 0);
});

test("the provider-call limit prevents an extra tool execution", async () => {
  let providerCalls = 0;
  let handlerCalls = 0;
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async () => {
        handlerCalls += 1;
        return { count: handlerCalls };
      },
    }),
  ]);

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () => {
          providerCalls += 1;
          return response({
            toolCalls: [functionCall()],
          });
        },
      },
      toolRegistry: registry,
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    AssistantProviderError
  );

  assert.equal(providerCalls, 3);
  assert.equal(handlerCalls, 2);
});

test("a tool handler timeout is reported as a provider timeout", async () => {
  const registry = createAssistantToolRegistry(
    [
      createTool({
        handler: () => new Promise(() => {}),
      }),
    ],
    { handlerTimeoutMs: 20 }
  );

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () =>
          response({ toolCalls: [functionCall()] }),
      },
      toolRegistry: registry,
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    (error) =>
      error instanceof AssistantProviderError &&
      error.code === "TIMEOUT"
  );
});

test("provider tool-call errors are normalized without swallowing handler failures", async () => {
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async () => {
        throw new Error("database unavailable");
      },
    }),
  ]);

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () =>
          response({ toolCalls: [functionCall()] }),
      },
      toolRegistry: registry,
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    /database unavailable/
  );
});
