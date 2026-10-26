const webPush = require("web-push");

const env = require("../../config/env");

const {
  NOTIFICATION_TTL_SECONDS,
} = require("./notification.constants");

let isConfigured = false;

function ensureConfigured() {
  if (!env.webPush.enabled) {
    throw new Error(
      "Web Push is not configured"
    );
  }

  if (!isConfigured) {
    webPush.setVapidDetails(
      env.webPush.subject,
      env.webPush.publicKey,
      env.webPush.privateKey
    );
    isConfigured = true;
  }
}

function isEnabled() {
  return env.webPush.enabled;
}

function getPublicKey() {
  return env.webPush.publicKey;
}

// Every call goes through this property lookup on purpose: the unit
// tests replace sendNotification with mock.method and must be able to
// observe deliveries without reaching the network.
async function sendNotification(subscription, payload) {
  ensureConfigured();

  return webPush.sendNotification(
    subscription,
    payload,
    { TTL: NOTIFICATION_TTL_SECONDS }
  );
}

module.exports = {
  isEnabled,
  getPublicKey,
  sendNotification,
};
