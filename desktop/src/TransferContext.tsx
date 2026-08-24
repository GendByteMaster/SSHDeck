import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  const { choosePanel } = useWorkbench();

  const refresh = useCallback(async () => {
    const next = await invoke<TransferSnapshot[]>("sftp_transfer_list");
    setTransfers(next);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 650);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startUpload = useCallback(async (serverId: string, localPath: string, remoteDirectory: string) => {
    const next = await invoke<TransferSnapshot>("sftp_start_upload", { serverId, localPath, remoteDirectory });
    setTransfers((current) => mergeOne(current, next));
    choosePanel("transfers");
    return next;
  }, [choosePanel]);

  const startDownload = useCallback(async (serverId: string, remotePath: string, localPath: string) => {
    const next = await invoke<TransferSnapshot>("sftp_start_download", { serverId, remotePath, localPath });
    setTransfers((current) => mergeOne(current, next));
    choosePanel("transfers");
    return next;
  }, [choosePanel]);

  const cancel = useCallback(async (transferId: string) => {
    await invoke("sftp_cancel_transfer", { transferId });
    await refresh();
  }, [refresh]);

  const retry = useCallback(async (transferId: string) => {
    const next = await invoke<TransferSnapshot>("sftp_retry_transfer", { transferId });
    setTransfers((current) => mergeOne(current, next));
    choosePanel("transfers");
    return next;
  }, [choosePanel]);

  const clearFinished = useCallback(async () => {
    await invoke("sftp_clear_finished");
    await refresh();
  }, [refresh]);

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
