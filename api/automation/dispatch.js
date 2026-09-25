const MAX_BATCHES = 5;

function authorised(req) {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers?.authorization || "";
  return Boolean(expected && supplied === `Bearer ${expected}`);
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ success: false, error: "Unauthorized." });

  const host = req.headers?.host;
  if (!host) return res.status(500).json({ success: false, error: "Production host is unavailable." });

  const protocol = req.headers?.["x-forwarded-proto"] || "https";
  const url = `${protocol}://${host}/api/automation/run`;
  const secret = process.env.CRON_SECRET;

  const responses = await Promise.all(
    Array.from({ length: MAX_BATCHES }, (_, index) => {
      const batch = index + 1;
      return fetch(`${url}?batch=${batch}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` }
      })
        .then(async response => ({
          batch,
          status: response.status,
          body: await response.json().catch(() => null)
        }))
        .catch(error => ({
          batch,
          status: 599,
          body: { success: false, error: String(error?.message || error) }
        }));
    })
  );

  const failed = responses.filter(item => item.status < 200 || item.status >= 300);
  return res.status(failed.length ? 207 : 200).json({
    success: failed.length === 0,
    batches: responses,
    batchCount: MAX_BATCHES,
    failedBatchCount: failed.length
  });
};
