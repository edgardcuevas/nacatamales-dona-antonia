const {
  successResponse,
} = require("../../shared/http-response");

const {
  listMedia,
  getMediaById,
  updateMediaAltText,
  changeMediaStatus,
} = require("./media.service");

async function listMediaController(request, response) {
  const data = await listMedia(
    request.mediaListQuery
  );

  return successResponse(
    response,
    200,
    data,
    "Media retrieved successfully"
  );
}

async function getMediaController(request, response) {
  const media = await getMediaById(
    request.mediaId
  );

  return successResponse(
    response,
    200,
    { media },
    "Media record retrieved successfully"
  );
}

async function updateMediaController(
  request,
  response
) {
  const media = await updateMediaAltText({
    mediaId: request.mediaId,
    altText: request.mediaUpdates.altText,
  });

  return successResponse(
    response,
    200,
    { media },
    "Media alt text updated successfully"
  );
}

async function changeMediaStatusController(
  request,
  response
) {
  const media = await changeMediaStatus({
    mediaId: request.mediaId,
    isActive: request.mediaStatus.isActive,
  });

  return successResponse(
    response,
    200,
    { media },
    "Media status updated successfully"
  );
}

module.exports = {
  listMediaController,
  getMediaController,
  updateMediaController,
  changeMediaStatusController,
};
