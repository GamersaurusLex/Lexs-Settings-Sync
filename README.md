# Lex's Settings Sync

Export settings from one Foundry v14 world, then import the profile into another
world with a review table before anything changes.

## Safety rules

- Target values that differ from a registered default are unticked for review.
- Per-user values and target-world identity stay out.
- Automatic Rune Progression, Influence Manual Mode, Lex's Variant Rules, and
  Settings Vault state never transfer.
- Campaign Index endpoint and secret are excluded unless the GM explicitly
  chooses to include sensitive values during export.

Open **Game Settings → Settings Sync → Open Settings Sync** as a GM.

## Install

Use this manifest in Foundry or Forge:

`https://github.com/GamersaurusLex/Lexs-Settings-Sync/releases/latest/download/module.json`

## First-release scope

This release establishes the safe profile workflow and the policy engine. The
Mini Stats system-specific baseline profiles remain documented policy for a
future release; they are not automatically enforced yet.
