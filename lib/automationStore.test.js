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
