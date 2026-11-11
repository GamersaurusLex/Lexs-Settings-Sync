export const MODULE_ID = "settings-sync";

// These values power Foundry's native Core configuration panes. They are
// intentionally synchronized even though Foundry marks them config:false/null.
export const NATIVE_CORE_CONFIGURATION = new Set([
  "core.uiConfig", "core.permissions", "core.rtcWorldSettings", "core.rtcClientSettings",
  "core.prototypeTokenOverrides", "core.fonts", "core.combatTrackerConfig",
  "core.diceConfiguration", "core.compendiumArtConfiguration", "core.sheetClasses"
]);

export const NEVER_SYNC = new Set([
  "campaign-index.campaignId", "campaign-index.campaignName", "campaign-index.lastSyncedAt", "campaign-index.reputationResourceIds",
  "influence-encounters.manualMode", "influence-encounters.manualModeAll", "influence-encounters.manualModeResearch",
  "influence-encounters.manualModeChase", "influence-encounters.manualModeSkill", "influence-encounters.manualModeInfiltration", "influence-encounters.manualModeStarship"
]);
export const NEVER_SYNC_NAMESPACES = new Set([MODULE_ID, "hero-bonus-points", "settings-vault"]);
export const BOOKKEEPING = /(?:^|\.)(?:migration|schema|version|lastSynced|tour|enabledModules|permissions|worldTime|party)(?:\.|$)/i;
export const PORTABLE_SENSITIVE = new Set(["campaign-index.endpoint", "campaign-index.syncSecret"]);
const SECRET_LIKE = /(?:token|secret|password|api.?key|license.?key)/i;

export const namespaceOf = fullKey => String(fullKey).split(".")[0];
export const keyPart = fullKey => String(fullKey).slice(String(fullKey).indexOf(".") + 1);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const packageVersion = value => typeof value === "string" ? value : value?.version;
export const packageActive = value => typeof value === "object" ? Boolean(value.active) : Boolean(value);
const PAIZO_D20_SYSTEMS = new Set(["pf2e", "sf2e"]);

export function areSystemsCompatible(sourceSystemId, targetSystemId) {
  if (!sourceSystemId || !targetSystemId) return false;
  return sourceSystemId === targetSystemId || (PAIZO_D20_SYSTEMS.has(sourceSystemId) && PAIZO_D20_SYSTEMS.has(targetSystemId));
}

export function isExcluded(fullKey) {
  const namespace = namespaceOf(fullKey);
  const key = keyPart(fullKey);
  return NEVER_SYNC.has(fullKey) || NEVER_SYNC_NAMESPACES.has(namespace) || (namespace === "pf2e-toolbelt" && key.startsWith("arp.")) || (!NATIVE_CORE_CONFIGURATION.has(fullKey) && BOOKKEEPING.test(fullKey));
}

export const isVisibleOrNativeCoreSetting = setting => setting?.config === true || NATIVE_CORE_CONFIGURATION.has(setting?.fullKey);
export const isSensitive = fullKey => PORTABLE_SENSITIVE.has(fullKey) || SECRET_LIKE.test(keyPart(fullKey));
export const policyFor = (profile, source) => profile.settingPolicies?.[source.fullKey] ?? profile.modulePolicies?.[namespaceOf(source.fullKey)] ?? "review";

function policyRow(source, target, { sourcePackages = {}, targetPackages = {}, sourceSystemId, targetSystemId, globalNeverSync = [] } = {}) {
  const fullKey = source.fullKey;
  if (globalNeverSync.includes(fullKey)) return { status: "skip", reason: "Your global Never Sync rule" };
  if (isExcluded(fullKey)) return { status: "skip", reason: "Protected world-local setting" };
  if (!isVisibleOrNativeCoreSetting(source)) return { status: "skip", reason: "Hidden or internal setting" };
  if (source.scope === "user") return { status: "skip", reason: "Per-user settings never transfer" };
  if (!target) return { status: "skip", reason: "Setting is not registered in this world" };
  if (source.scope !== target.scope) return { status: "skip", reason: "Source and target scopes differ" };
  if (target.scope === "user") return { status: "skip", reason: "Per-user settings never transfer" };
  if (same(source.value, target.value)) return { status: "skip", reason: "Already matches target" };
  if (!isVisibleOrNativeCoreSetting(target)) return { status: "skip", reason: "Hidden or internal setting" };
  if (fullKey === "core.permissions") return { status: "ask", reason: "Native User Permissions configuration requires review" };
  const namespace = namespaceOf(fullKey);
  if (sourceSystemId && targetSystemId && sourceSystemId !== targetSystemId && (namespace === sourceSystemId || namespace === targetSystemId)) return { status: "skip", reason: "System-owned setting does not transfer" };
  if (sourcePackages[namespace] && targetPackages[namespace] && packageVersion(sourcePackages[namespace]) !== packageVersion(targetPackages[namespace])) return { status: "ask", reason: "Package version differs" };
  return { status: "apply", reason: "Profile default" };
}

export function buildPlan(profile, targetSettings, context = {}) {
  const targetByKey = new Map(targetSettings.map(setting => [setting.fullKey, setting]));
  const rows = [];
  for (const source of profile.settings ?? []) {
    const decision = policyRow(source, targetByKey.get(source.fullKey), {
      sourcePackages: profile.packages ?? {}, targetPackages: context.targetPackages ?? {},
      sourceSystemId: profile.systemId, targetSystemId: context.targetSystemId, globalNeverSync: context.globalNeverSync ?? []
    });
    const policy = policyFor(profile, source);
    if (policy === "never") rows.push({ ...source, status: "skip", reason: "Profile rule: never sync", selected: false, sensitive: isSensitive(source.fullKey), policy });
    else if (decision.status === "apply" && policy === "review") rows.push({ ...source, status: "review", reason: "Profile rule: review before applying", selected: false, sensitive: isSensitive(source.fullKey), policy });
    else rows.push({ ...source, ...decision, selected: decision.status === "apply", sensitive: isSensitive(source.fullKey), policy });
  }
  if ((profile.packages ?? {})["campaign-index"] && targetByKey.has("campaign-index.pcFolder")) {
    const target = targetByKey.get("campaign-index.pcFolder");
    const value = context.targetSystemId === "pf2e" ? "" : "Party";
    if (!same(target.value, value)) rows.push({ fullKey: target.fullKey, namespace: "campaign-index", key: "pcFolder", scope: target.scope, value,
      status: "apply", reason: `Target-system policy: ${context.targetSystemId === "pf2e" ? "blank for PF2e" : "Party for this system"}`,
      selected: true, derived: true, sensitive: false, policy: "always" });
  }
  return rows.sort((a, b) => a.fullKey.localeCompare(b.fullKey));
}

export function buildModulePlan(profile, targetPackages = {}, exceptions = {}) {
  const rows = [];
  const sourcePackages = profile.packages ?? {};
  for (const [id, source] of Object.entries(sourcePackages)) {
    if (!packageActive(source)) continue;
    const target = targetPackages[id];
    const policy = profile.modulePolicies?.[id] ?? "review";
    if (!target) rows.push({ id, title: source.title ?? id, status: "unavailable", reason: "Installed in profile world, unavailable here", manifest: source.manifest, policy, selected: false });
    else if (!packageActive(target) && policy !== "never") rows.push({ id, title: target.title ?? source.title ?? id, status: policy === "always" ? "activate" : "review", reason: policy === "always" ? "Required by profile" : "Profile wants your decision", manifest: target.manifest ?? source.manifest, policy, selected: policy === "always" });
  }
  for (const [id, target] of Object.entries(targetPackages)) {
    if (!packageActive(target) || sourcePackages[id] || exceptions[id] === "keep") continue;
    rows.push({ id, title: target.title ?? id, status: "target-only", reason: "Active only in this world", manifest: target.manifest, policy: "review", selected: false, decision: "ignore" });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}
