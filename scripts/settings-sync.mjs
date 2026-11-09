import { MODULE_ID, buildPlan, isExcluded, isSensitive } from "./plan.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = value => String(value ?? "").replace(/[&<>'\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const currentPackages = () => Object.fromEntries([...game.modules.values()].filter(module => module.active).map(module => [module.id, module.version]));

function targetSettings() {
  return [...game.settings.settings.entries()].map(([fullKey, setting]) => {
    try {
      return { fullKey, namespace: setting.namespace, key: setting.key, scope: setting.scope, value: game.settings.get(setting.namespace, setting.key), default: setting.default, config: setting.config };
    } catch (_error) { return null; }
  }).filter(Boolean);
}

function exportProfile({ includeSensitive = false } = {}) {
  const settings = targetSettings()
    .filter(setting => !isExcluded(setting.fullKey))
    .filter(setting => includeSensitive || !isSensitive(setting.fullKey));
  return {
    schema: 1,
    exportedAt: new Date().toISOString(),
    world: game.world.id,
    worldTitle: game.world.title,
    systemId: game.system.id,
    systemVersion: game.system.version,
    packages: currentPackages(),
    settings
  };
}

class SettingsSyncApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`, classes: [MODULE_ID], tag: "section",
    window: { title: "Lex's Settings Sync", icon: "fa-solid fa-arrows-rotate", resizable: true },
    position: { width: 980, height: 700 },
    actions: {
      exportProfile: SettingsSyncApp.#exportProfile,
      chooseProfile: SettingsSyncApp.#chooseProfile,
      applySelected: SettingsSyncApp.#applySelected,
      clearProfile: SettingsSyncApp.#clearProfile
    }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/settings-sync.hbs` } };
  profile = null;
  rows = [];

  async _prepareContext() {
    const offered = this.rows
      .map((row, rowIndex) => ({ ...row, rowIndex }))
      .filter(row => row.status !== "skip");
    return {
      hasProfile: Boolean(this.profile), profile: this.profile,
      rows: offered.map(row => ({ ...row, valueLabel: row.sensitive ? "Sensitive value" : JSON.stringify(row.value) })),
      skipped: this.rows.filter(row => row.status === "skip"),
      applyCount: offered.filter(row => row.selected).length,
      sensitiveCount: offered.filter(row => row.sensitive).length
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const input = this.element.querySelector("input[type=file]");
    input?.addEventListener("change", async event => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      try {
        this.profile = JSON.parse(await file.text());
        if (this.profile?.schema !== 1 || !Array.isArray(this.profile.settings)) throw new Error("This file is not a Settings Sync profile.");
        this.rows = buildPlan(this.profile, targetSettings(), { targetPackages: currentPackages(), targetSystemId: game.system.id });
        await this.render({ force: true });
      } catch (error) { ui.notifications.error(error.message); }
    });
  }

  static async #exportProfile(event, button) {
    const includeSensitive = await DialogV2.confirm({ window: { title: "Include sensitive settings?" }, rejectClose: false,
      content: "<p>Include the Campaign Index endpoint and secret in this export?</p><p>Keep this file private if you do.</p>", yes: { label: "Include sensitive values" }, no: { label: "Exclude sensitive values" } });
    const profile = exportProfile({ includeSensitive });
    foundry.utils.saveDataToFile(JSON.stringify(profile, null, 2), "application/json", `${game.world.id}-settings.json`);
    ui.notifications.info(`Exported ${profile.settings.length} settings from ${game.world.title}.`);
  }

  static #chooseProfile() { this.element.querySelector("input[type=file]").click(); }
  static async #clearProfile() { this.profile = null; this.rows = []; await this.render({ force: true }); }

  static async #applySelected(event, button) {
    const selected = [...this.element.querySelectorAll("input[data-row-index]:checked")].map(input => this.rows[Number(input.dataset.rowIndex)]).filter(Boolean);
    if (!selected.length) return ui.notifications.warn("Choose at least one setting to apply.");
    const confirmation = await DialogV2.confirm({ window: { title: "Apply selected settings" }, rejectClose: false,
      content: `<p>Apply <strong>${selected.length}</strong> reviewed setting${selected.length === 1 ? "" : "s"} to <strong>${esc(game.world.title)}</strong>?</p>` });
    if (!confirmation) return;
    const results = await Promise.allSettled(selected.map(row => game.settings.set(row.namespace, row.key, row.value)));
    const failed = results.filter(result => result.status === "rejected");
    if (failed.length) ui.notifications.error(`${failed.length} setting${failed.length === 1 ? "" : "s"} could not be applied. Check the console for details.`);
    else ui.notifications.info(`Applied ${selected.length} setting${selected.length === 1 ? "" : "s"}. Reload if a changed setting requires it.`);
  }
}

function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "open", {
    name: "Settings Sync", label: "Open Settings Sync", hint: "Export this world's settings or preview a profile before applying it.",
    icon: "fa-solid fa-arrows-rotate", type: SettingsSyncApp, restricted: true
  });
}

Hooks.once("init", registerSettings);
export { SettingsSyncApp, exportProfile, targetSettings };
