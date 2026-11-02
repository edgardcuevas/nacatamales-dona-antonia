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
  parameters = EMPTY_PARAMETERS,
  handler = async () => ({ schedule: "8:00-17:00" }),
} = {}) {
  return {
    name,
    description: "Read a schedule",
    parameters,
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

function createActionRegistry({
  validateAction = true,
} = {}) {
  const definition = {
    name: "set_product_availability",
    description: "Propose product availability.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "integer" },
        isAvailable: { type: "boolean" },
      },
      required: ["productId", "isAvailable"],
      additionalProperties: false,
    },
    mode: "write",
    allowedRoles: ["ADMIN", "EDITOR"],
    targetType: "product",
  };

  return {
    getActionDeclarations: () => [
      {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
    ],
    getActionDefinition: (name) =>
      name === definition.name ? definition : null,
    validateActionCall: ({ name, arguments: args }) =>
      validateAction && name === definition.name
        ? { name, arguments: args }
        : null,
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

test("streaming answers a plain question with a single provider call", async () => {
  const registry = createAssistantToolRegistry([createTool()]);
  const streamedInputs = [];
  const chunks = [];
  let chatCalls = 0;
  const provider = {
    chat: async () => {
      chatCalls += 1;
      return response({ text: "Respuesta no transmitida." });
    },
    chatStream: async (input, onTextChunk) => {
      streamedInputs.push(input);
      onTextChunk("Respuesta ");
      onTextChunk("final.");
      return response({
        text: "Respuesta final.",
        inputTokens: 10,
        outputTokens: 5,
      });
    },
  };

  const result = await runAssistantToolTurn({
    provider,
    toolRegistry: registry,
    role: "EDITOR",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "¿Horario?" }],
    streamFinal: true,
    onTextChunk: (chunk) => chunks.push(chunk),
  });

  assert.deepEqual(chunks, ["Respuesta ", "final."]);
  assert.equal(result.text, "Respuesta final.");
  assert.equal(chatCalls, 0);
  assert.equal(result.providerCalls, 1);
  assert.equal(streamedInputs.length, 1);
  assert.deepEqual(
    streamedInputs[0].tools.map((tool) => tool.name),
    ["lookup_schedule"]
  );
  assert.deepEqual(streamedInputs[0].messages, [
    { role: "user", content: "¿Horario?" },
  ]);
});

test("streaming executes a read tool and answers in the second round", async () => {
  const registry = createAssistantToolRegistry([
    createTool({
      handler: async () => ({ schedule: "8:00-17:00" }),
    }),
  ]);
  const streamedInputs = [];
  const chunks = [];
  let round = 0;
  const provider = {
    chat: async () =>
      response({ text: "Respuesta no transmitida." }),
    chatStream: async (input, onTextChunk) => {
      streamedInputs.push(input);
      round += 1;

      if (round === 1) {
        return response({ toolCalls: [functionCall()] });
      }

      onTextChunk("Horario final.");
      return response({ text: "Horario final." });
    },
  };

  const result = await runAssistantToolTurn({
    provider,
    toolRegistry: registry,
    role: "EDITOR",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "¿Horario?" }],
    streamFinal: true,
    onTextChunk: (chunk) => chunks.push(chunk),
  });

  assert.deepEqual(chunks, ["Horario final."]);
  assert.equal(result.providerCalls, 2);
  assert.equal(streamedInputs.length, 2);
  assert.equal(streamedInputs[1].messages.at(-1).role, "tool");
  assert.deepEqual(
    JSON.parse(streamedInputs[1].messages.at(-1).content),
    { schedule: "8:00-17:00" }
  );
});

test("streaming does not transmit a pending write proposal", async () => {
  const streamedChunks = [];
  let streamCalls = 0;

  const result = await runAssistantToolTurn({
    provider: {
      chat: async () => response(),
      chatStream: async () => {
        streamCalls += 1;
        return response({
          toolCalls: [
            {
              name: "set_product_availability",
              arguments: {
                productId: 12,
                isAvailable: false,
              },
            },
          ],
        });
      },
    },
    toolRegistry: createAssistantToolRegistry([createTool()]),
    actionRegistry: createActionRegistry(),
    role: "ADMIN",
    systemInstruction: "Proponer, no ejecutar.",
    messages: [{ role: "user", content: "Agotá pollo." }],
    streamFinal: true,
    onTextChunk: (chunk) => streamedChunks.push(chunk),
  });

  assert.ok(result.pendingActionRequest);
  assert.equal(streamCalls, 1);
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(streamedChunks, []);
});

  test("a write tool call returns a pending request without executing it", async () => {
    const registry = createAssistantToolRegistry([
      createTool(),
    ]);
    const writeRegistry = createActionRegistry();
    const providerCalls = [];
    const result = await runAssistantToolTurn({
      provider: {
        chat: async (input) => {
          providerCalls.push(input);
          return response({
            toolCalls: [
              {
                name: "set_product_availability",
                arguments: {
                  productId: 12,
                  isAvailable: false,
                },
              },
            ],
          });
        },
      },
      toolRegistry: registry,
      actionRegistry: writeRegistry,
      role: "EDITOR",
      systemInstruction: "Proponer, no ejecutar.",
      messages: [{ role: "user", content: "Agotá el producto." }],
    });

    assert.deepEqual(result.pendingActionRequest, {
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    });
    assert.equal(providerCalls.length, 1);
    assert.deepEqual(
      providerCalls[0].tools.map((tool) => tool.name),
      ["lookup_schedule", "set_product_availability"]
    );
  });

  test("a mixed read and write response executes the reads and asks for the action alone", async () => {
    let readCalls = 0;
    const registry = createAssistantToolRegistry([
      createTool({
        handler: async () => {
          readCalls += 1;
          return { schedule: "8:00-17:00" };
        },
      }),
    ]);
    const actionCall = {
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    };
    const replies = [
      response({
        toolCalls: [
          functionCall("lookup_schedule"),
          actionCall,
        ],
      }),
      response({ toolCalls: [actionCall] }),
    ];
    const providerInputs = [];

    const result = await runAssistantToolTurn({
      provider: {
        chat: async (input) => {
          providerInputs.push(input);
          return replies.shift();
        },
      },
      toolRegistry: registry,
      actionRegistry: createActionRegistry(),
      role: "ADMIN",
      systemInstruction: "Proponer, no ejecutar.",
      messages: [{ role: "user", content: "Cambiar producto." }],
    });

    assert.equal(readCalls, 1);
    assert.deepEqual(result.pendingActionRequest, {
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    });

    const correctionRound = providerInputs[1].messages.slice(1);

    assert.deepEqual(
      correctionRound.map((message) => message.role),
      ["assistant", "tool", "tool"]
    );
    assert.deepEqual(
      JSON.parse(correctionRound[1].content),
      { schedule: "8:00-17:00" }
    );
    assert.equal(
      JSON.parse(correctionRound[2].content).error,
      "ACTION_ALONE"
    );
  });

  test("invalid write arguments are rejected before proposal", async () => {
    await assert.rejects(
      runAssistantToolTurn({
        provider: {
          chat: async () =>
            response({
              toolCalls: [
                {
                  name: "set_product_availability",
                  arguments: { productId: "12" },
                },
              ],
            }),
        },
        toolRegistry: createAssistantToolRegistry([
          createTool(),
        ]),
        actionRegistry: createActionRegistry({
          validateAction: false,
        }),
        role: "ADMIN",
        systemInstruction: "Proponer, no ejecutar.",
        messages: [{ role: "user", content: "Cambiar producto." }],
      }),
      AssistantProviderError
    );
  });

  test("a write proposal is allowed after read results and aggregates provider usage", async () => {
    const registry = createAssistantToolRegistry([
      createTool({
        name: "search_products",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        handler: async () => ({
          products: [{ id: 12, name: "Pollo" }],
        }),
      }),
    ]);
    const replies = [
      response({
        toolCalls: [
          {
            name: "search_products",
            arguments: { query: "pollo" },
          },
        ],
        inputTokens: 10,
        outputTokens: 2,
      }),
      response({
        toolCalls: [
          {
            name: "set_product_availability",
            arguments: {
              productId: 12,
              isAvailable: false,
            },
          },
        ],
        inputTokens: 20,
        outputTokens: 4,
      }),
    ];
    const providerInputs = [];

    const result = await runAssistantToolTurn({
      provider: {
        chat: async (input) => {
          providerInputs.push(input);
          return replies.shift();
        },
      },
      toolRegistry: registry,
      actionRegistry: createActionRegistry(),
      role: "ADMIN",
      systemInstruction: "Proponer, no ejecutar.",
      messages: [{ role: "user", content: "Agotá pollo." }],
    });

    assert.equal(providerInputs.length, 2);
    assert.deepEqual(result.usage, {
      inputTokens: 30,
      outputTokens: 6,
    });
    assert.deepEqual(
      JSON.parse(providerInputs[1].messages.at(-1).content),
      { products: [{ id: 12, name: "Pollo" }] }
    );
    assert.deepEqual(result.pendingActionRequest, {
      name: "set_product_availability",
      arguments: {
        productId: 12,
        isAvailable: false,
      },
    });
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

test("an unknown tool is explained to the model and the turn still answers", async () => {
  let providerCalls = 0;
  const providerInputs = [];
  const provider = {
    chat: async (input) => {
      providerCalls += 1;
      providerInputs.push(input);

      return providerCalls === 1
        ? response({
            toolCalls: [functionCall("not_registered")],
          })
        : response({ text: "Todavía no puedo crear productos." });
    },
  };

  const result = await runAssistantToolTurn({
    provider,
    toolRegistry: createAssistantToolRegistry([createTool()]),
    role: "ADMIN",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "Creá un producto" }],
  });

  assert.equal(
    result.text,
    "Todavía no puedo crear productos."
  );
  assert.equal(providerCalls, 2);

  const feedback = JSON.parse(
    providerInputs[1].messages.at(-1).content
  );

  assert.equal(feedback.error, "UNKNOWN_TOOL");
});

test("a forbidden tool is explained to the model without running the handler", async () => {
  let handlerCalls = 0;
  let providerCalls = 0;
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
    chat: async () => {
      providerCalls += 1;

      return providerCalls === 1
        ? response({ toolCalls: [functionCall()] })
        : response({ text: "No tengo permiso para eso." });
    },
  };

  const result = await runAssistantToolTurn({
    provider,
    toolRegistry: registry,
    role: "EDITOR",
    systemInstruction: "Solo lectura.",
    messages: [{ role: "user", content: "Consulta" }],
  });

  assert.equal(result.text, "No tengo permiso para eso.");
  assert.equal(handlerCalls, 0);
});

test("a repeated invalid request after the correction is reported as tool misuse", async () => {
  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () =>
          response({
            toolCalls: [functionCall("not_registered")],
          }),
      },
      toolRegistry: createAssistantToolRegistry([createTool()]),
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
    }),
    (error) =>
      error instanceof AssistantProviderError &&
      error.code === "TOOL_MISUSE"
  );
});

test("streaming stops a runaway tool loop as tool misuse", async () => {
  let streamCalls = 0;

  await assert.rejects(
    runAssistantToolTurn({
      provider: {
        chat: async () => response(),
        chatStream: async () => {
          streamCalls += 1;
          return response({ toolCalls: [functionCall()] });
        },
      },
      toolRegistry: createAssistantToolRegistry([createTool()]),
      role: "ADMIN",
      systemInstruction: "Solo lectura.",
      messages: [{ role: "user", content: "Consulta" }],
      streamFinal: true,
      onTextChunk: () => {},
    }),
    (error) =>
      error instanceof AssistantProviderError &&
      error.code === "TOOL_MISUSE"
  );

  assert.equal(streamCalls, 3);
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
