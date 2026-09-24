const {
  successResponse,
} = require("../../shared/http-response");

const {
  listPublicAnnouncements,
  listAdministrativeAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  changeAnnouncementStatus,
} = require("./announcement.service");

async function listPublicAnnouncementsController(
  request,
  response
) {
  const announcements =
    await listPublicAnnouncements(
      request.announcementListQuery
    );

  return successResponse(
    response,
    200,
    { announcements },
    "Announcements retrieved successfully"
  );
}

async function listAdministrativeAnnouncementsController(
  request,
  response
) {
  const data =
    await listAdministrativeAnnouncements(
      request.announcementListQuery
    );

  return successResponse(
    response,
    200,
    data,
    "Administrative announcements retrieved successfully"
  );
}

async function getAnnouncementController(
  request,
  response
) {
  const announcement =
    await getAnnouncementById(
      request.announcementId
    );

  return successResponse(
    response,
    200,
    { announcement },
    "Administrative announcement retrieved successfully"
  );
}

async function createAnnouncementController(
  request,
  response
) {
  const announcement =
    await createAnnouncement(
      request.announcementInput
    );

  return successResponse(
    response,
    201,
    { announcement },
    "Announcement created successfully"
  );
}

async function updateAnnouncementController(
  request,
  response
) {
  const announcement =
    await updateAnnouncement({
      announcementId: request.announcementId,
      updates: request.announcementUpdates,
    });

  return successResponse(
    response,
    200,
    { announcement },
    "Announcement updated successfully"
  );
}

async function changeAnnouncementStatusController(
  request,
  response
) {
  const announcement =
    await changeAnnouncementStatus({
      announcementId: request.announcementId,
      isActive:
        request.announcementStatus.isActive,
    });

  return successResponse(
    response,
    200,
    { announcement },
    "Announcement status updated successfully"
  );
}

module.exports = {
  listPublicAnnouncementsController,
  listAdministrativeAnnouncementsController,
  getAnnouncementController,
  createAnnouncementController,
  updateAnnouncementController,
  changeAnnouncementStatusController,
};
