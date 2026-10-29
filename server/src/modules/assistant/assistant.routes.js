const express = require("express");

const authenticate = require(
  "../../middlewares/authenticate.middleware"
);
const requireActiveUser = require(
  "../../middlewares/require-active-user.middleware"
);
const authorizeRoles = require(
  "../../middlewares/authorize-roles.middleware"
);

const {
  getAssistantStatusController,
  listAssistantConversationsController,
  listAssistantMessagesController,
  sendAssistantMessageController,
  streamAssistantMessageController,
  deleteAssistantConversationController,
  getAssistantUsageController,
} = require("./assistant.controller");
const {
  confirmAssistantActionController,
  cancelAssistantActionController,
} = require("./assistant.action.controller");

const {
  assistantRateLimiter,
} = require(
  "../../middlewares/assistant-rate-limit.middleware"
);

const {
  validateAssistantMessageBody,
  validateAssistantConversationId,
  validateAssistantConversationListQuery,
  validateAssistantMessageListQuery,
  validateAssistantUsageQuery,
} = require("./assistant.validator");
const {
  validateAssistantActionToken,
  validateEmptyAssistantActionBody,
} = require("./assistant.action.validator");

const router = express.Router();

router.use(
  authenticate,
  requireActiveUser,
  authorizeRoles("ADMIN", "EDITOR"),
  assistantRateLimiter
);

router.get("/status", getAssistantStatusController);

router.get(
  "/conversations",
  validateAssistantConversationListQuery,
  listAssistantConversationsController
);

router.get(
  "/conversations/:conversationId/messages",
  validateAssistantConversationId,
  validateAssistantMessageListQuery,
  listAssistantMessagesController
);

router.delete(
  "/conversations/:conversationId",
  validateAssistantConversationId,
  deleteAssistantConversationController
);

router.post(
  "/messages",
  validateAssistantMessageBody,
  sendAssistantMessageController
);

router.post(
  "/messages/stream",
  validateAssistantMessageBody,
  streamAssistantMessageController
);

router.post(
  "/actions/:token/confirm",
  validateAssistantActionToken,
  validateEmptyAssistantActionBody,
  confirmAssistantActionController
);

router.post(
  "/actions/:token/cancel",
  validateAssistantActionToken,
  validateEmptyAssistantActionBody,
  cancelAssistantActionController
);

router.get(
  "/usage",
  authorizeRoles("ADMIN"),
  validateAssistantUsageQuery,
  getAssistantUsageController
);

module.exports = router;
