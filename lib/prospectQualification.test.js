const test = require("node:test");
const assert = require("node:assert/strict");
const { qualifyProspect } = require("./prospectQualification");

test("classifies confirmed critical route failures as high", () => {
  const result = qualifyProspect({
    success: true,
    scores: { overall: 77, technical: 52, business: 83, accessibility: 93, performance: 60, security: 78 },
    routeHealth: {
      routes: [
        { path: "/contact", status: "broken" },
        { path: "/book", status: "broken" },
        { path: "/services", status: "broken" }
      ]
    },
    linkHealth: { tested: 0, broken: 0 },
    businessEvidence: {
      phone: [{}],
      email: [{}],
      whatsapp: [{}],
      form: []
    }
  });

  assert.equal(result.priority, "high");
  assert.match(result.reason, /customer-facing route/i);
  assert.equal(result.evidence.criticalBrokenRoutes, 2);
});

test("keeps a canonical mismatch in moderate rather than high", () => {
  const result = qualifyProspect({
    success: true,
    scores: { overall: 91, technical: 100, business: 90, accessibility: 65, performance: null, security: 88 },
    checks: {
      seo: [
        {
          title: "Canonical domain mismatch",
          status: "warning",
          description: "The public website hostname is www.example.co.za, but the canonical URL points to another hostname."
        }
      ]
    },
    routeHealth: { routes: [] },
    linkHealth: { tested: 17, broken: 0 },
    businessEvidence: { phone: [{}], email: [{}], whatsapp: [{}] }
  });

  assert.equal(result.priority, "moderate");
  assert.match(result.reason, /canonical/i);
});

test("does not treat a healthy scan as a prospect", () => {
  const result = qualifyProspect({
    success: true,
    scores: { overall: 96, technical: 100, business: 98, accessibility: 95, performance: 92, security: 95 },
    routeHealth: { routes: [{ path: "/services", status: "working" }] },
    linkHealth: { tested: 10, broken: 0 },
    businessEvidence: { phone: [{}], email: [{}], whatsapp: [{}], cta: [{}] }
  });

  assert.equal(result.priority, "healthy");
});

test("failed scans are not silently classified as healthy", () => {
  const result = qualifyProspect({ success: false });
  assert.equal(result.priority, "failed");
});
