import type { JobStatus } from "./schemas.js";

const terminal: JobStatus[] = ["succeeded", "failed"];

export function isTerminalStatus(s: JobStatus): boolean {
  return terminal.includes(s) || s === "blocked";
}

const allowed: Record<JobStatus, JobStatus[]> = {
  queued: ["claimed", "blocked"],
  claimed: ["running", "queued", "blocked"],
  running: ["succeeded", "failed", "blocked"],
  succeeded: [],
  failed: [],
  blocked: ["queued"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return allowed[from]?.includes(to) ?? false;
}

export function nextStatuses(from: JobStatus): JobStatus[] {
  return allowed[from] ?? [];
}
