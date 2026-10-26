const crypto = require("node:crypto");

const pool = require("../../database/pool");

function hashEndpoint(endpoint) {
  return crypto
    .createHash("sha256")
    .update(endpoint, "utf8")
    .digest("hex");
}

// Re-subscribing with the same browser must update the keys, not create
// a second row: the endpoint is stable per browser install.
async function upsertSubscription({
  endpoint,
  p256dh,
  auth,
  userAgent,
}) {
  const endpointHash = hashEndpoint(endpoint);

  await pool.execute(
    `
      INSERT INTO push_subscriptions (
        endpoint,
        endpoint_hash,
        p256dh,
        auth,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        endpoint = VALUES(endpoint),
        p256dh = VALUES(p256dh),
        auth = VALUES(auth),
        user_agent = VALUES(user_agent),
        failure_count = 0
    `,
    [
      endpoint,
      endpointHash,
      p256dh,
      auth,
      userAgent,
    ]
  );

  const [rows] = await pool.execute(
    `
      SELECT id
      FROM push_subscriptions
      WHERE endpoint_hash = ?
      LIMIT 1
    `,
    [endpointHash]
  );

  return Number(rows[0]?.id);
}

async function deleteSubscriptionByEndpoint(endpoint) {
  const [result] = await pool.execute(
    `
      DELETE FROM push_subscriptions
      WHERE endpoint_hash = ?
    `,
    [hashEndpoint(endpoint)]
  );

  return result.affectedRows === 1;
}

async function deleteSubscriptionById(
  subscriptionId
) {
  const [result] = await pool.execute(
    `
      DELETE FROM push_subscriptions
      WHERE id = ?
    `,
    [subscriptionId]
  );

  return result.affectedRows === 1;
}

async function listSubscriptions() {
  const [rows] = await pool.execute(
    `
      SELECT id, endpoint, p256dh, auth
      FROM push_subscriptions
      ORDER BY id ASC
    `
  );

  return rows;
}

async function markSubscriptionSuccess(
  subscriptionId
) {
  await pool.execute(
    `
      UPDATE push_subscriptions
      SET
        failure_count = 0,
        last_success_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [subscriptionId]
  );
}

// A rejected delivery is not always a dead subscription, so the row
// survives until the failure count reaches the threshold. 404/410 are
// handled separately by the service because those are terminal.
async function registerSubscriptionFailure(
  subscriptionId,
  maxFailures
) {
  await pool.execute(
    `
      UPDATE push_subscriptions
      SET failure_count = failure_count + 1
      WHERE id = ?
    `,
    [subscriptionId]
  );

  await pool.execute(
    `
      DELETE FROM push_subscriptions
      WHERE id = ? AND failure_count >= ?
    `,
    [subscriptionId, maxFailures]
  );
}

async function countSubscriptions() {
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS total_subscriptions
      FROM push_subscriptions
    `
  );

  return Number(
    rows[0]?.total_subscriptions ?? 0
  );
}

module.exports = {
  hashEndpoint,
  upsertSubscription,
  deleteSubscriptionByEndpoint,
  deleteSubscriptionById,
  listSubscriptions,
  markSubscriptionSuccess,
  registerSubscriptionFailure,
  countSubscriptions,
};
