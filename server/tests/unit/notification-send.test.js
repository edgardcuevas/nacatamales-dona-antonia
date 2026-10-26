const test = require("node:test");
const assert = require("node:assert/strict");
const {
  after,
  afterEach,
  mock,
} = require("node:test");

// VAPID keys generated for tests only. They never leave this file and
// are not the keys of any deployment.
const TEST_PUBLIC_KEY =
  "BElYtqfJ-YGAMo5Ga6FO930PFs5XhodM9h2CWM-gZ3Ra-U3yjaJtfjRd2JoNscMEDouoTFkupwE979GhdsCTQ6E";
const TEST_PRIVATE_KEY =
  "emdVLow-Tk4XwEqVVSh8tZpwF_T7Cx3P0znKWranYuo";

const TEST_ENVIRONMENT = Object.freeze({
  NODE_ENV: "test",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "notification_send_test",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  JWT_ACCESS_TOKEN_SECRET:
    "test-access-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL: "15m",
  JWT_REFRESH_TOKEN_SECRET:
    "test-refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_TOKEN_TTL: "30d",
  IMAGEKIT_PUBLIC_KEY: "test_public_key",
  IMAGEKIT_PRIVATE_KEY: "test_private_key",
  IMAGEKIT_URL_ENDPOINT:
    "https://ik.imagekit.io/test-imagekit-id",
  IMAGEKIT_FOLDER: "test-folder",
  GOOGLE_CLIENT_ID: "test_google_client_id",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  GOOGLE_REDIRECT_URI:
    "https://example.test/api/admin/youtube/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
  WEB_PUSH_PUBLIC_KEY: TEST_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY: TEST_PRIVATE_KEY,
  WEB_PUSH_SUBJECT: "mailto:test@example.com",
});

for (const [name, value] of Object.entries(
  TEST_ENVIRONMENT
)) {
  if (
    typeof process.env[name] !== "string" ||
    process.env[name].trim() === ""
  ) {
    process.env[name] = value;
  }
}

const AppError = require("../../src/errors/app-error");
const announcementRepository = require(
  "../../src/modules/announcements/announcement.repository"
);
const announcementService = require(
  "../../src/modules/announcements/announcement.service"
);
const notificationRepository = require(
  "../../src/modules/notification/notification.repository"
);
const notificationService = require(
  "../../src/modules/notification/notification.service"
);
const pushProvider = require(
  "../../src/modules/notification/push.provider"
);
const {
  runNotificationSchedulerTick,
} = require(
  "../../src/modules/notification/notification.scheduler"
);
const {
  MAX_NOTIFICATION_TITLE_LENGTH,
  MAX_NOTIFICATION_BODY_LENGTH,
} = require(
  "../../src/modules/notification/notification.constants"
);
const pool = require("../../src/database/pool");

after(async () => {
  await pool.end();
});

afterEach(() => {
  mock.restoreAll();
});

function createRawAnnouncement(overrides = {}) {
  return {
    id: 7,
    title: "Aviso de prueba",
    content: "Contenido del aviso",
    type: "INFO",
    is_active: 1,
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    image_media_id: null,
    notified_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    image_id: null,
    image_url: null,
    image_alt_text: null,
    image_width: null,
    image_height: null,
    ...overrides,
  };
}

function createSubscriptionRow(id) {
  return {
    id,
    endpoint: `https://fcm.googleapis.com/fcm/send/subscription-${id}`,
    p256dh:
      "BElYtqfJ-YGAMo5Ga6FO930PFs5XhodM9h2CWM-gZ3Ra-U3yjaJtfjRd2JoNscMEDouoTFkupwE979GhdsCTQ6E",
    auth: "emdVLow-Tk4XwEqVVSh8tZpwF_T7Cx3P0znKWranYuo",
  };
}

function assertAppError(error, statusCode, code) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.code, code);
}

function mockDeliveryEnvironment({
  subscriptions = [],
  send = async () => ({}),
} = {}) {
  const calls = {
    sent: [],
    succeeded: [],
    failed: [],
    removed: [],
  };

  mock.method(
    notificationRepository,
    "listSubscriptions",
    async () => subscriptions
  );
  mock.method(
    notificationRepository,
    "markSubscriptionSuccess",
    async (subscriptionId) => {
      calls.succeeded.push(subscriptionId);
    }
  );
  mock.method(
    notificationRepository,
    "registerSubscriptionFailure",
    async (subscriptionId, maxFailures) => {
      calls.failed.push({
        subscriptionId,
        maxFailures,
      });
    }
  );
  mock.method(
    notificationRepository,
    "deleteSubscriptionById",
    async (subscriptionId) => {
      calls.removed.push(subscriptionId);
      return true;
    }
  );
  mock.method(
    pushProvider,
    "sendNotification",
    async (subscription, payload) => {
      calls.sent.push({ subscription, payload });
      return send(subscription, payload);
    }
  );

  return calls;
}

test("push payload is bounded and identifies the announcement", () => {
  const payload =
    notificationService.buildNotificationPayload({
      id: 12,
      title: "T".repeat(120),
      content: "C".repeat(200),
    });
  const parsed = JSON.parse(payload);

  assert.equal(parsed.announcementId, 12);
  assert.equal(parsed.tag, "announcement-12");
  assert.equal(parsed.url, "/");
  assert.equal(
    parsed.title.length,
    MAX_NOTIFICATION_TITLE_LENGTH
  );
  assert.equal(
    parsed.body.length,
    MAX_NOTIFICATION_BODY_LENGTH
  );
  assert.ok(parsed.title.endsWith("…"));
  assert.ok(parsed.body.endsWith("…"));
});

test("dispatch sends one push per subscription and records success", async () => {
  const calls = mockDeliveryEnvironment({
    subscriptions: [
      createSubscriptionRow(1),
      createSubscriptionRow(2),
    ],
  });

  const result =
    await notificationService.dispatchAnnouncement(
      createRawAnnouncement()
    );

  assert.deepEqual(result, {
    total: 2,
    sent: 2,
    failed: 0,
    removed: 0,
  });
  assert.equal(calls.sent.length, 2);
  assert.deepEqual(calls.succeeded, [1, 2]);
  assert.equal(
    calls.sent[0].subscription.keys.p256dh,
    createSubscriptionRow(1).p256dh
  );
});

test("a 410 from the push service deletes the dead subscription", async () => {
  const gone = Object.assign(
    new Error("Subscription no longer valid"),
    { statusCode: 410 }
  );

  const calls = mockDeliveryEnvironment({
    subscriptions: [createSubscriptionRow(1)],
    send: async () => {
      throw gone;
    },
  });

  const result =
    await notificationService.dispatchAnnouncement(
      createRawAnnouncement()
    );

  assert.deepEqual(result, {
    total: 1,
    sent: 0,
    failed: 0,
    removed: 1,
  });
  assert.deepEqual(calls.removed, [1]);
  assert.deepEqual(calls.failed, []);
});

test("a transient failure increments the counter instead of deleting", async () => {
  const calls = mockDeliveryEnvironment({
    subscriptions: [createSubscriptionRow(3)],
    send: async () => {
      throw Object.assign(new Error("boom"), {
        statusCode: 500,
      });
    },
  });

  const result =
    await notificationService.dispatchAnnouncement(
      createRawAnnouncement()
    );

  assert.equal(result.failed, 1);
  assert.equal(result.removed, 0);
  assert.deepEqual(calls.removed, []);
  assert.equal(calls.failed.length, 1);
  assert.equal(calls.failed[0].subscriptionId, 3);
  assert.ok(calls.failed[0].maxFailures >= 1);
});

test("an announcement is claimed before it is delivered", async () => {
  const calls = mockDeliveryEnvironment({
    subscriptions: [createSubscriptionRow(1)],
  });
  let claimedId = null;
  mock.method(
    announcementRepository,
    "claimAnnouncementNotification",
    async (announcementId) => {
      claimedId = announcementId;
      return true;
    }
  );
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () => createRawAnnouncement()
  );

  const result =
    await notificationService.notifyAnnouncementIfVisible(
      7
    );

  assert.equal(claimedId, 7);
  assert.equal(result.sent, 1);
  assert.equal(calls.sent.length, 1);
});

test("a row that was already notified is not sent twice", async () => {
  const calls = mockDeliveryEnvironment();
  mock.method(
    announcementRepository,
    "claimAnnouncementNotification",
    async () => false
  );

  const result =
    await notificationService.notifyAnnouncementIfVisible(
      7
    );

  assert.equal(result, null);
  assert.equal(calls.sent.length, 0);
});

test("resending is refused for an announcement that is not visible", async () => {
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        is_active: 0,
      })
  );

  await assert.rejects(
    () => notificationService.resendAnnouncement(7),
    (error) => {
      assertAppError(
        error,
        409,
        "ANNOUNCEMENT_NOT_VISIBLE"
      );
      return true;
    }
  );
});

test("resending is refused within the cooldown window", async () => {
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () =>
      createRawAnnouncement({
        notified_at: new Date(),
      })
  );

  await assert.rejects(
    () => notificationService.resendAnnouncement(7),
    (error) => {
      assertAppError(
        error,
        409,
        "RESEND_TOO_SOON"
      );
      return true;
    }
  );
});

test("resending marks the row and delivers again", async () => {
  let marked = 0;
  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () => createRawAnnouncement()
  );
  mock.method(
    announcementRepository,
    "markAnnouncementNotified",
    async () => {
      marked += 1;
      return true;
    }
  );
  const calls = mockDeliveryEnvironment({
    subscriptions: [createSubscriptionRow(1)],
  });

  const result =
    await notificationService.resendAnnouncement(7);

  assert.equal(marked, 1);
  assert.equal(result.sent, 1);
  assert.equal(calls.sent.length, 1);
  assert.ok(result.notifiedAt);
});

test("publishing an announcement triggers the background dispatch once", async () => {
  const current = createRawAnnouncement({
    is_active: 0,
  });
  let backgroundCalls = 0;

  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () => current
  );
  mock.method(
    announcementRepository,
    "updateAnnouncementStatusById",
    async () => true
  );
  mock.method(
    notificationService,
    "notifyAnnouncementInBackground",
    () => {
      backgroundCalls += 1;
    }
  );

  await announcementService.changeAnnouncementStatus({
    announcementId: 7,
    isActive: true,
  });

  assert.equal(backgroundCalls, 1);
});

test("hiding an announcement never sends a notification", async () => {
  const current = createRawAnnouncement({
    is_active: 1,
  });
  let backgroundCalls = 0;

  mock.method(
    announcementRepository,
    "findAnnouncementById",
    async () => current
  );
  mock.method(
    announcementRepository,
    "updateAnnouncementStatusById",
    async () => true
  );
  mock.method(
    notificationService,
    "notifyAnnouncementInBackground",
    () => {
      backgroundCalls += 1;
    }
  );

  await announcementService.changeAnnouncementStatus({
    announcementId: 7,
    isActive: false,
  });

  assert.equal(backgroundCalls, 0);
});

test("the scheduler processes only the rows it can claim", async () => {
  const visited = [];
  mock.method(
    announcementRepository,
    "listAnnouncementsAwaitingNotification",
    async () => [1, 2]
  );
  mock.method(
    notificationService,
    "notifyAnnouncementIfVisible",
    async (announcementId) => {
      visited.push(announcementId);
      return announcementId === 1
        ? { sent: 1 }
        : null;
    }
  );

  const result =
    await runNotificationSchedulerTick();

  assert.deepEqual(visited, [1, 2]);
  assert.equal(result.processed, 1);
});

test("the claim UPDATE is conditional on visibility and notified_at", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      return [{ affectedRows: 1 }, []];
    }
  );

  const claimed =
    await announcementRepository.claimAnnouncementNotification(
      7
    );

  assert.equal(claimed, true);
  assert.equal(queries.length, 1);
  assert.match(
    queries[0].sql,
    /notified_at IS NULL/
  );
  assert.match(
    queries[0].sql,
    /is_active = 1/
  );
  assert.match(
    queries[0].sql,
    /starts_at <= CURRENT_TIMESTAMP/
  );
  assert.match(
    queries[0].sql,
    /ends_at > CURRENT_TIMESTAMP/
  );
  assert.deepEqual(queries[0].parameters, [7]);
});

test("a row already claimed by another request reports no claim", async () => {
  mock.method(
    pool,
    "execute",
    async () => [{ affectedRows: 0 }, []]
  );

  const claimed =
    await announcementRepository.claimAnnouncementNotification(
      7
    );

  assert.equal(claimed, false);
});

test("the scheduler query only selects visible, unnotified announcements", async () => {
  const queries = [];
  mock.method(
    pool,
    "execute",
    async (sql, parameters) => {
      queries.push({ sql, parameters });
      return [[{ id: 7 }], []];
    }
  );

  const ids =
    await announcementRepository.listAnnouncementsAwaitingNotification(
      { limit: 25 }
    );

  assert.deepEqual(ids, [7]);
  assert.match(
    queries[0].sql,
    /notified_at IS NULL/
  );
  assert.match(
    queries[0].sql,
    /is_active = 1/
  );
  assert.deepEqual(queries[0].parameters, [25]);
});
