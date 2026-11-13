const test = require("node:test");
const assert = require("node:assert/strict");
const { qualifyProspect, collectEvidence, isOutreachChannelVerified } = require("./prospectQualification");

function base(overrides = {}) {
  return {
    success: true,
    url: "https://example.co.za/",
    finalUrl: "https://example.co.za/",
    scores: { overall: 90, technical: 90, business: 90, accessibility: 90, performance: 90, security: 90 },
    routeHealth: { routes: [] },
    linkHealth: { tested: 10, broken: 0 },
    businessEvidence: {
      companyName: "Example Services",
      emailValues: [{ value: "hello@example.co.za", url: "https://example.co.za/contact", source: "mailto" }],
      phoneValues: [{ value: "012 345 6789", url: "https://example.co.za/contact", source: "tel" }],
      phone: [{ url: "https://example.co.za/contact", clickable: true }],
      email: [{ url: "https://example.co.za/contact", clickable: true }],
      whatsapp: [],
      form: [],
      location: [],
      cta: []
    },
    ...overrides
  };
}

test("outreach readiness requires website-derived identity and published usable contact evidence", () => {
  const evidence = collectEvidence(base());
  assert.equal(evidence.companyNamePresent, true);
  assert.equal(evidence.emailDomainMatched, true);
  assert.equal(evidence.outreachReady, true);
  assert.equal(isOutreachChannelVerified(evidence, "email"), true);
  assert.equal(isOutreachChannelVerified(evidence, "phone"), true);
});

test("directory-only names do not establish business identity", () => {
  const evidence = collectEvidence(base({ businessEvidence: {
    discovery: { businessName: "Directory Services" },
    emailValues: [{ value: "info@example.co.za", url: "https://example.co.za/" }],
    phone: [{ url: "https://example.co.za/", clickable: true }],
    form: []
  }}));
  assert.equal(evidence.companyNamePresent, false);
  assert.equal(evidence.outreachReady, false);
});

test("directory and website identity conflicts block outreach readiness", () => {
  const evidence = collectEvidence(base({ businessEvidence: {
    companyName: "Urban Tents",
    discovery: { businessName: "Bedouin Tent Masterz" },
    emailValues: [{ value: "info@example.co.za", url: "https://example.co.za/" }],
    phone: [{ url: "https://example.co.za/", clickable: true }]
  }}));
  assert.equal(evidence.directoryIdentityMismatch, true);
  assert.equal(evidence.outreachReady, false);
});

test("placeholder email and third-party platform contact do not qualify", () => {
  const evidence = collectEvidence(base({ businessEvidence: {
    companyName: "Example Services",
    emailValues: [
      { value: "name@example.com", url: "https://example.co.za/" },
      { value: "press@linktr.ee", url: "https://linktr.ee/example" }
    ],
    phone: [],
    phoneValues: [],
    whatsapp: [],
    form: []
  }}));
  assert.equal(evidence.emailDomainMatched, false);
  assert.equal(evidence.outreachReady, false);
});

test("phone and contact forms count only when their evidence comes from the scanned website", () => {
  const evidence = collectEvidence(base({ businessEvidence: {
    companyName: "Example Services",
    emailValues: [],
    phoneValues: [],
    phone: [{ url: "https://linktr.ee/example", clickable: true }],
    whatsapp: [{ url: "https://wa.me/27123456789", clickable: true }],
    form: [{ url: "https://example.co.za/contact", usable: true }]
  }}));
  assert.equal(evidence.websitePublishedPhone, false);
  assert.equal(evidence.websitePublishedWhatsApp, false);
  assert.equal(evidence.contactFormDetected, true);
  assert.equal(evidence.outreachReady, true);
});

test("confirmed critical route failures are high", () => {
  const result = qualifyProspect(base({ scores: { overall: 77, technical: 52, business: 83, accessibility: 93, performance: 60, security: 78 }, routeHealth: { routes: [
    { path: "/contact", status: "broken" }, { path: "/book", status: "broken" }, { path: "/services", status: "broken" }
  ]}}));
  assert.equal(result.priority, "high");
  assert.equal(result.evidence.criticalBrokenRoutes, 2);
});

test("unreachable and inconclusive links are not treated as confirmed broken", () => {
  const result = qualifyProspect(base({ routeHealth: { routes: [{ path: "/contact", status: "unreachable" }] },
    linkHealth: { tested: 4, broken: 0 },
    linkResults: [{ url: "https://example.co.za/a", status: "unreachable" }, { url: "https://example.co.za/b", status: "verification_inconclusive" }]
  }));
  assert.equal(result.evidence.confirmedBrokenRoutes, 0);
  assert.equal(result.evidence.brokenLinks, 0);
});

test("explicitly confirmed broken forms require structured evidence", () => {
  const result = qualifyProspect(base({ businessEvidence: { companyName: "Example Services", phone: [], form: [{ failureConfirmed: true, status: "broken", statusCode: 410 }] }}));
  assert.equal(result.evidence.formFailure, true);
});

test("failed scans are not silently healthy", () => {
  assert.equal(qualifyProspect({ success: false }).priority, "failed");
});
