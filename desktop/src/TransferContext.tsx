import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "./LogContext";
import { useWorkbench } from "./WorkbenchContext";

export type TransferSnapshot = {
  id: string;
  serverId: string;
  name: string;
  direction: "upload" | "download";
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  localPath: string;
  remotePath: string;
  bytesTotal: number;
  bytesTransferred: number;
  createdAtMs: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  error: string | null;
};

type TransferContextValue = {
  transfers: TransferSnapshot[];
  refresh: () => Promise<void>;
  startUpload: (serverId: string, localPath: string, remoteDirectory: string) => Promise<TransferSnapshot>;
  startDownload: (serverId: string, remotePath: string, localPath: string) => Promise<TransferSnapshot>;
  cancel: (transferId: string) => Promise<void>;
  retry: (transferId: string) => Promise<TransferSnapshot>;
  clearFinished: () => Promise<void>;
};

const TransferContext = createContext<TransferContextValue | null>(null);

function mergeOne(current: TransferSnapshot[], next: TransferSnapshot) {
  const filtered = current.filter((item) => item.id !== next.id);
  return [next, ...filtered].sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export function TransferProvider({ children }: { children: ReactNode }) {
  const [transfers, setTransfers] = useState<TransferSnapshot[]>([]);
  const previousStates = useRef(new Map<string, TransferSnapshot["state"]>());
  const { choosePanel } = useWorkbench();
  const { addLog } = useLogs();

  const refresh = useCallback(async () => {
    const next = await invoke<TransferSnapshot[]>("sftp_transfer_list");
    for (const item of next) {
      const before = previousStates.current.get(item.id);
      if (before && before !== item.state) {
        const severity = item.state === "failed"
          ? "error"
          : item.state === "cancelled"
            ? "warn"
            : item.state === "running"
              ? "debug"
              : "info";
        addLog({
          subsystem: "transfer",
          severity,
          message: `${item.direction} ${item.name}: ${before} → ${item.state}`,
          detail: item.error,
          serverId: item.serverId,
          resourceId: item.id,
        });
      }
    }
    previousStates.current = new Map(next.map((item) => [item.id, item.state]));
    setTransfers(next);
  }, [addLog]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 650);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startUpload = useCallback(async (serverId: string, localPath: string, remoteDirectory: string) => {
    const next = await invoke<TransferSnapshot>("sftp_start_upload", { serverId, localPath, remoteDirectory });
    setTransfers((current) => mergeOne(current, next));
    previousStates.current.set(next.id, next.state);
    addLog({
      subsystem: "transfer",
      severity: "info",
      message: `Upload queued: ${next.name}`,
      detail: `remote=${next.remotePath}`,
      serverId: next.serverId,
      resourceId: next.id,
    });
    choosePanel("transfers");
    return next;
  }, [addLog, choosePanel]);

  const startDownload = useCallback(async (serverId: string, remotePath: string, localPath: string) => {
    const next = await invoke<TransferSnapshot>("sftp_start_download", { serverId, remotePath, localPath });
    setTransfers((current) => mergeOne(current, next));
    previousStates.current.set(next.id, next.state);
    addLog({
      subsystem: "transfer",
      severity: "info",
      message: `Download queued: ${next.name}`,
      detail: `remote=${next.remotePath}`,
      serverId: next.serverId,
      resourceId: next.id,
    });
    choosePanel("transfers");
    return next;
  }, [addLog, choosePanel]);

  const cancel = useCallback(async (transferId: string) => {
    await invoke("sftp_cancel_transfer", { transferId });
    addLog({ subsystem: "transfer", severity: "warn", message: "Transfer cancellation requested", resourceId: transferId });
    await refresh();
  }, [addLog, refresh]);

  const retry = useCallback(async (transferId: string) => {
    const next = await invoke<TransferSnapshot>("sftp_retry_transfer", { transferId });
    setTransfers((current) => mergeOne(current, next));
    previousStates.current.set(next.id, next.state);
    addLog({
      subsystem: "transfer",
      severity: "info",
      message: `Transfer retry queued: ${next.name}`,
      serverId: next.serverId,
      resourceId: next.id,
    });
    choosePanel("transfers");
    return next;
  }, [addLog, choosePanel]);

  const clearFinished = useCallback(async () => {
    await invoke("sftp_clear_finished");
    addLog({ subsystem: "transfer", severity: "debug", message: "Finished transfer records cleared" });
    await refresh();
  }, [addLog, refresh]);

  const value = useMemo<TransferContextValue>(() => ({
    transfers,
    refresh,
    startUpload,
    startDownload,
    cancel,
    retry,
    clearFinished,
  }), [cancel, clearFinished, refresh, retry, startDownload, startUpload, transfers]);

  return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>;
}

export function useTransfers() {
  const value = useContext(TransferContext);
  if (!value) throw new Error("useTransfers must be used inside TransferProvider");
  return value;
}
