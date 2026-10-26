const AppError = require("../../errors/app-error");

const env = require("../../config/env");
const announcementRepository = require(
  "../announcements/announcement.repository"
);
const notificationRepository = require(
  "./notification.repository"
);
const pushProvider = require("./push.provider");

const {
  SEND_BATCH_SIZE,
  MAX_FAILURES_BEFORE_DELETE,
  MAX_NOTIFICATION_TITLE_LENGTH,
  MAX_NOTIFICATION_BODY_LENGTH,
  NOTIFICATION_ICON,
  NOTIFICATION_URL,
  NOTIFICATION_TAG_PREFIX,
} = require("./notification.constants");

const RESEND_COOLDOWN_MS = 30 * 1000;

function createPushNotConfiguredError() {
  return new AppError(
    503,
    "PUSH_NOT_CONFIGURED",
    "Push notifications are not configured on this server"
  );
}

function createAnnouncementNotVisibleError() {
  return new AppError(
    409,
    "ANNOUNCEMENT_NOT_VISIBLE",
    "The announcement is not visible right now"
  );
}

function createAnnouncementNotFoundError() {
  return new AppError(
    404,
    "ANNOUNCEMENT_NOT_FOUND",
    "The requested announcement does not exist"
  );
}

function createResendTooSoonError() {
  return new AppError(
    409,
    "RESEND_TOO_SOON",
    "Please wait before resending this notification"
  );
}

function isActiveRecord(value) {
  return value === true || value === 1;
}

function isAnnouncementVisible(
  announcement,
  now = new Date()
) {
  if (!isActiveRecord(announcement.is_active)) {
    return false;
  }

  if (
    announcement.starts_at !== null &&
    announcement.starts_at !== undefined &&
    new Date(announcement.starts_at) > now
  ) {
    return false;
  }

  if (
    announcement.ends_at !== null &&
    announcement.ends_at !== undefined &&
    new Date(announcement.ends_at) <= now
  ) {
    return false;
  }

  return true;
}

function truncate(value, maxLength) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildNotificationPayload(announcement) {
  return JSON.stringify({
    title: truncate(
      announcement.title,
      MAX_NOTIFICATION_TITLE_LENGTH
    ),
    body: truncate(
      announcement.content,
      MAX_NOTIFICATION_BODY_LENGTH
    ),
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: `${NOTIFICATION_TAG_PREFIX}${announcement.id}`,
    url: NOTIFICATION_URL,
    announcementId: Number(announcement.id),
  });
}

function toPushSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

function getPublicKeyConfig() {
  return {
    enabled: env.webPush.enabled,
    publicKey: env.webPush.enabled
      ? env.webPush.publicKey
      : null,
  };
}

async function subscribe({
  endpoint,
  p256dh,
  auth,
  userAgent,
}) {
  if (!env.webPush.enabled) {
    throw createPushNotConfiguredError();
  }

  const subscriptionId =
    await notificationRepository.upsertSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent,
    });

  return { subscriptionId };
}

async function unsubscribe({ endpoint }) {
  const deleted =
    await notificationRepository.deleteSubscriptionByEndpoint(
      endpoint
    );

  return { unsubscribed: deleted };
}

async function getSubscriptionStats() {
  const subscriptions =
    await notificationRepository.countSubscriptions();

  return {
    enabled: env.webPush.enabled,
    subscriptions,
  };
}

async function deliverBatch(batch, payload) {
  const results = await Promise.allSettled(
    batch.map((subscription) =>
      pushProvider.sendNotification(
        toPushSubscription(subscription),
        payload
      )
    )
  );

  const outcome = {
    sent: 0,
    failed: 0,
    removed: 0,
  };

  await Promise.all(
    results.map(async (result, index) => {
      const subscription = batch[index];

      try {
        if (result.status === "fulfilled") {
          outcome.sent += 1;
          await notificationRepository.markSubscriptionSuccess(
            subscription.id
          );
          return;
        }

        const statusCode =
          result.reason?.statusCode;

        if (
          statusCode === 404 ||
          statusCode === 410
        ) {
          outcome.removed += 1;
          await notificationRepository.deleteSubscriptionById(
            subscription.id
          );
          return;
        }

        outcome.failed += 1;
        await notificationRepository.registerSubscriptionFailure(
          subscription.id,
          MAX_FAILURES_BEFORE_DELETE
        );
      } catch (error) {
        outcome.failed += 1;
        console.error(
          "Push subscription bookkeeping failed:",
          error?.message ?? "unknown reason"
        );
      }
    })
  );

  return outcome;
}

async function dispatchAnnouncement(announcement) {
  if (!env.webPush.enabled) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0,
    };
  }

  const subscriptions =
    await notificationRepository.listSubscriptions();

  const payload =
    buildNotificationPayload(announcement);

  const totals = {
    total: subscriptions.length,
    sent: 0,
    failed: 0,
    removed: 0,
  };

  for (
    let index = 0;
    index < subscriptions.length;
    index += SEND_BATCH_SIZE
  ) {
    const batch = subscriptions.slice(
      index,
      index + SEND_BATCH_SIZE
    );
    const outcome = await deliverBatch(
      batch,
      payload
    );

    totals.sent += outcome.sent;
    totals.failed += outcome.failed;
    totals.removed += outcome.removed;
  }

  if (totals.failed > 0 || totals.removed > 0) {
    console.warn(
      `Push delivery for announcement ${announcement.id}: ${totals.sent} sent, ${totals.failed} failed, ${totals.removed} removed.`
    );
  }

  return totals;
}

async function notifyAnnouncementIfVisible(
  announcementId
) {
  if (!env.webPush.enabled) {
    return null;
  }

  const claimed =
    await announcementRepository.claimAnnouncementNotification(
      announcementId
    );

  if (!claimed) {
    return null;
  }

  const announcement =
    await announcementRepository.findAnnouncementById(
      announcementId
    );

  if (!announcement) {
    return null;
  }

  return dispatchAnnouncement(announcement);
}

function notifyAnnouncementInBackground(
  announcementId
) {
  if (!env.webPush.enabled) {
    return;
  }

  notifyAnnouncementIfVisible(announcementId).catch(
    (error) => {
      console.error(
        "Announcement push dispatch failed:",
        error?.code ??
          error?.message ??
          "unknown reason"
      );
    }
  );
}

async function resendAnnouncement(announcementId) {
  if (!env.webPush.enabled) {
    throw createPushNotConfiguredError();
  }

  const announcement =
    await announcementRepository.findAnnouncementById(
      announcementId
    );

  if (!announcement) {
    throw createAnnouncementNotFoundError();
  }

  if (!isAnnouncementVisible(announcement)) {
    throw createAnnouncementNotVisibleError();
  }

  const lastNotifiedAt = announcement.notified_at
    ? new Date(announcement.notified_at).getTime()
    : null;
  if (
    lastNotifiedAt !== null &&
    Date.now() - lastNotifiedAt < RESEND_COOLDOWN_MS
  ) {
    throw createResendTooSoonError();
  }

  await announcementRepository.markAnnouncementNotified(
    announcementId
  );

  const totals =
    await dispatchAnnouncement(announcement);

  return {
    ...totals,
    notifiedAt: new Date().toISOString(),
  };
}

module.exports = {
  getPublicKeyConfig,
  subscribe,
  unsubscribe,
  getSubscriptionStats,
  dispatchAnnouncement,
  notifyAnnouncementIfVisible,
  notifyAnnouncementInBackground,
  resendAnnouncement,
  buildNotificationPayload,
  isAnnouncementVisible,
};
