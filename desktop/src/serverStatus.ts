import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

const BATCH_SIZE = 2;
const REFRESH_MS = 90_000;
const STALE_MS = 60_000;

export function useServerStatus(servers: ServerRef[]) {
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const running = useRef(false);
  const focused = useRef(true);
  const serverIds = useMemo(() => servers.map((server) => server.id), [servers]);
  const serverKey = serverIds.join("\u0000");

  const probeOne = useCallback(async (serverId: string, force = true) => {
    if (!force) {
      const cached = statuses[serverId];
      if (cached && Date.now() - cached.checkedAt * 1000 < STALE_MS) return cached;
    }

    setChecking((current) => {
      if (current.has(serverId)) return current;
      const next = new Set(current);
      next.add(serverId);
      return next;
    });
    try {
      const result = await invoke<ServerStatus>("server_status", { serverId });
      setStatuses((current) => current[serverId] === result ? current : { ...current, [serverId]: result });
      return result;
    } finally {
      setChecking((current) => {
        if (!current.has(serverId)) return current;
        const next = new Set(current);
        next.delete(serverId);
        return next;
      });
    }
  }, [statuses]);

  const refreshAll = useCallback(async (force = false) => {
    if (running.current || serverIds.length === 0 || !focused.current) return;
    running.current = true;
    try {
      for (let index = 0; index < serverIds.length; index += BATCH_SIZE) {
        const batch = serverIds.slice(index, index + BATCH_SIZE);
        await Promise.allSettled(batch.map((serverId) => probeOne(serverId, force)));
      }
    } finally {
      running.current = false;
    }
  }, [probeOne, serverKey]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow().onFocusChanged(({ payload }) => {
      focused.current = payload;
      if (payload && !disposed) void refreshAll(false);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    void refreshAll(false);
    const timer = window.setInterval(() => void refreshAll(false), REFRESH_MS);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
    };
  }, [refreshAll]);

  const refreshServer = useCallback((serverId: string) => probeOne(serverId, true), [probeOne]);

  return { statuses, checking, refreshAll: () => refreshAll(true), refreshServer };
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
