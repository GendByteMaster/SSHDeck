export type TunnelRuntimeState = "running" | "stopping" | "stopped" | "failed";

export type TunnelProcessStatus = {
  tunnelId: string;
  state: TunnelRuntimeState;
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number;
  exitCode: number | null;
  reason: string | null;
};

const AUTO_RESTART_KEY = "sshdeck:tunnel-auto-restart:v1";

export function loadTunnelAutoRestart(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(AUTO_RESTART_KEY);
    return raw ? JSON.parse(raw) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

export function saveTunnelAutoRestart(value: Record<string, boolean>) {
  localStorage.setItem(AUTO_RESTART_KEY, JSON.stringify(value));
}

export function tunnelStateLabel(status: TunnelProcessStatus | null) {
  if (!status) return "Stopped";
  if (status.state === "running") return "Running";
  if (status.state === "stopping") return "Stopping";
  if (status.state === "failed") return "Failed";
  return "Stopped";
}
