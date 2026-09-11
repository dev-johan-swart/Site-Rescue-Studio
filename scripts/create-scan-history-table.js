require("dotenv").config({
    path: ".env.local"
  });
  
  const { neon } =
    require("@neondatabase/serverless");

async function createScanHistoryTable() {

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured."
    );
  }

  const sql =
    neon(
      process.env.DATABASE_URL
    );

  console.log(
    "Creating scan_history table..."
  );

  await sql`
    CREATE TABLE IF NOT EXISTS scan_history (
      id BIGSERIAL PRIMARY KEY,

      prospect_id INTEGER,

      website TEXT NOT NULL,

      website_normalized TEXT NOT NULL,

      scanned_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      scanner_version TEXT NOT NULL
        DEFAULT '3.0',

      overall_score INTEGER,

      seo_score INTEGER,

      mobile_score INTEGER,

      accessibility_score INTEGER,

      technical_score INTEGER,

      business_score INTEGER,

      performance_score INTEGER,

      security_score INTEGER,

      key_problems TEXT,

      potential_services TEXT
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
      scan_history_website_normalized_idx
    ON scan_history (
      website_normalized
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
      scan_history_prospect_id_idx
    ON scan_history (
      prospect_id
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
      scan_history_scanned_at_idx
    ON scan_history (
      scanned_at DESC
    );
  `;

  console.log(
    "scan_history table and indexes are ready."
  );
}

createScanHistoryTable()
  .catch(error => {
    console.error(
      "Unable to create scan_history table:",
      error
    );

    process.exit(1);
  });