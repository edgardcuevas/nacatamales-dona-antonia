const {
  successResponse,
} = require("../../shared/http-response");

const {
  listMedia,
  getMediaById,
  createUploadAuth,
  confirmMedia,
  updateMediaAltText,
  changeMediaStatus,
  deleteMedia,
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

async function createUploadAuthController(
  request,
  response
) {
  const upload = await createUploadAuth(
    request.mediaUploadInput
  );

  return successResponse(
    response,
    200,
    { upload },
    "Media upload authorization created successfully"
  );
}

async function confirmMediaController(
  request,
  response
) {
  const media = await confirmMedia(
    request.mediaConfirmInput
  );

  return successResponse(
    response,
    201,
    { media },
    "Media confirmed and registered successfully"
  );
}

async function deleteMediaController(
  request,
  response
) {
  const result = await deleteMedia({
    mediaId: request.mediaId,
  });

  return successResponse(
    response,
    200,
    result,
    "Media deleted successfully"
  );
}

module.exports = {
  listMediaController,
  getMediaController,
  createUploadAuthController,
  confirmMediaController,
  updateMediaController,
  changeMediaStatusController,
  deleteMediaController,
};
