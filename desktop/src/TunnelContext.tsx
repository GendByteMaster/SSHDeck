import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "./LogContext";
import { TunnelProcessStatus } from "./tunnelHealth";
import { useWorkbench } from "./WorkbenchContext";

export type TunnelKind = "local" | "remote" | "dynamic";

export type Tunnel = {
  id: string;
  name: string;
  serverId: string;
  kind: TunnelKind;
  bindHost: string | null;
  localPort: number;
  remoteHost: string | null;
  remotePort: number | null;
  autoRestart: boolean;
};

export type TunnelDraft = Omit<Tunnel, "id"> & { id?: string };

type WorkspaceTunnelData = { tunnels: Tunnel[] };

type TunnelContextValue = {
  tunnels: Tunnel[];
  statuses: Record<string, TunnelProcessStatus | null>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  startTunnel: (id: string) => Promise<void>;
  stopTunnel: (id: string) => Promise<void>;
  toggleTunnel: (id: string) => Promise<void>;
  saveTunnel: (tunnel: TunnelDraft) => Promise<void>;
  deleteTunnel: (id: string) => Promise<void>;
  toggleAutoRestart: (tunnel: Tunnel) => Promise<void>;
  restartAttempts: (id: string) => number;
};

const TunnelContext = createContext<TunnelContextValue | null>(null);

function message(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

export function TunnelProvider({ children }: { children: ReactNode }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [statuses, setStatuses] = useState<Record<string, TunnelProcessStatus | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tunnelsRef = useRef<Tunnel[]>([]);
  const restarting = useRef(new Set<string>());
  const attempts = useRef(new Map<string, number>());
  const previousTunnelStates = useRef(new Map<string, string>());
  const { registerAppActions, selectedTunnel, setSelectedTunnel } = useWorkbench();
  const { addLog } = useLogs();
  const selectedTunnelRef = useRef(selectedTunnel);

  useEffect(() => { tunnelsRef.current = tunnels; }, [tunnels]);
  useEffect(() => { selectedTunnelRef.current = selectedTunnel; }, [selectedTunnel]);

  const applyWorkspace = useCallback((workspace: WorkspaceTunnelData) => {
    tunnelsRef.current = workspace.tunnels;
    setTunnels(workspace.tunnels);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const workspace = await invoke<WorkspaceTunnelData>("workspace_load");
      applyWorkspace(workspace);
      setError(null);
    } catch (value) {
      const text = `Could not load SSH tunnels: ${message(value)}`;
      setError(text);
      addLog({ subsystem: "tunnel", severity: "error", message: "Tunnel registry load failed", detail: text });
    } finally {
      setLoading(false);
    }
  }, [addLog, applyWorkspace]);

  useEffect(() => { void refresh(); }, [refresh]);

  const syncSelected = useCallback((id: string, status: TunnelProcessStatus | null) => {
    if (selectedTunnelRef.current.id !== id) return;
    const tunnel = tunnelsRef.current.find((item) => item.id === id);
    if (!tunnel) {
      setSelectedTunnel({ id: null, name: "No tunnel selected", state: "stopped" });
      return;
    }
    setSelectedTunnel({ id, name: tunnel.name, state: status?.state ?? "stopped" });
  }, [setSelectedTunnel]);

  const startTunnel = useCallback(async (id: string) => {
    try {
      const status = await invoke<TunnelProcessStatus>("start_tunnel", { id });
      attempts.current.set(id, 0);
      previousTunnelStates.current.set(id, status.state);
      setStatuses((current) => ({ ...current, [id]: status }));
      syncSelected(id, status);
      const tunnel = tunnelsRef.current.find((item) => item.id === id);
      addLog({
        subsystem: "tunnel",
        severity: "info",
        message: `Tunnel started: ${tunnel?.name ?? id}`,
        detail: `state=${status.state}`,
        serverId: tunnel?.serverId ?? null,
        resourceId: id,
      });
      setError(null);
    } catch (value) {
      const text = `Could not start tunnel: ${message(value)}`;
      const tunnel = tunnelsRef.current.find((item) => item.id === id);
      addLog({
        subsystem: "tunnel",
        severity: "error",
        message: `Tunnel start failed: ${tunnel?.name ?? id}`,
        detail: text,
        serverId: tunnel?.serverId ?? null,
        resourceId: id,
      });
      setError(text);
      throw new Error(text);
    }
  }, [addLog, syncSelected]);

  const stopTunnel = useCallback(async (id: string) => {
    try {
      const status = await invoke<TunnelProcessStatus>("stop_tunnel", { id });
      previousTunnelStates.current.set(id, status.state);
      setStatuses((current) => ({ ...current, [id]: status }));
      syncSelected(id, status);
      const tunnel = tunnelsRef.current.find((item) => item.id === id);
      addLog({
        subsystem: "tunnel",
        severity: "info",
        message: `Tunnel stopped: ${tunnel?.name ?? id}`,
        detail: `state=${status.state}`,
        serverId: tunnel?.serverId ?? null,
        resourceId: id,
      });
      setError(null);
    } catch (value) {
      const text = `Could not stop tunnel: ${message(value)}`;
      const tunnel = tunnelsRef.current.find((item) => item.id === id);
      addLog({
        subsystem: "tunnel",
        severity: "error",
        message: `Tunnel stop failed: ${tunnel?.name ?? id}`,
        detail: text,
        serverId: tunnel?.serverId ?? null,
        resourceId: id,
      });
      setError(text);
      throw new Error(text);
    }
  }, [addLog, syncSelected]);

  const restartTunnel = useCallback(async (id: string) => {
    if (restarting.current.has(id)) return;
    const tunnel = tunnelsRef.current.find((item) => item.id === id);
    if (!tunnel?.autoRestart) return;

    restarting.current.add(id);
    try {
      let attempt = attempts.current.get(id) ?? 0;
      while (attempt < 3) {
        const currentTunnel = tunnelsRef.current.find((item) => item.id === id);
        if (!currentTunnel?.autoRestart) return;
        attempt += 1;
        attempts.current.set(id, attempt);
        addLog({
          subsystem: "tunnel",
          severity: "warn",
          message: `Tunnel auto-restart attempt ${attempt}: ${currentTunnel.name}`,
          serverId: currentTunnel.serverId,
          resourceId: id,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** (attempt - 1))));
        try {
          const status = await invoke<TunnelProcessStatus>("start_tunnel", { id });
          previousTunnelStates.current.set(id, status.state);
          setStatuses((current) => ({ ...current, [id]: status }));
          syncSelected(id, status);
          addLog({
            subsystem: "tunnel",
            severity: "info",
            message: `Tunnel auto-restart succeeded: ${currentTunnel.name}`,
            detail: `attempt=${attempt}`,
            serverId: currentTunnel.serverId,
            resourceId: id,
          });
          setError(null);
          return;
        } catch (value) {
          if (attempt >= 3) {
            const text = `Tunnel auto-restart failed after ${attempt} attempts: ${message(value)}`;
            addLog({
              subsystem: "tunnel",
              severity: "error",
              message: `Tunnel auto-restart exhausted: ${currentTunnel.name}`,
              detail: text,
              serverId: currentTunnel.serverId,
              resourceId: id,
            });
            setError(text);
          }
        }
      }
    } finally {
      restarting.current.delete(id);
    }
  }, [addLog, syncSelected]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      await Promise.all(tunnels.map(async (tunnel) => {
        try {
          const status = await invoke<TunnelProcessStatus | null>("tunnel_status", { id: tunnel.id });
          if (cancelled) return;
          setStatuses((current) => ({ ...current, [tunnel.id]: status }));
          syncSelected(tunnel.id, status);
          const before = previousTunnelStates.current.get(tunnel.id);
          if (status?.state) previousTunnelStates.current.set(tunnel.id, status.state);
          if (status?.state === "failed" && before !== "failed") {
            addLog({
              subsystem: "tunnel",
              severity: "error",
              message: `Tunnel failed: ${tunnel.name}`,
              detail: status.reason ?? (status.exitCode != null ? `exit=${status.exitCode}` : null),
              serverId: tunnel.serverId,
              resourceId: tunnel.id,
            });
          }
          if (status?.state === "running" && status.durationMs >= 30_000) attempts.current.set(tunnel.id, 0);
          if (status?.state === "failed" && tunnel.autoRestart && (attempts.current.get(tunnel.id) ?? 0) < 3) {
            void restartTunnel(tunnel.id);
          }
        } catch (value) {
          if (!cancelled) setError(`Could not read tunnel state: ${message(value)}`);
        }
      }));
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [addLog, restartTunnel, syncSelected, tunnels]);

  const toggleTunnel = useCallback(async (id: string) => {
    const status = statuses[id];
    if (status?.state === "running" || status?.state === "stopping") await stopTunnel(id);
    else await startTunnel(id);
  }, [startTunnel, statuses, stopTunnel]);

  const saveTunnel = useCallback(async (tunnel: TunnelDraft) => {
    try {
      const workspace = await invoke<WorkspaceTunnelData>("save_tunnel", {
        tunnel: { ...tunnel, id: tunnel.id ?? "" },
      });
      applyWorkspace(workspace);
      setError(null);
    } catch (value) {
      const text = `Could not save tunnel: ${message(value)}`;
      setError(text);
      throw new Error(text);
    }
  }, [applyWorkspace]);

  const deleteTunnel = useCallback(async (id: string) => {
    try {
      const status = statuses[id];
      if (status?.state === "running" || status?.state === "stopping") {
        await invoke<TunnelProcessStatus>("stop_tunnel", { id }).catch(() => undefined);
      }
      const tunnel = tunnelsRef.current.find((item) => item.id === id);
      const workspace = await invoke<WorkspaceTunnelData>("delete_tunnel", { id });
      applyWorkspace(workspace);
      setStatuses((current) => {
        const copy = { ...current };
        delete copy[id];
        return copy;
      });
      previousTunnelStates.current.delete(id);
      attempts.current.delete(id);
      if (selectedTunnelRef.current.id === id) {
        setSelectedTunnel({ id: null, name: "No tunnel selected", state: "stopped" });
      }
      addLog({
        subsystem: "tunnel",
        severity: "info",
        message: `Tunnel deleted: ${tunnel?.name ?? id}`,
        serverId: tunnel?.serverId ?? null,
        resourceId: id,
      });
      setError(null);
    } catch (value) {
      const text = `Could not delete tunnel: ${message(value)}`;
      setError(text);
      throw new Error(text);
    }
  }, [addLog, applyWorkspace, setSelectedTunnel, statuses]);

  const toggleAutoRestart = useCallback(async (tunnel: Tunnel) => {
    await saveTunnel({ ...tunnel, autoRestart: !tunnel.autoRestart });
    attempts.current.set(tunnel.id, 0);
  }, [saveTunnel]);

  useEffect(() => {
    registerAppActions({
      startTunnel: (id) => { void startTunnel(id).catch(() => undefined); },
      stopTunnel: (id) => { void stopTunnel(id).catch(() => undefined); },
    });
  }, [registerAppActions, startTunnel, stopTunnel]);

  const value = useMemo<TunnelContextValue>(() => ({
    tunnels,
    statuses,
    loading,
    error,
    clearError: () => setError(null),
    refresh,
    startTunnel,
    stopTunnel,
    toggleTunnel,
    saveTunnel,
    deleteTunnel,
    toggleAutoRestart,
    restartAttempts: (id) => attempts.current.get(id) ?? 0,
  }), [deleteTunnel, error, loading, refresh, saveTunnel, startTunnel, statuses, stopTunnel, toggleAutoRestart, toggleTunnel, tunnels]);

  return <TunnelContext.Provider value={value}>{children}</TunnelContext.Provider>;
}

export function useTunnels() {
  const value = useContext(TunnelContext);
  if (!value) throw new Error("useTunnels must be used inside TunnelProvider");
  return value;
}
