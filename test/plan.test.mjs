import assert from "node:assert/strict";
import { buildPlan, isExcluded, isSensitive, namespaceOf, keyPart } from "../scripts/plan.mjs";

const setting = (fullKey, value, defaultValue = value, extras = {}) => ({ fullKey, namespace: namespaceOf(fullKey), key: keyPart(fullKey), scope: "world", value, default: defaultValue, config: true, ...extras });

assert.equal(namespaceOf("pf2e.tokens.autoscale"), "pf2e");
assert.equal(keyPart("pf2e.tokens.autoscale"), "tokens.autoscale");
assert.equal(isExcluded("pf2e-toolbelt.arp.enabled"), true);
assert.equal(isExcluded("hero-bonus-points.bonusDie"), true);
assert.equal(isSensitive("campaign-index.syncSecret"), true);
assert.equal(isSensitive("example.apiToken"), true);

const profile = { systemId: "pf2e", packages: { "some-module": "1.0.0", "campaign-index": "1.0.0" }, settings: [
  setting("some-module.clean", true), setting("some-module.changed", 4), setting("influence-encounters.manualMode", true), setting("some-module.user", true, true, { scope: "user" })
] };
const target = [
  setting("some-module.clean", false, false), setting("some-module.changed", 2, 0), setting("influence-encounters.manualMode", false, false), setting("some-module.user", false, false, { scope: "user" }), setting("campaign-index.pcFolder", "Party", "")
];
const rows = buildPlan(profile, target, { targetSystemId: "pf2e", targetPackages: { "some-module": "1.0.0", "campaign-index": "1.0.0" } });
assert.equal(rows.find(row => row.fullKey === "some-module.clean").status, "apply");
assert.equal(rows.find(row => row.fullKey === "some-module.changed").status, "ask");
assert.equal(rows.find(row => row.fullKey === "influence-encounters.manualMode").status, "skip");
assert.equal(rows.find(row => row.fullKey === "some-module.user").status, "skip");
assert.equal(rows.find(row => row.fullKey === "campaign-index.pcFolder").value, "");
console.log("Settings Sync planner tests passed.");
