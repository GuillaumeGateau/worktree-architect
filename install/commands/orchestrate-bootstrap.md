# /orchestrate-bootstrap

Apply the **orchestrator-bootstrap** skill from `~/.cursor/skills/orchestrator-bootstrap/SKILL.md`.

1. Scan the open workspace for stack signals (Node, Python, Go, CI).
2. Propose the minimal file set: `orchestrator.config.yaml`, `.gitignore` entries, `package.json` script `orchestrator:start`, optional Redis compose **only** if the user asked for scale-out.
3. List every file you will create or modify; wait for explicit confirmation unless the user already asked you to apply changes without asking.

After changes, tell the user to run:

```bash
npm run orchestrator:start
# or: npx orchestrator start
```

Then open the printed **dashboard URL**.
