const { neon } = require("@neondatabase/serverless");
const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(process.env.DATABASE_URL);
}

function normalizeProspectWebsite(url) { return normalizeWebsite(url); }
function cleanProspectWebsite(url) { return cleanWebsiteUrl(url); }

function isPlatformHostedWebsite(normalized) {
  const host = String(normalized || "").replace(/^www\\./i, "").toLowerCase();
  const blocked = [
    "facebook.com", "instagram.com", "linkedin.com", "tripadvisor.com",
    "booking.com", "airbnb.com", "google.com", "maps.google.com",
    "yellowpages.net.za", "yellowpages-south-africa.com", "myportmoni.com",
    "linktr.ee", "wixsite.com", "wordpress.com", "sites.google.com"
  ];
  return blocked.some(domain => host === domain || host.endsWith("." + domain));
}


async function getQueueDepth(sql) {
  const rows = await sql`
    SELECT COUNT(DISTINCT q.website_normalized)::int AS count
    FROM automation_queue q
    WHERE q.status = 'queued'
      AND q.attempt_count < 3
      AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
      AND NOT EXISTS (
        SELECT 1 FROM prospects p
        WHERE p.website_normalized = q.website_normalized
           OR p.website_normalized LIKE q.website_normalized || '/%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM scan_history h
        WHERE h.website_normalized = q.website_normalized
           OR h.website_normalized LIKE q.website_normalized || '/%'
      )`;
  return Number(rows[0]?.count || 0);
}

async function getFreshQueueDepth(sql) {
  const rows = await sql`
    SELECT COUNT(DISTINCT q.website_normalized)::int AS count
    FROM automation_queue q
    WHERE q.status = 'queued'
      AND q.attempt_count = 0
      AND (q.scheduled_for IS NULL OR q.scheduled_for <= NOW())
      AND NOT EXISTS (
        SELECT 1 FROM prospects p
        WHERE p.website_normalized = q.website_normalized
           OR p.website_normalized LIKE q.website_normalized || '/%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM scan_history h
        WHERE h.website_normalized = q.website_normalized
           OR h.website_normalized LIKE q.website_normalized || '/%'
      )`;
  return Number(rows[0]?.count || 0);
}

async function getDailyScannedCount(sql, cycleDate = null) {
  // Count only successful scans of genuinely new prospects inside the same
  // SAST calendar day. Midnight starts the new production cycle and 07:30 is
  // the reporting cutoff; a queue completion cannot satisfy the 50-site target
  // if the website already had scan history before it entered this queue.
  const rows = cycleDate
    ? await sql`
        SELECT COUNT(*)::int AS count
        FROM automation_queue q
        WHERE q.status = 'completed'
          AND q.scan_history_id IS NOT NULL
          AND q.completed_at >= (${String(cycleDate)}::date) AT TIME ZONE 'Africa/Johannesburg'
          AND q.completed_at < ((${String(cycleDate)}::date + 1)) AT TIME ZONE 'Africa/Johannesburg'
          AND NOT EXISTS (
            SELECT 1
            FROM scan_history h
            WHERE h.website_normalized = q.website_normalized
              AND h.scanned_at < q.created_at
          )
      `
    : await sql`
        WITH cycle AS (
          SELECT CASE
            WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg') < 8
              THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date - 1
            ELSE (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date
          END AS cycle_date
        )
        SELECT COUNT(*)::int AS count
        FROM automation_queue q, cycle
        WHERE q.status = 'completed'
          AND q.scan_history_id IS NOT NULL
          AND q.completed_at >= (cycle.cycle_date + TIME '08:00') AT TIME ZONE 'Africa/Johannesburg'
          AND q.completed_at < ((cycle.cycle_date + 1) + TIME '08:00') AT TIME ZONE 'Africa/Johannesburg'
          AND NOT EXISTS (
            SELECT 1
            FROM scan_history h
            WHERE h.website_normalized = q.website_normalized
              AND h.scanned_at < q.created_at
          )
      `;
  return Number(rows[0]?.count || 0);
}
async function recoverStaleAutomationRuns(sql) {
  await sql`
    UPDATE automation_runs
    SET status = 'completed_with_errors',
        completed_at = NOW(),
        error_summary = COALESCE(error_summary, 'Recovered stale automation run after the worker exceeded its safety window.'),
        updated_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '15 minutes'
  `;
}

async function claimNextDailyRun(sql, cycleDate, maxBatches = 5, requestedBatchNo = null) {
  const safeDate = String(cycleDate);
  const limit = Math.max(1, Math.min(Number(maxBatches) || 12, 12));
  const requested = Number(requestedBatchNo);
  const hasRequestedBatch = Number.isInteger(requested) && requested >= 1 && requested <= limit;
  const rows = hasRequestedBatch
    ? await sql`
        INSERT INTO automation_runs (run_key, scheduled_for, status, started_at)
        VALUES (${safeDate} || ':' || ${requested}::text, NOW(), 'running', NOW())
        ON CONFLICT (run_key) DO NOTHING
        RETURNING id, run_key, status
      `
    : await sql`
        WITH candidate AS (
          SELECT gs AS batch_no
          FROM generate_series(1, ${limit}) AS gs
          WHERE NOT EXISTS (
            SELECT 1
            FROM automation_runs r
            WHERE r.run_key = ${safeDate} || ':' || gs::text
          )
          AND NOT EXISTS (
            SELECT 1
            FROM generate_series(1, gs - 1) AS prior
            LEFT JOIN automation_runs pr
              ON pr.run_key = ${safeDate} || ':' || prior::text
            WHERE pr.id IS NULL
               OR pr.status NOT IN ('completed', 'completed_with_errors')
          )
          ORDER BY gs
          LIMIT 1
        )
        INSERT INTO automation_runs (run_key, scheduled_for, status, started_at)
        SELECT ${safeDate} || ':' || batch_no::text, NOW(), 'running', NOW()
        FROM candidate
        ON CONFLICT (run_key) DO NOTHING
        RETURNING id, run_key, status
      `;
  return rows.length ? { ...rows[0], acquired: true } : null;
}

async function getDiscoveryProviderState(sql, provider) {
  const rows = await sql`SELECT * FROM automation_discovery_provider_state WHERE provider = ${provider} LIMIT 1`;
  return rows[0] || null;
}
async function reserveDiscoveryProvider(sql, provider, dailyLimit = 2, cycleDate = null, monthlyLimit = null) {
  const dayKey = cycleDate || new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg"
  }).format(new Date());
  const monthKey = String(dayKey).slice(0, 7);
  await sql`
    INSERT INTO automation_discovery_provider_state (provider, day_key, month_key)
    VALUES (${provider}, ${dayKey}, ${monthKey})
    ON CONFLICT (provider) DO NOTHING
  `;
  const rows = await sql`
    UPDATE automation_discovery_provider_state
    SET day_key = ${dayKey},
        request_count = CASE WHEN day_key = ${dayKey} THEN request_count ELSE 0 END,
        month_key = ${monthKey},
        monthly_request_count = CASE WHEN month_key = ${monthKey} THEN monthly_request_count ELSE 0 END,
        consecutive_failures = CASE WHEN day_key = ${dayKey} THEN consecutive_failures ELSE 0 END,
        cooldown_until = CASE WHEN cooldown_until IS NOT NULL AND cooldown_until <= NOW() THEN NULL ELSE cooldown_until END,
        updated_at = NOW()
    WHERE provider = ${provider}
      AND (cooldown_until IS NULL OR cooldown_until <= NOW())
      AND (day_key <> ${dayKey} OR request_count < ${dailyLimit})
      AND (${monthlyLimit === null ? 0 : Number(monthlyLimit)} <= 0 OR
           (month_key <> ${monthKey} OR monthly_request_count < ${Number(monthlyLimit)}))
    RETURNING provider
  `;
  if (!rows.length) return false;
  await sql`
    UPDATE automation_discovery_provider_state
    SET request_count = request_count + 1,
        monthly_request_count = monthly_request_count + 1,
        updated_at = NOW()
    WHERE provider = ${provider}
  `;
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
    month_key TEXT, monthly_request_count INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0, cooldown_until TIMESTAMPTZ, last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE automation_discovery_provider_state ADD COLUMN IF NOT EXISTS month_key TEXT`;
  await sql`ALTER TABLE automation_discovery_provider_state ADD COLUMN IF NOT EXISTS monthly_request_count INTEGER NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS automation_runs (
    id BIGSERIAL PRIMARY KEY, run_key TEXT NOT NULL UNIQUE, scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'queued',
    candidate_count INTEGER NOT NULL DEFAULT 0, scanned_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0, moderate_count INTEGER NOT NULL DEFAULT 0,
    healthy_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0, error_summary TEXT,
    queue_depth_before INTEGER, queue_depth_after INTEGER, queue_reserve_target INTEGER,
    refill_requested INTEGER, refill_added INTEGER, queue_health TEXT,
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
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS queue_depth_before INTEGER`;
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS queue_depth_after INTEGER`;
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS queue_reserve_target INTEGER`;
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS refill_requested INTEGER`;
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS refill_added INTEGER`;
  await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS queue_health TEXT`;
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

  // Preserve failed prospects for manual rescue review without allowing hard
  // failures to consume production retry budget.
  await sql`CREATE TABLE IF NOT EXISTS automation_scan_failures (
    id BIGSERIAL PRIMARY KEY,
    queue_id BIGINT,
    run_id BIGINT,
    website TEXT NOT NULL,
    website_normalized TEXT NOT NULL,
    source TEXT,
    failure_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    details JSONB,
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS automation_scan_failures_created_idx
    ON automation_scan_failures (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS automation_scan_failures_reviewed_idx
    ON automation_scan_failures (reviewed, created_at DESC)`;
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
    const cleanedWebsite = cleanProspectWebsite(website);
    const normalized = normalizeProspectWebsite(cleanedWebsite);
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
          (${cleanedWebsite}, ${normalized}, ${source}, 'queued', NOW())
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
    UPDATE automation_queue q
    SET status = 'running', run_id = ${runId}, attempt_count = q.attempt_count + 1,
        started_at = NOW(), updated_at = NOW()
    WHERE q.id = (
      SELECT candidate.id
      FROM automation_queue candidate
      WHERE candidate.status = 'queued'
        AND candidate.attempt_count < 3
        AND (candidate.scheduled_for IS NULL OR candidate.scheduled_for <= NOW())
        AND NOT EXISTS (
          SELECT 1
          FROM prospects p
          WHERE p.website_normalized = candidate.website_normalized
             OR p.website_normalized LIKE candidate.website_normalized || '/%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM scan_history h
          WHERE h.website_normalized = candidate.website_normalized
             OR h.website_normalized LIKE candidate.website_normalized || '/%'
        )
      ORDER BY candidate.id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING q.*
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

async function failQueueItem(id, error, options = {}) {
  const sql = getSql();
  const retryable = options.retryable !== false;
  const failureType = String(options.failureType || "OTHER");
  const details = options.details || {};
  const rows = await sql`
    SELECT id, run_id, website, website_normalized, source, attempt_count
    FROM automation_queue
    WHERE id = ${id}
    LIMIT 1
  `;
  const item = rows[0];
  const message = String(error?.message || error || "Unknown error");

  if (item) {
    await sql`
      INSERT INTO automation_scan_failures
        (queue_id, run_id, website, website_normalized, source, failure_type,
         error_message, attempt_count, details)
      VALUES
        (${item.id}, ${item.run_id || null}, ${item.website}, ${item.website_normalized},
         ${item.source || null}, ${failureType}, ${message}, ${item.attempt_count || 1},
         ${JSON.stringify(details)})
    `;
  }

  if (retryable && (item?.attempt_count || 0) < 3) {
    await sql`
      UPDATE automation_queue
      SET status = 'queued',
          completed_at = NULL,
          scheduled_for = NOW() + INTERVAL '5 minutes',
          updated_at = NOW(),
          last_error = ${message}
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE automation_queue
      SET status = 'failed',
          completed_at = NOW(),
          updated_at = NOW(),
          last_error = ${message}
      WHERE id = ${id}
    `;
  }
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

async function finishRun(runId, counts, errorSummary = null, pipelineReport = null) {
  const sql = getSql();
  await sql`
    UPDATE automation_runs
    SET status = ${errorSummary ? "completed_with_errors" : "completed"},
        completed_at = NOW(), candidate_count = ${counts.candidateCount},
        scanned_count = ${counts.scannedCount}, high_count = ${counts.highCount},
        moderate_count = ${counts.moderateCount}, healthy_count = ${counts.healthyCount},
        failed_count = ${counts.failedCount}, error_summary = ${errorSummary},
        queue_depth_before = ${pipelineReport?.freshBeforeRun ?? null}, queue_depth_after = ${pipelineReport?.freshAfterRun ?? null},
        queue_reserve_target = ${pipelineReport?.reserveTarget ?? null}, refill_requested = ${pipelineReport?.refillRequested ?? null},
        refill_added = ${pipelineReport?.refillAdded ?? null}, queue_health = ${pipelineReport?.queueHealth ?? null},
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
async function addDiscoveryBacklogCandidates(sql, candidates, source, stageId, diagnostics = false) {
  let added = 0;
  let invalidUrl = 0;
  let platformOnly = 0;
  let duplicates = 0;

  for (const candidate of candidates || []) {
    const cleanedWebsite = cleanProspectWebsite(candidate.website);
    const normalized = normalizeProspectWebsite(cleanedWebsite);
    if (!normalized) {
      invalidUrl++;
      continue;
    }

    const backlogStatus = isPlatformHostedWebsite(normalized) ? "platform_only" : "available";
    const rows = await sql`INSERT INTO automation_discovery_backlog
      (website, website_normalized, source, region, category, business_name, city, status)
      VALUES (${cleanedWebsite}, ${normalized}, ${source}, ${stageId || null},
              ${candidate.category || null}, ${candidate.name || null}, ${candidate.city || null}, ${backlogStatus})
      ON CONFLICT (website_normalized) DO NOTHING
      RETURNING id`;

    if (rows.length) {
      added++;
      if (backlogStatus === "platform_only") platformOnly++;
    } else {
      duplicates++;
    }
  }

  if (!diagnostics) return added;

  return {
    inputCandidates: Array.isArray(candidates) ? candidates.length : 0,
    added,
    invalidUrl,
    platformOnly,
    duplicates,
    usableBacklogCandidates: added - platformOnly
  };
}
async function promoteFreshBacklogToQueue(sql, limit = 80, sourceOverride = null) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 110));

  // Keep the discovery backlog itself limited to genuinely fresh, never-scanned
  // websites. Older rows can remain in the table for audit/history, but they
  // must not remain visible as available supply after a successful scan exists.
  await sql`
    UPDATE automation_discovery_backlog b
    SET status = 'consumed',
        consumed_at = COALESCE(consumed_at, NOW())
    WHERE b.status = 'available'
      AND (
        EXISTS (
          SELECT 1
          FROM prospects p
          WHERE p.website_normalized IN (b.website_normalized, b.website_normalized || '/')
             OR p.website_normalized LIKE b.website_normalized || '/%'
        )
        OR EXISTS (
          SELECT 1
          FROM scan_history h
          WHERE h.website_normalized IN (b.website_normalized, b.website_normalized || '/')
             OR h.website_normalized LIKE b.website_normalized || '/%'
        )
      )
  `;

  const rows = await sql`
    WITH candidates AS (
      SELECT b.id, b.website, b.website_normalized,
             COALESCE(${sourceOverride}, b.source) AS queue_source
      FROM automation_discovery_backlog b
      WHERE b.status = 'available'
        AND NOT EXISTS (
          SELECT 1
          FROM prospects p
          WHERE p.website_normalized IN (b.website_normalized, b.website_normalized || '/')
             OR p.website_normalized LIKE b.website_normalized || '/%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM scan_history h
          WHERE h.website_normalized IN (b.website_normalized, b.website_normalized || '/')
             OR h.website_normalized LIKE b.website_normalized || '/%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM automation_queue q
          WHERE q.website_normalized = b.website_normalized
        )
      ORDER BY b.id ASC
      LIMIT ${safeLimit}
      FOR UPDATE OF b SKIP LOCKED
    ),
    inserted AS (
      INSERT INTO automation_queue
        (website, website_normalized, source, status, scheduled_for)
      SELECT website, website_normalized, queue_source, 'queued', NOW()
      FROM candidates
      RETURNING id, website, website_normalized
    )
    SELECT c.id AS backlog_id, i.website, i.website_normalized
    FROM candidates c
    JOIN inserted i ON i.website_normalized = c.website_normalized
  `;

  if (rows.length) {
    const ids = rows.map(row => row.backlog_id);
    await sql`
      UPDATE automation_discovery_backlog
      SET status = 'consumed',
          queued_at = COALESCE(queued_at, NOW()),
          consumed_at = NOW()
      WHERE id = ANY(${ids})
    `;
  }

  return rows;
}

async function drainDiscoveryBacklog(sql, limit = 80) {
  // A backlog row is only a discovery staging record. Once its website has
  // entered automation_queue, it must no longer occupy the discovery backlog,
  // even after the queue item is later completed. Keep the backlog itself
  // focused on candidates that have not yet entered the active queue.
  await sql`
    UPDATE automation_discovery_backlog b
    SET status = 'consumed',
        consumed_at = COALESCE(consumed_at, NOW())
    WHERE b.status IN ('available', 'queued')
      AND EXISTS (
        SELECT 1
        FROM automation_queue q
        WHERE q.website_normalized = b.website_normalized
      )
  `;
  // Older schema versions used "queued" for staged discovery rows. Recover
  // those rows when they have not actually entered automation_queue.
  await sql`
    UPDATE automation_discovery_backlog b
    SET status = 'available',
        updated_at = NOW()
    WHERE b.status = 'queued'
      AND NOT EXISTS (
        SELECT 1
        FROM automation_queue q
        WHERE q.website_normalized = b.website_normalized
      )
  `;
  const rows = await sql`SELECT id, website FROM automation_discovery_backlog WHERE status = 'available' ORDER BY id ASC LIMIT ${Math.max(1, Math.min(Number(limit) || 80, 80))}`;
  const results = [];
  for (const row of rows) {
    const cleanedWebsite = cleanProspectWebsite(row.website);
    const normalized = normalizeProspectWebsite(cleanedWebsite);
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

    results.push({ id: row.id, website: cleanedWebsite });
  }
  return results;
}

async function markDiscoveryBacklogResults(sql, items, enqueueResults) {
  const resultByWebsite = new Map((enqueueResults || []).map(item => [item.website, item.status]));
  for (const item of items || []) {
    const status = resultByWebsite.get(item.website);
    if (status === 'queued') {
      // The candidate has left discovery staging and now belongs to the
      // automation queue. Do not leave a second active pipeline copy behind.
      await sql`UPDATE automation_discovery_backlog
        SET status = 'consumed', queued_at = COALESCE(queued_at, NOW()), consumed_at = NOW()
        WHERE id = ${item.id}`;
    } else if (status === 'previously_scanned' || status === 'duplicate' || status === 'invalid') {
      await sql`UPDATE automation_discovery_backlog SET status = 'consumed', consumed_at = NOW() WHERE id = ${item.id}`;
    }
  }
}

module.exports = {
  getSql, normalizeProspectWebsite, cleanProspectWebsite, historicalIdentityCandidates, getQueueDepth, getFreshQueueDepth, getDailyScannedCount, recoverStaleAutomationRuns, claimNextDailyRun,
  getDiscoveryProviderState, reserveDiscoveryProvider, recordDiscoveryProviderSuccess, recordDiscoveryProviderFailure,
  getDiscoveryStageState, setDiscoveryStageState, addDiscoveryBacklogCandidates, promoteFreshBacklogToQueue, drainDiscoveryBacklog, markDiscoveryBacklogResults,
  ensureAutomationSchema, enqueueWebsites, createRun, claimNextQueueItem,
  completeQueueItem, failQueueItem,
  addShortlistItem, addDueFollowUps, finishRun, recoverStaleQueueItems, markExhaustedFailures, findPreviouslyScannedWebsite
};
