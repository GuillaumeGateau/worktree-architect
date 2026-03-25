import { execSync } from "node:child_process";

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function terminateGracefully(
  pid: number,
  timeoutMs = 1500
): Promise<void> {
  if (!isAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isAlive(pid)) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!isAlive(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
}

function spinWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy-wait only after best-effort port steal */
  }
}

/** Best-effort: SIGTERM listeners on a TCP port (darwin/linux). Use with --steal-port / env. */
export function stealPort(port: number): void {
  const platform = process.platform;
  try {
    if (platform === "darwin" || platform === "linux") {
      const out = execSync(`lsof -ti tcp:${port} || true`, { encoding: "utf8" }).trim();
      if (!out) return;
      const pids = new Set<number>();
      for (const line of out.split(/\n/)) {
        for (const tok of line.trim().split(/\s+/)) {
          const pid = Number(tok);
          if (Number.isFinite(pid) && pid > 0) pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
      spinWait(350);
    }
  } catch {
    /* ignore */
  }
}
