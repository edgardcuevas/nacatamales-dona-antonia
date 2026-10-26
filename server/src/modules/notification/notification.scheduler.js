const env = require("../../config/env");
const announcementRepository = require(
  "../announcements/announcement.repository"
);
const notificationService = require(
  "./notification.service"
);

const {
  SCHEDULER_INTERVAL_MS,
  SCHEDULER_BATCH_LIMIT,
} = require("./notification.constants");

let timer = null;
let isRunning = false;

// Un tick nunca solapa con el anterior. Si un envio tarda mas que el
// intervalo, el siguiente tick se salta en vez de duplicar trabajo.
async function runNotificationSchedulerTick() {
  if (!env.webPush.enabled || isRunning) {
    return { processed: 0 };
  }

  isRunning = true;

  try {
    const announcementIds =
      await announcementRepository.listAnnouncementsAwaitingNotification(
        { limit: SCHEDULER_BATCH_LIMIT }
      );

    let processed = 0;

    for (const announcementId of announcementIds) {
      // notifyAnnouncementIfVisible reclaims the row atomically, so a
      // concurrent activation cannot produce a second delivery.
      const result =
        await notificationService.notifyAnnouncementIfVisible(
          announcementId
        );

      if (result) {
        processed += 1;
      }
    }

    return { processed };
  } catch (error) {
    console.error(
      "Notification scheduler tick failed:",
      error?.message ?? "unknown reason"
    );

    return { processed: 0 };
  } finally {
    isRunning = false;
  }
}

function startNotificationScheduler({
  intervalMs = SCHEDULER_INTERVAL_MS,
} = {}) {
  if (!env.webPush.enabled || timer) {
    return null;
  }

  timer = setInterval(() => {
    void runNotificationSchedulerTick();
  }, intervalMs);

  // The scheduler must never keep the process alive on its own.
  timer.unref();

  // Covers announcements scheduled before the server restarted.
  void runNotificationSchedulerTick();

  return timer;
}

function stopNotificationScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  runNotificationSchedulerTick,
  startNotificationScheduler,
  stopNotificationScheduler,
};
