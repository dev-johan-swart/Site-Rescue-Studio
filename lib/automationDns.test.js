const test = require("node:test");
const assert = require("node:assert/strict");
const { filterDiscoveryDnsCandidates } = require("../api/automation/run");

test("discovery DNS preflight rejects confirmed NXDOMAIN and preserves valid candidates", async () => {
  const result = await filterDiscoveryDnsCandidates([
    { website: "https://valid.co.za", provider: "mycityinfo" },
    { website: "https://missing.co.za", provider: "websdocs" }
  ], {
    resolve4: async host => host === "valid.co.za" ? ["192.0.2.20"] : Object.assign(new Error("not found"), { code: "ENOTFOUND" }),
    resolve6: async host => host === "valid.co.za" ? [] : Object.assign(new Error("no data"), { code: "ENODATA" })
  });
  assert.deepEqual(result.candidates.map(item => item.website), ["https://valid.co.za"]);
  assert.equal(result.diagnostics.examined, 2);
  assert.equal(result.diagnostics.rejectedNoAddress, 1);
});

test("discovery DNS preflight fails open on temporary resolver errors", async () => {
  const result = await filterDiscoveryDnsCandidates([
    { website: "https://temporary.co.za", provider: "websdocs" }
  ], {
    resolve4: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" }); },
    resolve6: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" }); }
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.diagnostics.deferredTransient, 1);
});
