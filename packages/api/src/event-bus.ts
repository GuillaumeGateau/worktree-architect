import { EventEmitter } from "node:events";

export type OrchestratorEvent =
  | { type: "job_created"; jobId: string }
  | { type: "job_updated"; jobId: string }
  | { type: "feature_created"; featureId: string }
  | { type: "feature_updated"; featureId: string }
  | { type: "step_updated"; featureId: string; stepId: string }
  | { type: "activity_appended"; featureId: string; activityId: string };

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emitOrchestratorEvent(e: OrchestratorEvent): void {
  bus.emit("event", e);
}
