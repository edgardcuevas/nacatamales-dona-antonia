const {
  successResponse,
} = require("../../shared/http-response");

const {
  listPublicVideos,
  getPublicVideoById,
  listAdministrativeVideos,
  getVideoById,
  createVideo,
  updateVideo,
  changeVideoStatus,
} = require("./video.service");

async function listPublicVideosController(
  request,
  response
) {
  const videos = await listPublicVideos();

  return successResponse(
    response,
    200,
    { videos },
    "Videos retrieved successfully"
  );
}

async function getPublicVideoController(
  request,
  response
) {
  const video = await getPublicVideoById(
    request.videoId
  );

  return successResponse(
    response,
    200,
    { video },
    "Video retrieved successfully"
  );
}

async function listAdministrativeVideosController(
  request,
  response
) {
  const data =
    await listAdministrativeVideos(
      request.videoListQuery
    );

  return successResponse(
    response,
    200,
    data,
    "Administrative videos retrieved successfully"
  );
}

async function getAdministrativeVideoController(
  request,
  response
) {
  const video = await getVideoById(
    request.videoId
  );

  return successResponse(
    response,
    200,
    { video },
    "Administrative video retrieved successfully"
  );
}

async function createVideoController(
  request,
  response
) {
  const video = await createVideo(
    request.videoInput
  );

  return successResponse(
    response,
    201,
    { video },
    "Video created successfully"
  );
}

async function updateVideoController(
  request,
  response
) {
  const video = await updateVideo({
    videoId: request.videoId,
    updates: request.videoUpdates,
  });

  return successResponse(
    response,
    200,
    { video },
    "Video updated successfully"
  );
}

async function changeVideoStatusController(
  request,
  response
) {
  const video = await changeVideoStatus({
    videoId: request.videoId,
    isActive: request.videoStatus.isActive,
  });

  return successResponse(
    response,
    200,
    { video },
    "Video status updated successfully"
  );
}

module.exports = {
  listPublicVideosController,
  getPublicVideoController,
  listAdministrativeVideosController,
  getAdministrativeVideoController,
  createVideoController,
  updateVideoController,
  changeVideoStatusController,
};
