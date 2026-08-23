import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ServerState = "online" | "auth_required" | "offline" | "error";

export type ServerStatus = {
  serverId: string;
  state: ServerState;
  latencyMs: number | null;
  sshOk: boolean;
  uptimeSeconds: number | null;
  checkedAt: number;
  error: string | null;
};

type ServerRef = { id: string };

const BATCH_SIZE = 4;
const REFRESH_MS = 30_000;

export function useServerStatus(servers: ServerRef[]) {
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const running = useRef(false);
  const serverIds = useMemo(() => servers.map((server) => server.id), [servers]);
  const serverKey = serverIds.join("\u0000");

  const probeOne = useCallback(async (serverId: string) => {
    setChecking((current) => new Set(current).add(serverId));
    try {
      const result = await invoke<ServerStatus>("server_status", { serverId });
      setStatuses((current) => ({ ...current, [serverId]: result }));
      return result;
    } finally {
      setChecking((current) => {
        const next = new Set(current);
        next.delete(serverId);
        return next;
      });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (running.current || serverIds.length === 0) return;
    running.current = true;
    try {
      for (let index = 0; index < serverIds.length; index += BATCH_SIZE) {
        const batch = serverIds.slice(index, index + BATCH_SIZE);
        await Promise.allSettled(batch.map((serverId) => probeOne(serverId)));
      }
    } finally {
      running.current = false;
    }
  }, [probeOne, serverKey]);

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => void refreshAll(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  return { statuses, checking, refreshAll, refreshServer: probeOne };
}

export function formatUptime(seconds: number | null) {
  if (seconds == null) return "Unavailable";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
