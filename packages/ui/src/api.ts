const base = "";

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
