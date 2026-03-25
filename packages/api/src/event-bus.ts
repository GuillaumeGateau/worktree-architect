import { EventEmitter } from "node:events";

export type OrchestratorEvent =
  | { type: "job_created"; jobId: string }
  | { type: "job_updated"; jobId: string };

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emitOrchestratorEvent(e: OrchestratorEvent): void {
  bus.emit("event", e);
}
