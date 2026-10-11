const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getSastClock,
  withinSafeStartWindow,
  constantTimeSecretMatch
} = require("./trigger");

test("SAST clock converts UTC timestamps to South African time", () => {
  const clock = getSastClock(new Date("2026-10-11T01:05:00.000Z"));
  assert.equal(clock.display, "03:05");
  assert.equal(clock.hhmm, 305);
});

test("safe production start window includes 03:00 and excludes 07:25", () => {
  assert.equal(withinSafeStartWindow({ hhmm: 300 }), true);
  assert.equal(withinSafeStartWindow({ hhmm: 724 }), true);
  assert.equal(withinSafeStartWindow({ hhmm: 725 }), false);
  assert.equal(withinSafeStartWindow({ hhmm: 729 }), false);
  assert.equal(withinSafeStartWindow({ hhmm: 730 }), false);
  assert.equal(withinSafeStartWindow({ hhmm: 259 }), false);
});

test("external trigger authorization requires an exact Bearer secret", () => {
  assert.equal(constantTimeSecretMatch("secret-value", "Bearer secret-value"), true);
  assert.equal(constantTimeSecretMatch("secret-value", "secret-value"), false);
  assert.equal(constantTimeSecretMatch("secret-value", "Bearer wrong"), false);
  assert.equal(constantTimeSecretMatch("", "Bearer secret-value"), false);
  assert.equal(constantTimeSecretMatch("secret-value", undefined), false);
});

test("workflow dispatch sends the selected batch without waiting for scan completion", async () => {
  const { dispatchWorker } = require("./trigger");
  let captured;
  const result = await dispatchWorker({
    token: "test-token",
    batch: 7,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { status: 204 };
    }
  });
  assert.equal(result.accepted, true);
  assert.equal(result.status, 204);
  assert.equal(captured.url, "https://api.github.com/repos/dev-johan-swart/Site-Rescue-Studio/actions/workflows/automation-worker.yml/dispatches");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(captured.options.body), {
    ref: "main",
    inputs: { batch: "7" }
  });
});

test("workflow dispatch treats non-204 responses as failures", async () => {
  const { dispatchWorker } = require("./trigger");
  await assert.rejects(
    dispatchWorker({
      token: "test-token",
      batch: 1,
      fetchImpl: async () => ({ status: 403 })
    }),
    /HTTP 403/
  );
});
