import { createServer } from "node:net";
import { stealPort as freeListenersOnPort } from "./process-kill.js";

const PORT_MIN = 45200;
const PORT_MAX = 45499;

export function randomPortStart(): number {
  return PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1));
}

export async function pickListenPort(options: {
  preferred?: number;
  stealPort: boolean;
}): Promise<number> {
  const envPort = process.env.ORCHESTRATOR_PORT
    ? Number(process.env.ORCHESTRATOR_PORT)
    : undefined;
  const preferred =
    options.preferred ?? (Number.isFinite(envPort) ? envPort : undefined);

  if (preferred !== undefined && Number.isFinite(preferred)) {
    if (options.stealPort || process.env.ORCHESTRATOR_STEAL_PORT === "1") {
      freeListenersOnPort(preferred);
    }
    if (await canBind(preferred)) return preferred;
    if (!options.stealPort && process.env.ORCHESTRATOR_STEAL_PORT !== "1") {
      console.warn(
        `orchestrator: port ${preferred} busy, scanning ${PORT_MIN}-${PORT_MAX}…`
      );
    }
  }

  const start = randomPortStart();
  for (let i = 0; i < 120; i++) {
    const port = PORT_MIN + ((start - PORT_MIN + i) % (PORT_MAX - PORT_MIN + 1));
    if (process.env.ORCHESTRATOR_STEAL_PORT === "1") {
      freeListenersOnPort(port);
    }
    if (await canBind(port)) return port;
  }
  throw new Error("No free port in orchestrator range");
}

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => {
      s.close(() => resolve(true));
    });
  });
}
