const {
  successResponse,
} = require("../../shared/http-response");

const {
  getStatus,
  listConversations,
  listMessages,
  sendMessage,
  deleteConversation,
  getUsage,
} = require("./assistant.service");

function getAssistantStatusController(
  request,
  response
) {
  const status = getStatus();

  return successResponse(
    response,
    200,
    status,
    "Assistant status retrieved successfully"
  );
}

async function listAssistantConversationsController(
  request,
  response
) {
  const data = await listConversations({
    currentUser: request.currentUser,
    query: request.assistantListQuery,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant conversations retrieved successfully"
  );
}

async function listAssistantMessagesController(
  request,
  response
) {
  const data = await listMessages({
    currentUser: request.currentUser,
    conversationId: request.assistantConversationId,
    query: request.assistantMessageListQuery,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant messages retrieved successfully"
  );
}

async function sendAssistantMessageController(
  request,
  response
) {
  const data = await sendMessage({
    currentUser: request.currentUser,
    input: request.assistantMessageInput,
  });

  return successResponse(
    response,
    201,
    data,
    "Assistant message answered successfully"
  );
}

function writeAssistantStreamEvent(
  response,
  event,
  data
) {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  response.write(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

async function streamAssistantMessageController(
  request,
  response
) {
  response.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  const data = await sendMessage({
    currentUser: request.currentUser,
    input: request.assistantMessageInput,
    onTextChunk: (text) =>
      writeAssistantStreamEvent(response, "chunk", { text }),
  });

  writeAssistantStreamEvent(response, "complete", {
    success: true,
    message: "Assistant message answered successfully",
    data,
  });
  response.end();
}

async function deleteAssistantConversationController(
  request,
  response
) {
  const data = await deleteConversation({
    currentUser: request.currentUser,
    conversationId: request.assistantConversationId,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant conversation deleted successfully"
  );
}

async function getAssistantUsageController(
  request,
  response
) {
  const data = await getUsage({
    currentUser: request.currentUser,
    query: request.assistantUsageQuery,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant usage retrieved successfully"
  );
}

module.exports = {
  getAssistantStatusController,
  listAssistantConversationsController,
  listAssistantMessagesController,
  sendAssistantMessageController,
  streamAssistantMessageController,
  deleteAssistantConversationController,
  getAssistantUsageController,
};
