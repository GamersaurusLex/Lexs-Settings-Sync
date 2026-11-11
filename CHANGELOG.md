# Changelog

## 0.2.4

- Allow PF2e and SF2e profiles to share portable Core and module settings.
- Keep PF2e- and SF2e-owned settings out of the other system, with a clear in-app notice.

## 0.2.3

- Fixed the profile review layout so each setting title, description, and value comparison stay together and remain readable.
- Separated profile warnings from the action bar so Settings Vault notices no longer overlap controls.

## 0.2.2

- Prompt for a profile name when creating or saving, allowing multiple named profiles in the Foundry data library.
- Preserve the main panel scroll position when a sync policy changes.
- Replace raw setting keys and hidden-setting counts with readable labels, descriptions, and profile-versus-world values.
- Exclude deprecated Foundry settings from profile capture.

## 0.2.1

- Reworked the review screen into one main scroll area with a fixed Review Selected Changes control.
- Added a plain-language confirmation list before any setting or module change is committed.
- Explicitly capture native Core configuration panes, including User Permissions, UI, Audio/Video, Prototype Token Overrides, fonts, combat tracker, dice, compendium art, and default sheets.
- Require an explicit selection before applying User Permissions and exclude unrelated hidden Core bookkeeping from profiles.

## 0.2.0

- Rebuilt the profile workflow around readable policy rules instead of raw settings dumps.
- Added a Foundry data-library for saved profiles, plus JSON import and download copies.
- Added module-level and setting-level Always Sync, Review, and Never Sync rules.
- Added global Never Sync choices, protected-setting handling, and a Settings Vault conflict warning.
- Added reviewed module-state actions for profile requirements and target-world-only modules.
- Added system-specific Campaign Index Party-folder handling.

## 0.1.0

- Initial Foundry VTT v14 release.
- Export a world settings profile, review differences, and selectively apply approved values.
- Protect Campaign Index identity, encounter Manual Mode, Variant Rules, Automatic Rune Progression, Settings Vault, per-user settings, and other target-local state.
- Optionally include the Campaign Index endpoint and secret in a private export.
