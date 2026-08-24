import { invoke } from "@tauri-apps/api/core";

export type SessionState = "active" | "reconnecting" | "disconnected" | "failed";

export const SESSION_HISTORY_LIMIT = 200;

export type SessionProcessStatus = {
  sessionId: string;
  serverId: string;
  state: "running" | "disconnected" | "failed";
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
};

export type SessionView = {
  id: string;
  serverId: string;
  name: string;
  state: SessionState;
  startedAtMs: number;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  autoReconnect: boolean;
  reconnectAttempts: number;
};

export type SessionHistoryItem = {
  id: string;
  serverId: string;
  serverName: string;
  state: "disconnected" | "failed" | "reconnected" | "closed";
  atMs: number;
  startedAtMs?: number | null;
  durationMs: number;
  exitCode: number | null;
  signal?: string | null;
};

type WorkspaceSnapshot = { sessionHistory?: SessionHistoryItem[] };

let historyCache: SessionHistoryItem[] = [];

export function loadSessionHistory(): SessionHistoryItem[] {
  return historyCache.slice();
}

export async function hydrateSessionHistory(): Promise<SessionHistoryItem[]> {
  const workspace = await invoke<WorkspaceSnapshot>("workspace_load");
  historyCache = Array.isArray(workspace.sessionHistory) ? workspace.sessionHistory.slice(0, SESSION_HISTORY_LIMIT) : [];
  return historyCache.slice();
}

export function saveSessionHistory(items: SessionHistoryItem[]) {
  historyCache = items.slice(0, SESSION_HISTORY_LIMIT);
  void invoke("workspace_save_session_history", { items: historyCache });
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
