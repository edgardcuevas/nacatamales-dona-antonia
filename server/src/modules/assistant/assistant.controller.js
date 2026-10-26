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
  deleteAssistantConversationController,
  getAssistantUsageController,
};
