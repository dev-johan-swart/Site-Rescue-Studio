const { qualifyProspect } = require("../../lib/prospectQualification");
const { discoverWithProviders, getDiscoveryStage, nextEnabledDiscoveryStageId, providerQueries, DISCOVERY_STAGES } = require("../../lib/discoveryProviders");
const {
  getSql, ensureAutomationSchema, createRun, claimNextQueueItem,
  getQueueDepth, getFreshQueueDepth, getDailyScannedCount, recoverStaleAutomationRuns, claimNextDailyRun, getDiscoveryStageState, setDiscoveryStageState, addDiscoveryBacklogCandidates, drainDiscoveryBacklog, markDiscoveryBacklogResults,
  reserveDiscoveryProvider, recordDiscoveryProviderSuccess, recordDiscoveryProviderFailure,
  completeQueueItem, failQueueItem, addShortlistItem, addDueFollowUps, finishRun,
  recoverStaleQueueItems, markExhaustedFailures, enqueueWebsites
} = require("../../lib/automationStore");
const scanHandler = require("../scan");

function authorised(req) {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers?.authorization || "";
  return Boolean(expected && supplied === `Bearer ${expected}`);
}

function runScan(url) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let payload = null;
    const response = {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; resolve({ statusCode, payload }); return this; },
      end() { resolve({ statusCode, payload }); return this; }
    };
    scanHandler({ method: "POST", body: { url } }, response).catch(reject);
  });
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) {
    console.warn("Automation cron rejected.", {
      method: req.method,
      userAgent: req.headers?.["user-agent"] || null
    });
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  const sql = getSql();
  await ensureAutomationSchema(sql);

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
  const cycleDate = localHour < 8
    ? new Date(Date.UTC(
        Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day) - 1
      )).toISOString().slice(0, 10)
    : localDate;
  await recoverStaleAutomationRuns(sql);
  // Preparation runs build the fresh reserve before the first scan window without consuming a scan batch.
  if (String(req.query?.mode || "").toLowerCase() === "prepare") {\n    const target = 60;\n    const dailyLimit = Math.max(1, Math.min(Number(process.env.AUTOMATION_DISCOVERY_DAILY_LIMIT || 12), 12));\n    const maxAttempts = 6;\n    const startedAt = Date.now();\n    let queueDepth = await getFreshQueueDepth(sql);\n    const attempts = [];\n    let stageId = await getDiscoveryStageState(sql);\n    for (let attemptNumber = 0; queueDepth < target && attemptNumber < maxAttempts; attemptNumber++) {\n      if (Date.now() - startedAt >= 240000) break;\n      const available = await drainDiscoveryBacklog(sql, target - queueDepth);\n      if (available.length) {\n        const results = await enqueueWebsites(available, "discovery_backlog");\n        await markDiscoveryBacklogResults(sql, available, results);\n      }\n      queueDepth = await getFreshQueueDepth(sql);\n      if (queueDepth >= target) break;\n      const stage = getDiscoveryStage(stageId);\n      if (stage.id === "international" && String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY || "").toLowerCase() !== "true") {\n        stageId = nextEnabledDiscoveryStageId(stage.id);\n        await setDiscoveryStageState(sql, stageId);\n        continue;\n      }\n      try {\n        const discovery = await discoverWithProviders({\n          stage,\n          queries: providerQueries(new Date(), stage.queries, Date.now() + attemptNumber),\n          maxCandidates: 20,\n          isProviderAvailable: provider => reserveDiscoveryProvider(sql, provider, dailyLimit, cycleDate),\n          recordSuccess: provider => recordDiscoveryProviderSuccess(sql, provider),\n          recordFailure: (provider, error) => recordDiscoveryProviderFailure(sql, provider, error)\n        });\n        await addDiscoveryBacklogCandidates(sql, discovery.candidates, discovery.provider, stage.id);\n        const availableAfterDiscovery = await drainDiscoveryBacklog(sql, 80);\n        const results = await enqueueWebsites(availableAfterDiscovery, "discovery_backlog");\n        await markDiscoveryBacklogResults(sql, availableAfterDiscovery, results);\n        queueDepth = await getFreshQueueDepth(sql);\n        attempts.push({stage: stage.id, provider: discovery.provider, candidateCount: discovery.candidateCount, newlyQueued: results.filter(item => item.status === "queued").length});\n      } catch (error) {\n        attempts.push({stage: stage.id, status: "failed", message: String(error?.message || error)});\n      }\n      stageId = nextEnabledDiscoveryStageId(stage.id);\n      await setDiscoveryStageState(sql, stageId);\n    }\n    return res.status(200).json({success: true, preparationOnly: true, queueDepth, target, targetReached: queueDepth >= target, attempts});\n  }\n\n  const run = await claimNextDailyRun(sql, cycleDate, 12);

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
      dailyTargetReached: dailyScanned >= 50
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

  try {
    await recoverStaleQueueItems();
    await markExhaustedFailures();

  let discoverySummary = null;
  const queueReserveTarget = Math.max(
    60,
    Math.min(Number(process.env.AUTOMATION_QUEUE_RESERVE_TARGET || 60), 60)
  );
  const dailyLimit = Math.max(
    1,
    Math.min(Number(process.env.AUTOMATION_DISCOVERY_DAILY_LIMIT || 12), 12)
  );
  const discoveryMaxCandidates = Math.max(
    1,
    Math.min(Number(process.env.AUTOMATION_DISCOVERY_MAX_CANDIDATES || 20), 20)
  );
  const discoveryMaxAttempts = Math.max(
    3,
    Math.min(Number(process.env.AUTOMATION_DISCOVERY_MAX_ATTEMPTS || 6), 6)
  );

  async function refillQueueToReserve() {
    let queueDepth = await getFreshQueueDepth(sql);
    const attempts = [];
    let newlyQueuedTotal = 0;
    let stageId = await getDiscoveryStageState(sql);

    for (let attemptNumber = 0;
         queueDepth < queueReserveTarget && attemptNumber < discoveryMaxAttempts;
         attemptNumber++) {
      // Leave enough time for the actual 5-site scan batch under Vercel's
      // 300-second function ceiling.
      if (Date.now() - startedAt >= maxRunMs - 90000) break;

      const available = await drainDiscoveryBacklog(
        sql,
        Math.max(queueReserveTarget - queueDepth, 0)
      );
      if (available.length) {
        const discovered = await enqueueWebsites(available, "discovery_backlog");
        await markDiscoveryBacklogResults(sql, available, discovered);
      }

      queueDepth = await getFreshQueueDepth(sql);
      if (queueDepth >= queueReserveTarget) break;

      const stage = getDiscoveryStage(stageId);
      if (
        stage.id === "international" &&
        String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY || "").toLowerCase() !== "true"
      ) {
        const nextStageId = nextEnabledDiscoveryStageId(stage.id);
        await setDiscoveryStageState(sql, nextStageId);
        stageId = nextStageId;
        attempts.push({
          stage: stage.id,
          status: "disabled"
        });
        continue;
      }

      try {
        const discovery = await discoverWithProviders({
          stage,
          // Offset each discovery attempt so a successful provider is not
          // repeatedly asked for the same query slice in one worker run.
          queries: providerQueries(
            new Date(),
            stage.queries,
            run.id + attemptNumber
          ),
          maxCandidates: discoveryMaxCandidates,
          isProviderAvailable: provider =>
            reserveDiscoveryProvider(sql, provider, dailyLimit, cycleDate),
          recordSuccess: provider =>
            recordDiscoveryProviderSuccess(sql, provider),
          recordFailure: (provider, error) =>
            recordDiscoveryProviderFailure(sql, provider, error)
        });

        await addDiscoveryBacklogCandidates(
          sql,
          discovery.candidates,
          discovery.provider,
          stage.id
        );

        const availableAfterDiscovery = await drainDiscoveryBacklog(sql, 80);
        const discovered = await enqueueWebsites(
          availableAfterDiscovery,
          "discovery_backlog"
        );
        await markDiscoveryBacklogResults(
          sql,
          availableAfterDiscovery,
          discovered
        );

        const newlyQueued = discovered.filter(
          item => item.status === "queued"
        ).length;
        newlyQueuedTotal += newlyQueued;
        queueDepth = await getQueueDepth(sql);

        const nextStageId = nextEnabledDiscoveryStageId(stage.id);
        await setDiscoveryStageState(sql, nextStageId);
        stageId = nextStageId;

        attempts.push({
          stage: stage.id,
          source: discovery.provider,
          candidateCount: discovery.candidateCount,
          newlyQueued,
          providerAttempts: discovery.attempts || [],
          providerErrors: discovery.errors || [],
          nextStage: nextStageId
        });

        // A provider can legitimately return only candidates we have already
        // scanned. Continue through the enabled geographic stages rather than
        // treating that as a successful refill.
        if (newlyQueued === 0) continue;
      } catch (error) {
        const message = String(error?.message || error);
        attempts.push({
          stage: stage.id,
          status: "failed",
          message,
          providerAttempts: error?.attempts || [],
          providerErrors: error?.providerErrors || []
        });
        errors.push(`Discovery ${stage.label} failed: ${message}`);

        const nextStageId = nextEnabledDiscoveryStageId(stage.id);
        await setDiscoveryStageState(sql, nextStageId);
        stageId = nextStageId;
      }
    }

    return {
      queueDepth,
      target: queueReserveTarget,
      newlyQueued: newlyQueuedTotal,
      attempts,
      targetReached: queueDepth >= queueReserveTarget
    };
  }

  // The 02:00/02:20/02:40 preparation workflow is responsible for
  // building the reserve before scanning. Do not spend the scan budget on
  // discovery before claiming the first sites.
  await addDueFollowUps(run.id);

  for (let i = 0; i < effectiveBatchSize; i++) {
    if (Date.now() - startedAt >= maxRunMs) break;
    const item = await claimNextQueueItem(run.id);
    if (!item) break;
    counts.candidateCount++;

    try {
      const result = await runScan(item.website);
      const scanData = result.payload;

      if (result.statusCode < 200 || result.statusCode >= 300 || !scanData) {
        throw new Error(scanData?.error || `Scanner returned HTTP ${result.statusCode}.`);
      }

      const qualification = qualifyProspect(scanData);
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
          qualification.evidence
        );
      }
    } catch (error) {
      counts.failedCount++;
      errors.push(`${item.website}: ${error?.message || error}`);
      await failQueueItem(item.id, error);
    }
  }

  const timeBudgetReached = Date.now() - startedAt >= maxRunMs;
  if (timeBudgetReached) errors.push("Run stopped at the safety time budget; remaining queued sites stay queued.");

  // Refill after the scan batch as well. This keeps the active queue near the
  // 60-site reserve instead of waiting for the next scheduled worker.
  if (Date.now() - startedAt < maxRunMs - 30000) {
    try {
      const refillAfterScan = await refillQueueToReserve();
      discoverySummary = {
        ...(discoverySummary || {}),
        afterScan: refillAfterScan
      };
      if (!refillAfterScan.targetReached) {
        errors.push(
          `Post-scan discovery reserve target not reached: ${refillAfterScan.queueDepth}/${refillAfterScan.target} active queued sites.`
        );
      }
    } catch (error) {
      errors.push(`Post-scan discovery orchestration failed: ${error?.message || error}`);
    }
  }

  const errorSummary = errors.length ? errors.join(" | ").slice(0, 4000) : null;
  await finishRun(run.id, counts, errorSummary);

  const queueDepth = await getFreshQueueDepth(sql);
  const dailyScannedTotal = await getDailyScannedCount(sql, cycleDate);

  return res.status(200).json({
    success: true,
    runId: run.id,
    counts,
    dailyTarget,
    dailyScannedBeforeRun,
    dailyScannedTotal,
    dailyTargetReached: dailyScannedTotal >= dailyTarget,
    followUpsIncluded: true,
    discoverySummary,
    queueDepth,
    queueReserveTarget,
    queueReserveHealthy: queueDepth >= queueReserveTarget,
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
