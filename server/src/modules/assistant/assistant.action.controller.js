const {
  successResponse,
} = require("../../shared/http-response");
const {
  confirmAction,
  cancelAction,
} = require("./assistant.action.service");

async function confirmAssistantActionController(
  request,
  response
) {
  const data = await confirmAction({
    currentUser: request.currentUser,
    token: request.assistantActionToken,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant action confirmed successfully"
  );
}

async function cancelAssistantActionController(
  request,
  response
) {
  const data = await cancelAction({
    currentUser: request.currentUser,
    token: request.assistantActionToken,
  });

  return successResponse(
    response,
    200,
    data,
    "Assistant action cancelled successfully"
  );
}

module.exports = {
  confirmAssistantActionController,
  cancelAssistantActionController,
};
