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
