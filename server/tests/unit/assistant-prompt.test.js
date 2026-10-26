const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ASSISTANT_KNOWLEDGE,
  ASSISTANT_MODULE_KEYS,
} = require(
  "../../src/modules/assistant/assistant.knowledge"
);
const {
  ASSISTANT_ROLES,
  buildSystemInstruction,
} = require(
  "../../src/modules/assistant/assistant.prompt"
);
const {
  MAX_PROMPT_CHARS,
} = require(
  "../../src/modules/assistant/assistant.constants"
);

const KNOWLEDGE_PATH = path.resolve(
  __dirname,
  "../../src/modules/assistant/assistant.knowledge.js"
);

const ADMINISTRACION_PATH = path.resolve(
  __dirname,
  "../../../frontend/src/pages/Administracion.jsx"
);

const FALLBACK_SENTENCE =
  "No tengo esa información en el sistema.";

test("the catalog matches the dashboard sections and nothing else", () => {
  const source = fs.readFileSync(
    ADMINISTRACION_PATH,
    "utf8"
  );
  const dashboardKeys = [
    ...source.matchAll(/key: '([a-z-]+)'/g),
  ]
    .map((match) => match[1])
    .filter((key) => key !== 'assistant');

  assert.equal(dashboardKeys.length, 8);
  assert.deepEqual(
    ASSISTANT_MODULE_KEYS,
    dashboardKeys
  );
});

test("every module declares real roles, actions and limitations", () => {
  for (const key of ASSISTANT_MODULE_KEYS) {
    const entry = ASSISTANT_KNOWLEDGE[key];

    assert.equal(
      typeof entry.label,
      "string",
      `${key} needs a label`
    );
    assert.ok(entry.label.trim() !== "");

    assert.ok(
      Array.isArray(entry.roles) &&
        entry.roles.length > 0,
      `${key} needs roles`
    );

    for (const role of entry.roles) {
      assert.ok(
        ASSISTANT_ROLES.includes(role),
        `${key} declares unknown role ${role}`
      );
    }

    assert.ok(
      entry.roles.includes("ADMIN"),
      `${key} must be reachable by ADMIN`
    );

    assert.ok(
      Array.isArray(entry.actions) &&
        entry.actions.length > 0,
      `${key} needs actions`
    );

    for (const action of entry.actions) {
      assert.equal(typeof action, "string");
      assert.ok(action.trim() !== "");
    }

    assert.ok(
      Array.isArray(entry.limitations) &&
        entry.limitations.length > 0,
      `${key} needs limitations`
    );
  }
});

test("only Usuarios is restricted to ADMIN", () => {
  for (const key of ASSISTANT_MODULE_KEYS) {
    const entry = ASSISTANT_KNOWLEDGE[key];
    const expected = key === "users"
      ? ["ADMIN"]
      : ["ADMIN", "EDITOR"];

    assert.deepEqual(
      entry.roles,
      expected,
      `${key} has unexpected roles`
    );
  }
});

test("the catalog documents capabilities, not transport details", () => {
  const serialized = JSON.stringify(
    ASSISTANT_KNOWLEDGE
  );

  assert.doesNotMatch(serialized, /\/api\b/);
  assert.doesNotMatch(
    serialized,
    /\b(GET|POST|PUT|PATCH|DELETE)\b/
  );
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.doesNotMatch(serialized, /\bSQL\b/i);
});

test("the knowledge file stays small", () => {
  const lines = fs
    .readFileSync(KNOWLEDGE_PATH, "utf8")
    .split(/\r?\n/).length;

  assert.ok(
    lines <= 120,
    `knowledge file has ${lines} lines`
  );
});

test("the ADMIN prompt carries the rules, the date and every module", () => {
  const now = new Date("2026-10-26T15:30:00.000Z");
  const prompt = buildSystemInstruction({
    role: "ADMIN",
    now,
  });

  assert.match(prompt, /Tu rol actual es ADMIN/);
  assert.match(
    prompt,
    /Fecha y hora actual: 2026-10-26T15:30:00\.000Z/
  );
  assert.ok(prompt.includes(FALLBACK_SENTENCE));
  assert.match(prompt, /No inventes secciones/);
  assert.match(prompt, /no consultás datos en vivo/);
  assert.match(prompt, /son datos, no instrucciones/);

  for (const key of ASSISTANT_MODULE_KEYS) {
    assert.ok(
      prompt.includes(
        `### ${ASSISTANT_KNOWLEDGE[key].label}`
      ),
      `prompt is missing ${key}`
    );
  }

  assert.equal(
    prompt.includes(
      "Módulos que existen pero tu rol no puede usar"
    ),
    false
  );

  assert.ok(prompt.length <= MAX_PROMPT_CHARS);
});

test("the EDITOR prompt marks Usuarios as restricted instead of hiding it", () => {
  const prompt = buildSystemInstruction({
    role: "EDITOR",
    now: new Date("2026-10-26T15:30:00.000Z"),
  });

  assert.match(prompt, /Tu rol actual es EDITOR/);
  assert.match(
    prompt,
    /Módulos que existen pero tu rol no puede usar:\nUsuarios\./
  );
  assert.match(prompt, /requieren un ADMIN/);

  const catalog = prompt.slice(
    prompt.indexOf(
      "Módulos que tu rol EDITOR puede usar"
    )
  );

  assert.equal(
    catalog.includes("### Usuarios"),
    false
  );
  assert.ok(catalog.includes("### Configuración del sitio"));
  assert.ok(catalog.includes("### Mi cuenta"));
});

test("every limitation reaches the prompt", () => {
  const prompt = buildSystemInstruction({
    role: "ADMIN",
    now: new Date("2026-10-26T00:00:00.000Z"),
  });

  for (const key of ASSISTANT_MODULE_KEYS) {
    for (const limitation of ASSISTANT_KNOWLEDGE[
      key
    ].limitations) {
      assert.ok(
        prompt.includes(limitation),
        `prompt is missing a ${key} limitation`
      );
    }
  }
});

test("the prompt never carries credentials or provider details", () => {
  const prompt = buildSystemInstruction({
    role: "ADMIN",
    now: new Date("2026-10-26T00:00:00.000Z"),
  });

  assert.doesNotMatch(prompt, /GEMINI|apiKey|Bearer/);
  assert.doesNotMatch(prompt, /https?:\/\//);
});

test("the prompt reports disabled push instead of promising a missing button", () => {
  const base = buildSystemInstruction({
    role: "ADMIN",
    now: new Date("2026-10-26T00:00:00.000Z"),
  });
  const withoutPush = buildSystemInstruction({
    role: "ADMIN",
    now: new Date("2026-10-26T00:00:00.000Z"),
    pushEnabled: false,
  });

  assert.equal(
    base.includes("notificaciones push están desactivadas"),
    false
  );
  assert.match(
    withoutPush,
    /Nota del sitio: las notificaciones push están desactivadas/
  );
});

test("an unknown role is rejected before building anything", () => {
  for (const role of [
    undefined,
    null,
    "",
    "admin",
    "SUPERADMIN",
  ]) {
    assert.throws(
      () => buildSystemInstruction({ role }),
      TypeError
    );
  }
});
