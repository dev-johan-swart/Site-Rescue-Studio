const { qualifyProspect } = require("../../lib/prospectQualification");
const { discoverWithProviders, getDiscoveryStage, providerQueries, DISCOVERY_STAGES } = require("../../lib/discoveryProviders");
const {
  getSql, ensureAutomationSchema, createRun, claimNextQueueItem,
  getQueueDepth, getDailyScannedCount, getDiscoveryStageState, setDiscoveryStageState, addDiscoveryBacklogCandidates, drainDiscoveryBacklog,
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
  if (!authorised(req)) return res.status(401).json({ success: false, error: "Unauthorized." });

  const sql = getSql();
  await ensureAutomationSchema(sql);

  // Each scheduled batch gets its own durable run record. This allows five
  // 10-site workers to complete the 50-site daily target without weakening
  // same-slot duplicate protection.
  const runKey = new Date().toISOString().slice(0, 16);
  const run = await createRun(runKey);

  if (!run) return res.status(500).json({ success: false, error: "Automation run could not be created." });

  if (run.acquired === false) {
    const message = run.status === "running"
      ? "Another automation run is already in progress."
      : "Today's automation run has already been started.";
    return res.status(409).json({ success: false, error: message, runId: run.id, status: run.status });
  }

  const configuredBatchSize = Number(process.env.AUTOMATION_BATCH_SIZE || 10);
  const batchSize = Math.max(1, Math.min(Number.isFinite(configuredBatchSize) ? configuredBatchSize : 10, 10));
  const dailyTarget = Math.max(1, Math.min(Number(process.env.AUTOMATION_DAILY_SCAN_TARGET || 50), 50));
  const dailyScannedBeforeRun = await getDailyScannedCount(sql);
  const remainingDailyScans = Math.max(0, dailyTarget - dailyScannedBeforeRun);
  const effectiveBatchSize = Math.min(batchSize, remainingDailyScans);
  const startedAt = Date.now();
  // Keep enough headroom for a 10-site production batch while staying below Vercel's 300s Hobby function limit.
  const maxRunMs = 240000;
  const counts = { candidateCount: 0, scannedCount: 0, highCount: 0, moderateCount: 0, healthyCount: 0, failedCount: 0 };
  const errors = [];

  try {
    await recoverStaleQueueItems();
    await markExhaustedFailures();

  let discoverySummary = null;
  const reserveMinimum = Math.max(10, Math.min(Number(process.env.AUTOMATION_QUEUE_RESERVE_MIN || 12), 30));
  try {
    const dailyLimit = Math.max(1, Math.min(Number(process.env.AUTOMATION_DISCOVERY_DAILY_LIMIT || 2), 4));
    const currentStageId = await getDiscoveryStageState(sql);
    const currentStage = getDiscoveryStage(currentStageId);
    const beforeDepth = await getQueueDepth(sql);
    const backlogSites = await drainDiscoveryBacklog(sql, Math.max(reserveMinimum - beforeDepth, 0));
    if (backlogSites.length) await enqueueWebsites(backlogSites, "discovery_backlog");
    const stages = [currentStage];
    const index = DISCOVERY_STAGES.findIndex(item => item.id === currentStage.id);
    if (beforeDepth + backlogSites.length < reserveMinimum && index >= 0 && index < DISCOVERY_STAGES.length - 1) stages.push(DISCOVERY_STAGES[index + 1]);
    for (const stage of stages) {
      if (stage.id === "international" && String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY || "").toLowerCase() !== "true") {
        errors.push("International discovery is approaching but remains disabled pending pricing, currency, service-area and business-workflow review.");
        break;
      }
      try {
        const discovery = await discoverWithProviders({
          stage,
          queries: providerQueries(new Date(), stage.queries),
          maxCandidates: Number(process.env.AUTOMATION_DISCOVERY_MAX_CANDIDATES || 40),
          isProviderAvailable: provider => reserveDiscoveryProvider(sql, provider, dailyLimit),
          recordSuccess: provider => recordDiscoveryProviderSuccess(sql, provider),
          recordFailure: (provider, error) => recordDiscoveryProviderFailure(sql, provider, error)
        });
        await addDiscoveryBacklogCandidates(sql, discovery.candidates, discovery.provider, stage.id);
        const available = await drainDiscoveryBacklog(sql, 40);
        const discovered = await enqueueWebsites(available, "discovery_backlog");
        const newlyQueued = discovered.filter(item => item.status === "queued").length;
        discoverySummary = { source: discovery.provider, failoverUsed: discovery.failoverUsed, stage: stage.id, stageLabel: stage.label, candidateCount: discovery.candidateCount, newlyQueued };
        if (stage.id !== currentStage.id && newlyQueued > 0) await setDiscoveryStageState(sql, stage.id);
        if (newlyQueued > 0 || stage === stages[stages.length - 1]) break;
      } catch (error) {
        errors.push(`Discovery ${stage.label} failed: ${error?.message || error}`);
      }
    }
  } catch (error) {
    errors.push(`Discovery orchestration failed: ${error?.message || error}`);
  }
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
  const errorSummary = errors.length ? errors.join(" | ").slice(0, 4000) : null;
  await finishRun(run.id, counts, errorSummary);

  const queueDepth = await getQueueDepth(sql);
  const dailyScannedTotal = await getDailyScannedCount(sql);

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
    queueReserveMinimum: reserveMinimum,
    queueReserveHealthy: queueDepth >= reserveMinimum,
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
