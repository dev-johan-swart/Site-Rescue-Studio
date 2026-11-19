const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanBusinessName, emailCandidate, emailMatchesWebsite,
  isEmailPublishedOnWebsite, selectPrimaryEmail, selectPrimaryPhone,
  selectWebsitePublishedEmail, selectWebsitePublishedPhone, businessNamesMatch
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
  assert.equal(businessNamesMatch("CloudView Solar", "CloudVIEW Security"), false);
  assert.equal(businessNamesMatch("Bedouin Tent Masterz", "Urban Tents"), false);
  assert.equal(businessNamesMatch("The Pretoria Treefelling Guru", "Malverns Projects"), false);
});


test("email selection rejects public-suffix-only and platform-owned email domains", () => {
  assert.equal(emailCandidate({ value: "info@co.za" }), null);
  assert.equal(emailCandidate({ value: "press@linktr.ee" }), null);
  assert.equal(emailCandidate({ value: "info@business.co.za" }).value, "info@business.co.za");
});


test("business identity matching tolerates compound-word spacing but not unrelated names", () => {
  assert.equal(businessNamesMatch("Southend Scaffolding", "South End Scaffolding"), true);
  assert.equal(businessNamesMatch("GT Clubsport", "GT Club Sport"), true);
  assert.equal(businessNamesMatch("CarpenterPro", "Carpenter Pro"), true);
  assert.equal(businessNamesMatch("AirbagDoctor", "Airbag Doctor"), true);
  assert.equal(businessNamesMatch("Example Electrical", "Completely Different"), false);
});

test("primary prospect email requires a matching domain and first-party publishing page", () => {
  const website = "https://appirklaas.co.za/";
  const emailValues = [
    { value: "info@donkinhouse.co.za", url: "https://appirklaas.co.za/contact-us/", source: "visible-text" },
    { value: "info@appirklaas.co.za", url: "https://appirklaas.co.za/contact-us/", source: "visible-text" },
    { value: "other@appirklaas.co.za", url: "https://third-party.example/contact/", source: "visible-text" }
  ];
  assert.equal(selectWebsitePublishedEmail(emailValues, website)?.value, "info@appirklaas.co.za");
});

test("mismatched and off-site email evidence is retained for review but not selected as primary", () => {
  const website = "https://appirklaas.co.za/";
  const emailValues = [
    { value: "info@donkinhouse.co.za", url: "https://appirklaas.co.za/contact-us/", source: "visible-text" },
    { value: "contact@another-domain.co.za", url: "https://another-domain.co.za/contact/", source: "mailto" }
  ];
  assert.equal(selectWebsitePublishedEmail(emailValues, website), null);
});

test("primary prospect phone requires a first-party publishing page", () => {
  const website = "https://example.co.za/";
  const phoneValues = [
    { value: "012 345 6789", url: "https://unrelated.example/contact/" },
    { value: "012 555 0101", url: "https://example.co.za/contact/" }
  ];
  assert.equal(selectWebsitePublishedPhone(phoneValues, website)?.value, "012 555 0101");
});
