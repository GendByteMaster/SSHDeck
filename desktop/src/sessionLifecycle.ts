export type SessionState = "active" | "reconnecting" | "disconnected" | "failed";

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
  durationMs: number;
  exitCode: number | null;
};

const HISTORY_KEY = "sshdeck.sessionHistory.v1";

export function loadSessionHistory(): SessionHistoryItem[] {
  try {
    const value = localStorage.getItem(HISTORY_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as SessionHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function saveSessionHistory(items: SessionHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
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
