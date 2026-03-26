import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./server.js";

describe("api", () => {
  let dir: string;
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CURSOR_API_KEY;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("health and create job", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
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

  it("validates job role/status in agent flow", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { role: "agent", contractVersion: 1 },
    });
    expect(created.statusCode).toBe(200);
    const job = JSON.parse(created.body) as { id: string; role?: string; status: string };
    expect(job.role).toBe("agent");
    expect(job.status).toBe("queued");

    const claimed = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${job.id}`,
      payload: { status: "claimed", role: "agent", workerId: "worker-1" },
    });
    expect(claimed.statusCode).toBe(200);
    const claimedBody = JSON.parse(claimed.body) as { status: string; role?: string; workerId?: string };
    expect(claimedBody.status).toBe("claimed");
    expect(claimedBody.role).toBe("agent");
    expect(claimedBody.workerId).toBe("worker-1");

    const badStatus = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${job.id}`,
      payload: { status: "done" },
    });
    expect(badStatus.statusCode).toBe(400);
    expect((JSON.parse(badStatus.body) as { error: string }).error).toBe("invalid_body");

    const badRoleOnCreate = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { role: "" },
    });
    expect(badRoleOnCreate.statusCode).toBe(400);
    expect((JSON.parse(badRoleOnCreate.body) as { error: string }).error).toBe("invalid_body");

    const badRoleOnPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${job.id}`,
      payload: { role: "" },
    });
    expect(badRoleOnPatch.statusCode).toBe(400);
    expect((JSON.parse(badRoleOnPatch.body) as { error: string }).error).toBe("invalid_body");

    await app.close();
  });

  it("smoke validates reviewer/tester role and status flow", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });

    const createReviewer = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { role: "reviewer", contractVersion: 1 },
    });
    expect(createReviewer.statusCode).toBe(200);
    const reviewer = JSON.parse(createReviewer.body) as { id: string; role?: string; status: string };
    expect(reviewer.role).toBe("reviewer");
    expect(reviewer.status).toBe("queued");

    const reviewerClaimed = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${reviewer.id}`,
      payload: { status: "claimed", workerId: "reviewer-1" },
    });
    expect(reviewerClaimed.statusCode).toBe(200);
    expect((JSON.parse(reviewerClaimed.body) as { status: string }).status).toBe("claimed");

    const reviewerRunning = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${reviewer.id}`,
      payload: { status: "running" },
    });
    expect(reviewerRunning.statusCode).toBe(200);
    expect((JSON.parse(reviewerRunning.body) as { status: string }).status).toBe("running");

    const reviewerSucceeded = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${reviewer.id}`,
      payload: { status: "succeeded" },
    });
    expect(reviewerSucceeded.statusCode).toBe(200);
    expect((JSON.parse(reviewerSucceeded.body) as { status: string }).status).toBe("succeeded");

    const reviewerInvalidAfterTerminal = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${reviewer.id}`,
      payload: { status: "running" },
    });
    expect(reviewerInvalidAfterTerminal.statusCode).toBe(400);
    expect((JSON.parse(reviewerInvalidAfterTerminal.body) as { error: string }).error).toBe("invalid_transition");

    const createTester = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { role: "tester", contractVersion: 1 },
    });
    expect(createTester.statusCode).toBe(200);
    const tester = JSON.parse(createTester.body) as { id: string; role?: string; status: string };
    expect(tester.role).toBe("tester");
    expect(tester.status).toBe("queued");

    const testerInvalidInitialJump = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "succeeded" },
    });
    expect(testerInvalidInitialJump.statusCode).toBe(400);
    expect((JSON.parse(testerInvalidInitialJump.body) as { error: string }).error).toBe("invalid_transition");

    const testerClaimed = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "claimed", workerId: "tester-1" },
    });
    expect(testerClaimed.statusCode).toBe(200);
    expect((JSON.parse(testerClaimed.body) as { status: string }).status).toBe("claimed");

    const testerRunning = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "running" },
    });
    expect(testerRunning.statusCode).toBe(200);
    expect((JSON.parse(testerRunning.body) as { status: string }).status).toBe("running");

    const testerBlocked = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "blocked", blockedReason: "waiting on reviewer feedback" },
    });
    expect(testerBlocked.statusCode).toBe(200);
    const blockedBody = JSON.parse(testerBlocked.body) as { status: string; blockedReason?: string };
    expect(blockedBody.status).toBe("blocked");
    expect(blockedBody.blockedReason).toBe("waiting on reviewer feedback");

    const testerRequeued = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "queued" },
    });
    expect(testerRequeued.statusCode).toBe(200);
    expect((JSON.parse(testerRequeued.body) as { status: string }).status).toBe("queued");

    const testerClaimedAgain = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "claimed", workerId: "tester-1" },
    });
    expect(testerClaimedAgain.statusCode).toBe(200);
    expect((JSON.parse(testerClaimedAgain.body) as { status: string }).status).toBe("claimed");

    const testerRunningAgain = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "running" },
    });
    expect(testerRunningAgain.statusCode).toBe(200);
    expect((JSON.parse(testerRunningAgain.body) as { status: string }).status).toBe("running");

    const testerSucceeded = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${tester.id}`,
      payload: { status: "succeeded" },
    });
    expect(testerSucceeded.statusCode).toBe(200);
    expect((JSON.parse(testerSucceeded.body) as { status: string }).status).toBe("succeeded");

    await app.close();
  });

  it("feature create, detail, start, activity", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: {
        title: "Test feature",
        status: "ready",
        summary: "Lifecycle check",
        steps: [
          { title: "Step A", summary: "First" },
          { title: "Step B", summary: "Second" },
        ],
      },
    });
    expect(create.statusCode).toBe(200);
    const created = JSON.parse(create.body) as { id: string; status: string };
    expect(created.status).toBe("ready");
    const id = created.id;

    const detail = await app.inject({ method: "GET", url: `/api/v1/features/${id}` });
    expect(detail.statusCode).toBe(200);
    const detailBody = JSON.parse(detail.body) as {
      feature: { status: string };
      steps: { title: string; status: string }[];
    };
    expect(detailBody.steps).toHaveLength(2);
    expect(detailBody.steps[0].status).toBe("pending");

    const start = await app.inject({ method: "POST", url: `/api/v1/features/${id}/start` });
    expect(start.statusCode).toBe(200);
    const started = JSON.parse(start.body) as { status: string; links?: { featureStartMode?: string } };
    expect(started.status).toBe("executing");
    expect(started.links?.featureStartMode).toBe("plan_only");

    const actAfterStart = await app.inject({
      method: "GET",
      url: `/api/v1/features/${id}/activity`,
    });
    expect(actAfterStart.statusCode).toBe(200);
    const actBody = JSON.parse(actAfterStart.body) as { activity: { message: string }[] };
    expect(actBody.activity.length).toBeGreaterThanOrEqual(1);
    expect(actBody.activity.some((a) => /Provisioning|Worktree|manual|Start pipeline/i.test(a.message))).toBe(
      true
    );

    const detail2 = await app.inject({ method: "GET", url: `/api/v1/features/${id}` });
    const steps2 = (JSON.parse(detail2.body) as { steps: { status: string }[] }).steps;
    expect(steps2[0].status).toBe("active");
    expect(steps2[1].status).toBe("pending");

    const act = await app.inject({
      method: "POST",
      url: `/api/v1/features/${id}/activity`,
      payload: { kind: "agent", message: "Milestone reached" },
    });
    expect(act.statusCode).toBe(200);
    const ev = JSON.parse(act.body) as { kind: string; message: string };
    expect(ev.kind).toBe("agent");

    const listAct = await app.inject({
      method: "GET",
      url: `/api/v1/features/${id}/activity`,
    });
    expect(listAct.statusCode).toBe(200);
    const acts = JSON.parse(listAct.body) as { activity: { message: string }[] };
    expect(acts.activity.length).toBeGreaterThan(0);
    expect(acts.activity.some((a) => a.message === "Milestone reached")).toBe(true);

    const summary = await app.inject({ method: "GET", url: "/api/v1/summary" });
    expect(summary.statusCode).toBe(200);
    const sum = JSON.parse(summary.body) as { featuresTotal?: number };
    expect(sum.featuresTotal).toBe(1);

    await app.close();
  });

  it("feature PATCH cannot set status to executing (must use POST start)", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: {
        title: "Patch trap",
        status: "ready",
        steps: [{ title: "S" }],
      },
    });
    const { id } = JSON.parse(create.body) as { id: string };
    const bad = await app.inject({
      method: "PATCH",
      url: `/api/v1/features/${id}`,
      payload: { status: "executing", links: { featureStartMode: "plan_only" } },
    });
    expect(bad.statusCode).toBe(400);
    const body = JSON.parse(bad.body) as { error: string };
    expect(body.error).toBe("use_post_start");

    const detail = await app.inject({ method: "GET", url: `/api/v1/features/${id}` });
    expect((JSON.parse(detail.body) as { feature: { status: string } }).feature.status).toBe("ready");

    await app.close();
  });

  it("feature start calls Cursor Cloud API when cursorCloudAgent configured", async () => {
    process.env.CURSOR_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : url.toString();
        if (u === "https://api.cursor.com/v0/agents" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              id: "bc_fixture",
              target: {
                url: "https://cursor.com/agents?id=bc_fixture",
                branchName: "orch-feature-test",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("unexpected", { status: 500 });
      })
    );

    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
cursorCloudAgent:
  enabled: true
  repository: "https://github.com/example/repo"
  ref: "main"
  pollStatus: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: { title: "Cloud test", status: "ready", steps: [{ title: "Do work" }] },
    });
    const { id } = JSON.parse(create.body) as { id: string };
    const start = await app.inject({ method: "POST", url: `/api/v1/features/${id}/start` });
    expect(start.statusCode).toBe(200);
    const body = JSON.parse(start.body) as {
      links?: {
        cursorAgentId?: string;
        cursorAgentUrl?: string;
        featureStartMode?: string;
      };
    };
    expect(body.links?.featureStartMode).toBe("cursor_cloud");
    expect(body.links?.cursorAgentId).toBe("bc_fixture");
    expect(body.links?.cursorAgentUrl).toContain("cursor.com");

    const listAct = await app.inject({ method: "GET", url: `/api/v1/features/${id}/activity` });
    const acts = JSON.parse(listAct.body) as { activity: { message: string }[] };
    expect(acts.activity.some((a) => a.message.includes("Launched Cursor Cloud Agent"))).toBe(true);

    expect(globalThis.fetch).toHaveBeenCalled();
    await app.close();
  });

  it("feature start logs error when cloud enabled but API key missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    dir = mkdtempSync(join(tmpdir(), "orch-api-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
cursorCloudAgent:
  enabled: true
  repository: "https://github.com/example/repo"
  ref: "main"
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: { title: "No key", status: "ready" },
    });
    const { id } = JSON.parse(create.body) as { id: string };
    const start = await app.inject({ method: "POST", url: `/api/v1/features/${id}/start` });
    expect(start.statusCode).toBe(200);
    const started = JSON.parse(start.body) as { links?: { featureStartMode?: string } };
    expect(started.links?.featureStartMode).toBe("cloud_missing_api_key");
    const listAct = await app.inject({ method: "GET", url: `/api/v1/features/${id}/activity` });
    const acts = JSON.parse(listAct.body) as { activity: { message: string; kind: string }[] };
    expect(acts.activity.some((a) => a.kind === "error" && a.message.includes("CURSOR_API_KEY"))).toBe(
      true
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it("feature start creates git worktree when cwd is a git repo", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-git-"));
    execFileSync("git", ["init"], { cwd: dir, encoding: "utf8" });
    execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    writeFileSync(join(dir, "README.md"), "# x\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
featureWorktree:
  enabled: true
  spawnDefaultHook: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: { title: "WT", status: "ready", steps: [{ title: "S1" }] },
    });
    const { id } = JSON.parse(create.body) as { id: string };
    const start = await app.inject({ method: "POST", url: `/api/v1/features/${id}/start` });
    expect(start.statusCode).toBe(200);
    const body = JSON.parse(start.body) as {
      links?: { worktreePath?: string; worktreeBranch?: string; featureStartMode?: string };
    };
    expect(body.links?.worktreePath).toBeTruthy();
    expect(body.links?.worktreeBranch).toMatch(/^orch-feature-/);
    expect(existsSync(body.links!.worktreePath!)).toBe(true);
    expect(body.links?.featureStartMode).toBe("local_worktree");

    const listAct = await app.inject({ method: "GET", url: `/api/v1/features/${id}/activity` });
    const acts = JSON.parse(listAct.body) as { activity: { message: string }[] };
    expect(acts.activity.some((a) => a.message.includes("git worktree"))).toBe(true);

    await app.close();
  });

  it("feature start auto-launches Cursor Cloud without cursorCloudAgent yaml when origin is GitHub", async () => {
    process.env.CURSOR_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : url.toString();
        if (u === "https://api.cursor.com/v0/agents" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              id: "auto_fixture",
              target: {
                url: "https://cursor.com/agents?id=auto_fixture",
                branchName: "orch-feature-auto",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("unexpected", { status: 500 });
      })
    );

    dir = mkdtempSync(join(tmpdir(), "orch-api-autocc-"));
    execFileSync("git", ["init"], { cwd: dir, encoding: "utf8" });
    execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    writeFileSync(join(dir, "README.md"), "# x\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    execFileSync(
      "git",
      ["remote", "add", "origin", "https://github.com/example/from-origin.git"],
      { cwd: dir }
    );

    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
featureWorktree:
  enabled: false
  spawnDefaultHook: false
`,
      "utf8"
    );

    const app = await buildServer({ cwd: dir });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: { title: "Auto CC", status: "ready", steps: [{ title: "Do" }] },
    });
    const { id } = JSON.parse(create.body) as { id: string };
    const start = await app.inject({ method: "POST", url: `/api/v1/features/${id}/start` });
    expect(start.statusCode).toBe(200);
    const body = JSON.parse(start.body) as {
      links?: {
        featureStartMode?: string;
        cursorAgentId?: string;
        cursorCloudAutoLaunched?: boolean;
      };
    };
    expect(body.links?.featureStartMode).toBe("cursor_cloud");
    expect(body.links?.cursorAgentId).toBe("auto_fixture");
    expect(body.links?.cursorCloudAutoLaunched).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
    await app.close();
  });

  it("persists per-task integration evidence metadata", async () => {
    dir = mkdtempSync(join(tmpdir(), "orch-api-tasks-"));
    writeFileSync(
      join(dir, "orchestrator.config.yaml"),
      `sqlitePath: ".orchestrator/test.db"
statusMdPath: ".orchestrator/STATUS.md"
autoCursorCloudAgentOnStart: false
`,
      "utf8"
    );
    const app = await buildServer({ cwd: dir });

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/features",
      payload: { title: "Task evidence", status: "ready", steps: [{ title: "S1" }] },
    });
    const { id: featureId } = JSON.parse(create.body) as { id: string };

    const seeded = await app.inject({
      method: "POST",
      url: `/api/v1/features/${featureId}/tasks`,
      payload: {
        tasks: [{ title: "Implement integration evidence persistence", summary: "Task summary" }],
      },
    });
    expect(seeded.statusCode).toBe(200);
    const seededBody = JSON.parse(seeded.body) as {
      tasks: Array<{
        id: string;
        integrationResult: string;
        integrationReason?: string;
        integrationDetail?: string;
        integrationRecordedAt?: string;
      }>;
    };
    expect(seededBody.tasks).toHaveLength(1);
    expect(seededBody.tasks[0].integrationResult).toBe("pending");
    expect(seededBody.tasks[0].integrationReason).toBe("task_seeded");
    expect(seededBody.tasks[0].integrationRecordedAt).toBeTruthy();

    const taskId = seededBody.tasks[0].id;
    const integrationRecordedAt = new Date().toISOString();
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/features/${featureId}/tasks/${taskId}`,
      payload: {
        status: "done",
        integrationResult: "integrated_completed",
        integrationReason: "merged_into_integration_branch",
        integrationDetail: "Merged origin/task-branch into orch-feature-int-123.",
        integrationRecordedAt,
      },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = JSON.parse(patched.body) as {
      integrationResult: string;
      integrationReason?: string;
      integrationDetail?: string;
      integrationRecordedAt?: string;
    };
    expect(patchedBody.integrationResult).toBe("integrated_completed");
    expect(patchedBody.integrationReason).toBe("merged_into_integration_branch");
    expect(patchedBody.integrationDetail).toContain("Merged origin/task-branch");
    expect(patchedBody.integrationRecordedAt).toBe(integrationRecordedAt);

    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/features/${featureId}/tasks`,
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = JSON.parse(listed.body) as {
      tasks: Array<{
        id: string;
        status: string;
        integrationResult: string;
        integrationReason?: string;
        integrationDetail?: string;
        integrationRecordedAt?: string;
      }>;
    };
    expect(listedBody.tasks).toHaveLength(1);
    expect(listedBody.tasks[0]).toMatchObject({
      id: taskId,
      status: "done",
      integrationResult: "integrated_completed",
      integrationReason: "merged_into_integration_branch",
      integrationDetail: "Merged origin/task-branch into orch-feature-int-123.",
      integrationRecordedAt,
    });

    await app.close();
  });
});
