const {
  successResponse,
} = require("../../shared/http-response");

const {
  getPublicKeyConfig,
  subscribe,
  unsubscribe,
  getSubscriptionStats,
  resendAnnouncement,
} = require("./notification.service");

function getPublicKeyController(request, response) {
  return successResponse(
    response,
    200,
    getPublicKeyConfig(),
    "Push notification configuration retrieved successfully"
  );
}

async function subscribeController(
  request,
  response
) {
  const result = await subscribe(
    request.pushSubscription
  );

  return successResponse(
    response,
    201,
    result,
    "Push subscription stored successfully"
  );
}

async function unsubscribeController(
  request,
  response
) {
  const result = await unsubscribe(
    request.pushUnsubscribe
  );

  return successResponse(
    response,
    200,
    result,
    "Push subscription removed successfully"
  );
}

async function getSubscriptionStatsController(
  request,
  response
) {
  const stats = await getSubscriptionStats();

  return successResponse(
    response,
    200,
    stats,
    "Push notification statistics retrieved successfully"
  );
}

async function resendAnnouncementController(
  request,
  response
) {
  const result = await resendAnnouncement(
    request.announcementId
  );

  return successResponse(
    response,
    200,
    result,
    "Announcement notification sent successfully"
  );
}

module.exports = {
  getPublicKeyController,
  subscribeController,
  unsubscribeController,
  getSubscriptionStatsController,
  resendAnnouncementController,
};
