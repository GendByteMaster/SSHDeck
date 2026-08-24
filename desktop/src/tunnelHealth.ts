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

export function tunnelStateLabel(status: TunnelProcessStatus | null) {
  if (!status) return "Stopped";
  if (status.state === "running") return "Running";
  if (status.state === "stopping") return "Stopping";
  if (status.state === "failed") return "Failed";
  return "Stopped";
}
