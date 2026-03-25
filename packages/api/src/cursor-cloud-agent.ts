const CURSOR_API_BASE = "https://api.cursor.com";

export type FeatureStepBrief = { title: string; summary?: string; ordinal: number };

export type BuildPromptInput = {
  featureId: string;
  title: string;
  summary?: string;
  steps: FeatureStepBrief[];
  links?: Record<string, unknown>;
  activityBaseUrl?: string;
};

export function buildCloudAgentPrompt(input: BuildPromptInput): string {
  const lines: string[] = [
    `You are working on Orchestration OS Feature Run id=${input.featureId}.`,
    "",
    `## Title`,
    input.title,
    "",
  ];
  if (input.summary) {
    lines.push("## Summary", input.summary, "");
  }
  lines.push(
    "## Autonomous execution (required)",
    "Implement this feature without waiting for the human to click anything in the orchestrator UI.",
    "Work through the plan steps in order. When `links.targetPath` is set (e.g. `test-apps/my-slug`), create and edit files under that path in the repository.",
    "Commit your changes on the agent branch as you make progress.",
    ""
  );
  if (input.links && Object.keys(input.links).length > 0) {
    lines.push("## Metadata (links JSON)", JSON.stringify(input.links, null, 2), "");
  }
  lines.push("## Plan steps (implement in order; update repo accordingly)", "");
  const ordered = [...input.steps].sort((a, b) => a.ordinal - b.ordinal);
  ordered.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title}${s.summary ? ` — ${s.summary}` : ""}`);
  });
  lines.push(
    "",
    "## Reporting (optional)",
    "If the orchestrator HTTP API is reachable from your environment, you may POST activity with:",
    "`orchestrator feature activity <featureId> --kind agent -m \"…\"`",
    ""
  );
  if (input.activityBaseUrl) {
    lines.push(
      `Base URL for API (e.g. tunneled): ${input.activityBaseUrl}`,
      "Example: curl -s -X POST -H 'content-type: application/json' -d '{\"kind\":\"agent\",\"message\":\"…\"}' \\",
      `  "${input.activityBaseUrl}/api/v1/features/${input.featureId}/activity"`,
      ""
    );
  } else {
    lines.push(
      "(No ORCHESTRATOR_ACTIVITY_BASE_URL was set on the server — localhost APIs are usually not reachable from Cursor Cloud; rely on git commits and the Cursor agent UI.)",
      ""
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
