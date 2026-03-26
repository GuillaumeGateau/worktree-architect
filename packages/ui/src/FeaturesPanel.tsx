import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canCancelFeature, canStartFeature } from "@orch-os/core";
import type { FeatureStatus } from "@orch-os/core";
import {
  fetchFeatureActivity,
  fetchFeatureDetail,
  fetchFeatures,
  type FeatureListView,
  postFeatureArchive,
  postFeatureCancel,
  postFeatureStart,
  postFeatureUnarchive,
} from "./api";
import type { ActivityEventRow, FeatureRow, FeatureStepRow } from "./types";
import {
  chooseDefaultFeatureRunId,
  countRunningCloudAgents,
  deriveAgentStageState,
  deriveDeskState,
  deriveOfficeSceneState,
  deriveSceneRoleStatusLines,
  filterAndReverseActivity,
  sortStepsByOrdinal,
} from "./feature-view-utils";
import type { AgentStageFigure } from "./feature-view-utils";
import { DeskAgentAvatars } from "./DeskAgentAvatars";
import { FooA } from "./FooA";
import { FooB } from "./FooB";

const ACTIVITY_KINDS = ["plan", "agent", "tool", "error", "merge", "note"] as const;
const COUNTER_MISMATCH_PERSIST_MS = 10000;

function featureBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (
    ["draft", "ready", "executing", "completed", "failed", "cancelled"].includes(s)
  ) {
    return `badge feat-${s}`;
  }
  return "badge";
}

function stepClass(status: string): string {
  const s = status.toLowerCase();
  return `step-card step-${s}`;
}

function cursorAgentUrl(links: Record<string, unknown> | undefined): string | undefined {
  const u = links?.cursorAgentUrl;
  return typeof u === "string" && u.startsWith("http") ? u : undefined;
}

function cursorAgentStatus(links: Record<string, unknown> | undefined): string | undefined {
  const s = links?.cursorAgentStatus;
  return typeof s === "string" ? s : undefined;
}

/** Set by the API on Start so the UI can tell “cloud off” from “cloud failed”. */
function featureStartMode(links: Record<string, unknown> | undefined): string | undefined {
  const m = links?.featureStartMode;
  return typeof m === "string" ? m : undefined;
}

function worktreePath(links: Record<string, unknown> | undefined): string | undefined {
  const p = links?.worktreePath;
  return typeof p === "string" && p.length > 0 ? p : undefined;
}

function worktreeBranch(links: Record<string, unknown> | undefined): string | undefined {
  const b = links?.worktreeBranch;
  return typeof b === "string" && b.length > 0 ? b : undefined;
}

/** Newest-first activity (for “Now” strip), ignoring kind filter. */
function latestActivityRows(activity: ActivityEventRow[], max: number): ActivityEventRow[] {
  const sorted = [...activity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return sorted.slice(0, max);
}

function figureDisplayName(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Merge auditor";
  if (figure.taskOrdinal !== undefined) return `Task ${figure.taskOrdinal}`;
  return "Task agent";
}

function motionZoneForFigure(figure: AgentStageFigure): string {
  return figure.role === "auditor" ? "review" : "desk";
}

function toPercent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

function zoneStyle(kind: string): { borderColor: string; background: string } {
  if (kind === "desk") {
    return {
      borderColor: "rgba(93, 111, 137, 0.45)",
      background: "rgba(93, 111, 137, 0.1)",
    };
  }
  if (kind === "hub") {
    return {
      borderColor: "rgba(13, 116, 216, 0.5)",
      background: "rgba(13, 116, 216, 0.12)",
    };
  }
  if (kind === "review") {
    return {
      borderColor: "rgba(143, 69, 179, 0.5)",
      background: "rgba(143, 69, 179, 0.13)",
    };
  }
  return {
    borderColor: "rgba(17, 123, 86, 0.5)",
    background: "rgba(17, 123, 86, 0.12)",
  };
}

function figureStateClassForLifecycle(lifecycle: string): "idle" | "working" | "done" {
  if (lifecycle === "active" || lifecycle === "review" || lifecycle === "testing") return "working";
  if (lifecycle === "done" || lifecycle === "failed" || lifecycle === "cancelled") return "done";
  return "idle";
}

function formatDetailsJson(details: Record<string, unknown> | undefined): string | null {
  if (!details || Object.keys(details).length === 0) return null;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function isFeatureArchived(feature: FeatureRow | undefined): boolean {
  if (!feature) return false;
  if (feature.archived === true) return true;
  if (typeof feature.archivedAt === "string" && feature.archivedAt.length > 0) return true;
  const links = feature.links;
  if (!links) return false;
  return (
    links.archived === true ||
    (typeof links.archivedAt === "string" && links.archivedAt.length > 0)
  );
}

export function FeaturesPanel(props: {
  live: boolean;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}) {
  const featureRunsRailId = "feature-runs-rail";
  const qc = useQueryClient();
  const { selectedId, onSelectId: setSelectedId } = props;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activityKind, setActivityKind] = useState<string>("all");
  const [featureListView, setFeatureListView] = useState<FeatureListView>("active");
  const [isRailCollapsed, setIsRailCollapsed] = useState(true);

  const featuresQ = useQuery({
    queryKey: ["features", featureListView],
    queryFn: () => fetchFeatures(featureListView),
    refetchInterval: props.live ? false : 8000,
  });

  const detailQ = useQuery({
    queryKey: ["feature", selectedId],
    queryFn: () => fetchFeatureDetail(selectedId!),
    enabled: Boolean(selectedId),
  });

  const detail = detailQ.data;
  const featureStatusForPoll = detail?.feature.status;

  const activityQ = useQuery({
    queryKey: ["feature", selectedId, "activity"],
    queryFn: () => fetchFeatureActivity(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: featureStatusForPoll === "executing" ? 2500 : false,
  });

  const invalidateFeatures = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["features"] });
  }, [qc]);

  const invalidateSelected = useCallback(
    (fid: string) => {
      void qc.invalidateQueries({ queryKey: ["feature", fid] });
      void qc.invalidateQueries({ queryKey: ["feature", fid, "activity"] });
    },
    [qc]
  );

  const rawFeatures = (featuresQ.data as FeatureRow[] | undefined) ?? [];
  const activity = (activityQ.data as ActivityEventRow[] | undefined) ?? [];
  const features = useMemo(
    () =>
      rawFeatures.filter((feature) =>
        featureListView === "archived" ? isFeatureArchived(feature) : !isFeatureArchived(feature)
      ),
    [featureListView, rawFeatures]
  );

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedId),
    [features, selectedId]
  );

  useEffect(() => {
    if (!selectedId || featuresQ.isLoading) return;
    if (!features.some((feature) => feature.id === selectedId)) {
      setSelectedId(null);
    }
  }, [features, featuresQ.isLoading, selectedId, setSelectedId]);

  useEffect(() => {
    if (selectedId) return;
    const defaultFeatureId = chooseDefaultFeatureRunId(features);
    if (defaultFeatureId) setSelectedId(defaultFeatureId);
  }, [features, selectedId, setSelectedId]);

  const filteredActivity = useMemo(
    () => filterAndReverseActivity(activity, activityKind),
    [activity, activityKind]
  );

  const sortedSteps = useMemo(
    () => sortStepsByOrdinal(detail?.steps ?? []),
    [detail?.steps]
  );

  const activeStep = useMemo(
    () => sortedSteps.find((s) => s.status === "active"),
    [sortedSteps]
  );

  const deskState = useMemo(() => deriveDeskState(activity, sortedSteps), [activity, sortedSteps]);
  const nowActivity = useMemo(() => latestActivityRows(activity, 3), [activity]);
  const stageState = useMemo(() => deriveAgentStageState(activity, sortedSteps), [activity, sortedSteps]);
  const deskFigures = stageState.figures;
  const figureById = useMemo(
    () => new Map(deskFigures.map((figure) => [figure.figureId, figure] as const)),
    [deskFigures]
  );
  const officeScene = useMemo(() => {
    const deskCount = Math.max(sortedSteps.length, deskFigures.length, 1);
    const deskColumns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(deskCount))));
    return deriveOfficeSceneState(stageState.figures, {
      deskCount,
      deskColumns,
    });
  }, [stageState.figures, sortedSteps.length]);
  const officeZoneById = useMemo(() => {
    const map = new Map<string, (typeof officeScene.layout.desks)[number] | typeof officeScene.layout.zones.hub>();
    for (const desk of officeScene.layout.desks) map.set(desk.id, desk);
    map.set(officeScene.layout.zones.hub.id, officeScene.layout.zones.hub);
    map.set(officeScene.layout.zones.review.id, officeScene.layout.zones.review);
    map.set(officeScene.layout.zones.test.id, officeScene.layout.zones.test);
    return map;
  }, [officeScene.layout.desks, officeScene.layout.zones.hub, officeScene.layout.zones.review, officeScene.layout.zones.test]);
  const highlightedTransitPathIds = useMemo(() => {
    const set = new Set<string>();
    for (const placement of officeScene.placements) {
      for (const pathId of placement.transitPathIds) set.add(pathId);
    }
    return set;
  }, [officeScene.placements]);
  const officeFigures = officeScene.placements;
  const officeTrackHeight = Math.max(180, officeScene.layout.bounds.height);
  const sceneRoleStatus = useMemo(
    () => deriveSceneRoleStatusLines(detail?.feature.status, sortedSteps, activity),
    [activity, detail?.feature.status, sortedSteps]
  );
  const activeTaskCount = useMemo(
    () => sortedSteps.filter((s) => s.status === "active").length,
    [sortedSteps]
  );
  const runningCloudAgentCount = useMemo(
    () => countRunningCloudAgents(deskFigures),
    [deskFigures]
  );
  const [mismatchSinceMs, setMismatchSinceMs] = useState<number | null>(null);
  const [showPersistentMismatch, setShowPersistentMismatch] = useState(false);
  const hasCounterMismatch = activeTaskCount !== runningCloudAgentCount;

  useEffect(() => {
    setMismatchSinceMs(null);
    setShowPersistentMismatch(false);
  }, [selectedId]);

  useEffect(() => {
    if (detail?.feature.status !== "executing" || !hasCounterMismatch) {
      setMismatchSinceMs(null);
      setShowPersistentMismatch(false);
      return;
    }

    const startedAt = mismatchSinceMs ?? Date.now();
    if (mismatchSinceMs === null) {
      setMismatchSinceMs(startedAt);
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= COUNTER_MISMATCH_PERSIST_MS) {
      setShowPersistentMismatch(true);
      return;
    }

    setShowPersistentMismatch(false);
    const timeoutId = window.setTimeout(() => {
      setShowPersistentMismatch(true);
    }, COUNTER_MISMATCH_PERSIST_MS - elapsedMs);
    return () => window.clearTimeout(timeoutId);
  }, [detail?.feature.status, hasCounterMismatch, mismatchSinceMs]);

  const runStart = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    setBusy(true);
    try {
      await postFeatureStart(selectedId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["feature", selectedId] }),
        qc.refetchQueries({ queryKey: ["feature", selectedId, "activity"] }),
      ]);
      invalidateSelected(selectedId);
      invalidateFeatures();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [invalidateFeatures, invalidateSelected, qc, selectedId]);

  const runCancel = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    setBusy(true);
    try {
      await postFeatureCancel(selectedId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["feature", selectedId] }),
        qc.refetchQueries({ queryKey: ["feature", selectedId, "activity"] }),
      ]);
      invalidateSelected(selectedId);
      invalidateFeatures();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [invalidateFeatures, invalidateSelected, qc, selectedId]);

  const runArchive = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    setBusy(true);
    try {
      await postFeatureArchive(selectedId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["feature", selectedId] }),
        qc.refetchQueries({ queryKey: ["feature", selectedId, "activity"] }),
      ]);
      invalidateSelected(selectedId);
      invalidateFeatures();
      if (featureListView === "active") setSelectedId(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [featureListView, invalidateFeatures, invalidateSelected, qc, selectedId, setSelectedId]);

  const runUnarchive = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    setBusy(true);
    try {
      await postFeatureUnarchive(selectedId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["feature", selectedId] }),
        qc.refetchQueries({ queryKey: ["feature", selectedId, "activity"] }),
      ]);
      invalidateSelected(selectedId);
      invalidateFeatures();
      if (featureListView === "archived") setSelectedId(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [featureListView, invalidateFeatures, invalidateSelected, qc, selectedId, setSelectedId]);

  const st = detail?.feature.status as FeatureStatus | undefined;
  const canStart = st ? canStartFeature(st) : false;
  const canCancel = st ? canCancelFeature(st) : false;
  const isArchived = isFeatureArchived(detail?.feature);
  const canArchive =
    Boolean(detail) &&
    !isArchived &&
    ["completed", "failed", "cancelled"].includes(detail.feature.status);
  const canUnarchive = Boolean(detail) && isArchived;
  const agentUrl = detail ? cursorAgentUrl(detail.feature.links) : undefined;
  const agentStatus = detail ? cursorAgentStatus(detail.feature.links) : undefined;
  const startMode = detail ? featureStartMode(detail.feature.links) : undefined;
  const wtPath = detail ? worktreePath(detail.feature.links) : undefined;
  const wtBranch = detail ? worktreeBranch(detail.feature.links) : undefined;

  const executingSubtitle = (() => {
    if (detail?.feature.status !== "executing") return null;
    if (agentUrl) return "Cloud agent + optional local worktree";
    if (startMode === "local_worktree" || wtPath) return "Git worktree + local hook";
    if (startMode === "local_hook") return "Local hook (repo or worktree cwd)";
    if (startMode === "plan_only") return "Manual — no worktree/hook";
    if (
      startMode === "cloud_missing_repository" ||
      startMode === "cloud_missing_api_key" ||
      startMode === "cloud_launch_failed"
    )
      return null;
    return "See Activity for details";
  })();

  return (
    <div className={`features-layout ${isRailCollapsed ? "rail-collapsed" : ""}`}>
      <div className={`features-list-col ${isRailCollapsed ? "collapsed" : ""}`}>
        <div className="feature-list-col-head">
          <h2 className="section-title">Feature runs</h2>
          <button
            type="button"
            className="rail-toggle-btn"
            aria-controls={featureRunsRailId}
            aria-expanded={!isRailCollapsed}
            onClick={() => setIsRailCollapsed((collapsed) => !collapsed)}
          >
            {isRailCollapsed ? "Expand run list" : "Collapse run list"}
          </button>
        </div>

        {isRailCollapsed ? (
          <div
            id={featureRunsRailId}
            className="feature-rail-collapsed-note"
            role="status"
            aria-live="polite"
          >
            <p className="muted-sm">Feature list is collapsed by default.</p>
            <p className="muted-sm">
              {selectedFeature
                ? `Selected: ${selectedFeature.title}`
                : "Expand the run list to browse feature runs."}
            </p>
          </div>
        ) : (
          <div id={featureRunsRailId}>
            <div className="feature-list-toolbar" role="tablist" aria-label="Feature run filters">
              <button
                type="button"
                className={`feature-view-btn ${featureListView === "active" ? "active" : ""}`}
                onClick={() => setFeatureListView("active")}
                aria-selected={featureListView === "active"}
              >
                Active
              </button>
              <button
                type="button"
                className={`feature-view-btn ${featureListView === "archived" ? "active" : ""}`}
                onClick={() => setFeatureListView("archived")}
                aria-selected={featureListView === "archived"}
              >
                Archived
              </button>
            </div>
            <p className="muted-sm">Desk map: {FooA(deskState)}</p>
            {featuresQ.error && (
              <div className="error-banner" role="alert">
                Could not load features: {(featuresQ.error as Error).message}
              </div>
            )}
            {features.length === 0 && !featuresQ.isLoading ? (
              <div className="table-wrap empty">
                {featureListView === "active" ? (
                  <>
                    No active feature runs yet. Use{" "}
                    <code className="mono">orchestrator feature create</code> or{" "}
                    <code className="mono">/build-feature</code> from Cursor.
                  </>
                ) : (
                  <>No archived feature runs.</>
                )}
              </div>
            ) : (
              <ul className="feature-list" aria-label="Feature runs">
                {features.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={`feature-list-item ${selectedId === f.id ? "active" : ""}`}
                      onClick={() => setSelectedId(f.id)}
                    >
                      <span className="feature-list-title">{f.title}</span>
                      <span className="feature-list-badges">
                        <span className={featureBadgeClass(f.status)}>{f.status}</span>
                        {isFeatureArchived(f) ? (
                          <span className="badge feat-archived">archived</span>
                        ) : null}
                      </span>
                      <span className="feature-list-id mono" title={f.id}>
                        {f.id.slice(0, 10)}…
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="features-detail-col">
        <div className="muted-sm" data-testid="foo-b-marker">
          {FooB(deskState)}
        </div>
        {!selectedId ? (
          <div className="table-wrap empty">Select a feature run to see the plan and activity.</div>
        ) : detailQ.isLoading ? (
          <div className="table-wrap empty">Loading…</div>
        ) : detailQ.error ? (
          <div className="error-banner" role="alert">
            {(detailQ.error as Error).message}
          </div>
        ) : detail ? (
          <>
            <header className="feature-detail-head">
              <div>
                <h2 className="feature-detail-title">{detail.feature.title}</h2>
                {detail.feature.status === "executing" && executingSubtitle ? (
                  <p className="feature-executing-sub muted-sm">{executingSubtitle}</p>
                ) : null}
                <details className="feature-run-details">
                  <summary>Run details</summary>
                  {detail.feature.summary ? (
                    <p className="feature-detail-summary">{detail.feature.summary}</p>
                  ) : (
                    <p className="muted-sm">No summary.</p>
                  )}
                  <p className="mono feature-detail-meta">
                    {detail.feature.id} · updated {new Date(detail.feature.updatedAt).toLocaleString()}
                  </p>
                </details>
              </div>
              <div className="feature-detail-actions">
                <span className={featureBadgeClass(detail.feature.status)}>
                  {detail.feature.status}
                </span>
                {isArchived ? <span className="badge feat-archived">archived</span> : null}
                {agentUrl ? (
                  <a
                    className="btn-primary"
                    href={agentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Cursor Cloud Agent
                  </a>
                ) : null}
                {canStart && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void runStart()}
                  >
                    Start
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => void runCancel()}
                  >
                    Cancel
                  </button>
                )}
                {canArchive && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void runArchive()}
                  >
                    Archive
                  </button>
                )}
                {canUnarchive && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void runUnarchive()}
                  >
                    Unarchive
                  </button>
                )}
              </div>
            </header>

            {actionError && (
              <div className="error-banner" role="alert">
                {actionError}
              </div>
            )}

            {(detail.feature.status === "draft" || detail.feature.status === "ready") && (
              <div className="execution-callout" role="note">
                <strong>What happens when you click Start</strong>
                <p>
                  The run moves to <strong>executing</strong> and the first plan step becomes{" "}
                  <strong>active</strong> in the database.
                </p>
                <p className="execution-callout-sub">
                  <strong>Default:</strong> with a git repo, Start creates a <strong>git worktree</strong> and
                  runs <code className="mono">scripts/orch-feature-start-worker.mjs</code> (posts Activity).
                  Optional: <code className="mono">cursorCloudAgent</code> for Cursor Cloud,{" "}
                  <code className="mono">featureStartCommand</code>, or{" "}
                  <code className="mono">featureWorktree.openWithCursor</code>. See{" "}
                  <code className="mono">docs/FEATURE_EXECUTION.md</code>.
                </p>
              </div>
            )}

            {detail.feature.status === "executing" && (
              <div
                className={`execution-callout ${
                  agentUrl
                    ? ""
                    : startMode === "cloud_missing_repository" ||
                        startMode === "cloud_missing_api_key" ||
                        startMode === "cloud_launch_failed"
                      ? "execution-callout-error"
                      : startMode === "plan_only" ||
                          startMode === "local_hook" ||
                          startMode === "local_worktree"
                        ? "execution-callout-info"
                        : "execution-callout-warn"
                }`}
                role="status"
              >
                {agentUrl ? (
                  <>
                    <strong>Cursor Cloud Agent</strong>
                    <p>
                      Agent status: <span className="mono">{agentStatus ?? "…"}</span>. Open the agent for live
                      work; activity below updates from the API and optional status polling.
                    </p>
                    {wtPath ? (
                      <p className="execution-callout-sub">
                        Local worktree: <span className="mono">{wtPath}</span>
                        {wtBranch ? (
                          <>
                            {" "}
                            (branch <span className="mono">{wtBranch}</span>)
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </>
                ) : startMode === "local_worktree" ? (
                  <>
                    <strong>Executing with git worktree</strong>
                    <p>
                      A dedicated worktree was created for this run (see Workspace below). A local start hook ran
                      with that folder as cwd unless disabled in config.
                    </p>
                  </>
                ) : startMode === "plan_only" ? (
                  <>
                    <strong>Manual mode</strong>
                    <p>
                      No git worktree was created (orchestrator cwd not inside a git repo,{" "}
                      <code className="mono">featureWorktree.enabled: false</code>, or worktree error — see{" "}
                      <code className="mono">worktreeError</code> in Execution log) and the default start worker
                      did not run (missing <code className="mono">scripts/orch-feature-start-worker.mjs</code>{" "}
                      under repo root, or hook disabled). Restart <code className="mono">orchestrator start</code>{" "}
                      from the repository root if you were in a subfolder — the CLI now resolves the git root
                      automatically.
                    </p>
                    <p className="execution-callout-sub">
                      Progress is whatever you do in the editor plus{" "}
                      <code className="mono">orchestrator feature activity</code>. If you only see a GitHub /
                      Cursor Cloud error elsewhere, auto-cloud may be on without a GitHub{" "}
                      <code className="mono">origin</code> — set{" "}
                      <code className="mono">autoCursorCloudAgentOnStart: false</code> in{" "}
                      <code className="mono">orchestrator.config.yaml</code> to rely on local worktree + worker only.
                    </p>
                  </>
                ) : startMode === "local_hook" ? (
                  <>
                    <strong>Local start hook</strong>
                    <p>
                      A command was spawned from <code className="mono">featureStartCommand</code> (cwd is the
                      worktree when one exists, else repo root). No Cursor Cloud Agent link unless{" "}
                      <code className="mono">cursorCloudAgent</code> is enabled.
                    </p>
                  </>
                ) : startMode === "cloud_missing_repository" ? (
                  <>
                    <strong>Cursor Cloud: no GitHub repository</strong>
                    <p>
                      Auto-launch or <code className="mono">cursorCloudAgent</code> needs a GitHub repo URL, but{" "}
                      <code className="mono">git remote origin</code> is missing or not GitHub. Set{" "}
                      <code className="mono">cursorCloudAgent.repository</code> in YAML, add a GitHub{" "}
                      <code className="mono">origin</code> remote, or set{" "}
                      <code className="mono">autoCursorCloudAgentOnStart: false</code> to skip cloud and use only
                      local worktree + start hook. See Activity and Execution log.
                    </p>
                  </>
                ) : startMode === "cloud_missing_api_key" ? (
                  <>
                    <strong>Cloud misconfigured: missing API key</strong>
                    <p>
                      Cloud launch is enabled (auto or YAML) but <code className="mono">CURSOR_API_KEY</code> (or
                      your <code className="mono">apiKeyEnv</code>) is empty. Unset the key to disable auto-cloud,
                      or set the key. See Activity.
                    </p>
                  </>
                ) : startMode === "cloud_launch_failed" ? (
                  <>
                    <strong>Cursor Cloud launch failed</strong>
                    <p>
                      The API called Cursor Cloud but the launch request failed. Check Activity for the error
                      message (network, auth, or API response).
                    </p>
                  </>
                ) : (
                  <>
                    <strong>No cloud agent link (legacy or unknown)</strong>
                    <p>
                      This run has no <code className="mono">featureStartMode</code> in its links (it may have
                      started before that field existed). Check Activity for errors; otherwise treat as
                      plan-only unless you know cloud was launched elsewhere.
                    </p>
                  </>
                )}
              </div>
            )}

            <section className="office-role-status card" aria-label="Shared office role status">
              <h3 className="subsection-title">Shared office role status</h3>
              <ul className="office-role-list">
                {sceneRoleStatus.map((line) => (
                  <li key={line.role} className="office-role-row">
                    <div className="office-role-main">
                      <span className="office-role-label">{line.label}</span>
                      <span className={`badge office-role-state office-role-state-${line.state}`}>
                        {line.state}
                      </span>
                    </div>
                    <p className="office-role-detail">{line.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
            {detail.feature.status === "executing" && (
              <section className="execution-counters card" aria-label="Execution counters">
                <div className="execution-counters-head">
                  <h3 className="subsection-title">Execution counters</h3>
                  {hasCounterMismatch ? (
                    <span
                      className={`badge execution-mismatch-badge ${
                        showPersistentMismatch
                          ? "execution-mismatch-badge-persistent"
                          : "execution-mismatch-badge-transient"
                      }`}
                    >
                      {showPersistentMismatch ? "Persistent mismatch" : "Mismatch detected"}
                    </span>
                  ) : null}
                </div>
                <p className="muted-sm execution-counters-subtitle">
                  Active tasks in plan vs running cloud agents in activity.
                </p>
                <div className="execution-counter-grid">
                  <div className="execution-counter-item">
                    <div className="label">Active tasks</div>
                    <div className="value">{activeTaskCount}</div>
                  </div>
                  <div className="execution-counter-item">
                    <div className="label">Running cloud agents</div>
                    <div className="value">{runningCloudAgentCount}</div>
                  </div>
                </div>
                <p className="muted-sm execution-counter-note" aria-live="polite">
                  {showPersistentMismatch
                    ? "Counts are still diverged after 10s. Check activity feed and agent launches."
                    : hasCounterMismatch
                      ? "Transient mismatch detected; waiting before showing a warning."
                      : "Counters are aligned."}
                </p>
              </section>
            )}

            {wtPath && (
              <div className="worktree-banner card" role="region" aria-label="Git worktree">
                <div className="label">Workspace (git worktree)</div>
                <p className="mono worktree-path">{wtPath}</p>
                {wtBranch ? (
                  <p className="muted-sm">
                    Branch: <span className="mono">{wtBranch}</span>
                  </p>
                ) : null}
                <p className="muted-sm worktree-hint">
                  Terminal: <code className="mono">cd {JSON.stringify(wtPath)}</code>
                </p>
              </div>
            )}

            {(detail.feature.status === "executing" || deskFigures.length > 0) && (
              <DeskAgentAvatars figures={deskFigures} />
            )}

            {(detail.feature.status === "executing" || officeScene.placements.length > 0) && (
              <section className="office-stage card" aria-label="Shared office movement">
                <div className="office-stage-head">
                  <h3 className="subsection-title">Shared office</h3>
                  <p className="muted-sm">
                    Agents leave their desk as work starts and return when complete.
                  </p>
                </div>
                <div className="office-stage-track" style={{ height: `${officeTrackHeight}px` }}>
                  <svg
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    {officeScene.layout.transitPaths.map((path) => (
                      <polyline
                        key={path.id}
                        points={path.points
                          .map((point) => {
                            const x = toPercent(point.x, officeScene.layout.bounds.width);
                            const y = toPercent(point.y, officeScene.layout.bounds.height);
                            return `${x},${y}`;
                          })
                          .join(" ")}
                        fill="none"
                        stroke={
                          highlightedTransitPathIds.has(path.id)
                            ? "rgba(13, 116, 216, 0.72)"
                            : "rgba(93, 111, 137, 0.34)"
                        }
                        strokeWidth={highlightedTransitPathIds.has(path.id) ? 2.2 : 1.3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ))}
                  </svg>
                  {[...officeScene.layout.desks, ...Object.values(officeScene.layout.zones)].map((zone) => {
                    const visual = zoneStyle(zone.kind);
                    return (
                      <div
                        key={zone.id}
                        style={{
                          position: "absolute",
                          left: toPercent(
                            zone.center.x - zone.size.width / 2,
                            officeScene.layout.bounds.width
                          ),
                          top: toPercent(
                            zone.center.y - zone.size.height / 2,
                            officeScene.layout.bounds.height
                          ),
                          width: toPercent(zone.size.width, officeScene.layout.bounds.width),
                          height: toPercent(zone.size.height, officeScene.layout.bounds.height),
                          borderRadius: "9px",
                          border: `1px solid ${visual.borderColor}`,
                          background: visual.background,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.64rem",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "var(--muted)",
                          }}
                        >
                          {zone.label}
                        </span>
                      </div>
                    );
                  })}
                  {officeScene.placements.map((placement) => {
                    const figure = figureById.get(placement.figureId);
                    const zone =
                      officeZoneById.get(placement.currentZoneId) ??
                      officeZoneById.get(placement.deskZoneId);
                    if (!figure || !zone) return null;
                    return (
                      <div
                        key={figure.figureId}
                        className={`office-figure role-${figure.role} state-${figureStateClassForLifecycle(
                          placement.lifecycleState
                        )}`}
                        data-motion-zone={motionZoneForFigure(figure)}
                        style={{
                          left: toPercent(zone.center.x, officeScene.layout.bounds.width),
                          top: toPercent(zone.center.y, officeScene.layout.bounds.height),
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <span className="office-figure-chip">{figureDisplayName(figure)}</span>
                        <span className="office-figure-status">{figure.statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {detail.feature.status === "executing" && (activeStep || nowActivity.length > 0) && (
              <section className="feature-now card" aria-label="Current focus">
                <h3 className="subsection-title">Now</h3>
                {activeStep ? (
                  <div className="feature-now-step">
                    <span className="badge step-badge-active">active</span>
                    <span className="feature-now-step-title">{activeStep.title}</span>
                    {activeStep.summary ? (
                      <p className="muted-sm feature-now-step-summary">{activeStep.summary}</p>
                    ) : null}
                  </div>
                ) : null}
                {nowActivity.length > 0 ? (
                  <ul className="feature-now-activity">
                    {nowActivity.map((a) => (
                      <li key={a.id}>
                        <span className="badge activity-kind">{a.kind}</span>
                        <span className="mono muted-sm feature-now-time">
                          {new Date(a.createdAt).toLocaleTimeString()}
                        </span>
                        <div className="feature-now-msg">{a.message}</div>
                      </li>
                    ))}
                  </ul>
                ) : activityQ.isLoading ? (
                  <p className="muted-sm">Loading activity…</p>
                ) : (
                  <p className="muted-sm">
                    No activity events in the API response yet. If Start already finished, check{" "}
                    <strong>Execution log</strong> below or confirm the orchestrator is using the same DB /
                    cwd. While executing, activity is polled every 2.5s.
                  </p>
                )}
              </section>
            )}

            {(detail.feature.risks || detail.feature.dependencies) && (
              <div className="feature-risks card">
                {detail.feature.risks ? (
                  <div>
                    <div className="label">Risks</div>
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
                      {detail.feature.risks}
                    </p>
                  </div>
                ) : null}
                {detail.feature.dependencies ? (
                  <div style={{ marginTop: "1rem" }}>
                    <div className="label">Dependencies</div>
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
                      {detail.feature.dependencies}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <section className="feature-plan" aria-label="Plan">
              <h3 className="subsection-title">Plan</h3>
              {sortedSteps.length === 0 ? (
                <p className="muted-sm">No steps yet. Replace the plan via the API or CLI.</p>
              ) : (
                <ol className="stepper">
                  {sortedSteps.map((s: FeatureStepRow) => (
                    <li key={s.id} className={stepClass(s.status)}>
                      <div className="step-head">
                        <span className="step-ordinal">{s.ordinal}</span>
                        <span className="step-title">{s.title}</span>
                        <span className={`badge step-badge-${s.status}`}>{s.status}</span>
                      </div>
                      {s.summary ? <p className="step-summary">{s.summary}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="execution-log-section card" aria-label="Execution log raw">
              <h3 className="subsection-title">Execution log (raw)</h3>
              <p className="muted-sm execution-log-hint">
                Chronological trail from <code className="mono">GET …/activity</code> (up to 500 events).
                {featureStatusForPoll === "executing"
                  ? " Polling every 2.5s while this run is executing."
                  : null}
                {activityQ.isFetching ? (
                  <span className="execution-log-fetching"> Refreshing…</span>
                ) : null}
              </p>
              <div className="execution-log-links">
                <div className="label">feature.links</div>
                <pre className="execution-log-pre" tabIndex={0}>
                  {JSON.stringify(detail.feature.links ?? {}, null, 2)}
                </pre>
              </div>
              {activityQ.isLoading ? (
                <p className="muted-sm">Loading activity…</p>
              ) : activity.length === 0 ? (
                <p className="muted-sm">
                  No activity rows — if you just clicked Start, wait for the refetch or check the API
                  process logs; empty here usually means nothing wrote to{" "}
                  <code className="mono">activity_events</code> for this feature id.
                </p>
              ) : (
                <ol className="execution-log-entries">
                  {activity.map((a) => {
                    const dj = formatDetailsJson(a.details);
                    return (
                      <li key={a.id} className="execution-log-entry">
                        <div className="execution-log-line">
                          <span className="mono execution-log-ts">{a.createdAt}</span>
                          <span className="badge activity-kind">{a.kind}</span>
                          <span className="mono execution-log-id">{a.id}</span>
                          {a.stepId ? (
                            <span className="mono muted-sm execution-log-step">step {a.stepId}</span>
                          ) : null}
                        </div>
                        <div className="execution-log-message">{a.message}</div>
                        {dj ? <pre className="execution-log-pre execution-log-details">{dj}</pre> : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="feature-activity" aria-label="Activity">
              <div className="activity-head">
                <h3 className="subsection-title">Activity</h3>
                <label className="activity-filter">
                  <span className="muted-sm">Kind</span>
                  <select
                    value={activityKind}
                    onChange={(e) => setActivityKind(e.target.value)}
                    aria-label="Filter activity by kind"
                  >
                    <option value="all">All</option>
                    {ACTIVITY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {activityQ.isLoading ? (
                <p className="muted-sm">Loading activity…</p>
              ) : filteredActivity.length === 0 ? (
                <p className="muted-sm">
                  {detail.feature.status === "draft" || detail.feature.status === "ready"
                    ? "Activity after Start only if something calls the activity API (not automatic)."
                    : "No activity logged yet — nothing is posting events to this run."}
                </p>
              ) : (
                <ul className="activity-feed">
                  {filteredActivity.map((a) => (
                    <li key={a.id} className={`activity-row kind-${a.kind}`}>
                      <div className="activity-meta">
                        <span className="mono activity-time">
                          {new Date(a.createdAt).toLocaleTimeString()}
                        </span>
                        <span className="badge activity-kind">{a.kind}</span>
                        {a.stepId ? (
                          <span className="mono muted-sm">step {a.stepId.slice(0, 8)}…</span>
                        ) : null}
                      </div>
                      <div className="activity-message">{a.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
