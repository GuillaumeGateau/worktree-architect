const CURSOR_API_BASE = "https://api.cursor.com";

export type FeatureStepBrief = { title: string; summary?: string; ordinal: number };

export type BuildPromptInput = {
  featureId: string;
  title: string;
  summary?: string;
  steps: FeatureStepBrief[];
  links?: Record<string, unknown>;
  activityBaseUrl?: string;
  repoContext?: string;
  fileContentContext?: string;
};

export function buildCloudAgentPrompt(input: BuildPromptInput): string {
  const ordered = [...input.steps].sort((a, b) => a.ordinal - b.ordinal);
  // Focus on the single first step — keep scope small so the agent commits and succeeds
  const focusStep = ordered[0];
  const remainingSteps = ordered.slice(1);

  const lines: string[] = [
    `# Your job: implement ONE task, commit and push — do not stop without committing`,
    ``,
    `You are a coding agent for Orchestration OS Feature \`${input.featureId}\`.`,
    `**You MUST make at least one git commit before you finish.** If you complete your task`,
    `without committing, this run is considered a failure.`,
    ``,
    `## The task you must implement NOW`,
  ];

  if (focusStep) {
    lines.push(`**${focusStep.title}**`);
    if (focusStep.summary) lines.push(``, focusStep.summary);
  } else {
    lines.push(input.title);
    if (input.summary) lines.push(``, input.summary);
  }

  lines.push(
    ``,
    `## How to work`,
    `1. Read the existing code in the relevant files (listed below).`,
    `2. Implement the task above — make targeted, focused edits.`,
    `3. **Commit after every file you change** (\`git add -A && git commit -m "feat: <what you did>"\`).`,
    `4. Push your branch when done (\`git push -u origin HEAD\`).`,
    `5. Do NOT implement future steps — scope strictly to the task above.`,
    ``
  );

  const targetPath = (input.links?.targetPath as string | undefined) ?? "";
  if (targetPath) {
    lines.push(`## Target directory: \`${targetPath}\``);
    lines.push(`Edit files inside \`${targetPath}\`. Do not modify files outside this directory unless strictly required.`);
    lines.push(``);
  }

  if (input.fileContentContext) {
    lines.push(`## Current content of files you need to edit`, input.fileContentContext, ``);
  } else if (input.repoContext) {
    lines.push(`## Relevant existing files`, "```", input.repoContext, "```", ``);
  }

  if (input.links && Object.keys(input.links).length > 0) {
    lines.push(`## Feature metadata (links)`, "```json", JSON.stringify(input.links, null, 2), "```", ``);
  }

  if (remainingSteps.length > 0) {
    lines.push(
      `## Future steps (do NOT implement these now)`,
      `These are planned for later agents — ignore them in this run:`,
      ...remainingSteps.map((s, i) => `${i + 2}. ${s.title}${s.summary ? ` — ${s.summary.slice(0, 120)}` : ""}`),
      ``
    );
  }

  lines.push(
    `## Reminder`,
    `- **Commit. Push. Done.** Even a partial implementation committed is better than nothing committed.`,
    `- Branch: \`${(input.links?.worktreeBranch as string | undefined) ?? "orch-feature-" + input.featureId}\``,
    ``
  );

  if (input.activityBaseUrl) {
    lines.push(
      `## Optional: report progress`,
      `POST activity to: \`${input.activityBaseUrl}/api/v1/features/${input.featureId}/activity\``,
      `Example: \`curl -s -X POST -H 'content-type: application/json' -d '{"kind":"agent","message":"…"}' "${input.activityBaseUrl}/api/v1/features/${input.featureId}/activity"\``,
      ``
    );
  }

  return lines.join("\n");
}

export type LaunchCloudAgentParams = {
  apiKey: string;
  repository: string;
  ref: string;
  model?: string;
  branchName?: string;
  promptText: string;
};

export async function launchCloudAgent(
  params: LaunchCloudAgentParams
): Promise<{ id: string; targetUrl: string; branchName?: string }> {
  const prompt: Record<string, unknown> = { text: params.promptText };
  if (params.model && params.model.length > 0 && params.model !== "default") {
    prompt.model = params.model;
  }
  const body: Record<string, unknown> = {
    prompt,
    source: {
      repository: params.repository,
      ref: params.ref,
    },
  };
  if (params.branchName) {
    body.target = { branchName: params.branchName };
  }
  const res = await fetch(`${CURSOR_API_BASE}/v0/agents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Cursor Cloud API POST /v0/agents ${res.status}: ${text.slice(0, 2000)}`);
  }
  const data = JSON.parse(text) as {
    id: string;
    target: { url: string; branchName?: string };
  };
  return {
    id: data.id,
    targetUrl: data.target.url,
    branchName: data.target.branchName,
  };
}

const TERMINAL_STATUSES = new Set(["FINISHED", "ERROR", "EXPIRED"]);

export async function getCloudAgentStatus(
  apiKey: string,
  agentId: string
): Promise<{ status: string; summary?: string }> {
  const res = await fetch(`${CURSOR_API_BASE}/v0/agents/${encodeURIComponent(agentId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Cursor Cloud API GET agent ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text) as { status: string; summary?: string };
  return { status: data.status, summary: data.summary };
}

export function isTerminalAgentStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

const pollTimers = new Map<string, ReturnType<typeof setInterval>>();

export function scheduleCursorAgentStatusPoll(opts: {
  featureId: string;
  agentId: string;
  apiKey: string;
  intervalMs: number;
  onUpdate: (status: string, summary?: string) => void;
  onTerminal: (status: string, summary?: string) => void;
}): void {
  const existing = pollTimers.get(opts.featureId);
  if (existing) clearInterval(existing);

  const tick = () => {
    void (async () => {
      try {
        const { status, summary } = await getCloudAgentStatus(opts.apiKey, opts.agentId);
        opts.onUpdate(status, summary);
        if (isTerminalAgentStatus(status)) {
          const t = pollTimers.get(opts.featureId);
          if (t) clearInterval(t);
          pollTimers.delete(opts.featureId);
          opts.onTerminal(status, summary);
        }
      } catch {
        /* transient network errors; next tick */
      }
    })();
  };

  tick();
  const timer = setInterval(tick, opts.intervalMs);
  pollTimers.set(opts.featureId, timer);
}

export function clearCursorAgentPoll(featureId: string): void {
  const t = pollTimers.get(featureId);
  if (t) {
    clearInterval(t);
    pollTimers.delete(featureId);
  }
}
