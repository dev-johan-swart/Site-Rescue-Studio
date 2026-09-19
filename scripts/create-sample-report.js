const fs =
  require("fs");

const path =
  require("path");

const {
  generateFullReport
} =
  require(
    "../lib/reportGenerator"
  );

const sampleData = {

  success: true,

  url:
    "https://example-business.co.za/",

  finalUrl:
    "https://example-business.co.za/",

  scannedAt:
    "2026-09-10T10:00:00.000Z",

  scores: {
    overall: 83,
    seo: 88,
    mobile: 84,
    accessibility: 76,
    technical: 80,
    business: 91,
    performance: 72,
    security: 78,
    routeReliability: 80
  },

  issues: [

    {
      title:
        "Images missing alternative text",
      severity:
        "high",
      description:
        "Several images do not provide useful alternative text, which can reduce accessibility and make image content harder to understand."
    },

    {
      title:
        "Server response time",
      severity:
        "high",
      description:
        "The initial server response could be improved to reduce the time before the page begins loading."
    },

    {
      title:
        "Responsive layout opportunities",
      severity:
        "medium",
      description:
        "Some layout elements would benefit from additional responsive adjustments for smaller screens."
    },

    {
      title:
        "Security header improvements",
      severity:
        "medium",
      description:
        "Several recommended browser security headers are not currently present."
    },

    {
      title:
        "Call-to-action improvements",
      severity:
        "low",
      description:
        "The customer journey could be strengthened with clearer calls-to-action."
    }

  ],

  recommendations: [

    {
      title:
        "Improve image accessibility",
      severity:
        "high",
      why:
        "Meaningful alternative text helps users who rely on assistive technology.",
      action:
        "Add concise, useful alt text to informative images and use empty alt attributes for decorative images.",
      service:
        "Accessibility optimisation"
    },

    {
      title:
        "Improve server response time",
      severity:
        "high",
      why:
        "A faster initial response helps visitors start receiving the website sooner.",
      action:
        "Review hosting, caching, redirects and backend processing.",
      service:
        "Performance optimisation"
    },

    {
      title:
        "Strengthen responsive behaviour",
      severity:
        "medium",
      why:
        "Visitors increasingly access business websites from phones.",
      action:
        "Review fixed widths, typography, spacing and responsive layout behaviour.",
      service:
        "Mobile optimisation"
    },

    {
      title:
        "Add security hardening headers",
      severity:
        "medium",
      why:
        "Security headers provide additional browser-side protection.",
      action:
        "Review and implement appropriate HSTS, CSP, Referrer-Policy and related headers.",
      service:
        "Website security"
    },

    {
      title:
        "Improve conversion paths",
      severity:
        "low",
      why:
        "Clear customer journeys make it easier for visitors to enquire.",
      action:
        "Strengthen calls-to-action, contact paths and service enquiry options.",
      service:
        "Conversion optimisation"
    }

  ],

  checks: {
    seo: [
      { title: "Page title", description: "A descriptive page title was detected.", status: "pass", weight: 15 },
      { title: "Title length", description: "The title is slightly longer than the recommended range.", status: "warning", weight: 8, severity: "low" },
      { title: "Meta description", description: "A meta description was detected.", status: "pass", weight: 12 }
    ],
    accessibility: [
      { title: "Document language", description: "The document language is declared.", status: "pass", weight: 10 },
      { title: "Images alternative text", description: "Some images are missing useful alternative text.", status: "warning", weight: 10, severity: "high" }
    ],
    mobile: [
      { title: "Viewport", description: "A responsive viewport meta tag was detected.", status: "pass", weight: 10 },
      { title: "Flexible layout", description: "Some layout elements would benefit from more flexible responsive rules.", status: "warning", weight: 8, severity: "medium" }
    ],
    technical: [
      { title: "HTTPS", description: "The website is served over HTTPS.", status: "pass", weight: 15 },
      { title: "Server response time", description: "The initial server response could be improved.", status: "warning", weight: 10, severity: "high" }
    ],
    security: [
      { title: "HTTPS", description: "The website is served over HTTPS.", status: "pass", weight: 15 },
      { title: "HSTS", description: "Strict-Transport-Security was detected.", status: "pass", weight: 8 },
      { title: "Content Security Policy", description: "No Content-Security-Policy header was detected.", status: "warning", weight: 8, severity: "medium" },
      { title: "Referrer-Policy", description: "No Referrer-Policy header was detected.", status: "warning", weight: 5, severity: "low" }
    ]
  },

  businessEvidence: {
    phone: [{ url: "https://example-business.co.za/", value: "+27 12 555 0100", clickable: true }],
    email: [{ url: "https://example-business.co.za/contact", value: "info@example-business.co.za", clickable: true }],
    whatsapp: [{ url: "https://example-business.co.za/", value: "WhatsApp", clickable: true }],
    form: [{ url: "https://example-business.co.za/contact", count: 1, usable: true }],
    location: [{ url: "https://example-business.co.za/", value: "Pretoria, Gauteng" }],
    cta: [{ url: "https://example-business.co.za/", value: "Request a quote" }]
  },

  metadata: {
    title:
      "Example Business",
    description:
      "A sample business website used to demonstrate the Site Rescue Studio report."
  },

  counts: {
    pagesCrawled: 5,
    linksTested: 18
  },

  linkHealth: {
    total: 20,
    tested: 18,
    working: 16,
    broken: 1,
    placeholder: 1,
    blocked: 1,
    unreachable: 0,
    redirected: 1,
    internal: 12,
    external: 8,
    anchors: 2
  },

  routeHealth: {
    tested: 7,
    working: 4,
    broken: 1,
    blocked: 1,
    unreachable: 0,
    redirected: 1,
    failed: 1,
    reliabilityScore: 80,
    routes: [
      { path: "/about", url: "https://example-business.co.za/about", status: "working", statusCode: 200, finalUrl: "https://example-business.co.za/about" },
      { path: "/services", url: "https://example-business.co.za/services", status: "working", statusCode: 200, finalUrl: "https://example-business.co.za/services" },
      { path: "/contact", url: "https://example-business.co.za/contact", status: "working", statusCode: 200, finalUrl: "https://example-business.co.za/contact" },
      { path: "/quote", url: "https://example-business.co.za/quote", status: "working", statusCode: 200, finalUrl: "https://example-business.co.za/quote" },
      { path: "/pricing", url: "https://example-business.co.za/pricing", status: "broken", statusCode: 404, finalUrl: "https://example-business.co.za/pricing" },
      { path: "/old-page", url: "https://example-business.co.za/old-page", status: "blocked", statusCode: 403, finalUrl: "https://example-business.co.za/old-page" },
      { path: "/legacy", url: "https://example-business.co.za/legacy", status: "redirected", statusCode: 301, finalUrl: "https://example-business.co.za/services" }
    ]
  },

  browserInspection: {
    attempted: true,
    available: true,
    durationMs: 8200,
    consoleErrors: [],
    failedResources: [],
    findings: [],
    renderedForms: [{ action: "/contact", method: "POST" }],
    renderedButtons: [{ text: "Request a quote" }, { text: "Contact us" }],
    renderedHeadings: [{ tag: "h1", text: "Example Business" }, { tag: "h2", text: "Our Services" }],
    renderedContactLinks: [{ type: "phone", text: "Call us" }, { type: "email", text: "Email us" }, { type: "whatsapp", text: "WhatsApp" }],
    horizontalOverflow: false
  },

  pageAccess: {
    limited: false,
    status: 200,
    challengeDetected: false,
    reason: ""
  },

  responseTime: 842,

  crawl: {
    enabled: true,
    maxAdditionalPages: 8,
    pagesScanned: 5,
    totalPagesDiscovered: 6,
    pages: [
      { path: "/", type: "homepage", scanned: true },
      { path: "/services", type: "priority", scanned: true },
      { path: "/contact", type: "priority", scanned: true }
    ]
  },

pageSpeed: {
  available: true,
  performance: 72,
  accessibility: 76,
  bestPractices: 84,
  seo: 88,
  vitals: {
    lcp: 2.9,
    cls: 0.08,
    inp: 190,
    fcp: 1.8,
    tbt: 180
  }
},

_sampleReport: true
};

async function main() {

  const pdf =
    await generateFullReport(
      sampleData
    );

  const outputPath =
    path.join(
      process.cwd(),
      "sample-health-report.pdf"
    );

  fs.writeFileSync(
    outputPath,
    pdf
  );

  console.log(
    `Sample report created: ${outputPath}`
  );
}

main().catch(
  error => {

    console.error(
      "Sample report generation failed:",
      error
    );

    process.exit(1);
  }
);