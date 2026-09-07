const { neon } = require("@neondatabase/serverless");

function normalizeWebsite(url) {
  try {
    const parsed = new URL(url);

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    let pathname = parsed.pathname || "/";

    pathname = pathname
      .replace(/\/+$/, "")
      .toLowerCase();

    if (!pathname) {
      pathname = "/";
    }

    return `${hostname}${pathname}`;
  } catch {
    return String(url)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

async function saveProspect(scanData) {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "Prospect database skipped: DATABASE_URL is not configured."
    );

    return {
      saved: false,
      reason: "database_not_configured",
    };
  }

  const sql = neon(process.env.DATABASE_URL);

  const website =
    scanData.finalUrl ||
    scanData.url;

  if (!website) {
    return {
      saved: false,
      reason: "missing_website",
    };
  }

  const websiteNormalized =
    normalizeWebsite(website);

  const scores =
    scanData.scores || {};

  const businessEvidence =
    scanData.businessEvidence || {};

  const result = await sql`
    INSERT INTO prospects (
      website,
      website_normalized,
      last_scanned,
      scan_count,
      scan_status,
      overall_score,
      seo_score,
      mobile_score,
      accessibility_score,
      technical_score,
      business_score,
      performance_score,
      scanner_version,
      final_url,
      business_evidence,
      key_problems,
      opportunity,
      priority,
      potential_services
    )
    VALUES (
      ${website},
      ${websiteNormalized},
      NOW(),
      1,
      'completed',
      ${scores.overall ?? null},
      ${scores.seo ?? null},
      ${scores.mobile ?? null},
      ${scores.accessibility ?? null},
      ${scores.technical ?? null},
      ${scores.business ?? null},
      ${scores.performance ?? null},
      ${scanData.scannerVersion ?? "3.0"},
      ${scanData.finalUrl ?? null},
      ${JSON.stringify(businessEvidence)},
      ${scanData.keyProblems ?? null},
      ${scanData.opportunity ?? null},
      ${scanData.priority ?? null},
      ${scanData.potentialServices ?? null}
    )
    ON CONFLICT (website_normalized)
    DO UPDATE SET
      website = EXCLUDED.website,
      last_scanned = NOW(),
      scan_count = prospects.scan_count + 1,
      scan_status = 'completed',
      overall_score = EXCLUDED.overall_score,
      seo_score = EXCLUDED.seo_score,
      mobile_score = EXCLUDED.mobile_score,
      accessibility_score = EXCLUDED.accessibility_score,
      technical_score = EXCLUDED.technical_score,
      business_score = EXCLUDED.business_score,
      performance_score = EXCLUDED.performance_score,
      scanner_version = EXCLUDED.scanner_version,
      final_url = EXCLUDED.final_url,
      business_evidence = EXCLUDED.business_evidence,
      key_problems = EXCLUDED.key_problems,
      opportunity = EXCLUDED.opportunity,
      priority = EXCLUDED.priority,
      potential_services = EXCLUDED.potential_services,
      updated_at = NOW()
    RETURNING
      id,
      website,
      scan_count;
  `;

  return {
    saved: true,
    prospect: result[0] || null,
  };
}

module.exports = {
  saveProspect,
};