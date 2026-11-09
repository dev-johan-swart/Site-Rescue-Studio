const test = require("node:test");
const assert = require("node:assert/strict");
const scanner = require("../api/scan");

test("SSRF guard blocks IPv4-mapped private IPv6 addresses", () => {
  assert.equal(scanner.isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("::ffff:10.0.0.8"), true);
  assert.equal(scanner.isPrivateOrReservedIp("::ffff:192.168.1.5"), true);
});

test("SSRF guard blocks reserved IPv6 ranges and allows a public IPv6 address", () => {
  assert.equal(scanner.isPrivateOrReservedIp("fc00::1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("fe80::1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("2001:db8::1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("2606:4700:4700::1111"), false);
});

test("contact extraction retains explicit mailto and tel values with page evidence", () => {
  const result = scanner.extractContactValues(
    '<a href="mailto:hello@example.co.za">Email us</a><a href="tel:+27123456789">Call</a>',
    "https://example.co.za/contact"
  );
  assert.equal(result.emails[0].value, "hello@example.co.za");
  assert.equal(result.emails[0].source, "mailto");
  assert.equal(result.phones[0].value, "+27123456789");
  assert.equal(result.phones[0].source, "tel");
  assert.equal(result.emails[0].url, "https://example.co.za/contact");
});

test("contact extraction reads public visible contact values and Organization JSON-LD", () => {
  const html = [
    '<p>Contact hello@example.co.za or 012 345 6789</p>',
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Services","email":"office@example.co.za","telephone":"+27111222333"}</script>'
  ].join("");
  const result = scanner.extractContactValues(html, "https://example.co.za/");
  assert.equal(result.companyName, "Example Services");
  assert.ok(result.emails.some(item => item.value === "hello@example.co.za" && item.source === "visible-text"));
  assert.ok(result.emails.some(item => item.value === "office@example.co.za" && item.source === "json-ld"));
  assert.ok(result.phones.some(item => item.value === "012 345 6789"));
  assert.ok(result.phones.some(item => item.value === "+27111222333" && item.source === "json-ld"));
});


test("candidate geographic region is derived from the candidate city, not the discovery stage", () => {
  const { getCandidateRegion } = require("../lib/discoveryProviders");
  assert.equal(getCandidateRegion({ city: "Cape Town" }), "western_cape");
  assert.equal(getCandidateRegion({ city: "Pretoria" }), "gauteng");
  assert.equal(getCandidateRegion({ city: "South Africa" }), "south_africa");
  assert.equal(getCandidateRegion({ city: null }), null);
});
