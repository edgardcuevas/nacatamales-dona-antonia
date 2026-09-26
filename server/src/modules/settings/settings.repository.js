const pool = require("../../database/pool");

const SETTINGS_COLUMNS = Object.freeze({
  businessName: "business_name",
  tagline: "tagline",
  whatsappNumber: "whatsapp_number",
  facebookUrl: "facebook_url",
  instagramUrl: "instagram_url",
  address: "address",
  latitude: "latitude",
  longitude: "longitude",
  scheduleText: "schedule_text",
});

async function getSettings() {
  const [rows] = await pool.execute(
    "SELECT * FROM site_settings WHERE id = 1 LIMIT 1"
  );

  return rows[0] ?? null;
}

async function updateSettings(updates) {
  const entries = Object.entries(updates);
  if (
    entries.length === 0 ||
    entries.some(([key]) => !Object.hasOwn(SETTINGS_COLUMNS, key))
  ) {
    throw new Error("Invalid settings update");
  }

  const setSql = entries
    .map(([key]) => `${SETTINGS_COLUMNS[key]} = ?`)
    .join(", ");
  const values = entries.map(([, value]) => value);

  await pool.execute(
    `UPDATE site_settings SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    values
  );

  return getSettings();
}

module.exports = {
  getSettings,
  updateSettings,
};