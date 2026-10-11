const crypto = require("node:crypto");

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

async function dispatchWorker({ token, batch, fetchImpl = fetch }) {
  if (!token) throw new Error("GitHub workflow-dispatch token is not configured.");
  const response = await fetchImpl(
    "https://api.github.com/repos/dev-johan-swart/Site-Rescue-Studio/actions/workflows/automation-worker.yml/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ ref: "main", inputs: { batch: String(batch) } })
    }
  );
  if (response.status !== 204) {
    throw new Error(`GitHub workflow dispatch returned HTTP ${response.status}.`);
  }
  return { accepted: true, status: response.status };
}

module.exports = async function externalAutomationTrigger(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  if (!constantTimeSecretMatch(
    process.env.EXTERNAL_TRIGGER_SECRET,
    req.headers?.authorization || ""
  )) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  const batch = Number(req.query?.batch);
  if (!Number.isInteger(batch) || batch < 1 || batch > 12) {
    return res.status(400).json({ success: false, error: "Batch must be an integer from 1 to 12." });
  }

  const clock = getSastClock();
  const windowOpen = withinSafeStartWindow(clock);
  const dryRun = ["1", "true", "yes"].includes(String(req.query?.dryRun || "").toLowerCase());

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      authorized: true,
      dispatchTokenConfigured: Boolean(process.env.GITHUB_DISPATCH_TOKEN),
      sastTime: clock.display,
      productionWindowOpen: windowOpen,
      allowedStartWindow: "03:00-07:24 SAST",
      batch,
      workflowDispatched: false
    });
  }

  if (!windowOpen) {
    return res.status(409).json({
      success: false,
      productionWindowClosed: true,
      reason: "External trigger may dispatch production only from 03:00 through 07:24 SAST.",
      sastTime: clock.display,
      batch,
      workflowDispatched: false
    });
  }

  try {
    await dispatchWorker({
      token: process.env.GITHUB_DISPATCH_TOKEN,
      batch
    });
  } catch (error) {
    console.error("External scheduler could not dispatch the worker.", {
      message: String(error?.message || error),
      batch,
      sastTime: clock.display
    });
    return res.status(502).json({
      success: false,
      error: "GitHub Actions did not confirm workflow dispatch.",
      batch,
      workflowDispatched: false
    });
  }

  return res.status(202).json({
    success: true,
    accepted: true,
    workflowDispatched: true,
    workflow: "automation-worker.yml",
    batch,
    sastDispatchTime: clock.display,
    note: "Dispatch accepted; scan completion must be verified in GitHub Actions and Neon."
  });
};

module.exports.getSastClock = getSastClock;
module.exports.withinSafeStartWindow = withinSafeStartWindow;
module.exports.constantTimeSecretMatch = constantTimeSecretMatch;
module.exports.dispatchWorker = dispatchWorker;
