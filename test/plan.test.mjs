import assert from "node:assert/strict";
import { buildModulePlan, buildPlan, isExcluded, isSensitive, isVisibleOrNativeCoreSetting, namespaceOf, keyPart } from "../scripts/plan.mjs";

const setting = (fullKey, value, defaultValue = value, extras = {}) => ({ fullKey, namespace: namespaceOf(fullKey), key: keyPart(fullKey), scope: "world", value, default: defaultValue, config: true, ...extras });

assert.equal(namespaceOf("pf2e.tokens.autoscale"), "pf2e");
assert.equal(keyPart("pf2e.tokens.autoscale"), "tokens.autoscale");
assert.equal(isExcluded("pf2e-toolbelt.arp.enabled"), true);
assert.equal(isExcluded("pf2e-toolbelt.arp.someNewRule"), true);
assert.equal(isExcluded("hero-bonus-points.bonusDie"), true);
assert.equal(isExcluded("core.permissions"), false);
assert.equal(isSensitive("campaign-index.syncSecret"), true);
assert.equal(isSensitive("example.apiToken"), true);

const profile = { systemId: "pf2e", packages: { "some-module": "1.0.0", "campaign-index": "1.0.0" }, modulePolicies: { "some-module": "always" }, settings: [
  setting("some-module.clean", true), setting("some-module.changed", 4), setting("influence-encounters.manualMode", true), setting("some-module.user", true, true, { scope: "user" })
] };
const target = [
  setting("some-module.clean", false, false), setting("some-module.changed", 2, 0), setting("influence-encounters.manualMode", false, false), setting("some-module.user", false, false, { scope: "user" }), setting("campaign-index.pcFolder", "Party", "")
];
const rows = buildPlan(profile, target, { targetSystemId: "pf2e", targetPackages: { "some-module": "1.0.0", "campaign-index": "1.0.0" } });
assert.equal(rows.find(row => row.fullKey === "some-module.clean").status, "apply");
assert.equal(rows.find(row => row.fullKey === "some-module.changed").status, "apply");
assert.equal(rows.find(row => row.fullKey === "influence-encounters.manualMode").status, "skip");
assert.equal(rows.find(row => row.fullKey === "some-module.user").status, "skip");
assert.equal(rows.find(row => row.fullKey === "campaign-index.pcFolder").value, "");
const reviewed = buildPlan({ ...profile, modulePolicies: { "some-module": "review" } }, target, { targetSystemId: "pf2e", targetPackages: { "some-module": "1.0.0", "campaign-index": "1.0.0" } });
assert.equal(reviewed.find(row => row.fullKey === "some-module.clean").status, "review");
const globallyExcluded = buildPlan(profile, target, { targetSystemId: "pf2e", targetPackages: { "some-module": "1.0.0", "campaign-index": "1.0.0" }, globalNeverSync: ["some-module.clean"] });
assert.equal(globallyExcluded.find(row => row.fullKey === "some-module.clean").status, "skip");
const hiddenProfile = { ...profile, settings: [setting("some-module.hidden", true, true, { config: null })] };
const hiddenTarget = [setting("some-module.hidden", false, false, { config: null })];
assert.equal(buildPlan(hiddenProfile, hiddenTarget, { targetSystemId: "pf2e" }).find(row => row.fullKey === "some-module.hidden").status, "skip");
const permissions = setting("core.permissions", { PLAYER: ["ACTOR_CREATE"] }, {}, { config: null });
assert.equal(isVisibleOrNativeCoreSetting(permissions), true);
assert.equal(buildPlan({ ...profile, settings: [permissions] }, [setting("core.permissions", {}, {}, { config: null })], { targetSystemId: "pf2e" }).find(row => row.fullKey === "core.permissions").status, "ask");
const moduleRows = buildModulePlan({ packages: { "some-module": { active: true, title: "Some Module" } }, modulePolicies: { "some-module": "always" } }, { "some-module": { active: false, title: "Some Module" }, "campaign-only": { active: true, title: "Campaign Only" } });
assert.equal(moduleRows.find(row => row.id === "some-module").status, "activate");
assert.equal(moduleRows.find(row => row.id === "campaign-only").status, "target-only");
console.log("Settings Sync planner tests passed.");
