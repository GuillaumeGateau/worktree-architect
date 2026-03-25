# Cursor install bundle (`install/`)

Project-agnostic **rules**, **skills**, and **slash commands** for Cursor. These are **not** published via npm; they are copied into `~/.cursor/`.

## Full instructions

See **[docs/CURSOR_GLOBAL_INSTALL.md](../docs/CURSOR_GLOBAL_INSTALL.md)** for:

- What gets installed and where
- **One-command install** (`scripts/install-cursor-global.sh` or `npm run install:cursor-global`)
- How to ask Cursor to run the installer for you
- Windows notes

## Quick manual copy (alternative)

```bash
cp install/rules/*.mdc ~/.cursor/rules/
rsync -a install/skills/ ~/.cursor/skills/
cp install/commands/*.md ~/.cursor/commands/
```

Restart Cursor after installing.
