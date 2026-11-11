const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProspectWebsite } = require("./automationStore");

test("normalizes www and paths to one prospect hostname", () => {
  assert.equal(normalizeProspectWebsite("https://www.example.co.za/contact/"), "example.co.za");
  assert.equal(normalizeProspectWebsite("example.co.za"), "example.co.za");
});

test("invalid values normalize to an empty identity", () => {
  assert.equal(normalizeProspectWebsite(""), "");
});


test("normalization treats www and non-www as the same prospect", () => {
  assert.equal(normalizeProspectWebsite("https://www.example.co.za/contact"), "example.co.za");
  assert.equal(normalizeProspectWebsite("https://example.co.za/another-page"), "example.co.za");
});

test("historical identity candidates include root and root-slash forms", () => {
  const { historicalIdentityCandidates } = require("./automationStore");
  assert.deepEqual(
    historicalIdentityCandidates("example.co.za"),
    ["example.co.za", "example.co.za/"]
  );
});


test("queue reserve policy stays within safe bounds", () => {
  const reserve = Math.max(3, Math.min(Number("9"), 30));
  assert.equal(reserve, 9);
});


test("fresh discovery filtering removes known websites before provider failover", async () => {
  const { filterFreshDiscoveryCandidates } = require("./automationStore");
  let requested;
  const sql = async (strings, ...values) => {
    requested = values[0];
    return [{ normalized: "known.co.za" }];
  };
  const result = await filterFreshDiscoveryCandidates(sql, [
    { website: "https://known.co.za/about", name: "Already known" },
    { website: "https://fresh-one.co.za", name: "Fresh one" },
    { website: "https://www.fresh-one.co.za/contact", name: "Duplicate fresh one" },
    { website: "http://127.0.0.1", name: "Invalid local host" },
    { website: "https://business.websdocs.com/example-profile", name: "Hosted directory profile" }
  ]);
  assert.deepEqual(requested, ["known.co.za", "fresh-one.co.za"]);
  assert.deepEqual(result.map(item => item.normalized), ["fresh-one.co.za"]);
});

test("successful provider runs clear stale failure diagnostics", async () => {
  const { recordDiscoveryProviderSuccess } = require("./automationStore");
  let statement = "";
  const sql = async (strings, ...values) => {
    statement = strings.join("?");
    return [];
  };
  await recordDiscoveryProviderSuccess(sql, "pretoriahub");
  assert.match(statement, /last_error = NULL/);
  assert.match(statement, /consecutive_failures = 0/);
  assert.match(statement, /cooldown_until = NULL/);
});

test("daily scan count uses explicit midnight SAST timestamp boundaries", async () => {
  const { getDailyScannedCount } = require("./automationStore");
  let statement = "";
  const sql = async strings => { statement = strings.join("?"); return [{ count: 42 }]; };
  const count = await getDailyScannedCount(sql, "2026-10-31");
  assert.equal(count, 42);
  assert.ok(statement.includes("::date::timestamp AT TIME ZONE 'Africa/Johannesburg'"));
  assert.doesNotMatch(statement, /TIME '08:00'/);
});

test("shortlist prospect linking prefers the prospect id saved on scan history", async () => {
  const { findShortlistProspectId } = require("./automationStore");
  let statement = "";
  let values = [];
  const sql = async (strings, ...args) => {
    statement = strings.join("?");
    values = args;
    return [{ prospect_id: 731 }];
  };
  const id = await findShortlistProspectId(sql, 991, "example.co.za");
  assert.equal(id, 731);
  assert.match(statement, /FROM scan_history/);
  assert.ok(values.includes(991));
});

test("shortlist prospect linking tolerates root and trailing-slash URL normalization", async () => {
  const { findShortlistProspectId } = require("./automationStore");
  let statement = "";
  let values = [];
  const sql = async (strings, ...args) => {
    statement = strings.join("?");
    values = args;
    return [{ id: 732 }];
  };
  const id = await findShortlistProspectId(sql, null, "example.co.za/");
  assert.equal(id, 732);
  assert.match(statement, /website_normalized IN/);
  assert.deepEqual(values.slice(0, 2), ["example.co.za", "example.co.za/"]);
});

test("DNS resolver avoids the libuv lookup path and retains bounded diagnostics", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const scanner = fs.readFileSync(path.join(__dirname, "../api/scan.js"), "utf8");
  const worker = fs.readFileSync(path.join(__dirname, "../api/automation/run.js"), "utf8");
  assert.match(scanner, /resolveFamily\("resolve4"\)/);
  assert.match(scanner, /resolveFamily\("resolve6"\)/);
  assert.doesNotMatch(scanner, /dns\.lookup\(/);
  assert.match(scanner, /diagnosticAttempts: 2/);
  assert.match(scanner, /diagnosticDurationMs: Date\.now\(\) - lookupStartedAt/);
  assert.match(worker, /diagnosticAttempts: scanData\?\.diagnosticAttempts/);
  assert.match(worker, /diagnosticDurationMs: scanData\?\.diagnosticDurationMs/);
});


test("discovery metadata enrichment preserves verified company names and uses existing JSONB evidence", async () => {
  const { saveDiscoveryMetadataToProspect } = require("./automationStore");
  let statement = "";
  let values = [];
  const sql = async (strings, ...args) => {
    statement = strings.join("?");
    values = args;
    return [{ id: 42 }];
  };
  const updated = await saveDiscoveryMetadataToProspect(sql, "https://www.example.co.za/contact");
  assert.equal(updated, 1);
  assert.ok(values.includes("example.co.za"));
  assert.match(statement, /COALESCE\(NULLIF\(p\.company_name/);
  assert.match(statement, /business_evidence/);
  assert.match(statement, /website_normalized IN/);
  assert.match(statement, /website_normalized LIKE/);
  assert.match(statement, /jsonb_build_object\('discovery'/);
});

test("queue claim order interleaves retries while preserving the three-attempt ceiling and provider provenance", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const store = fs.readFileSync(path.join(__dirname, "automationStore.js"), "utf8");
  assert.match(store, /candidate\.attempt_count < 3/);
  assert.match(store, /COUNT\(\*\).*run_id = \$\{runId\}.*% 4/s);
  assert.match(store, /b\.source AS queue_source/);
  assert.doesNotMatch(store, /COALESCE\(\$\{sourceOverride\}, b\.source\)/);
});


test("backlog geographic region never falls back to stage id for an unknown city", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const store = fs.readFileSync(path.join(__dirname, "automationStore.js"), "utf8");
  assert.match(store, /candidate\.region \|\| \(String\(candidate\.city \|\| ""\)\.toLowerCase\(\) === "south africa" \? "south_africa" : null\)/);
  assert.doesNotMatch(store, /candidate\.city \? stageId/);
});


test("permanent failure classification keeps transient timeouts retryable", () => {
  const { isPermanentScanFailure } = require("./automationStore");
  assert.equal(isPermanentScanFailure("INVALID_URL"), true);
  assert.equal(isPermanentScanFailure("SAFETY_REJECTED"), true);
  assert.equal(isPermanentScanFailure("DNS_NO_ADDRESSES"), true);
  assert.equal(isPermanentScanFailure("DNS_LOOKUP_FAILED"), true);
  assert.equal(isPermanentScanFailure("TIMEOUT"), false);
  assert.equal(isPermanentScanFailure("DNS_TEMPORARY_FAILURE"), false);
  assert.equal(isPermanentScanFailure("UNREACHABLE"), false);
  assert.equal(isPermanentScanFailure("OTHER"), false);
});

test("stale run recovery reconciles retryable failure attempts from failure history", async () => {
  const { recoverStaleAutomationRuns } = require("./automationStore");
  let statement = "";
  const sql = async strings => { statement = strings.join("?"); return []; };
  await recoverStaleAutomationRuns(sql);
  assert.match(statement, /FROM automation_scan_failures f/);
  assert.match(statement, /f\.run_id = r\.id/);
  assert.match(statement, /failed_count = GREATEST/);
});


test("production worker defers discovery reserve refill to the scheduled preparation workflow", () => {
  const worker = require("../api/automation/run");
  const source = worker.toString();
  assert.doesNotMatch(source, /refillQueueToReserve/);
  assert.match(source, /deferredToScheduledPreparation/);
});


test("discovery metadata can be returned for qualification while preserving the default update count", async () => {
  const { saveDiscoveryMetadataToProspect } = require("./automationStore");
  const sql = async () => [{
    id: 7,
    business_name: "Example Electrical Services",
    city: "Centurion",
    region: "gauteng",
    source: "pretoriahub"
  }];
  const metadata = await saveDiscoveryMetadataToProspect(sql, "https://example.co.za", { returnMetadata: true });
  assert.equal(metadata.business_name, "Example Electrical Services");
  assert.equal(metadata.city, "Centurion");
  assert.equal(metadata.region, "gauteng");
  assert.equal(metadata.source, "pretoriahub");
  const count = await saveDiscoveryMetadataToProspect(sql, "https://example.co.za");
  assert.equal(count, 1);
});

test("worker passes discovery-sourced business identity into shortlist qualification", () => {
  const worker = require("../api/automation/run");
  const source = worker.toString();
  assert.match(source, /returnMetadata: true/);
  assert.match(source, /companyName: scanData\.businessEvidence\?\.companyName \|\| discoveryMetadata\.business_name/);
});
