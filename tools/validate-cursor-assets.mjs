import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(root, "install", "skills");

function walkSkills(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkSkills(p, acc);
    else if (name === "SKILL.md") acc.push(p);
  }
  return acc;
}

const skills = walkSkills(skillsRoot);
let errors = 0;

for (const file of skills) {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith("---")) {
    console.error("Missing frontmatter:", file);
    errors++;
    continue;
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    console.error("Invalid frontmatter:", file);
    errors++;
    continue;
  }
  const fm = text.slice(4, end);
  const nameM = fm.match(/^name:\s*(.+)$/m);
  const descM = fm.match(/^description:\s*(.+)$/m);
  if (!nameM || !descM) {
    console.error("name/description required:", file);
    errors++;
    continue;
  }
  const n = nameM[1].trim();
  if (n.length === 0 || n.length > 64) {
    console.error("Bad skill name length:", file, n);
    errors++;
  }
}

if (errors) {
  console.error(`validate-cursor-assets: ${errors} error(s)`);
  process.exit(1);
}
console.log("validate-cursor-assets: ok", skills.length, "SKILL.md files");
