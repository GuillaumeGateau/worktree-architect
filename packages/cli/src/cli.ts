#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Command } from "commander";
import YAML from "yaml";
import { buildServer } from "@orch-os/api";
import {
  readInstance,
  writeInstance,
  clearInstance,
  orchestratorDir,
} from "./instance-file.js";
import { isAlive, terminateGracefully } from "./process-kill.js";
import { pickListenPort } from "./port.js";

function cwd(): string {
  return process.cwd();
}

async function cmdStart(opts: { stealPort: boolean; port?: string }) {
  const root = cwd();
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
  const inst = readInstance(cwd());
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
  const root = cwd();
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
  const inst = readInstance(cwd());
  if (inst?.baseUrl) return inst.baseUrl.replace(/\/$/, "");
  if (process.env.ORCHESTRATOR_BASE_URL)
    return process.env.ORCHESTRATOR_BASE_URL.replace(/\/$/, "");
  throw new Error("Set --base-url, instance.json (orchestrator start), or ORCHESTRATOR_BASE_URL");
}

function headersFor(): Record<string, string> {
  const inst = readInstance(cwd());
  const key = process.env.ORCHESTRATOR_API_KEY ?? inst?.apiKey;
  return key ? { "x-api-key": key } : {};
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
  .command("init")
  .description("Write orchestrator.config.yaml and .orchestrator layout")
  .option("--with-redis-compose", "Also add docker-compose.orchestrator.yml")
  .action((opts: { withRedisCompose?: boolean }) => {
    cmdInit(Boolean(opts.withRedisCompose));
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
