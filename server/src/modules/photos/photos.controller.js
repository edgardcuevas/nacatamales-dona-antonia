const {
  successResponse,
} = require("../../shared/http-response");

const photosService = require("./photos.service");

async function listPublicPhotosController(request, response) {
  const photos = await photosService.listPublicPhotos();
  return successResponse(
    response,
    200,
    { photos },
    "Photos retrieved successfully"
  );
}

async function getPublicPhotoController(request, response) {
  const photo = await photosService.getPublicPhotoById(request.photoId);
  return successResponse(
    response,
    200,
    { photo },
    "Photo retrieved successfully"
  );
}

async function listAdministrativePhotosController(request, response) {
  const data = await photosService.listAdministrativePhotos(
    request.photoListQuery
  );
  return successResponse(
    response,
    200,
    data,
    "Administrative photos retrieved successfully"
  );
}

async function getPhotoController(request, response) {
  const photo = await photosService.getPhotoById(request.photoId);
  return successResponse(
    response,
    200,
    { photo },
    "Administrative photo retrieved successfully"
  );
}

async function createPhotoController(request, response) {
  const photo = await photosService.createPhoto(request.photoInput);
  return successResponse(
    response,
    201,
    { photo },
    "Photo created successfully"
  );
}

async function updatePhotoController(request, response) {
  const photo = await photosService.updatePhoto({
    photoId: request.photoId,
    updates: request.photoUpdates,
  });
  return successResponse(
    response,
    200,
    { photo },
    "Photo updated successfully"
  );
}

async function deletePhotoController(request, response) {
  const result = await photosService.deletePhoto(request.photoId);
  return successResponse(
    response,
    200,
    result,
    "Photo deleted successfully"
  );
}

module.exports = {
  listPublicPhotosController,
  getPublicPhotoController,
  listAdministrativePhotosController,
  getPhotoController,
  createPhotoController,
  updatePhotoController,
  deletePhotoController,
};