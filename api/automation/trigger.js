const crypto = require("node:crypto");
const runAutomation = require("./run");

function constantTimeSecretMatch(expected, suppliedHeader) {
  if (!expected || typeof suppliedHeader !== "string") return false;
  const supplied = suppliedHeader.startsWith("Bearer ") ? suppliedHeader.slice(7) : "";
  const expectedBuffer = Buffer.from(String(expected));
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function getSastClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  return {
    hour,
    minute,
    hhmm: hour * 100 + minute,
    display: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  };
}

function withinSafeStartWindow(clock) {
  return clock.hhmm >= 300 && clock.hhmm < 725;
}

module.exports = async function externalAutomationTrigger(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const expectedSecret = process.env.EXTERNAL_TRIGGER_SECRET;
  if (!constantTimeSecretMatch(expectedSecret, req.headers?.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  const clock = getSastClock();
  const windowOpen = withinSafeStartWindow(clock);
  const dryRun = ["1", "true", "yes"].includes(String(req.query?.dryRun || "").toLowerCase());

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      authorized: true,
      internalSecretConfigured: Boolean(process.env.CRON_SECRET),
      sastTime: clock.display,
      productionWindowOpen: windowOpen,
      allowedStartWindow: "03:00-07:24 SAST",
      productionBatchInvoked: false
    });
  }

  if (!process.env.CRON_SECRET) {
    return res.status(503).json({
      success: false,
      error: "Internal automation secret is not configured.",
      productionBatchInvoked: false
    });
  }

  if (!windowOpen) {
    return res.status(409).json({
      success: false,
      productionWindowClosed: true,
      reason: "External trigger may start production only from 03:00 through 07:24 SAST.",
      sastTime: clock.display,
      productionBatchInvoked: false
    });
  }

  const internalReq = {
    method: "GET",
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "user-agent": "Site Rescue Studio External Scheduler"
    },
    // No explicit batch: Neon atomically claims the next eligible sequential batch.
    query: {}
  };
  const internalRes = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  try {
    await runAutomation(internalReq, internalRes);
  } catch (error) {
    console.error("External automation trigger failed.", {
      message: String(error?.message || error)
    });
    return res.status(502).json({
      success: false,
      error: "Internal automation handler failed.",
      productionBatchInvoked: true
    });
  }

  const result = internalRes.body;
  if (internalRes.statusCode >= 400) {
    return res.status(internalRes.statusCode).json(result || {
      success: false,
      error: "Internal automation returned an HTTP error."
    });
  }
  if (!result || result.productionWindowClosed === true) {
    return res.status(409).json(result || {
      success: false,
      error: "Internal automation returned no response."
    });
  }
  if (result.success !== true || result.fatalStage) {
    return res.status(502).json(result);
  }
  if (result.noBatchClaimed === true) {
    return res.status(409).json(result);
  }
  if (!result.runId || typeof result.counts?.scannedCount !== "number") {
    return res.status(502).json({
      success: false,
      error: "Internal automation response did not confirm a claimed batch.",
      internalResponse: result
    });
  }

  return res.status(200).json({
    ...result,
    externalTrigger: true,
    sastTriggerTime: clock.display
  });
};

module.exports.getSastClock = getSastClock;
module.exports.withinSafeStartWindow = withinSafeStartWindow;
module.exports.constantTimeSecretMatch = constantTimeSecretMatch;
