import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { InstanceFileSchema, type InstanceFile } from "@orch-os/core";

export function orchestratorDir(cwd: string): string {
  return join(cwd, ".orchestrator");
}

export function instancePath(cwd: string): string {
  return join(orchestratorDir(cwd), "instance.json");
}

export function readInstance(cwd: string): InstanceFile | undefined {
  const p = instancePath(cwd);
  if (!existsSync(p)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return InstanceFileSchema.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeInstance(cwd: string, data: InstanceFile): void {
  mkdirSync(orchestratorDir(cwd), { recursive: true });
  writeFileSync(instancePath(cwd), JSON.stringify(data, null, 2), "utf8");
}

export function clearInstance(cwd: string): void {
  const p = instancePath(cwd);
  if (existsSync(p)) unlinkSync(p);
}
