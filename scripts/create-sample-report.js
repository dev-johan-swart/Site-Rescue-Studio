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
    overall: 82,
    seo: 88,
    mobile: 84,
    accessibility: 76,
    technical: 80,
    business: 91,
    performance: 72,
    security: 78
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

  checks: {},

  businessEvidence: {
    phone: true,
    email: true,
    whatsapp: true,
    contactForm: true,
    location: true
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
    working: 16,
    broken: 1,
    blocked: 1
  },

  responseTime: 842,

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