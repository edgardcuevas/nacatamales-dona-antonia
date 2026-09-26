const AppError = require("../../errors/app-error");

const settingsRepository = require(
  "./settings.repository"
);

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid settings timestamp record");
  }

  return date.toISOString();
}

function toPublicSettings(row) {
  return {
    businessName: row.business_name,
    tagline: row.tagline,
    whatsappNumber: row.whatsapp_number,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    scheduleText: row.schedule_text,
  };
}

function toAdminSettings(row) {
  return {
    ...toPublicSettings(row),
    updatedAt: toIsoString(row.updated_at),
  };
}

function createSettingsNotConfiguredError() {
  return new AppError(
    500,
    "SETTINGS_NOT_CONFIGURED",
    "Site settings have not been configured"
  );
}

async function getPublicSettings() {
  const row = await settingsRepository.getSettings();
  if (!row) {
    throw createSettingsNotConfiguredError();
  }

  return toPublicSettings(row);
}

async function getAdminSettings() {
  const row = await settingsRepository.getSettings();
  if (!row) {
    throw createSettingsNotConfiguredError();
  }

  return toAdminSettings(row);
}

async function updateSettings(updates) {
  await settingsRepository.updateSettings(updates);
  return getAdminSettings();
}

module.exports = {
  toPublicSettings,
  toAdminSettings,
  getPublicSettings,
  getAdminSettings,
  updateSettings,
};