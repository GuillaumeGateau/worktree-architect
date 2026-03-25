#!/usr/bin/env bash
# Install project-agnostic Cursor rules, skills, and commands from this repo into ~/.cursor/
# Idempotent: safe to re-run; only updates files shipped in install/

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${CURSOR_HOME:-${HOME}/.cursor}"

RULES_SRC="${ROOT}/install/rules"
SKILLS_SRC="${ROOT}/install/skills"
CMDS_SRC="${ROOT}/install/commands"

mkdir -p "${DEST}/rules" "${DEST}/skills" "${DEST}/commands"

echo "orch-os: installing Cursor assets → ${DEST}"

shopt -s nullglob
copied_rules=0
for f in "${RULES_SRC}"/*.mdc; do
  cp -f "$f" "${DEST}/rules/"
  copied_rules=$((copied_rules + 1))
done

if command -v rsync >/dev/null 2>&1; then
  rsync -a "${SKILLS_SRC}/" "${DEST}/skills/"
else
  shopt -s nullglob
  for d in "${SKILLS_SRC}"/*; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    rm -rf "${DEST}/skills/${name}"
    cp -R "$d" "${DEST}/skills/"
  done
  shopt -u nullglob
fi
skill_count="$(find "${SKILLS_SRC}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"

copied_cmds=0
for f in "${CMDS_SRC}"/*.md; do
  cp -f "$f" "${DEST}/commands/"
  copied_cmds=$((copied_cmds + 1))
done
shopt -u nullglob

echo "orch-os: rules .mdc files copied: ${copied_rules}"
echo "orch-os: skill folders synced: ${skill_count} (under install/skills/)"
echo "orch-os: command .md files copied: ${copied_cmds}"
echo "orch-os: done. Restart Cursor if rules/commands do not refresh."
