import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, diff, snap, bullets } from "../lib/ctg.js";

const raw = { protocolSection: {
  identificationModule: { nctId: "NCT00000001", briefTitle: "Example study" },
  statusModule: { overallStatus: "NOT_YET_RECRUITING", lastUpdatePostDateStruct: { date: "2026-01-02" } },
  designModule: { phases: ["PHASE2"], enrollmentInfo: { count: 120 } },
  conditionsModule: { conditions: ["Asthma"] },
  eligibilityModule: { minimumAge: "18 Years", maximumAge: "65 Years", sex: "FEMALE", eligibilityCriteria: "Inclusion Criteria:\n* Adults with asthma\n* Written consent given\n\nExclusion Criteria:\n* Pregnancy or lactation" },
  contactsLocationsModule: { locations: [{ facility: "City Hospital", city: "Delhi", country: "India", status: "RECRUITING", geoPoint: { lat: 28.6139, lon: 77.209 } }], centralContacts: [{ name: "A. Lead", role: "CONTACT", email: "a@example.org" }] },
} };

test("normalize maps registry fields", () => {
  const t = normalize(raw);
  assert.equal(t.id, "NCT00000001"); assert.equal(t.status, "Not yet recruiting");
  assert.equal(t.phase, "Phase 2"); assert.equal(t.min, 18); assert.equal(t.max, 65); assert.equal(t.sex, "Female");
  assert.deepEqual(t.inc, ["Adults with asthma", "Written consent given"]); assert.deepEqual(t.exc, ["Pregnancy or lactation"]);
  assert.equal(t.sites[0].city, "Delhi"); assert.equal(t.contacts[0].email, "a@example.org");
});
test("bullets drops headings and short lines", () => {
  assert.deepEqual(bullets("Inclusion Criteria:\n- ok\n- A real criterion"), ["A real criterion"]);
});
test("diff reports status, sites and criteria changes", () => {
  const before = normalize(raw), s = snap(before);
  assert.deepEqual(diff(s, before), []);
  const raw2 = structuredClone(raw);
  raw2.protocolSection.statusModule.overallStatus = "RECRUITING";
  raw2.protocolSection.contactsLocationsModule.locations.push({ facility: "Second Hospital", city: "Pune", country: "India" });
  raw2.protocolSection.eligibilityModule.eligibilityCriteria += "\n* New rule here";
  const out = diff(s, normalize(raw2));
  assert.equal(out.length, 3);
  assert.match(out[0], /Not yet recruiting.*Recruiting/); assert.match(out[1], /1 site added/); assert.match(out[2], /criteria/);
});
test("normalize keeps rounded site coordinates and tolerates missing ones", () => {
  const t = normalize(raw); assert.equal(t.sites[0].lat, 28.614); assert.equal(t.sites[0].lon, 77.209);
  const r2 = structuredClone(raw); delete r2.protocolSection.contactsLocationsModule.locations[0].geoPoint;
  assert.equal(normalize(r2).sites[0].lat, null);
});
