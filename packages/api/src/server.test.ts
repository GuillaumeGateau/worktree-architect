import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("api", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("health and create job", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"\nstatusMdPath: ".orchestrator/STATUS.md"\n`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    const jobRes = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { role: "be", contractVersion: 2 },
    });
    expect(jobRes.statusCode).toBe(200);
    const job = JSON.parse(jobRes.body) as { id: string; status: string };
    expect(job.status).toBe("queued");
    await app.close();
  });
});
