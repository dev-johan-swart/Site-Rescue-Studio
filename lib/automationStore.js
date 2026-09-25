const { neon } = require("@neondatabase/serverless");

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(process.env.DATABASE_URL);
}

function normalizeProspectWebsite(url) {
  try {
    const parsed = new URL(String(url).trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return hostname;
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

async function getQueueDepth(sql) {
  const rows = await sql`SELECT COUNT(*)::int AS count
    FROM automation_queue
    WHERE status = 'queued'
      AND attempt_count < 3
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())`;
  return Number(rows[0]?.count || 0);
}

async function getDailyScannedCount(sql) {
  const rows = await sql`SELECT COALESCE(SUM(scanned_count), 0)::int AS count
    FROM automation_runs
    WHERE started_at >= CURRENT_DATE
      AND started_at < CURRENT_DATE + INTERVAL '1 day'
      AND status IN ('completed', 'completed_with_errors')`;
  return Number(rows[0]?.count || 0);
}

async function getDiscoveryProviderState(sql, provider) {
  const rows = await sql`SELECT * FROM automation_discovery_provider_state WHERE provider = ${provider} LIMIT 1`;
  return rows[0] || null;
}
async function reserveDiscoveryProvider(sql, provider, dailyLimit = 2) {
  const dayKey = new Date().toISOString().slice(0, 10);
  await sql`INSERT INTO automation_discovery_provider_state (provider, day_key) VALUES (${provider}, ${dayKey}) ON CONFLICT (provider) DO NOTHING`;
  const rows = await sql`UPDATE automation_discovery_provider_state
    SET day_key = ${dayKey},
        request_count = CASE WHEN day_key = ${dayKey} THEN request_count ELSE 0 END,
        consecutive_failures = CASE WHEN day_key = ${dayKey} THEN consecutive_failures ELSE 0 END,
        cooldown_until = CASE WHEN cooldown_until IS NOT NULL AND cooldown_until <= NOW() THEN NULL ELSE cooldown_until END,
        updated_at = NOW()
    WHERE provider = ${provider}
      AND (cooldown_until IS NULL OR cooldown_until <= NOW())
      AND (day_key <> ${dayKey} OR request_count < ${dailyLimit})
    RETURNING provider`;
  if (!rows.length) return false;
  await sql`UPDATE automation_discovery_provider_state SET request_count = request_count + 1, updated_at = NOW() WHERE provider = ${provider}`;
  return true;
}
async function recordDiscoveryProviderSuccess(sql, provider) {
  await sql`UPDATE automation_discovery_provider_state SET consecutive_failures = 0, cooldown_until = NULL, updated_at = NOW() WHERE provider = ${provider}`;
}
async function recordDiscoveryProviderFailure(sql, provider, error) {
  const status = Number(error?.status || 0);
  await sql`UPDATE automation_discovery_provider_state
    SET consecutive_failures = consecutive_failures + 1,
        cooldown_until = CASE
          WHEN ${status} = 429 OR ${status} >= 500 THEN NOW() + INTERVAL '60 minutes'
          WHEN consecutive_failures + 1 >= 2 THEN NOW() + INTERVAL '30 minutes'
          ELSE NOW() + INTERVAL '15 minutes'
        END,
        last_error = ${String(error?.message || error || "Discovery provider failure").slice(0, 1000)},
        updated_at = NOW()
    WHERE provider = ${provider}`;
}
async function ensureAutomationSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS automation_discovery_provider_state (
    provider TEXT PRIMARY KEY, day_key DATE NOT NULL, request_count INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0, cooldown_until TIMESTAMPTZ, last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS automation_runs (
    id BIGSERIAL PRIMARY KEY, run_key TEXT NOT NULL UNIQUE, scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'queued',
    candidate_count INTEGER NOT NULL DEFAULT 0, scanned_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0, moderate_count INTEGER NOT NULL DEFAULT 0,
    healthy_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0, error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS automation_queue (
    id BIGSERIAL PRIMARY KEY, website TEXT NOT NULL, website_normalized TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'queued',
    run_id BIGINT, attempt_count INTEGER NOT NULL DEFAULT 0, scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, last_error TEXT, scan_history_id BIGINT,
    qualification_priority TEXT, qualification_reason TEXT, qualification_evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS automation_queue_website_active_idx
    ON automation_queue (website_normalized) WHERE status IN ('queued','running')`;
  await sql`CREATE INDEX IF NOT EXISTS automation_queue_status_idx
    ON automation_queue (status, scheduled_for)`;
  await sql`CREATE INDEX IF NOT EXISTS automation_queue_run_idx ON automation_queue (run_id)`;
  await sql`CREATE TABLE IF NOT EXISTS automation_outreach (
    id BIGSERIAL PRIMARY KEY, website_normalized TEXT NOT NULL, prospect_id BIGINT,
    outreach_kind TEXT NOT NULL DEFAULT 'initial', contacted_at TIMESTAMPTZ NOT NULL,
    contact_date DATE NOT NULL, channel TEXT, status TEXT, follow_up_at TIMESTAMPTZ,
    notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS automation_outreach_initial_idx
    ON automation_outreach (website_normalized) WHERE outreach_kind = 'initial'`;
  await sql`CREATE INDEX IF NOT EXISTS automation_outreach_followup_idx
    ON automation_outreach (follow_up_at, website_normalized)`;
  await sql`CREATE TABLE IF NOT EXISTS automation_shortlist (
    id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL, website_normalized TEXT NOT NULL,
    prospect_id BIGINT, priority TEXT NOT NULL, is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    qualification_reason TEXT, evidence JSONB, report_generated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS automation_shortlist_run_website_idx
    ON automation_shortlist (run_id, website_normalized)`;
  await sql`CREATE INDEX IF NOT EXISTS automation_shortlist_priority_idx
    ON automation_shortlist (run_id, priority)`;

  // These tables are part of the production discovery workflow. Keep their
  // creation here as well as in automationSchema.sql so a fresh/older Neon
  // database cannot silently break the scheduled worker.
  await sql`CREATE TABLE IF NOT EXISTS automation_discovery_stage_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stage_id TEXT NOT NULL DEFAULT 'pretoria_centurion',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS automation_discovery_backlog (
    id BIGSERIAL PRIMARY KEY,
    website TEXT NOT NULL,
    website_normalized TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    region TEXT,
    category TEXT,
    business_name TEXT,
    city TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    queued_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS automation_discovery_backlog_status_idx
    ON automation_discovery_backlog (status, created_at)`;
}

function historicalIdentityCandidates(normalized) {
  return [normalized, normalized ? normalized + "/" : ""].filter(Boolean);
}

async function findPreviouslyScannedWebsite(sql, normalized) {
  const candidates = historicalIdentityCandidates(normalized);
  const root = candidates[0];
  const rootSlash = candidates[1] || root;
  const pathPrefix = root + "/";

  const prospect = await sql`
    SELECT id, scan_count, last_scanned
    FROM prospects
    WHERE website_normalized IN (${root}, ${rootSlash})
       OR website_normalized LIKE ${pathPrefix + "%"}
    LIMIT 1
  `;
  if (prospect.length) return { type: "prospect", record: prospect[0] };

  const history = await sql`
    SELECT id, scanned_at
    FROM scan_history
    WHERE website_normalized IN (${root}, ${rootSlash})
       OR website_normalized LIKE ${pathPrefix + "%"}
    ORDER BY scanned_at DESC NULLS LAST, id DESC
    LIMIT 1
  `;
  return history.length ? { type: "history", record: history[0] } : null;
}

async function enqueueWebsites(websites, source = "manual") {
  const sql = getSql();
  await ensureAutomationSchema(sql);
  const results = [];
  for (const website of websites) {
    const normalized = normalizeProspectWebsite(website);
    if (!normalized) { results.push({ website, status: "invalid" }); continue; }
    const previouslyScanned = await findPreviouslyScannedWebsite(sql, normalized);
    if (previouslyScanned) {
      results.push({ website, status: "previously_scanned", scanRecordType: previouslyScanned.type, scanRecordId: previouslyScanned.record.id });
      continue;
    }
    const existing = source === "google_places"
      ? await sql`SELECT id, status, source FROM automation_queue WHERE website_normalized = ${normalized} ORDER BY id DESC LIMIT 1`
      : await sql`SELECT id, status FROM automation_queue WHERE website_normalized = ${normalized} AND status IN ('queued','running') LIMIT 1`;
    if (existing.length) {
      results.push({
        website,
        status: "duplicate",
        queueId: existing[0].id,
        source: existing[0].source || source
      });
      continue;
    }
    try {
      const inserted = await sql`
        INSERT INTO automation_queue
          (website, website_normalized, source, status, scheduled_for)
        VALUES
          (${website}, ${normalized}, ${source}, 'queued', NOW())
        RETURNING id, website, website_normalized, status
      `;
      results.push({ ...inserted[0], status: "queued" });
    } catch (error) {
      if (error?.code === "23505") {
        const duplicate = await sql`
          SELECT id, status, source
          FROM automation_queue
          WHERE website_normalized = ${normalized}
          ORDER BY id DESC LIMIT 1
        `;
        if (duplicate.length) {
          results.push({ website, status: "duplicate", queueId: duplicate[0].id });
          continue;
        }
      }
      throw error;
    }
  }
  return results;
}
async function createRun(runKey) {
  const sql = getSql();
  await sql`INSERT INTO automation_runs (run_key, scheduled_for, status) VALUES (${runKey}, NOW(), 'queued') ON CONFLICT (run_key) DO NOTHING`;
  const existing = await sql`SELECT id, run_key, status FROM automation_runs WHERE run_key = ${runKey} LIMIT 1`;
  if (existing.length && existing[0].status !== "queued") return { ...existing[0], acquired: false };
  const rows = await sql`UPDATE automation_runs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE run_key = ${runKey} AND status = 'queued' RETURNING id, run_key, status`;
  return rows.length ? { ...rows[0], acquired: true } : null;
}
async function recoverStaleQueueItems() {
  const sql = getSql();
  await sql`
    UPDATE automation_queue
    SET status = 'queued', run_id = NULL, started_at = NULL, updated_at = NOW(),
        scheduled_for = NOW(), last_error = COALESCE(last_error, 'Recovered stale running queue item.')
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '20 minutes'
      AND attempt_count < 3
  `;
}

async function markExhaustedFailures() {
  const sql = getSql();
  await sql`
    UPDATE automation_queue
    SET status = 'failed', completed_at = NOW(), updated_at = NOW()
    WHERE status = 'queued' AND attempt_count >= 3
  `;
}

async function claimNextQueueItem(runId) {
  const sql = getSql();
  const rows = await sql`
    UPDATE automation_queue
    SET status = 'running', run_id = ${runId}, attempt_count = attempt_count + 1,
        started_at = NOW(), updated_at = NOW()
    WHERE id = (
      SELECT id FROM automation_queue
      WHERE status = 'queued' AND attempt_count < 3 AND (scheduled_for IS NULL OR scheduled_for <= NOW())
      ORDER BY id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] || null;
}

async function completeQueueItem(id, result) {
  const sql = getSql();
  await sql`
    UPDATE automation_queue
    SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
        scan_history_id = ${result.historyId || null},
        qualification_priority = ${result.priority || null},
        qualification_reason = ${result.reason || null},
        qualification_evidence = ${JSON.stringify(result.evidence || {})}
    WHERE id = ${id}
  `;
}

async function failQueueItem(id, error) {
  const sql = getSql();
  await sql`
    UPDATE automation_queue
    SET status = CASE WHEN attempt_count < 3 THEN 'queued' ELSE 'failed' END,
        completed_at = CASE WHEN attempt_count < 3 THEN NULL ELSE NOW() END,
        scheduled_for = CASE WHEN attempt_count < 3 THEN NOW() + INTERVAL '5 minutes' ELSE scheduled_for END,
        updated_at = NOW(),
        last_error = ${String(error?.message || error || "Unknown error")}
    WHERE id = ${id}
  `;
}

async function addShortlistItem(runId, websiteNormalized, priority, reason, evidence) {
  const sql = getSql();
  const prospect = await sql`
    SELECT id FROM prospects WHERE website_normalized = ${websiteNormalized} LIMIT 1
  `;
  await sql`
    INSERT INTO automation_shortlist
      (run_id, website_normalized, prospect_id, priority, is_follow_up, qualification_reason, evidence)
    VALUES
      (${runId}, ${websiteNormalized}, ${prospect[0]?.id || null}, ${priority},
       FALSE, ${reason || null}, ${JSON.stringify(evidence || {})})
    ON CONFLICT (run_id, website_normalized) DO UPDATE SET
      priority = EXCLUDED.priority,
      qualification_reason = EXCLUDED.qualification_reason,
      evidence = EXCLUDED.evidence
  `;
}

async function addDueFollowUps(runId) {
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT ON (o.website_normalized)
      o.website_normalized, p.id AS prospect_id, p.priority,
      o.follow_up_at
    FROM automation_outreach o
    LEFT JOIN prospects p ON p.website_normalized = o.website_normalized
    WHERE o.follow_up_at IS NOT NULL
      AND o.follow_up_at <= NOW()
      AND NOT EXISTS (
        SELECT 1 FROM automation_shortlist s
        WHERE s.run_id = ${runId} AND s.website_normalized = o.website_normalized
      )
    ORDER BY o.website_normalized, o.follow_up_at ASC
  `;
  for (const row of rows) {
    await sql`
      INSERT INTO automation_shortlist
        (run_id, website_normalized, prospect_id, priority, is_follow_up, qualification_reason)
      VALUES
        (${runId}, ${row.website_normalized}, ${row.prospect_id || null},
         ${row.priority || "moderate"}, TRUE, 'Follow-up is due.')
      ON CONFLICT (run_id, website_normalized) DO NOTHING
    `;
  }
  return rows.length;
}

async function finishRun(runId, counts, errorSummary = null) {
  const sql = getSql();
  await sql`
    UPDATE automation_runs
    SET status = ${errorSummary ? "completed_with_errors" : "completed"},
        completed_at = NOW(), candidate_count = ${counts.candidateCount},
        scanned_count = ${counts.scannedCount}, high_count = ${counts.highCount},
        moderate_count = ${counts.moderateCount}, healthy_count = ${counts.healthyCount},
        failed_count = ${counts.failedCount}, error_summary = ${errorSummary},
        updated_at = NOW()
    WHERE id = ${runId}
  `;
}

async function getDiscoveryStageState(sql) {
  const rows = await sql`SELECT stage_id FROM automation_discovery_stage_state WHERE id = 1 LIMIT 1`;
  if (rows.length) return rows[0].stage_id;
  await sql`INSERT INTO automation_discovery_stage_state (id, stage_id) VALUES (1, 'pretoria_centurion') ON CONFLICT (id) DO NOTHING`;
  return "pretoria_centurion";
}
async function setDiscoveryStageState(sql, stageId) {
  await sql`INSERT INTO automation_discovery_stage_state (id, stage_id, updated_at) VALUES (1, ${stageId}, NOW()) ON CONFLICT (id) DO UPDATE SET stage_id = EXCLUDED.stage_id, updated_at = NOW()`;
}
async function addDiscoveryBacklogCandidates(sql, candidates, source, stageId) {
  let added = 0;
  for (const candidate of candidates || []) {
    const normalized = normalizeProspectWebsite(candidate.website);
    if (!normalized) continue;
    const rows = await sql`INSERT INTO automation_discovery_backlog (website, website_normalized, source, region, category, business_name, city) VALUES (${candidate.website}, ${normalized}, ${source}, ${stageId || null}, ${candidate.category || null}, ${candidate.name || null}, ${candidate.city || null}) ON CONFLICT (website_normalized) DO NOTHING RETURNING id`;
    if (rows.length) added++;
  }
  return added;
}
async function drainDiscoveryBacklog(sql, limit = 40) {
  const rows = await sql`SELECT id, website FROM automation_discovery_backlog WHERE status = 'available' ORDER BY id ASC LIMIT ${Math.max(1, Math.min(Number(limit) || 40, 40))}`;
  const results = [];
  for (const row of rows) {
    const normalized = normalizeProspectWebsite(row.website);
    if (!normalized) {
      await sql`UPDATE automation_discovery_backlog SET status = 'consumed', consumed_at = NOW() WHERE id = ${row.id}`;
      continue;
    }

    const previouslyScanned = await findPreviouslyScannedWebsite(sql, normalized);
    if (previouslyScanned) {
      await sql`UPDATE automation_discovery_backlog SET status = 'consumed', consumed_at = NOW() WHERE id = ${row.id}`;
      continue;
    }

    const existing = await sql`SELECT id FROM automation_queue WHERE website_normalized = ${normalized} AND status IN ('queued','running') LIMIT 1`;
    if (existing.length) {
      await sql`UPDATE automation_discovery_backlog SET status = 'consumed', consumed_at = NOW() WHERE id = ${row.id}`;
      continue;
    }

    results.push(row.website);
    await sql`UPDATE automation_discovery_backlog SET status = 'queued', queued_at = NOW() WHERE id = ${row.id}`;
  }
  return results;
}

module.exports = {
  getSql, normalizeProspectWebsite, historicalIdentityCandidates, getQueueDepth, getDailyScannedCount,
  getDiscoveryProviderState, reserveDiscoveryProvider, recordDiscoveryProviderSuccess, recordDiscoveryProviderFailure,
  getDiscoveryStageState, setDiscoveryStageState, addDiscoveryBacklogCandidates, drainDiscoveryBacklog,
  ensureAutomationSchema, enqueueWebsites, createRun, claimNextQueueItem,
  completeQueueItem, failQueueItem,
  addShortlistItem, addDueFollowUps, finishRun, recoverStaleQueueItems, markExhaustedFailures, findPreviouslyScannedWebsite
};
