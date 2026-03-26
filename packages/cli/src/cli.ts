#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env") });
import { randomBytes } from "node:crypto";
import { Command } from "commander";
import YAML from "yaml";
import { CreateFeatureBodySchema } from "@orch-os/core";
import {
  buildServer,
  loadOrchestratorConfig,
  resolveFeatureWorktree,
  resolveGitRepositoryRoot,
} from "@orch-os/api";
import {
  readInstance,
  writeInstance,
  clearInstance,
  orchestratorDir,
  instancePath,
} from "./instance-file.js";
import { isAlive, terminateGracefully } from "./process-kill.js";
import { pickListenPort } from "./port.js";

function cwd(): string {
  return process.cwd();
}

/** Repo root for DB, config, instance.json, and Feature Start git operations. */
function orchestratorRoot(): string {
  return resolveGitRepositoryRoot(cwd());
}

async function cmdStart(opts: { stealPort: boolean; port?: string }) {
  const root = orchestratorRoot();
  const startedFrom = cwd();
  if (root !== startedFrom) {
    console.error(
      `orchestrator: using git repo root ${root}\n(orchestrator was started from ${startedFrom}; worktree + scripts resolve from repo root)`
    );
  }
  const prev = readInstance(root);
  if (prev?.pid && isAlive(prev.pid)) {
    console.error(`orchestrator: stopping previous instance (pid ${prev.pid})…`);
    await terminateGracefully(prev.pid);
  }
  if (prev && (!prev.pid || !isAlive(prev.pid))) {
    clearInstance(root);
  }

  const steal =
    opts.stealPort || process.env.ORCHESTRATOR_STEAL_PORT === "1";
  const preferred = opts.port ? Number(opts.port) : undefined;
  const port = await pickListenPort({ preferred, stealPort: steal });

  const apiKey = process.env.ORCHESTRATOR_API_KEY;
  const app = await buildServer({ cwd: root, apiKey });

  await app.listen({ port, host: "127.0.0.1" });
  const baseUrl = `http://127.0.0.1:${port}`;
  const instanceToken = randomBytes(16).toString("hex");
  writeInstance(root, {
    baseUrl,
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    instanceToken,
    apiKey,
  });

  console.log(`orchestrator: listening at ${baseUrl}`);
  console.log(`orchestrator: dashboard ${baseUrl}/`);
  console.log(`orchestrator: run \`orchestrator url\` (from this repo) for agents`);

  const shutdown = async () => {
    try {
      await app.close();
    } finally {
      clearInstance(root);
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await new Promise<void>(() => {
    /* keep process alive until signal */
  });
}

function cmdUrl(): void {
  const inst = readInstance(orchestratorRoot());
  if (!inst) {
    console.error("orchestrator: no instance.json — start the server first");
    process.exit(1);
  }
  if (!isAlive(inst.pid)) {
    console.error("orchestrator: recorded pid is not running");
    process.exit(1);
  }
  process.stdout.write(`${inst.baseUrl}\n`);
}

async function cmdDoctor(): Promise<void> {
  const root = orchestratorRoot();
  const startedFrom = cwd();
  if (root !== startedFrom) {
    console.log(`orchestrator: cwd ${startedFrom} → git root ${root}`);
  }
  const inst = readInstance(root);
  if (!inst) {
    console.log("orchestrator: no instance.json (server not started)");
    process.exit(0);
    return;
  }
  if (!isAlive(inst.pid)) {
    console.log("orchestrator: instance.json present but pid not running");
    process.exit(1);
    return;
  }
  const r = await fetch(new URL("/api/v1/health", inst.baseUrl), {
    headers: headersFor(),
  });
  if (!r.ok) {
    console.error("orchestrator: health check failed", r.status);
    process.exit(1);
    return;
  }
  console.log("orchestrator: ok", await r.json());

  const feat = await fetch(new URL("/api/v1/features", inst.baseUrl), {
    headers: headersFor(),
  });
  if (feat.status === 404) {
    console.error(
      "orchestrator: Feature Runs API missing (GET /api/v1/features → 404). Rebuild packages and restart:\n  npm run build && npm run orchestrator -- start"
    );
    process.exit(1);
    return;
  }
  if (!feat.ok) {
    console.error("orchestrator: features check failed", feat.status);
    process.exit(1);
    return;
  }
  console.log("orchestrator: feature API ok");

  const cfg = loadOrchestratorConfig(root);
  const fw = resolveFeatureWorktree(cfg);
  console.log(
    `orchestrator: Feature Start worktree — ${fw.enabled ? `enabled (root ${fw.root})` : "disabled"}; default hook ${fw.spawnDefaultHook ? "on" : "off"}`
  );
  console.log(
    `orchestrator: Auto Cursor Cloud on Start — ${cfg.autoCursorCloudAgentOnStart !== false ? "on (when CURSOR_API_KEY + GitHub origin)" : "off"}`
  );
  const cc = cfg.cursorCloudAgent;
  const keyEnv = cc?.apiKeyEnv ?? "CURSOR_API_KEY";
  if (cc?.enabled && cc.repository) {
    const hasKey = Boolean(process.env[keyEnv]?.trim());
    console.log(
      `orchestrator: Cursor Cloud Agent on Start — ${hasKey ? "API key present" : `missing env ${keyEnv}`} (repo ${cc.repository})`
    );
  } else if (cfg.featureStartCommand) {
    console.log("orchestrator: custom featureStartCommand configured (runs on Feature Start)");
  } else if (!fw.spawnDefaultHook) {
    console.log(
      "orchestrator: spawnDefaultHook is false and no featureStartCommand — only worktree/DB unless cloud is enabled"
    );
  }
}

function cmdInit(withRedis: boolean): void {
  const root = cwd();
  const cfgPath = join(root, "orchestrator.config.yaml");
  if (existsSync(cfgPath)) {
    console.error("orchestrator: orchestrator.config.yaml already exists");
    process.exit(1);
    return;
  }
  const body = `# Orchestration OS — project config
maxParallelWorkers: 8
testCommand: "npm test"
lintCommand: "npm run lint"
sqlitePath: ".orchestrator/orchestrator.db"
statusMdPath: ".orchestrator/STATUS.md"
# Optional Feature Start automation — see docs/FEATURE_EXECUTION.md in orch-os
# cursorCloudAgent:
#   enabled: true
#   repository: "https://github.com/org/repo"
#   ref: "main"
`;
  writeFileSync(cfgPath, body, "utf8");
  mkdirSync(orchestratorDir(root), { recursive: true });
  ensureGitignore(root);
  console.log("orchestrator: wrote orchestrator.config.yaml and .orchestrator/");
  if (withRedis) {
    const composePath = join(root, "docker-compose.orchestrator.yml");
    const c = `services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`;
    writeFileSync(composePath, c, "utf8");
    console.log("orchestrator: wrote docker-compose.orchestrator.yml (Redis opt-in)");
  }
}

function ensureGitignore(root: string): void {
  const gi = join(root, ".gitignore");
  const lines = [
    "",
    "# Orchestration OS",
    ".orchestrator/instance.json",
    ".orchestrator/*.db",
    ".orchestrator/*.db-wal",
    ".orchestrator/*.db-shm",
    ".orchestrator/logs/",
  ];
  if (!existsSync(gi)) {
    writeFileSync(gi, lines.join("\n").trimStart() + "\n", "utf8");
    return;
  }
  const cur = readFileSync(gi, "utf8");
  if (cur.includes(".orchestrator/instance.json")) return;
  appendFileSync(gi, lines.join("\n") + "\n", "utf8");
}

function resolveBaseUrl(flag?: string): string {
  if (flag) return flag.replace(/\/$/, "");
  const inst = readInstance(orchestratorRoot());
  if (inst?.baseUrl) return inst.baseUrl.replace(/\/$/, "");
  if (process.env.ORCHESTRATOR_BASE_URL)
    return process.env.ORCHESTRATOR_BASE_URL.replace(/\/$/, "");
  throw new Error("Set --base-url, instance.json (orchestrator start), or ORCHESTRATOR_BASE_URL");
}

function headersFor(): Record<string, string> {
  const inst = readInstance(orchestratorRoot());
  const key = process.env.ORCHESTRATOR_API_KEY ?? inst?.apiKey;
  return key ? { "x-api-key": key } : {};
}

type DiagReport = {
  timestamp: string;
  cwd: string;
  node: string;
  platform: string;
  config: {
    path: string;
    exists: boolean;
  };
  orchestratorDir: {
    path: string;
    exists: boolean;
  };
  instance: {
    path: string;
    exists: boolean;
    parsed: boolean;
    pid?: number;
    pidAlive?: boolean;
    baseUrl?: string;
  };
  environment: {
    hasBaseUrlEnv: boolean;
    hasApiKeyEnv: boolean;
  };
  health: {
    checked: boolean;
    baseUrl?: string;
    ok?: boolean;
    status?: number;
    body?: unknown;
    error?: string;
  };
};

async function cmdDiag(opts: { baseUrl?: string }): Promise<void> {
  const root = cwd();
  const cfgPath = join(root, "orchestrator.config.yaml");
  const orcDir = orchestratorDir(root);
  const instPath = instancePath(root);
  const inst = readInstance(root);
  const baseUrl =
    opts.baseUrl?.replace(/\/$/, "") ??
    inst?.baseUrl?.replace(/\/$/, "") ??
    process.env.ORCHESTRATOR_BASE_URL?.replace(/\/$/, "");
  const report: DiagReport = {
    timestamp: new Date().toISOString(),
    cwd: root,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    config: {
      path: cfgPath,
      exists: existsSync(cfgPath),
    },
    orchestratorDir: {
      path: orcDir,
      exists: existsSync(orcDir),
    },
    instance: {
      path: instPath,
      exists: existsSync(instPath),
      parsed: Boolean(inst),
      pid: inst?.pid,
      pidAlive: inst?.pid ? isAlive(inst.pid) : undefined,
      baseUrl: inst?.baseUrl,
    },
    environment: {
      hasBaseUrlEnv: Boolean(process.env.ORCHESTRATOR_BASE_URL),
      hasApiKeyEnv: Boolean(process.env.ORCHESTRATOR_API_KEY),
    },
    health: {
      checked: false,
      baseUrl,
    },
  };

  if (baseUrl) {
    report.health.checked = true;
    try {
      const r = await fetch(new URL("/api/v1/health", baseUrl), {
        headers: headersFor(),
      });
      report.health.status = r.status;
      report.health.ok = r.ok;
      const text = await r.text();
      try {
        report.health.body = JSON.parse(text);
      } catch {
        report.health.body = text;
      }
    } catch (err) {
      report.health.ok = false;
      report.health.error = err instanceof Error ? err.message : String(err);
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function cmdEnqueue(
  specPath: string,
  baseFlag?: string,
  prSnippet?: boolean
): Promise<void> {
  const base = resolveBaseUrl(baseFlag);
  const raw = readFileSync(specPath, "utf8");
  const spec = YAML.parse(raw) as Record<string, unknown>;
  const r = await fetch(`${base}/api/v1/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headersFor() },
    body: JSON.stringify({
      contractVersion: spec.contractVersion,
      role: spec.role,
      payload: spec.payload,
      worktreePath: spec.worktreePath,
      branch: spec.branch,
    }),
  });
  if (!r.ok) {
    console.error("orchestrator: enqueue failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  const job = (await r.json()) as { id: string; status: string };
  console.log(JSON.stringify(job, null, 2));
  if (prSnippet) {
    console.log("\n--- PR snippet ---\n");
    console.log(`Orchestrator job: \`${job.id}\` (${job.status})`);
    console.log(`Dashboard: ${base}/`);
  }
}

const JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "blocked",
] as const;

async function cmdJobPatch(
  id: string,
  opts: {
    status: string;
    workerId?: string;
    blockedReason?: string;
    baseUrl?: string;
  }
): Promise<void> {
  if (!JOB_STATUSES.includes(opts.status as (typeof JOB_STATUSES)[number])) {
    console.error("orchestrator: invalid status", opts.status);
    process.exit(1);
    return;
  }
  const base = resolveBaseUrl(opts.baseUrl);
  const body: Record<string, unknown> = { status: opts.status };
  if (opts.workerId) body.workerId = opts.workerId;
  if (opts.blockedReason) body.blockedReason = opts.blockedReason;
  const r = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headersFor() },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("orchestrator: patch failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) {
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function cmdFeatureCreate(opts: {
  jsonFile?: string;
  title?: string;
  baseUrl?: string;
}): Promise<void> {
  let body: unknown;
  if (opts.jsonFile) {
    body = JSON.parse(readFileSync(opts.jsonFile, "utf8"));
  } else if (opts.title) {
    body = { title: opts.title, status: "draft" };
  } else {
    body = await readStdinJson();
  }
  const parsed = CreateFeatureBodySchema.safeParse(body);
  if (!parsed.success) {
    console.error("orchestrator: invalid feature body", parsed.error.flatten());
    process.exit(1);
    return;
  }
  const base = resolveBaseUrl(opts.baseUrl);
  const r = await fetch(`${base}/api/v1/features`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headersFor() },
    body: JSON.stringify(parsed.data),
  });
  if (!r.ok) {
    console.error("orchestrator: feature create failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureList(baseUrl?: string): Promise<void> {
  const base = resolveBaseUrl(baseUrl);
  const r = await fetch(`${base}/api/v1/features`, { headers: headersFor() });
  if (!r.ok) {
    console.error("orchestrator: feature list failed", r.status);
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureShow(id: string, baseUrl?: string): Promise<void> {
  const base = resolveBaseUrl(baseUrl);
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}`, {
    headers: headersFor(),
  });
  if (!r.ok) {
    console.error("orchestrator: feature show failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureStart(id: string, baseUrl?: string): Promise<void> {
  const base = resolveBaseUrl(baseUrl);
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/start`, {
    method: "POST",
    headers: headersFor(),
  });
  if (!r.ok) {
    console.error("orchestrator: feature start failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureCancel(id: string, baseUrl?: string): Promise<void> {
  const base = resolveBaseUrl(baseUrl);
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: headersFor(),
  });
  if (!r.ok) {
    console.error("orchestrator: feature cancel failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureActivity(
  id: string,
  opts: { message: string; kind?: string; stepId?: string; baseUrl?: string }
): Promise<void> {
  const base = resolveBaseUrl(opts.baseUrl);
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/activity`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headersFor() },
    body: JSON.stringify({
      kind: opts.kind ?? "note",
      message: opts.message,
      stepId: opts.stepId,
    }),
  });
  if (!r.ok) {
    console.error("orchestrator: activity failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdFeatureStepsPut(
  id: string,
  jsonFile: string,
  baseUrl?: string
): Promise<void> {
  const body = JSON.parse(readFileSync(jsonFile, "utf8")) as { steps?: unknown[] };
  const base = resolveBaseUrl(baseUrl);
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/steps`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headersFor() },
    body: JSON.stringify({ steps: body.steps ?? [] }),
  });
  if (!r.ok) {
    console.error("orchestrator: steps put failed", r.status, await r.text());
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(await r.json(), null, 2));
}

async function cmdWatch(baseFlag?: string): Promise<void> {
  const base = resolveBaseUrl(baseFlag);
  let prev = "";
  for (;;) {
    const r = await fetch(`${base}/api/v1/jobs`, { headers: headersFor() });
    if (!r.ok) {
      console.error("watch: failed", r.status);
      process.exit(1);
      return;
    }
    const data = (await r.json()) as { jobs: unknown[] };
    const snap = JSON.stringify(data.jobs);
    if (snap !== prev) {
      prev = snap;
      console.log(new Date().toISOString(), data.jobs);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const program = new Command();
program.name("orchestrator").description("Orchestration OS CLI");

program
  .command("start")
  .description("Start API + UI on a dynamic localhost port")
  .option("--steal-port", "Try to free the port via lsof (darwin/linux)")
  .option("--port <n>", "Preferred port (falls back if busy unless steal-port)")
  .action(async (opts) => {
    await cmdStart(opts);
  });

program.command("url").description("Print base URL from instance.json").action(cmdUrl);

program
  .command("doctor")
  .description("Check instance + API health")
  .action(async () => {
    await cmdDoctor();
  });

program
  .command("diag")
  .description("Print diagnostics for config, instance, env, and health")
  .option("--base-url <url>", "Override health probe base URL")
  .action(async (opts: { baseUrl?: string }) => {
    await cmdDiag(opts);
  });

program
  .command("init")
  .description("Write orchestrator.config.yaml and .orchestrator layout")
  .option("--with-redis-compose", "Also add docker-compose.orchestrator.yml")
  .action((opts: { withRedisCompose?: boolean }) => {
    cmdInit(Boolean(opts.withRedisCompose));
  });

const feature = program.command("feature").description("Feature runs (plan → Start → activity)");

feature
  .command("create")
  .description("Create feature from --json-file, --title, or stdin JSON")
  .option("--json-file <path>", "CreateFeatureBody JSON file")
  .option("--title <t>", "Minimal create: title only (draft)")
  .option("--base-url <url>")
  .action(async (opts) => {
    await cmdFeatureCreate(opts);
  });

feature
  .command("list")
  .option("--base-url <url>")
  .action(async (opts) => {
    await cmdFeatureList(opts.baseUrl);
  });

feature
  .command("show")
  .argument("<id>")
  .option("--base-url <url>")
  .action(async (id, opts) => {
    await cmdFeatureShow(id, opts.baseUrl);
  });

feature
  .command("start")
  .argument("<id>")
  .option("--base-url <url>")
  .action(async (id, opts) => {
    await cmdFeatureStart(id, opts.baseUrl);
  });

feature
  .command("cancel")
  .argument("<id>")
  .option("--base-url <url>")
  .action(async (id, opts) => {
    await cmdFeatureCancel(id, opts.baseUrl);
  });

feature
  .command("activity")
  .argument("<id>")
  .requiredOption("-m, --message <text>")
  .option("--kind <k>", "plan|agent|tool|error|merge|note", "note")
  .option("--step-id <id>")
  .option("--base-url <url>")
  .action(async (id, opts) => {
    await cmdFeatureActivity(id, {
      message: opts.message,
      kind: opts.kind,
      stepId: opts.stepId,
      baseUrl: opts.baseUrl,
    });
  });

feature
  .command("steps")
  .argument("<id>")
  .requiredOption("--json-file <path>", "JSON with { steps: [...] }")
  .option("--base-url <url>")
  .action(async (id, opts) => {
    await cmdFeatureStepsPut(id, opts.jsonFile, opts.baseUrl);
  });

const job = program.command("job").description("Job helpers");

job
  .command("enqueue")
  .argument("<spec>", "YAML spec file")
  .option("--base-url <url>", "API base (default: instance.json)")
  .option("--emit-pr-body-snippet", "Print markdown for PR description")
  .action(async (spec, opts) => {
    await cmdEnqueue(spec, opts.baseUrl, Boolean(opts.emitPrBodySnippet));
  });

job
  .command("watch")
  .option("--base-url <url>", "API base (default: instance.json)")
  .action(async (opts) => {
    await cmdWatch(opts.baseUrl);
  });

job
  .command("patch")
  .description("PATCH job status (queued → claimed → running → done)")
  .argument("<id>", "Job id")
  .requiredOption("--status <s>", "queued|claimed|running|succeeded|failed|blocked")
  .option("--worker-id <id>", "Set workerId (e.g. when claiming)")
  .option("--blocked-reason <text>", "When moving to blocked")
  .option("--base-url <url>", "API base (default: instance.json)")
  .action(async (id, opts) => {
    await cmdJobPatch(id, {
      status: opts.status,
      workerId: opts.workerId,
      blockedReason: opts.blockedReason,
      baseUrl: opts.baseUrl,
    });
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
