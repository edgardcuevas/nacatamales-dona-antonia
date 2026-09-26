const {
  successResponse,
} = require("../../shared/http-response");

const settingsService = require("./settings.service");

async function getPublicSettingsController(request, response) {
  const settings = await settingsService.getPublicSettings();

  return successResponse(
    response,
    200,
    { settings },
    "Settings retrieved successfully"
  );
}

async function getAdministrativeSettingsController(request, response) {
  const settings = await settingsService.getAdminSettings();

  return successResponse(
    response,
    200,
    { settings },
    "Settings retrieved successfully"
  );
}

async function updateSettingsController(request, response) {
  const settings = await settingsService.updateSettings(
    request.settingsUpdates
  );

  return successResponse(
    response,
    200,
    { settings },
    "Settings updated successfully"
  );
}

module.exports = {
  getPublicSettingsController,
  getAdministrativeSettingsController,
  updateSettingsController,
};