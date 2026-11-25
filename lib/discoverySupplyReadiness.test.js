const test = require("node:test");
const assert = require("node:assert/strict");

test("provider allocation is shared across remaining bounded provider slots", () => {
  const { providerCandidateLimitForStage } = require("./discoveryProviders");
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 0, 8, 20, 1), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 1, 8, 13, 2), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 2, 8, 6, 3), 6);
  assert.equal(providerCandidateLimitForStage("gauteng", 0, 8, 20, 1), 7);
  assert.equal(providerCandidateLimitForStage("south_africa", 2, 8, 11, 3), 11);
  assert.equal(providerCandidateLimitForStage("gauteng", 0, 2, 20, 1), 10);
});

test("failed provider HTTP requests are retained in discovery diagnostics", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  await assert.rejects(discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [{ label: "electricians", city: "Pretoria" }] },
    queries: [{ label: "electricians", city: "Pretoria" }],
    providerOrder: ["websdocs"],
    isProviderAvailable: async () => true,
    fetchImpl: async () => ({
      ok: false, status: 503,
      headers: { get: name => name.toLowerCase() === "retry-after" ? "120" : null },
      async json() { return { message: "upstream unavailable" }; }
    })
  }), error => {
    assert.equal(error.httpRequests.length, 1);
    assert.equal(error.httpRequests[0].status, 503);
    assert.equal(error.httpRequests[0].retryAfter, "120");
    assert.equal(error.attempts[0].httpRequestCount, 1);
    return true;
  });
});

test("permanent MyCityInfo archive misses advance only the active stage cursor", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  const recorded = [];
  await assert.rejects(discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [{ label: "electricians", city: "Pretoria" }] },
    queries: [{ label: "electricians", city: "Pretoria" }],
    providerOrder: ["mycityinfo"],
    isProviderAvailable: async () => true,
    getProviderPageState: async () => ({ page: 3 }),
    recordProviderPageResult: async (...args) => recorded.push(args),
    fetchImpl: async () => ({
      ok: false, status: 404, headers: { get: () => null },
      async text() { return "archive page not found"; }
    })
  }), /No configured discovery provider returned usable website candidates/);
  assert.deepEqual(recorded, [["mycityinfo", 3, 100, false, "gauteng"]]);
});
