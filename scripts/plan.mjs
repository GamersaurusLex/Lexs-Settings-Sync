export const MODULE_ID = "settings-sync";

export const NEVER_SYNC = new Set([
  "campaign-index.campaignId", "campaign-index.campaignName", "campaign-index.lastSyncedAt", "campaign-index.reputationResourceIds",
  "influence-encounters.manualMode", "influence-encounters.manualModeAll", "influence-encounters.manualModeResearch",
  "influence-encounters.manualModeChase", "influence-encounters.manualModeSkill", "influence-encounters.manualModeInfiltration", "influence-encounters.manualModeStarship",
  "pf2e-toolbelt.arp.enabled", "pf2e-toolbelt.arp.force", "pf2e-toolbelt.arp.price", "pf2e-toolbelt.arp.shield"
]);

export const NEVER_SYNC_NAMESPACES = new Set([MODULE_ID, "hero-bonus-points", "settings-vault"]);
export const BOOKKEEPING = /(?:^|\.)(?:migration|schema|version|lastSynced|tour|enabledModules|permissions|worldTime|party)(?:\.|$)/i;
export const PORTABLE_SENSITIVE = new Set(["campaign-index.endpoint", "campaign-index.syncSecret"]);
const SECRET_LIKE = /(?:token|secret|password|api.?key|license.?key)/i;

export const namespaceOf = fullKey => String(fullKey).split(".")[0];
export const keyPart = fullKey => String(fullKey).slice(String(fullKey).indexOf(".") + 1);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function isExcluded(fullKey) {
  const namespace = namespaceOf(fullKey);
  return NEVER_SYNC.has(fullKey) || NEVER_SYNC_NAMESPACES.has(namespace) || BOOKKEEPING.test(fullKey);
}

export function isSensitive(fullKey) {
  return PORTABLE_SENSITIVE.has(fullKey) || SECRET_LIKE.test(keyPart(fullKey));
}

function policyRow(source, target, { sourcePackages = {}, targetPackages = {}, sourceSystemId, targetSystemId } = {}) {
  const fullKey = source.fullKey;
  if (isExcluded(fullKey)) return { status: "skip", reason: "Protected world-local setting" };
  if (source.scope === "user") return { status: "skip", reason: "Per-user settings never transfer" };
  if (!target) return { status: "skip", reason: "Setting is not registered in this world" };
  if (source.scope !== target.scope) return { status: "skip", reason: "Source and target scopes differ" };
  if (target.scope === "user") return { status: "skip", reason: "Per-user settings never transfer" };
  if (same(source.value, target.value)) return { status: "skip", reason: "Already matches target" };
  if (namespaceOf(fullKey) === "core" && target.scope === "world") return { status: "ask", reason: "World-wide Foundry core setting" };
  if (target.config === false) return { status: "ask", reason: "Hidden/internal setting requires review" };
  const namespace = namespaceOf(fullKey);
  if (sourceSystemId && targetSystemId && sourceSystemId !== targetSystemId && (namespace === sourceSystemId || namespace === targetSystemId)) {
    return { status: "ask", reason: "Game system differs" };
  }
  if (sourcePackages[namespace] && targetPackages[namespace] && sourcePackages[namespace] !== targetPackages[namespace]) {
    return { status: "ask", reason: "Package version differs" };
  }
  if (!same(target.value, target.default)) return { status: "ask", reason: "Target has a custom value" };
  return { status: "apply", reason: "Target still uses registered default" };
}

export function buildPlan(profile, targetSettings, context = {}) {
  const targetByKey = new Map(targetSettings.map(setting => [setting.fullKey, setting]));
  const rows = [];
  for (const source of profile.settings ?? []) {
    const decision = policyRow(source, targetByKey.get(source.fullKey), {
      sourcePackages: profile.packages ?? {},
      targetPackages: context.targetPackages ?? {},
      sourceSystemId: profile.systemId,
      targetSystemId: context.targetSystemId
    });
    rows.push({ ...source, ...decision, selected: decision.status === "apply", sensitive: isSensitive(source.fullKey) });
  }
  // Campaign Index uses a target-system rule rather than a source-world value.
  if ((profile.packages ?? {})["campaign-index"] && targetByKey.has("campaign-index.pcFolder")) {
    const target = targetByKey.get("campaign-index.pcFolder");
    const value = context.targetSystemId === "pf2e" ? "" : "Party";
    if (!same(target.value, value)) {
      const status = same(target.value, target.default) ? "apply" : "ask";
      rows.push({ fullKey: target.fullKey, namespace: "campaign-index", key: "pcFolder", scope: target.scope, value, status,
        reason: `Target-system policy: ${context.targetSystemId === "pf2e" ? "blank for PF2e" : "Party for this system"}`,
        selected: status === "apply", derived: true, sensitive: false });
    }
  }
  return rows.sort((a, b) => a.fullKey.localeCompare(b.fullKey));
}
