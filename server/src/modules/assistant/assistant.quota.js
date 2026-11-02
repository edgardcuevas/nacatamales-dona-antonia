const env = require("../../config/env");

function toDayKey(date) {
  return date.toISOString().slice(0, 10);
}

// El contador es del proceso y del proyecto, no del usuario: el limite
// gratuito de Gemini se mide por proyecto. Se reinicia cuando cambia el
// dia UTC.
function createAssistantQuota({
  limit,
  now = () => new Date(),
}) {
  let dayKey = null;
  let used = 0;

  function current() {
    const key = toDayKey(now());

    if (key !== dayKey) {
      dayKey = key;
      used = 0;
    }

    return {
      limit,
      used,
      remaining:
        limit > 0 ? Math.max(limit - used, 0) : null,
      exhausted: limit > 0 && used >= limit,
    };
  }

  function record(count) {
    if (!Number.isSafeInteger(count) || count <= 0) {
      return current();
    }

    current();
    used += count;

    return current();
  }

  // Solo para tests: mismo patron que resetAssistantRateLimiters.
  function reset() {
    dayKey = null;
    used = 0;
  }

  return Object.freeze({ current, record, reset });
}

module.exports = {
  createAssistantQuota,
  assistantQuota: createAssistantQuota({
    limit: env.assistant.dailyProviderCalls,
  }),
};
