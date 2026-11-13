const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanBusinessName, emailCandidate, emailMatchesWebsite,
  isEmailPublishedOnWebsite, selectPrimaryEmail, selectPrimaryPhone,
  businessNamesMatch
} = require("./prospectIdentity");

test("business names reject address, placeholder and parked-domain labels", () => {
  assert.equal(cleanBusinessName("Head Office: 155 Loop Street, Cape Town, 8001"), null);
  assert.equal(cleanBusinessName("Domain for Sale"), null);
  assert.equal(cleanBusinessName("Example Electrical Services"), "Example Electrical Services");
  assert.equal(cleanBusinessName("Road Runner Logistics, Inc."), "Road Runner Logistics, Inc.");
});

test("placeholder and automated email addresses are never selected", () => {
  assert.equal(emailCandidate({ value: "name@example.com" }), null);
  assert.equal(emailCandidate({ value: "no-reply@business.co.za" }), null);
  assert.equal(emailCandidate({ value: "hello@business.co.za" }).value, "hello@business.co.za");
});

test("primary email prefers a valid website-domain address over an earlier third-party address", () => {
  const selected = selectPrimaryEmail([
    { value: "press@linktr.ee", source: "mailto" },
    { value: "hello@business.co.za", source: "visible-text", url: "https://business.co.za/contact" },
    { value: "info@business.co.za", source: "mailto", url: "https://business.co.za/contact" }
  ], "https://business.co.za/");
  assert.equal(selected.value, "info@business.co.za");
  assert.equal(emailMatchesWebsite(selected, "https://business.co.za/"), true);
  assert.equal(isEmailPublishedOnWebsite(selected, "https://business.co.za/"), true);
});

test("a third-party email is only considered published when found on the actual business site", () => {
  assert.equal(isEmailPublishedOnWebsite({ value: "business@gmail.com", url: "https://business.co.za/contact" }, "https://business.co.za/"), true);
  assert.equal(isEmailPublishedOnWebsite({ value: "press@linktr.ee", url: "https://linktr.ee/business" }, "https://business.co.za/"), false);
});

test("primary phone rejects invalid placeholders and prefers clickable tel evidence", () => {
  const selected = selectPrimaryPhone([
    { value: "000 000 0000", source: "visible-text" },
    { value: "012 345 6789", source: "visible-text" },
    { value: "+27 12 345 6789", source: "tel" }
  ]);
  assert.equal(selected.value, "+27 12 345 6789");
});

test("business name comparison flags unrelated directory and website identities", () => {
  assert.equal(businessNamesMatch("CloudView Solar", "CloudVIEW Security"), true);
  assert.equal(businessNamesMatch("Bedouin Tent Masterz", "Urban Tents"), false);
  assert.equal(businessNamesMatch("The Pretoria Treefelling Guru", "Malverns Projects"), false);
});
