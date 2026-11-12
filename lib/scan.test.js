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
  assert.equal(scanner.isPrivateOrReservedIp("2001:200::1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("2002::1"), true);
  assert.equal(scanner.isPrivateOrReservedIp("3fff::1"), true);
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
  const { getCandidateRegion } = require("./discoveryProviders");
  assert.equal(getCandidateRegion({ city: "Cape Town" }), "western_cape");
  assert.equal(getCandidateRegion({ city: "Pretoria" }), "gauteng");
  assert.equal(getCandidateRegion({ city: "South Africa" }), "south_africa");
  assert.equal(getCandidateRegion({ city: null }), null);
});


test("validated DNS addresses reject mixed public and private answers", () => {
  assert.equal(scanner.areResolvedAddressesPublic([
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.5", family: 4 }
  ]), false);
  assert.equal(scanner.areResolvedAddressesPublic([
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 }
  ]), true);
  assert.equal(scanner.areResolvedAddressesPublic([]), false);
});

test("pinned socket lookup only returns validated addresses of the requested family", () => {
  const lookup = scanner.createPinnedLookup([
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 }
  ]);
  lookup("example.com", { family: 4 }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "93.184.216.34");
    assert.equal(family, 4);
  });
  lookup("example.com", { family: 6 }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "2606:4700:4700::1111");
    assert.equal(family, 6);
  });
  lookup("example.com", { family: 5 }, error => {
    assert.equal(error.code, "ENOTFOUND");
  });
});

test("pinned socket lookup refuses private and reserved addresses", () => {
  assert.throws(() => scanner.createPinnedLookup([
    { address: "127.0.0.1", family: 4 }
  ]), /No validated public IP address/);
});


test("contact names are extracted only from explicit ContactPoint or nested Person evidence", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Example Services",
    "author": { "@type": "Person", "name": "Article Author" },
    "contactPoint": { "@type": "ContactPoint", "name": "Customer Support" }
  }) + "</script>";
  const result = scanner.extractContactValues(html, "https://example.co.za/");
  assert.equal(result.companyName, "Example Services");
  assert.equal(result.contactName, "Customer Support");
});


test("bracketed IPv6 literals are normalized before public-address validation", async () => {
  assert.equal(scanner.stripIpBrackets("[::1]"), "::1");
  assert.equal((await scanner.isPublicHostname("[::1]")).ok, false);
  const publicIpv6 = await scanner.isPublicHostname("[2606:4700:4700::1111]");
  assert.equal(publicIpv6.ok, true);
  assert.equal(publicIpv6.addresses[0].family, 6);
});


test("PageSpeed timeouts and exhausted scan deadlines are classified as optional unavailability", () => {
  assert.equal(scanner.isOptionalPageSpeedTimeout({ name: "AbortError" }), true);
  assert.equal(scanner.isOptionalPageSpeedTimeout({ code: "SCAN_DEADLINE_EXCEEDED" }), true);
  assert.equal(scanner.isOptionalPageSpeedTimeout({ code: "ECONNRESET" }), false);
});

test("scan deadlines are capped and expired worker deadlines stay expired", () => {
  assert.equal(scanner.resolveScanDeadline(undefined, 1000), 181000);
  assert.equal(scanner.resolveScanDeadline(999999, 1000), 181000);
  assert.equal(scanner.resolveScanDeadline(51000, 1000), 51000);
  assert.equal(scanner.resolveScanDeadline(500, 1000), 500);
  assert.equal(scanner.resolveScanDeadline("invalid", 1000), 1000);
  assert.equal(scanner.resolveScanDeadline(Infinity, 1000), 1000);
});


test("company identity rejects address-shaped Organization names and uses site-name metadata", () => {
  const address = '<script type="application/ld+json">' + JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Head Office: 155 Loop Street, Cape Town, 8001"
  }) + "</script>";
  assert.equal(scanner.extractContactValues(address, "https://example.co.za/").companyName, null);

  const metadata = '<meta property="og:site_name" content="CareChamp">';
  assert.equal(scanner.extractContactValues(metadata, "https://example.co.za/").companyName, "CareChamp");
});

test("company identity keeps valid Organization names", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Example Electrical Services"
  }) + "</script>";
  assert.equal(scanner.extractContactValues(html, "https://example.co.za/").companyName, "Example Electrical Services");
});
