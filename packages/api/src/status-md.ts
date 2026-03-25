import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { JobEnvelope } from "@orch-os/core";

export function writeStatusMd(path: string, jobs: JobEnvelope[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    "# Orchestration status",
    "",
    `Last update: ${new Date().toISOString()}`,
    "",
    "| id | status | role | branch | contract |",
    "|----|--------|------|--------|----------|",
    ...jobs.slice(0, 50).map(
      (j) =>
        `| ${j.id} | ${j.status} | ${j.role ?? ""} | ${j.branch ?? ""} | v${j.contractVersion} |`
    ),
    "",
  ];
  writeFileSync(path, lines.join("\n"), "utf8");
}
