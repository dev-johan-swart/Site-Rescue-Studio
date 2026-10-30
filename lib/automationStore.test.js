const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProspectWebsite } = require("./automationStore");

test("normalizes www and paths to one prospect hostname", () => {
  assert.equal(normalizeProspectWebsite("https://www.example.co.za/contact/"), "example.co.za");
  assert.equal(normalizeProspectWebsite("example.co.za"), "example.co.za");
});

test("invalid values normalize to an empty identity", () => {
  assert.equal(normalizeProspectWebsite(""), "");
});


test("normalization treats www and non-www as the same prospect", () => {
  assert.equal(normalizeProspectWebsite("https://www.example.co.za/contact"), "example.co.za");
  assert.equal(normalizeProspectWebsite("https://example.co.za/another-page"), "example.co.za");
});

test("historical identity candidates include root and root-slash forms", () => {
  const { historicalIdentityCandidates } = require("./automationStore");
  assert.deepEqual(
    historicalIdentityCandidates("example.co.za"),
    ["example.co.za", "example.co.za/"]
  );
});


test("queue reserve policy stays within safe bounds", () => {
  const reserve = Math.max(3, Math.min(Number("9"), 30));
  assert.equal(reserve, 9);
});


test("fresh discovery filtering removes known websites before provider failover", async () => {
  const { filterFreshDiscoveryCandidates } = require("./automationStore");
  let requested;
  const sql = async (strings, ...values) => {
    requested = values[0];
    return [{ normalized: "known.co.za" }];
  };
  const result = await filterFreshDiscoveryCandidates(sql, [
    { website: "https://known.co.za/about", name: "Already known" },
    { website: "https://fresh-one.co.za", name: "Fresh one" },
    { website: "https://www.fresh-one.co.za/contact", name: "Duplicate fresh one" },
    { website: "http://127.0.0.1", name: "Invalid local host" }
  ]);
  assert.deepEqual(requested, ["known.co.za", "fresh-one.co.za"]);
  assert.deepEqual(result.map(item => item.normalized), ["fresh-one.co.za"]);
});

test("successful provider runs clear stale failure diagnostics", async () => {
  const { recordDiscoveryProviderSuccess } = require("./automationStore");
  let statement = "";
  const sql = async (strings, ...values) => {
    statement = strings.join("?");
    return [];
  };
  await recordDiscoveryProviderSuccess(sql, "pretoriahub");
  assert.match(statement, /last_error = NULL/);
  assert.match(statement, /consecutive_failures = 0/);
  assert.match(statement, /cooldown_until = NULL/);
});
