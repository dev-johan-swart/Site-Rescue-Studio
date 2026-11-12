let dep0169TraceAttached = false;

function attachDep0169Trace() {
  if (dep0169TraceAttached) return;
  dep0169TraceAttached = true;
  process.on("warning", warning => {
    if (warning?.code === "DEP0169") {
      console.warn("DEP0169 source trace:", warning.stack || warning.message);
    }
  });
}

function authorised(req) {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers?.authorization || "";
  return Boolean(expected && supplied === `Bearer ${expected}`);
}

module.exports = async function handler(req, res) {
  attachDep0169Trace();
  let qualifyProspect;
  let discoverWithProviders;
  let getDiscoveryStage;
  let nextEnabledDiscoveryStageId;
  let providerQueries;
  let PRIMARY_DISCOVERY_PROVIDERS;
  let PREPARATION_PROVIDER_ORDER;
  let getSql;
  let ensureAutomationSchema;
  let claimNextQueueItem;
  let getQueueDepth;
  let getFreshQueueDepth;
  let getDailyScannedCount;
  let recoverStaleAutomationRuns;
  let claimNextDailyRun;
  let getDiscoveryStageState;
  let setDiscoveryStageState;
  let getDiscoveryProviderPageState;
  let getDiscoveryProviderState;
  let recordDiscoveryProviderPageResult;
  let filterFreshDiscoveryCandidates;
  let addDiscoveryBacklogCandidates;
  let promoteFreshBacklogToQueue;
  let reserveDiscoveryProvider;
  let recordDiscoveryProviderSuccess;
  let recordDiscoveryProviderFailure;
  let completeQueueItem;
  let failQueueItem;
  let isPermanentScanFailure;
  let addShortlistItem;
  let addDueFollowUps;
  let finishRun;
  let recoverStaleQueueItems;
  let markExhaustedFailures;
  let saveDiscoveryMetadataToProspect;

  try {
    ({ qualifyProspect } = require("../../lib/prospectQualification"));
    ({
      discoverWithProviders,
      getDiscoveryStage,
      nextEnabledDiscoveryStageId,
      providerQueries,
      PRIMARY_DISCOVERY_PROVIDERS,
      preparationProviderOrderForStage
    } = require("../../lib/discoveryProviders"));
    ({
      getSql,
      ensureAutomationSchema,
      claimNextQueueItem,
      getQueueDepth,
      getFreshQueueDepth,
      getDailyScannedCount,
      recoverStaleAutomationRuns,
      claimNextDailyRun,
      getDiscoveryStageState,
      setDiscoveryStageState,
      getDiscoveryProviderPageState,
      getDiscoveryProviderState,
      recordDiscoveryProviderPageResult,
      filterFreshDiscoveryCandidates,
      addDiscoveryBacklogCandidates,
      promoteFreshBacklogToQueue,
      reserveDiscoveryProvider,
      recordDiscoveryProviderSuccess,
      recordDiscoveryProviderFailure,
      completeQueueItem,
      failQueueItem,
      isPermanentScanFailure,
      addShortlistItem,
      addDueFollowUps,
      finishRun,
      recoverStaleQueueItems,
      markExhaustedFailures,
      saveDiscoveryMetadataToProspect
    } = require("../../lib/automationStore"));
  } catch (error) {
    const message = String(error?.message || error);
    console.error("Automation module initialization failed.", {
      message,
      stack: error?.stack || null
    });
    return res.status(200).json({
      success: false,
      fatalStage: "module_initialization",
      error: message,
      stack: error?.stack || null
    });
  }

  if (!authorised(req)) {
    console.warn("Automation cron rejected.", {
      method: req.method,
      userAgent: req.headers?.["user-agent"] || null
    });
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  const sql = getSql();
  const runtimeDiagnostics = {
    nodeVersion: process.version,
    vercelRegion: process.env.VERCEL_REGION || null,
    neonRoundTripMs: null
  };
  const dbPingStartedAt = Date.now();
  try {
    await sql`SELECT 1 AS health_check`;
    runtimeDiagnostics.neonRoundTripMs = Date.now() - dbPingStartedAt;
    console.info("Automation runtime diagnostics.", runtimeDiagnostics);
  } catch (error) {
    console.warn("Automation Neon round-trip diagnostic failed.", {
      nodeVersion: runtimeDiagnostics.nodeVersion,
      vercelRegion: runtimeDiagnostics.vercelRegion,
      message: String(error?.message || error)
    });
  }
  try {
    await ensureAutomationSchema(sql);
  } catch (error) {
    const message = String(error?.message || error);
    console.error("Automation schema initialization failed.", { message, stack: error?.stack || null });
    return res.status(200).json({
      success: false,
      fatalStage: "schema_initialization",
      error: message
    });
  }

  // Production must finish its daily cycle before the morning reporting window.
  // GitHub schedules are best-effort, so this is enforced at the production
  // endpoint rather than relying on scheduler timing alone.
  const cutoffParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const cutoffHour = Number(cutoffParts.hour || 0);
  const cutoffMinute = Number(cutoffParts.minute || 0);
  const isPreparation = String(req.query?.mode || "").toLowerCase() === "prepare";
  if (!isPreparation && (cutoffHour > 7 || (cutoffHour === 7 && cutoffMinute >= 30))) {
    return res.status(200).json({
      success: true,
      productionWindowClosed: true,
      reason: "Daily production window closed at 07:30 SAST.",
      dailyTarget: 50
    });
  }

  // Each worker invocation claims the next unfinished 5-site batch atomically.
  // External scheduling supplies repeated opportunities; the database remains
  // the source of truth for which batch is actually allowed to run.
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const localHour = Number(localParts.hour || 0);
  const localDate = `${localParts.year}-${localParts.month}-${localParts.day}`;
  // A production cycle belongs to the SAST calendar day on which it starts.
  // Midnight SAST begins the new production day; 07:30 SAST is the reporting cutoff.
  const cycleDate = localDate;
  try {
    await recoverStaleQueueItems(sql);
    await recoverStaleAutomationRuns(sql);
  } catch (error) {
    const message = String(error?.message || error);
    console.error("Automation stale-run recovery failed.", { message, stack: error?.stack || null });
    return res.status(200).json({ success: false, fatalStage: "stale_run_recovery", error: message });
  }

  // Preparation runs build the fresh reserve before the first scan window without consuming a scan batch.
  if (isPreparation) {
    try {
    const LOCAL_PROSPECT_RESERVE = require("../../data/prospect-reserve.json");
    const target = 110;
    const dailyLimit = Math.max(1, Math.min(Number(process.env.AUTOMATION_DISCOVERY_DAILY_LIMIT || 12), 12));
    const preparationProviderDailyLimits = {
      pretoriaeast: dailyLimit,
      ccbc: dailyLimit,
      openstreetmap: dailyLimit,
      hotfrog: Math.min(Number(process.env.AUTOMATION_HOTFROG_DAILY_LIMIT || 4), 4),
      opendi: Math.min(Number(process.env.AUTOMATION_OPENDI_DAILY_LIMIT || 4), 4),
      pretoriahub: Math.min(Number(process.env.AUTOMATION_PRETORIAHUB_DAILY_LIMIT || 4), 4),
      mycityinfo: Math.min(Number(process.env.AUTOMATION_MYCITYINFO_DAILY_LIMIT || 4), 4),
      foursquare: 0,
      websdocs: Math.min(Number(process.env.AUTOMATION_WEBS_DOCS_DAILY_LIMIT || 8), 8)
    };
    const preparationProviderMonthlyLimits = {
      hotfrog: 100,
      opendi: 100,
      pretoriahub: 100,
      mycityinfo: 100
    };
    const maxAttempts = 3;
    const maxPreparationMs = 180000;
    const startedAt = Date.now();
    let queueDepth = await getFreshQueueDepth(sql);
    const attempts = [];
    let stageId = await getDiscoveryStageState(sql);

    // Seed the durable local reserve first. This is independent of live
    // discovery providers and uses the same dedupe/backlog path as all other
    // discovery candidates.
    const reserveCandidates = (Array.isArray(LOCAL_PROSPECT_RESERVE) ? LOCAL_PROSPECT_RESERVE : [])
      .map(website => ({ website, name: null, city: null, category: "local_reserve" }))
      .filter(candidate => candidate.website);

    if (reserveCandidates.length && queueDepth < target) {
      try {
        const localDiagnostics = await addDiscoveryBacklogCandidates(
          sql,
          reserveCandidates,
          "local_reserve",
          "local_reserve",
          true
        );
        const promoted = await promoteFreshBacklogToQueue(
          sql,
          Math.max(target - queueDepth, 0),
          "local_reserve"
        );
        queueDepth = await getFreshQueueDepth(sql);
        attempts.push({
          source: "local_reserve",
          candidateCount: reserveCandidates.length,
          queueDepth,
          backlogDiagnostics: localDiagnostics,
          newlyQueued: promoted.length,
          status: "success"
        });
      } catch (error) {
        const message = String(error?.message || error);
        attempts.push({
          source: "local_reserve",
          candidateCount: reserveCandidates.length,
          queueDepth,
          status: "failed",
          error: message
        });
        console.error("Discovery preparation local reserve failed.", {
          message,
          stack: error?.stack || null
        });
      }
    }
    for (let attemptNumber = 0; queueDepth < target && attemptNumber < maxAttempts; attemptNumber++) {
      if (Date.now() - startedAt >= maxPreparationMs) break;
      const promoted = await promoteFreshBacklogToQueue(sql, target - queueDepth, "discovery_backlog");
      queueDepth = await getFreshQueueDepth(sql);
      if (queueDepth >= target) break;
      const stage = getDiscoveryStage(stageId);
      if (stage.id === "international" && String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY || "").toLowerCase() !== "true") {
        stageId = nextEnabledDiscoveryStageId(stage.id);
        await setDiscoveryStageState(sql, stageId);
        continue;
      }
      try {
        const discovery = await discoverWithProviders({
          stage,
          queries: providerQueries(new Date(), stage.queries, Date.now() + attemptNumber),
          maxCandidates: 20,
          providerStartOffset: 0,
          providerOrder: preparationProviderOrderForStage(stage.id),
          providerPageOffset: attemptNumber,
          getProviderPageState: async (provider, pageCount) => getDiscoveryProviderPageState(sql, provider, pageCount),
          recordProviderPageResult: async (provider, page, pageCount, hasFreshCandidates) =>
            recordDiscoveryProviderPageResult(sql, provider, page, pageCount, hasFreshCandidates),
          filterFreshCandidates: async candidates => filterFreshDiscoveryCandidates(sql, candidates),
          isProviderAvailable: async provider => {
            if (provider === "foursquare" && !String(process.env.FOURSQUARE_API_KEY || "").trim()) {
              return { available: false, reason: "disabled", details: { cause: "foursquare_not_configured" } };
            }
            const providerLimit = Number(preparationProviderDailyLimits[provider] ?? dailyLimit);
            if (providerLimit <= 0) return { available: false, reason: "disabled" };
            const monthlyLimit = preparationProviderMonthlyLimits[provider] ?? (provider === "foursquare" ? 500 : null);
            const state = await getDiscoveryProviderState(sql, provider);
            const cooldownUntil = state?.cooldown_until || null;
            if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
              return { available: false, reason: "cooldown", details: { cooldownUntil } };
            }
            const reserved = await reserveDiscoveryProvider(sql, provider, providerLimit, cycleDate, monthlyLimit);
            if (reserved) return true;
            if (state?.day_key === cycleDate && Number(state?.request_count || 0) >= providerLimit) {
              return {
                available: false,
                reason: "daily_budget_exhausted",
                details: { requestCount: Number(state.request_count || 0), dailyLimit: providerLimit }
              };
            }
            if (monthlyLimit !== null && state?.month_key === cycleDate.slice(0, 7) &&
                Number(state?.monthly_request_count || 0) >= monthlyLimit) {
              return {
                available: false,
                reason: "monthly_budget_exhausted",
                details: { monthlyRequestCount: Number(state.monthly_request_count || 0), monthlyLimit }
              };
            }
            return { available: false, reason: "unavailable" };
          },
          recordSuccess: provider => recordDiscoveryProviderSuccess(sql, provider, provider === "mycityinfo" ? 240 : 0),
          recordFailure: (provider, error) => recordDiscoveryProviderFailure(sql, provider, error)
        });
        const backlogDiagnostics = await addDiscoveryBacklogCandidates(
          sql,
          discovery.candidates,
          discovery.provider,
          stage.id,
          true
        );
        const promoted = await promoteFreshBacklogToQueue(sql, Math.max(target - queueDepth, 0), "discovery_backlog");
        queueDepth = await getFreshQueueDepth(sql);
        attempts.push({
          stage: stage.id,
          provider: discovery.provider,
          candidateCount: discovery.candidateCount,
          extractionTelemetry: discovery.telemetry || null,
          providerAttempts: discovery.attempts || [],
          providerErrors: discovery.errors || [],
          backlogDiagnostics,
          newlyQueued: promoted.length
        });
      } catch (error) {
        attempts.push({
          stage: stage.id,
          status: "failed",
          message: String(error?.message || error),
          providerAttempts: Array.isArray(error?.attempts) ? error.attempts : [],
          providerErrors: Array.isArray(error?.providerErrors) ? error.providerErrors : []
        });
      }
      stageId = nextEnabledDiscoveryStageId(stage.id);
      await setDiscoveryStageState(sql, stageId);
    }
    return res.status(200).json({
      success: true,
      preparationOnly: true,
      queueDepth,
      target,
      targetReached: queueDepth >= target,
      runtimeDiagnostics,
      attempts
    });
    } catch (error) {
      const message = String(error?.message || error);
      console.error("Discovery preparation failed.", { message, stack: error?.stack || null });
      return res.status(200).json({
        success: false,
        preparationOnly: true,
        fatalStage: "preparation_orchestration",
        error: message
      });
    }
  }

  const requestedBatchNo = Number(req.query?.batch);
  const run = await claimNextDailyRun(
    sql,
    cycleDate,
    12,
    Number.isInteger(requestedBatchNo) && requestedBatchNo >= 1 && requestedBatchNo <= 12
      ? requestedBatchNo
      : null
  );

  console.log("Automation cron invoked.", {
    method: req.method,
    userAgent: req.headers?.["user-agent"] || null,
    cycleDate,
    runKey: run?.run_key || null
  });

  if (!run) {
    const dailyScanned = await getDailyScannedCount(sql, cycleDate);
    return res.status(200).json({
      success: true,
      noBatchClaimed: true,
      dailyTarget: 50,
      dailyScannedTotal: dailyScanned,
      dailyTargetReached: dailyScanned >= 50,
      runtimeDiagnostics
    });
  }

  const configuredBatchSize = Number(process.env.AUTOMATION_BATCH_SIZE || 5);
  const batchSize = Math.max(1, Math.min(Number.isFinite(configuredBatchSize) ? configuredBatchSize : 5, 5));
  const dailyTarget = Math.max(1, Math.min(Number(process.env.AUTOMATION_DAILY_SCAN_TARGET || 50), 50));
  const dailyScannedBeforeRun = await getDailyScannedCount(sql, cycleDate);
  const remainingDailyScans = Math.max(0, dailyTarget - dailyScannedBeforeRun);
  const effectiveBatchSize = Math.min(batchSize, remainingDailyScans);
  const startedAt = Date.now();
  // Keep enough headroom for a 5-site production batch while staying below Vercel's configured function limit.
  const maxRunMs = 240000;
  const counts = { candidateCount: 0, scannedCount: 0, highCount: 0, moderateCount: 0, healthyCount: 0, failedCount: 0 };
  const errors = [];
  const pipelineWarnings = [];
  let refillRequested = 0;
  let refillAdded = 0;

  try {
    const scanHandler = require("../scan");
    const runScan = (url, deadlineAt) => new Promise((resolve, reject) => {
      let statusCode = 200;
      let payload = null;
      const response = {
        status(code) { statusCode = code; return this; },
        json(value) { payload = value; resolve({ statusCode, payload }); return this; },
        end() { resolve({ statusCode, payload }); return this; }
      };
      scanHandler({ method: "POST", body: { url, deadlineAt } }, response).catch(reject);
    });
    await markExhaustedFailures();

  const queueReserveTarget = Math.max(
    110,
    Math.min(Number(process.env.AUTOMATION_QUEUE_RESERVE_TARGET || 110), 110)
  );
  // The dedicated Discovery Preparation workflow owns reserve replenishment
  // on its existing 20-minute schedule. Keep the time-critical worker focused
  // on scans and finalisation; do not start unbounded provider discovery here.
  await addDueFollowUps(run.id);
  const freshQueueDepthBeforeRun = await getFreshQueueDepth(sql);

  let attemptsThisBatch = 0;
  let stoppedForTimeBudget = false;
  const maxCandidateAttempts = Math.max(effectiveBatchSize + 3, effectiveBatchSize);
  while (counts.scannedCount < effectiveBatchSize && attemptsThisBatch < maxCandidateAttempts) {
    if (Date.now() - startedAt >= maxRunMs - 60000) {
      stoppedForTimeBudget = true;
      break;
    }
    const item = await claimNextQueueItem(run.id);
    if (!item) break;
    attemptsThisBatch++;
    counts.candidateCount++;

    let scanData = null;
    let discoveryMetadata = null;
    try {
      const scanDeadlineAt = startedAt + maxRunMs - 10000;
      const result = await runScan(item.website, scanDeadlineAt);
      scanData = result.payload;
      try {
        discoveryMetadata = await saveDiscoveryMetadataToProspect(sql, item.website, { returnMetadata: true });
      } catch (metadataError) {
        console.warn("Discovery metadata enrichment skipped:", {
          website: item.website,
          message: metadataError?.message || "Metadata enrichment failed."
        });
      }

      if (result.statusCode < 200 || result.statusCode >= 300 || !scanData) {
        const failureCode = scanData?.failureCode ? `[${scanData.failureCode}] ` : "";
        const diagnosticCode = scanData?.diagnosticCode ? ` (${scanData.diagnosticCode})` : "";
        throw new Error(failureCode + (scanData?.error || `Scanner returned HTTP ${result.statusCode}.`) + diagnosticCode);
      }

      const qualificationData = discoveryMetadata ? {
        ...scanData,
        businessEvidence: {
          ...(scanData.businessEvidence || {}),
          companyName: scanData.businessEvidence?.companyName || discoveryMetadata.company_name || discoveryMetadata.discovery_business_name || null,
          discovery: {
            ...(scanData.businessEvidence?.discovery || {}),
            provider: discoveryMetadata.source || null,
            region: discoveryMetadata.region || null,
            city: discoveryMetadata.city || null,
            businessName: discoveryMetadata.discovery_business_name || null
          }
        }
      } : scanData;
      const qualification = qualifyProspect(qualificationData);
      counts.scannedCount++;

      const qualificationResult = {
        ...qualification,
        historyId: scanData.historyId ?? null
      };

      if (qualification.priority === "high") counts.highCount++;
      else if (qualification.priority === "moderate") counts.moderateCount++;
      else if (qualification.priority === "healthy") counts.healthyCount++;
      else counts.failedCount++;

      await completeQueueItem(item.id, qualificationResult);

      if (qualification.priority === "high" || qualification.priority === "moderate") {
        await addShortlistItem(
          run.id,
          item.website_normalized,
          qualification.priority,
          qualification.reason,
          qualification.evidence,
          qualificationResult.historyId
        );
      }
    } catch (error) {
      counts.failedCount++;
      const message = String(error?.message || error || "Unknown scanner failure.");
      const lower = [error?.code, message].filter(Boolean).join(" ").toLowerCase();
      const failureType =
        /err_tls_cert_altname_invalid|hostname\/ip does not match certificate|certificate(?:'s)? altnames|cert_has_expired|certificate has expired|unable_to_verify_leaf_signature|self_signed_cert_in_chain|certificate verify failed/.test(lower)
          ? "TLS_CERTIFICATE_ERROR"
          : /\[malformed_hostname\]|\[invalid_url\]|invalid (website|url)|invalid url/.test(lower)
          ? "INVALID_URL"
          : /\[blocked_hostname\]|\[blocked_private_or_reserved_address\]/.test(lower)
            ? "SAFETY_REJECTED"
            : /\[dns_no_addresses\]/.test(lower)
              ? "DNS_NO_ADDRESSES"
              : /\(eai_again\)|\(ebusy\)/.test(lower)
                ? "DNS_TEMPORARY_FAILURE"
                : /\[dns_lookup_failed\]/.test(lower)
                  ? "DNS_LOOKUP_FAILED"
                  : /\[dns_lookup_error\]/.test(lower)
                  ? "DNS_LOOKUP_ERROR"
                  : /too long to respond|timed out|timeout/.test(lower)
                    ? "TIMEOUT"
                    : /could not be reached|network connection|econn|enotfound|dns|fetch failed|connection/.test(lower)
                      ? "UNREACHABLE"
                      : "OTHER";
      const hardFailure = isPermanentScanFailure(failureType);
      errors.push(item.website + ": [" + failureType + "] " + message);
      await failQueueItem(item.id, error, {
        retryable: !hardFailure,
        failureType,
        details: {
          httpStatus: null,
          scanner: "Site Rescue Studio Website Health Scanner/3.0",
          diagnosticCode: scanData?.diagnosticCode || null,
          diagnosticAttempts: scanData?.diagnosticAttempts ?? null,
          diagnosticDurationMs: scanData?.diagnosticDurationMs ?? null
        }
      });
    }
  }

  const timeBudgetReached = stoppedForTimeBudget;
  if (timeBudgetReached && counts.scannedCount < effectiveBatchSize) errors.push("Run stopped at the safety time budget before the target batch was completed; remaining queued sites stay queued.");

  const errorSummary = errors.length ? errors.join(" | ").slice(0, 4000) : null;

  const queueDepth = await getFreshQueueDepth(sql);
  refillRequested = Math.max(queueReserveTarget - queueDepth, 0);
  refillAdded = 0;
  if (refillRequested > 0) {
    pipelineWarnings.push("Post-scan reserve refill deferred to the scheduled Discovery Preparation workflow.");
  }
  const dailyScannedTotal = await getDailyScannedCount(sql, cycleDate);
  const queueHealth = queueDepth >= 110 ? "healthy" : queueDepth >= 60 ? "warning" : "critical";
  const pipelineReport = {
    freshBeforeRun: freshQueueDepthBeforeRun,
    scannedThisRun: counts.scannedCount,
    freshAfterRun: queueDepth,
    reserveTarget: queueReserveTarget,
    refillRequested,
    refillAdded,
    queueHealth,
    warning: queueDepth < 60 ? "CRITICAL: fresh prospect reserve is below 60." : queueDepth < 110 ? "WARNING: fresh prospect reserve is below the 110-site target." : null,
    discoveryWarnings: pipelineWarnings,
    supplyFailure: queueDepth < queueReserveTarget && refillAdded === 0,
    supplyDiagnostics: refillRequested > 0 ? { deferredToScheduledPreparation: true } : null
  };
  if (pipelineReport.warning) console.warn(pipelineReport.warning);

  await finishRun(run.id, counts, errorSummary, pipelineReport);

  return res.status(200).json({
    success: true,
    runId: run.id,
    counts,
    dailyTarget,
    dailyScannedBeforeRun,
    dailyScannedTotal,
    dailyTargetReached: dailyScannedTotal >= dailyTarget,
    followUpsIncluded: true,
    discoverySummary: null,
    queueDepth,
    queueReserveTarget,
    queueReserveHealthy: queueDepth >= queueReserveTarget,
    pipelineReport,
    runtimeDiagnostics,
    errorSummary
  });
  } catch (error) {
    const message = String(error?.message || error || "Unexpected automation failure.");
    const errorSummary = [...errors, message].join(" | ").slice(0, 4000);
    try {
      await finishRun(run.id, counts, errorSummary);
    } catch (finishError) {
      console.error("Automation run finalization failed:", finishError);
    }
    console.error("Automation run failed:", error);
    return res.status(500).json({
      success: false,
      runId: run.id,
      counts,
      errorSummary
    });
  }
};
