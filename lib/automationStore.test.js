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
