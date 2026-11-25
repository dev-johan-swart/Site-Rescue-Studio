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


test("provider cooldown respects a valid Retry-After header without shortening the wait", async () => {
  const { recordDiscoveryProviderFailure, retryAfterMinutes } = require("./automationStore");
  assert.equal(retryAfterMinutes("120"), 2);
  assert.equal(retryAfterMinutes("not-a-date"), null);
  let query = "";
  let values = [];
  const sql = async (strings, ...args) => { query = strings.join("?"); values = args; return []; };
  await recordDiscoveryProviderFailure(sql, "openstreetmap", {
    status: 429,
    message: "Rate limited",
    responseDiagnostics: { retryAfter: "120" }
  });
  assert.match(query, /GREATEST/);
  assert.ok(values.includes(2));
  assert.ok(values.includes("openstreetmap"));
});

test("preparation telemetry persists aggregate request, DNS and backlog diagnostics", async () => {
  const { recordDiscoveryPreparationRun } = require("./automationStore");
  let query = "";
  let values = [];
  const sql = async (strings, ...args) => {
    query = strings.join("?");
    values = args;
    return [{ id: 17, preparation_key: "prep-test", readiness_passed: true, http_request_count: 2 }];
  };
  const result = await recordDiscoveryPreparationRun(sql, {
    preparationKey: "prep-test",
    cycleDate: "2026-11-25",
    status: "target_reached",
    target: 110,
    queueDepthBefore: 90,
    queueDepthAfter: 110,
    readinessPassed: true,
    attempts: [{
      candidateCount: 12,
      dnsQualification: { examined: 10, rejectedNoAddress: 2, deferredTransient: 1 },
      backlogDiagnostics: { added: 5, alreadyKnown: 3, duplicates: 1, invalidUrl: 1, platformOnly: 2 },
      httpRequests: [{ provider: "hotfrog", status: 200 }, { provider: "mycityinfo", status: 200 }]
    }]
  });
  assert.equal(result.id, 17);
  assert.match(query, /automation_discovery_preparation_runs/);
  assert.ok(values.includes(2));
  assert.ok(values.includes(5));
  assert.ok(values.includes(2));
});

test("worker readiness lookup requires a same-day successful full reserve", async () => {
  const { hasDiscoveryPreparationReadiness } = require("./automationStore");
  let query = "";
  const sql = async strings => {
    query = strings.join(" ");
    return [{ id: 17, queue_depth_after: 110, target: 110 }];
  };
  const row = await hasDiscoveryPreparationReadiness(sql, "2026-11-25");
  assert.equal(row.id, 17);
  assert.match(query, /readiness_passed = TRUE/);
  assert.match(query, /queue_depth_after >= target/);
  assert.match(query, /cycle_date =/);
});

test("static automation schema includes runtime discovery telemetry and location evidence", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const schema = fs.readFileSync(path.join(__dirname, "automationSchema.sql"), "utf8");
  assert.match(schema, /automation_discovery_preparation_runs/);
  assert.match(schema, /location_evidence TEXT/);
  assert.match(schema, /page_cursors JSONB/);
});


test("backlog records retain explicit location evidence from verified business profiles", async () => {
  const { addDiscoveryBacklogCandidates } = require("./automationStore");
  let insertQuery = "";
  let insertValues = [];
  const sql = async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("SELECT 1")) return [];
    insertQuery = query;
    insertValues = values;
    return [{ id: 9 }];
  };
  const result = await addDiscoveryBacklogCandidates(sql, [{
    website: "https://acme.co.za",
    provider: "hotfrog",
    name: "Acme Electrical",
    city: "Centurion",
    region: "gauteng",
    locationEvidence: "business_profile_address"
  }], "multi_provider", "pretoria_centurion", true);
  assert.equal(result.added, 1);
  assert.match(insertQuery, /location_evidence/);
  assert.ok(insertValues.includes("business_profile_address"));
});
