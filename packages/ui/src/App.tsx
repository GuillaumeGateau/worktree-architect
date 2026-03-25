import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nextStatuses, type JobStatus } from "@orch-os/core";
import { fetchJobs, fetchSummary, patchJob, subscribeEvents } from "./api";
import { FeaturesPanel } from "./FeaturesPanel";
import type { JobRow, Summary } from "./types";

function patchForTransition(
  from: string,
  to: JobStatus
): Record<string, unknown> {
  const body: Record<string, unknown> = { status: to };
  if (to === "claimed") body.workerId = "dashboard";
  if (from === "claimed" && to === "running") body.workerId = "dashboard";
  return body;
}

function labelForTransition(from: string, to: JobStatus): string {
  if (to === "claimed") return "Claim";
  if (to === "running") return "Start";
  if (to === "queued" && from === "claimed") return "Release";
  if (to === "blocked") return "Block";
  if (to === "succeeded") return "Done";
  if (to === "failed") return "Fail";
  if (to === "queued" && from === "blocked") return "Unblock";
  return to;
}

function badgeClass(status: string): string {
  const s = status.toLowerCase();
  if (["queued", "claimed", "running", "succeeded", "failed", "blocked"].includes(s)) {
    return `badge ${s}`;
  }
  return "badge";
}

type MainTab = "features" | "jobs";

export default function App() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<MainTab>("features");
  const [featureSelectedId, setFeatureSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
    refetchInterval: live ? false : 8000,
  });

  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
    refetchInterval: live ? false : 8000,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["summary"] });
  }, [qc]);

  const invalidateFeatureQueries = useCallback(
    (featureId?: string) => {
      void qc.invalidateQueries({ queryKey: ["features"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      if (featureId) {
        void qc.invalidateQueries({ queryKey: ["feature", featureId] });
        void qc.invalidateQueries({ queryKey: ["feature", featureId, "activity"] });
      }
    },
    [qc]
  );

  useEffect(() => {
    const unsub = subscribeEvents(
      (msg) => {
        const m = msg as { type?: string; featureId?: string };
        if (m?.type === "job_created" || m?.type === "job_updated") {
          invalidate();
        }
        if (
          m?.type === "feature_created" ||
          m?.type === "feature_updated" ||
          m?.type === "step_updated" ||
          m?.type === "activity_appended"
        ) {
          invalidateFeatureQueries(m.featureId);
        }
      },
      () => setLive(true)
    );
    return unsub;
  }, [invalidate, invalidateFeatureQueries]);

  const summary = summaryQ.data as Summary | undefined;
  const jobs = (jobsQ.data as JobRow[] | undefined) ?? [];

  const runTransition = useCallback(
    async (jobId: string, from: string, to: JobStatus) => {
      setActionError(null);
      setBusyId(jobId);
      try {
        await patchJob(jobId, patchForTransition(from, to));
        invalidate();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [invalidate]
  );

  return (
    <div className="app">
      <header>
        <div>
          <h1>Orchestration OS</h1>
          <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            <strong>Feature runs</strong> — plan, then <strong>Start</strong> when ready.{" "}
            <strong>Jobs</strong> — classic queue (CLI <code className="mono">job patch</code> or
            buttons).
          </p>
          <nav className="main-tabs" aria-label="Primary">
            <button
              type="button"
              className={`tab-btn ${tab === "features" ? "active" : ""}`}
              onClick={() => setTab("features")}
            >
              Features
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === "jobs" ? "active" : ""}`}
              onClick={() => setTab("jobs")}
            >
              Jobs (legacy)
            </button>
          </nav>
        </div>
        <div className="live" aria-live="polite">
          <span className={`live-dot ${live ? "on" : ""}`} aria-hidden />
          {live ? "SSE connected" : "Connecting…"}
        </div>
      </header>

      {jobsQ.error && (
        <div className="error-banner" role="alert">
          Could not load jobs: {(jobsQ.error as Error).message}. Is the API running?
        </div>
      )}

      {actionError && (
        <div className="error-banner" role="alert">
          {actionError}
        </div>
      )}

      <section className="summary" aria-label="Summary">
        <div className="card">
          <div className="label">Feature runs</div>
          <div className="value">{summary?.featuresTotal ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Draft / ready</div>
          <div className="value">
            {(summary?.featuresByStatus?.draft ?? 0) +
              (summary?.featuresByStatus?.ready ?? 0)}
          </div>
        </div>
        <div className="card">
          <div className="label">Executing</div>
          <div className="value">{summary?.featuresByStatus?.executing ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Total jobs</div>
          <div className="value">{summary?.jobsTotal ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Workers</div>
          <div className="value">{summary?.activeWorkers ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Parallel cap</div>
          <div className="value">{summary?.maxParallelWorkers ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Queued</div>
          <div className="value">{summary?.byStatus?.queued ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Running</div>
          <div className="value">
            {(summary?.byStatus?.running ?? 0) + (summary?.byStatus?.claimed ?? 0)}
          </div>
        </div>
      </section>

      {tab === "features" ? (
        <FeaturesPanel
          live={live}
          selectedId={featureSelectedId}
          onSelectId={setFeatureSelectedId}
        />
      ) : (
        <section aria-label="Jobs">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--muted)" }}>
            Jobs
          </h2>
          {jobs.length === 0 && !jobsQ.isLoading ? (
            <div className="table-wrap empty">No jobs yet. Use the CLI to enqueue work.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                    <th scope="col">Role</th>
                    <th scope="col">Branch</th>
                    <th scope="col">Contract</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} tabIndex={0}>
                      <td className="mono">{j.id}</td>
                      <td>
                        <span className={badgeClass(j.status)}>{j.status}</span>
                      </td>
                      <td>
                        <div className="job-actions">
                          {nextStatuses(j.status as JobStatus).map((to) => (
                            <button
                              key={to}
                              type="button"
                              className="btn-sm"
                              disabled={busyId === j.id}
                              onClick={() => void runTransition(j.id, j.status, to)}
                            >
                              {labelForTransition(j.status, to)}
                            </button>
                          ))}
                          {nextStatuses(j.status as JobStatus).length === 0 && (
                            <span className="muted-sm">—</span>
                          )}
                        </div>
                      </td>
                      <td>{j.role ?? "—"}</td>
                      <td className="mono">{j.branch ?? "—"}</td>
                      <td>v{j.contractVersion}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {new Date(j.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
