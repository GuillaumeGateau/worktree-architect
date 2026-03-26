const base = "";

export type FeatureArchiveFilter = "active" | "archived" | "all";

function featureApiError(resource: string, status: number): Error {
  if (status === 404) {
    return new Error(
      `${resource}: API returned 404 — this server was built before Feature Runs. From the repo root run: npm run build && npm run orchestrator -- start (stop the old process first, or let start replace it).`
    );
  }
  return new Error(`${resource} ${status}`);
}

export async function fetchFeatures(
  archive: FeatureArchiveFilter = "active"
): Promise<import("./types").FeatureRow[]> {
  const q = new URLSearchParams({ archive });
  const r = await fetch(`${base}/api/v1/features?${q}`);
  if (!r.ok) throw featureApiError("features", r.status);
  const data = (await r.json()) as { features: import("./types").FeatureRow[] };
  return data.features;
}

export async function fetchFeatureDetail(
  id: string
): Promise<import("./types").FeatureDetailPayload> {
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}`);
  if (!r.ok) throw featureApiError("feature", r.status);
  return r.json() as Promise<import("./types").FeatureDetailPayload>;
}

export async function fetchFeatureActivity(
  id: string
): Promise<import("./types").ActivityEventRow[]> {
  const q = new URLSearchParams({ limit: "500" });
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/activity?${q}`);
  if (!r.ok) throw featureApiError("activity", r.status);
  const data = (await r.json()) as { activity: import("./types").ActivityEventRow[] };
  return data.activity;
}

export async function postFeatureStart(id: string): Promise<void> {
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/start`, {
    method: "POST",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `start ${r.status}`);
  }
}

export async function postFeatureCancel(id: string): Promise<void> {
  const r = await fetch(`${base}/api/v1/features/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `cancel ${r.status}`);
  }
}

export async function fetchJobs(): Promise<import("./types").JobRow[]> {
  const r = await fetch(`${base}/api/v1/jobs`);
  if (!r.ok) throw new Error(`jobs ${r.status}`);
  const data = (await r.json()) as { jobs: import("./types").JobRow[] };
  return data.jobs;
}

export async function fetchSummary(): Promise<import("./types").Summary> {
  const r = await fetch(`${base}/api/v1/summary`);
  if (!r.ok) throw new Error(`summary ${r.status}`);
  return r.json() as Promise<import("./types").Summary>;
}

export async function patchJob(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const r = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `patch ${r.status}`);
  }
}

export function subscribeEvents(
  onMessage: (data: unknown) => void,
  onOpen?: () => void
): () => void {
  const es = new EventSource(`${base}/api/v1/events`);
  es.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      onMessage(ev.data);
    }
  };
  es.onopen = () => onOpen?.();
  return () => es.close();
}
