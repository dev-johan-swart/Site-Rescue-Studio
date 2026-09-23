const { qualifyProspect } = require("../../lib/prospectQualification");
const {
  getSql, ensureAutomationSchema, createRun, claimNextQueueItem,
  completeQueueItem, failQueueItem, addShortlistItem, addDueFollowUps, finishRun,
  recoverStaleQueueItems, markExhaustedFailures
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
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        payload = value;
        resolve({ statusCode, payload });
        return this;
      },
      end() {
        resolve({ statusCode, payload });
        return this;
      }
    };
    scanHandler({ method: "POST", body: { url } }, response).catch(reject);
  });
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ success: false, error: "Unauthorized." });

  const sql = getSql();
  await ensureAutomationSchema(sql);

  const runKey = new Date().toISOString().slice(0, 10);
  const run = await createRun(runKey);

  if (!run) {
    return res.status(500).json({ success: false, error: "Automation run could not be created." });
  }

  if (run.acquired === false) {
    const message = run.status === "running"
      ? "Another automation run is already in progress."
      : "Today's automation run has already been started.";
    return res.status(409).json({ success: false, error: message, runId: run.id, status: run.status });
  }

  const configuredBatchSize = Number(process.env.AUTOMATION_BATCH_SIZE || 3);
  const batchSize = Math.max(1, Math.min(Number.isFinite(configuredBatchSize) ? configuredBatchSize : 3, 3));
  const startedAt = Date.now();
  const maxRunMs = 45000;
  const counts = { candidateCount: 0, scannedCount: 0, highCount: 0, moderateCount: 0, healthyCount: 0, failedCount: 0 };
  const errors = [];

  await recoverStaleQueueItems();
  await markExhaustedFailures();
  await addDueFollowUps(run.id);

  for (let i = 0; i < batchSize; i++) {
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

      if (qualification.priority === "high") counts.highCount++;
      else if (qualification.priority === "moderate") counts.moderateCount++;
      else if (qualification.priority === "healthy") counts.healthyCount++;
      else counts.failedCount++;

      await completeQueueItem(item.id, qualification);

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

  return res.status(200).json({
    success: true,
    runId: run.id,
    counts,
    followUpsIncluded: true,
    errorSummary
  });
};
