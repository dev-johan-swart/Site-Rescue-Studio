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
  assert.doesNotMatch(statement, /SET company_name/);
  assert.match(statement, /businessName/);
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
  assert.equal(isPermanentScanFailure("TLS_CERTIFICATE_ERROR"), true);
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
  assert.match(statement, /retry_count = GREATEST/);
  assert.match(statement, /f\.attempt_count > 1/);
});


test("production worker defers discovery reserve refill to the scheduled preparation workflow", () => {
  const worker = require("../api/automation/run");
  const source = worker.toString();
  assert.doesNotMatch(source, /refillQueueToReserve/);
  assert.match(source, /deferredToScheduledPreparation/);
  assert.match(source, /TLS_CERTIFICATE_ERROR/);
});


test("discovery metadata can be returned for qualification while preserving the default update count", async () => {
  const { saveDiscoveryMetadataToProspect } = require("./automationStore");
  const sql = async () => [{
    id: 7,
    company_name: "Example Electrical Services",
    discovery_business_name: "Example Electrical Services",
    city: "Centurion",
    region: "gauteng",
    source: "pretoriahub"
  }];
  const metadata = await saveDiscoveryMetadataToProspect(sql, "https://example.co.za", { returnMetadata: true });
  assert.equal(metadata.company_name, "Example Electrical Services");
  assert.equal(metadata.discovery_business_name, "Example Electrical Services");
  assert.equal(metadata.city, "Centurion");
  assert.equal(metadata.region, "gauteng");
  assert.equal(metadata.source, "pretoriahub");
  const count = await saveDiscoveryMetadataToProspect(sql, "https://example.co.za");
  assert.equal(count, 1);
});

test("worker keeps discovery-sourced names separate from verified website identity", () => {
  const worker = require("../api/automation/run");
  const source = worker.toString();
  assert.match(source, /returnMetadata: true/);
  assert.match(source, /companyName: scanData\.businessEvidence\?\.companyName \|\| null/);
  assert.match(source, /businessName: discoveryMetadata\.discovery_business_name/);
});


test("queue claims increment the durable run candidate counter in the same statement", async () => {
  const { claimNextQueueItem } = require("./automationStore");
  let queryText = "";
  const sql = async (strings) => {
    queryText = strings.join(" ");
    return [{ id: 1530, website: "https://example.co.za/", run_id: 562 }];
  };
  const claimed = await claimNextQueueItem(562, sql);
  assert.equal(claimed.id, 1530);
  assert.match(queryText, /WITH claimed AS/);
  assert.match(queryText, /UPDATE automation_runs r/);
  assert.match(queryText, /candidate_count = COALESCE\(r\.candidate_count, 0\) \+ 1/);
  assert.match(queryText, /EXISTS \(SELECT 1 FROM claimed\)/);
  const storeSource = require("node:fs").readFileSync(require.resolve("./automationStore"), "utf8");
  assert.match(storeSource, /candidate_count = GREATEST\(COALESCE\(candidate_count, 0\), \S+\)/);
});


test("stale queue recovery records the abandoned attempt against its original run", async () => {
  const { recoverStaleQueueItems } = require("./automationStore");
  let queryText = "";
  const sql = async (strings) => {
    queryText = strings.join(" ");
    return [{ id: 1535 }];
  };
  const recovered = await recoverStaleQueueItems(sql);
  assert.equal(recovered, 1);
  assert.match(queryText, /WITH stale AS/);
  assert.match(queryText, /previous_run_id/);
  assert.match(queryText, /INSERT INTO automation_scan_failures/);
  assert.match(queryText, /WORKER_TIMEOUT/);
  assert.match(queryText, /CASE WHEN s\.attempt_count < 3 THEN 'queued' ELSE 'failed' END/);
  assert.match(queryText, /f\.attempt_count = s\.attempt_count/);
});


test("finishRun derives retry count from durable failure and queue attempts", async () => {
  const { finishRun } = require("./automationStore");
  let statement = "";
  const sql = async strings => { statement = strings.join(" "); return []; };
  await finishRun(55, {
    candidateCount: 3, scannedCount: 2, highCount: 1,
    moderateCount: 1, healthyCount: 0, failedCount: 1
  }, "one failed attempt", null, sql);
  assert.match(statement, /retry_count =/);
  assert.match(statement, /COUNT\(DISTINCT retry_attempt\.queue_id\)/);
  assert.match(statement, /FROM automation_scan_failures f/);
  assert.match(statement, /FROM automation_queue q/);
  assert.match(statement, /q\.attempt_count > 1/);
});

test("MyCityInfo cooldown is written as a bounded provider cooldown", async () => {
  const { recordDiscoveryProviderSuccess } = require("./automationStore");
  let statement = "";
  let values = [];
  const sql = async (strings, ...args) => { statement = strings.join(" "); values = args; return []; };
  await recordDiscoveryProviderSuccess(sql, "mycityinfo", 240);
  assert.match(statement, /cooldown_until = NOW\(\)/);
  assert.ok(values.includes(240));
});


test("discovery DNS preflight rejects confirmed no-address hosts and preserves transient failures", async () => {
  const worker = require("../api/automation/run");
  const calls = [];
  const result = await worker.filterMyCityInfoDnsCandidates([
    { provider: "mycityinfo", website: "https://no-address.co.za/" },
    { provider: "mycityinfo", website: "https://valid.co.za/" },
    { provider: "mycityinfo", website: "https://temporary.co.za/" },
    { provider: "websdocs", website: "https://not-checked.co.za/" }
  ], {
    timeoutMs: 500,
    concurrency: 2,
    resolve4: async hostname => {
      calls.push(hostname);
      if (hostname === "no-address.co.za") {
        const error = new Error("No A record");
        error.code = "ENODATA";
        throw error;
      }
      if (hostname === "valid.co.za") return ["93.184.216.34"];
      const error = new Error("Temporary resolver failure");
      error.code = "EAI_AGAIN";
      throw error;
    },
    resolve6: async hostname => {
      calls.push(hostname);
      if (hostname === "no-address.co.za") {
        const error = new Error("No AAAA record");
        error.code = "ENOTFOUND";
        throw error;
      }
      if (hostname === "valid.co.za") {
        const error = new Error("No AAAA record");
        error.code = "ENODATA";
        throw error;
      }
      return [];
    }
  });
  assert.deepEqual(result.candidates.map(candidate => candidate.website), [
    "https://valid.co.za/",
    "https://temporary.co.za/",
    "https://not-checked.co.za/"
  ]);
  assert.deepEqual(result.diagnostics, {
    examined: 2,
    rejectedNoAddress: 1,
    deferredTransient: 2
  });
  assert.equal(calls.includes("not-checked.co.za"), true);
});

test("legacy scan history is blocked from detailed report generation", () => {
  const { hasFullReportEvidence } = require("./reportGenerator");
  const legacyScan = {
    url: "https://golfcentral.co.za/",
    scannerVersion: "3.2",
    scores: { overall: 72 },
    businessEvidence: { companyName: "Golf Central" },
    keyProblems: "Missing image alt text"
  };
  assert.equal(hasFullReportEvidence(legacyScan), false);
});

test("complete scanner evidence produces a valid PDF report", async () => {
  const { generateFullReport, hasFullReportEvidence } = require("./reportGenerator");
  const scanData = {
    success: true,
    url: "https://example.co.za/",
    finalUrl: "https://example.co.za/",
    scannedAt: "2026-11-11T10:00:00.000Z",
    responseTime: 800,
    scores: {
      overall: 82, seo: 85, performance: 74, mobile: 80,
      accessibility: 78, technical: 88, business: 84, security: 82
    },
    issues: [{ title: "Missing image alternative text", severity: "high", description: "Some informative images lack useful alternative text." }],
    recommendations: [{ title: "Improve image accessibility", severity: "high", why: "Alternative text improves access for assistive technology users.", action: "Add concise alt text to informative images.", service: "Accessibility optimisation" }],
    checks: {
      seo: [{ title: "Page title", description: "A descriptive title was detected.", status: "pass", weight: 10 }],
      accessibility: [{ title: "Image alternative text", description: "Some images are missing alt text.", status: "warning", weight: 10, severity: "high" }],
      technical: [{ title: "HTTPS", description: "The website uses HTTPS.", status: "pass", weight: 10 }],
      business: [{ title: "Contact details", description: "A business email was detected.", status: "pass", weight: 10 }],
      mobile: [{ title: "Viewport", description: "A responsive viewport was detected.", status: "pass", weight: 10 }],
      security: [{ title: "HSTS", description: "Strict-Transport-Security was detected.", status: "pass", weight: 10 }]
    },
    businessEvidence: {
      companyName: "Example Business",
      phone: [{ url: "https://example.co.za/", value: "+27 12 555 0100", clickable: true }],
      email: [{ url: "https://example.co.za/contact", value: "info@example.co.za", clickable: true }],
      whatsapp: [],
      form: [{ url: "https://example.co.za/contact", count: 1, usable: true }],
      location: [{ url: "https://example.co.za/", value: "Pretoria, Gauteng" }],
      cta: [{ url: "https://example.co.za/", value: "Request a quote" }]
    },
    pageSpeed: { available: false, error: "PageSpeed unavailable", scores: null, vitals: null, diagnostics: [] },
    counts: { images: 8, imagesWithoutAlt: 2, links: 12, scripts: 2, stylesheets: 1, h1: 1, h2: 3, pagesCrawled: 4, linksTested: 10 },
    linkHealth: { total: 12, tested: 10, working: 10, broken: 0, placeholder: 0, blocked: 0, unreachable: 0, redirected: 0, internal: 8, external: 4, anchors: 0 },
    routeHealth: { tested: 3, working: 3, broken: 0, blocked: 0, unreachable: 0, redirected: 0, failed: 0, reliabilityScore: 100, routes: [] },
    metadata: { title: "Example Business", description: "Example business website.", viewport: "width=device-width", canonical: "https://example.co.za/", language: "en", h1s: ["Example Business"], h2s: ["Our Services"], structuredData: [] },
    crawlability: { robotsTxt: true, sitemap: true, canonical: true },
    technologies: ["Next.js"],
    browserInspection: { attempted: false, available: false }
  };
  assert.equal(hasFullReportEvidence(scanData), true);
  const pdf = await generateFullReport(scanData);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.ok(pdf.length > 1000);
});
