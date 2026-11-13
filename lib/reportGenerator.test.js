const test = require("node:test");
const assert = require("node:assert/strict");
const { hasFullReportEvidence } = require("./reportGenerator");

test("full report evidence accepts a complete scan record", () => {
  const record = {
    url: "https://example.co.za/",
    scannedAt: "2026-11-13T00:00:00.000Z",
    scores: {},
    businessEvidence: {},
    issues: [],
    recommendations: [],
    checks: {
      seo: [], accessibility: [], technical: [], business: [], mobile: [], security: []
    },
    pageSpeed: {},
    counts: {},
    linkHealth: {},
    routeHealth: {},
    crawlability: {},
    technologies: [],
    browserInspection: {},
    metadata: {}
  };
  assert.equal(hasFullReportEvidence(record), true);
});

test("legacy or partial scan records are rejected for detailed reports", () => {
  assert.equal(hasFullReportEvidence({ url: "https://example.co.za/", scannedAt: "2026-11-13", scores: {} }), false);
});
