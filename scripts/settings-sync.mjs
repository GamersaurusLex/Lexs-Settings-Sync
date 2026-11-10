import { MODULE_ID, buildModulePlan, buildPlan, isExcluded, isSensitive, namespaceOf } from "./plan.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const PROFILE_DIR = "settings-sync/profiles";
const esc = value => String(value ?? "").replace(/[&<>'\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const currentPackages = () => Object.fromEntries([...game.modules.values()].map(module => [module.id, { version: module.version, active: module.active, title: module.title, manifest: module.manifest }]));
const profileFileName = profile => `${profile.systemId}-${String(profile.name ?? profile.worldTitle ?? "settings").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.json`;
async function ensureProfileDirectory() {
  for (const path of ["settings-sync", PROFILE_DIR]) {
    try { await FilePicker.createDirectory("data", path, { notify: false }); }
    catch (error) {
      if (!/already exists|EEXIST/i.test(error.message)) throw error;
    }
  }
}

function targetSettings() {
  return [...game.settings.settings.entries()].map(([fullKey, setting]) => {
    try { return { fullKey, namespace: setting.namespace, key: setting.key, scope: setting.scope, value: game.settings.get(setting.namespace, setting.key), default: setting.default, config: setting.config }; }
    catch (_error) { return null; }
  }).filter(Boolean);
}

function shouldExport(setting) {
  const module = game.modules.get(setting.namespace);
  return setting.config !== false && !isExcluded(setting.fullKey) && (!module || module.active);
}

function exportProfile({ includeSensitive = false } = {}) {
  const settings = targetSettings().filter(shouldExport).filter(setting => includeSensitive || !isSensitive(setting.fullKey));
  return {
    schema: 2, exportedAt: new Date().toISOString(), name: `${game.world.title} baseline`, world: game.world.id, worldTitle: game.world.title,
    systemId: game.system.id, systemVersion: game.system.version, packages: currentPackages(),
    modulePolicies: Object.fromEntries([["core", "always"], [game.system.id, "always"], ...[...game.modules.values()].filter(module => module.active).map(module => [module.id, "always"])]),
    settingPolicies: {}, settings
  };
}

class SettingsSyncApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`, classes: [MODULE_ID], tag: "section",
    window: { title: "Lex's Settings Sync", icon: "fa-solid fa-arrows-rotate", resizable: true }, position: { width: 980, height: 700 },
    actions: {
      createProfile: SettingsSyncApp.#createProfile, chooseProfile: SettingsSyncApp.#chooseProfile, showLibrary: SettingsSyncApp.#showLibrary,
      openLibraryProfile: SettingsSyncApp.#openLibraryProfile, saveProfile: SettingsSyncApp.#saveProfile, downloadProfile: SettingsSyncApp.#downloadProfile,
      applySelected: SettingsSyncApp.#applySelected, clearProfile: SettingsSyncApp.#clearProfile, closeLibrary: SettingsSyncApp.#closeLibrary
    }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/settings-sync.hbs` } };
  profile = null;
  rows = [];
  moduleRows = [];
  library = [];
  mode = "home";

  #exceptions() { return game.settings.get(MODULE_ID, "worldModuleExceptions") ?? {}; }
  #globalNeverSync() { return game.settings.get(MODULE_ID, "globalNeverSync") ?? []; }
  #replan() {
    const packages = currentPackages();
    this.rows = buildPlan(this.profile, targetSettings(), { targetPackages: packages, targetSystemId: game.system.id, globalNeverSync: this.#globalNeverSync() });
    this.moduleRows = buildModulePlan(this.profile, packages, this.#exceptions());
  }

  async _prepareContext() {
    const offered = this.rows.map((row, rowIndex) => ({ ...row, rowIndex })).filter(row => row.status !== "skip");
    const decorate = row => ({ ...row,
      settingLabel: game.i18n.localize(game.settings.settings.get(row.fullKey)?.name ?? row.fullKey),
      settingPolicy: this.profile.settingPolicies?.[row.fullKey] ?? "inherit"
    });
    const recommended = offered.filter(row => row.status === "apply").map(decorate);
    const review = offered.filter(row => row.status === "review" || row.status === "ask").map(decorate);
    const skipped = this.rows.filter(row => row.status === "skip");
    const moduleActions = this.moduleRows.map((row, moduleIndex) => ({ ...row, moduleIndex })).filter(row => row.status === "activate" || row.status === "review" || row.status === "target-only");
    const unavailable = this.moduleRows.filter(row => row.status === "unavailable");
    const policyGroups = this.profile ? [...new Set(this.profile.settings.map(setting => setting.namespace))].sort().map(namespace => ({ namespace, policy: this.profile.modulePolicies?.[namespace] ?? "review" })) : [];
    return {
      hasProfile: Boolean(this.profile), isLibrary: this.mode === "library", profile: this.profile, library: this.library,
      recommended, review, skipped, moduleActions, unavailable, policyGroups, applyCount: recommended.length,
      reviewCount: review.length, moduleActionCount: moduleActions.filter(row => row.selected).length, targetSystemId: game.system.id,
      isCompatible: this.profile?.systemId === game.system.id,
      settingsVaultActive: Boolean(game.modules.get("settings-vault")?.active)
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("input[type=file]")?.addEventListener("change", async event => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      await this.#loadProfile(JSON.parse(await file.text()));
    });
    this.element.querySelectorAll("select[data-policy-module]").forEach(select => select.addEventListener("change", async event => {
      this.profile.modulePolicies[event.currentTarget.dataset.policyModule] = event.currentTarget.value;
      this.#replan(); await this.render({ force: true });
    }));
    this.element.querySelectorAll("select[data-policy-setting]").forEach(select => select.addEventListener("change", async event => {
      const value = event.currentTarget.value, fullKey = event.currentTarget.dataset.policySetting;
      if (value === "global-never") {
        const neverSync = new Set(this.#globalNeverSync());
        neverSync.add(fullKey);
        await game.settings.set(MODULE_ID, "globalNeverSync", [...neverSync].sort());
      } else if (value === "inherit") delete this.profile.settingPolicies[fullKey];
      else this.profile.settingPolicies[fullKey] = value;
      this.#replan(); await this.render({ force: true });
    }));
    this.element.querySelectorAll("select[data-target-module]").forEach(select => select.addEventListener("change", async event => {
      const row = this.moduleRows[Number(event.currentTarget.dataset.targetModule)];
      row.decision = event.currentTarget.value;
      row.selected = row.decision === "deactivate";
      await this.render({ force: true });
    }));
  }

  async #loadProfile(profile) {
    if (![1, 2].includes(profile?.schema) || !Array.isArray(profile.settings)) throw new Error("This file is not a Settings Sync profile.");
    profile.modulePolicies ??= {}; profile.settingPolicies ??= {}; profile.schema = 2;
    this.profile = profile; this.mode = "profile"; this.#replan(); await this.render({ force: true });
  }

  static async #createProfile() {
    const includeSensitive = await DialogV2.confirm({ window: { title: "Include sensitive settings?" }, rejectClose: false,
      content: "<p>Include the Campaign Index endpoint and secret in this profile?</p><p>Keep saved profiles with sensitive values private.</p>", yes: { label: "Include sensitive values" }, no: { label: "Exclude sensitive values" } });
    this.profile = exportProfile({ includeSensitive }); this.mode = "profile"; this.#replan(); await this.render({ force: true });
  }
  static #chooseProfile() { this.element.querySelector("input[type=file]")?.click(); }
  static async #showLibrary() {
    try {
      await ensureProfileDirectory();
      const result = await FilePicker.browse("data", PROFILE_DIR, { extensions: [".json"] });
      this.library = result.files.map(path => ({ path, name: path.split("/").at(-1) })); this.mode = "library"; await this.render({ force: true });
    } catch (error) { ui.notifications.error(`Could not open the Settings Sync library: ${error.message}`); }
  }
  static async #openLibraryProfile(event, button) {
    try { await this.#loadProfile(await (await fetch(button.dataset.path)).json()); }
    catch (error) { ui.notifications.error(`Could not load that profile: ${error.message}`); }
  }
  static async #saveProfile() {
    try {
      await ensureProfileDirectory();
      const file = new File([JSON.stringify(this.profile, null, 2)], profileFileName(this.profile), { type: "application/json" });
      await FilePicker.upload("data", PROFILE_DIR, file, {}, { notify: false });
      ui.notifications.info(`Saved ${this.profile.name} in the Settings Sync library.`);
    } catch (error) { ui.notifications.error(`Could not save this profile: ${error.message}`); }
  }
  static #downloadProfile() { foundry.utils.saveDataToFile(JSON.stringify(this.profile, null, 2), "application/json", profileFileName(this.profile)); }
  static async #clearProfile() { this.profile = null; this.rows = []; this.moduleRows = []; this.mode = "home"; await this.render({ force: true }); }
  static async #closeLibrary() { this.mode = "home"; await this.render({ force: true }); }

  static async #applySelected() {
    const settings = [...this.element.querySelectorAll("input[data-row-index]:checked")].map(input => this.rows[Number(input.dataset.rowIndex)]).filter(Boolean);
    const modules = [...this.element.querySelectorAll("input[data-module-index]:checked")].map(input => this.moduleRows[Number(input.dataset.moduleIndex)]).filter(Boolean);
    const targetOnly = this.moduleRows.filter(row => row.status === "target-only");
    const updates = { ...this.#exceptions() };
    let profileChanged = false;
    for (const row of targetOnly) {
      if (row.decision === "keep") updates[row.id] = "keep";
      if (row.decision === "add-required" || row.decision === "add-optional") {
        this.profile.packages[row.id] = currentPackages()[row.id];
        this.profile.packages[row.id].active = true;
        this.profile.modulePolicies[row.id] = row.decision === "add-required" ? "always" : "review";
        profileChanged = true;
      }
      if (row.decision === "deactivate") modules.push(row);
    }
    const exceptionsChanged = JSON.stringify(updates) !== JSON.stringify(this.#exceptions());
    if (!settings.length && !modules.length && !exceptionsChanged && !profileChanged) return ui.notifications.warn("There are no selected profile changes to apply.");
    if (!settings.length && !modules.length) {
      await game.settings.set(MODULE_ID, "worldModuleExceptions", updates);
      this.#replan(); await this.render({ force: true });
      return ui.notifications.info(profileChanged ? "Profile rules updated. Save the profile to keep them in the library." : "Saved this world’s module exception.");
    }
    const confirmation = await DialogV2.confirm({ window: { title: "Apply profile changes" }, rejectClose: false,
      content: `<p>Apply <strong>${settings.length}</strong> setting${settings.length === 1 ? "" : "s"} and <strong>${modules.length}</strong> module change${modules.length === 1 ? "" : "s"} to <strong>${esc(game.world.title)}</strong>?</p>${modules.length ? "<p>Foundry will reload after the module changes are saved.</p>" : ""}` });
    if (!confirmation) return;
    await game.settings.set(MODULE_ID, "worldModuleExceptions", updates);
    const results = await Promise.allSettled(settings.map(row => game.settings.set(row.namespace, row.key, row.value)));
    const failed = results.filter(result => result.status === "rejected");
    if (modules.length) {
      const moduleConfig = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration") ?? {});
      for (const row of modules) moduleConfig[row.id] = { ...(moduleConfig[row.id] ?? {}), active: row.status === "activate" };
      await game.settings.set("core", "moduleConfiguration", moduleConfig);
    }
    if (failed.length) ui.notifications.error(`${failed.length} setting${failed.length === 1 ? "" : "s"} could not be applied. Check the console for details.`);
    else ui.notifications.info(`Applied ${settings.length} setting${settings.length === 1 ? "" : "s"}.`);
    if (modules.length) window.location.reload();
    else { this.#replan(); await this.render({ force: true }); }
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, "worldModuleExceptions", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "globalNeverSync", { scope: "client", config: false, type: Array, default: [] });
  game.settings.registerMenu(MODULE_ID, "open", { name: "Settings Sync", label: "Open Settings Sync", hint: "Build a system-specific profile and apply its approved defaults to another world.", icon: "fa-solid fa-arrows-rotate", type: SettingsSyncApp, restricted: true });
}

Hooks.once("init", registerSettings);
export { SettingsSyncApp, exportProfile, targetSettings };
