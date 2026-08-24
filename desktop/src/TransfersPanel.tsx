import { Ban, Check, Clock3, LoaderCircle, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { TransferSnapshot, useTransfers } from "./TransferContext";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function transferSpeed(item: TransferSnapshot) {
  if (!item.startedAtMs || item.bytesTransferred <= 0) return 0;
  const end = item.endedAtMs ?? Date.now();
  const seconds = Math.max(0.25, (end - item.startedAtMs) / 1000);
  return item.bytesTransferred / seconds;
}

function etaLabel(item: TransferSnapshot) {
  if (item.state !== "running" || item.bytesTotal <= 0) return null;
  const speed = transferSpeed(item);
  if (speed <= 0) return null;
  const seconds = Math.max(0, Math.ceil((item.bytesTotal - item.bytesTransferred) / speed));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function stateIcon(state: TransferSnapshot["state"]) {
  if (state === "queued") return <Clock3 size={13} className="text-zinc-500" />;
  if (state === "running") return <LoaderCircle size={13} className="animate-spin text-sky-300" />;
  if (state === "done") return <Check size={13} className="text-emerald-400" />;
  if (state === "cancelled") return <Ban size={13} className="text-amber-400" />;
  return <X size={13} className="text-rose-400" />;
}

export function TransfersPanel() {
  const { transfers, cancel, retry, clearFinished } = useTransfers();
  const active = transfers.filter((item) => item.state === "queued" || item.state === "running").length;
  const hasFinished = transfers.some((item) => item.state === "done" || item.state === "failed" || item.state === "cancelled");

  if (transfers.length === 0) {
    return <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <UploadCloud size={22} className="text-zinc-700" />
      <strong className="mt-3 text-[12px] font-medium text-zinc-400">No transfers yet</strong>
      <span className="mt-1 text-[11px] leading-5 text-zinc-600">Upload or download a remote file and it will appear in this queue.</span>
    </div>;
  }

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 text-[10.5px] text-zinc-500">
      <span>{active > 0 ? `${active} active` : "Idle"}</span>
      <span>{transfers.length} total</span>
      <span className="flex-1" />
      {hasFinished && <button type="button" onClick={() => void clearFinished()} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"><Trash2 size={12} /> Clear finished</button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {transfers.map((item) => {
        const progress = item.bytesTotal > 0 ? Math.min(1, item.bytesTransferred / item.bytesTotal) : null;
        const speed = transferSpeed(item);
        const eta = etaLabel(item);
        const activeItem = item.state === "queued" || item.state === "running";
        return <div key={item.id} className="mb-1.5 grid grid-cols-[minmax(160px,1.15fr)_minmax(180px,1.5fr)_auto] items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.018] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.03]">{stateIcon(item.state)}</span>
            <span className="min-w-0">
              <strong className="block truncate text-[11.5px] font-medium text-zinc-300">{item.direction === "upload" ? "↑" : "↓"} {item.name}</strong>
              <small className="mt-0.5 block truncate font-mono text-[9.5px] text-zinc-700">{item.direction === "upload" ? item.remotePath : item.localPath}</small>
            </span>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-[9.5px] text-zinc-600">
              <span className="capitalize">{item.state}</span>
              {item.bytesTotal > 0 && <span>{formatBytes(item.bytesTransferred)} / {formatBytes(item.bytesTotal)}</span>}
              {item.state === "running" && speed > 0 && <span>{formatBytes(speed)}/s</span>}
              {eta && <span>ETA {eta}</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
              {progress !== null ? <div className="h-full rounded-full bg-[#6488ff] transition-[width] duration-500" style={{ width: `${Math.max(item.state === "done" ? 100 : 2, progress * 100)}%` }} /> : activeItem ? <div className="h-full w-1/3 animate-pulse rounded-full bg-[#6488ff]/70" /> : null}
            </div>
            {item.error && <div className="mt-1.5 truncate text-[9.5px] text-rose-300/75" title={item.error}>{item.error}</div>}
          </div>

          <div className="flex items-center justify-end gap-1">
            {activeItem && <button type="button" title="Cancel transfer" onClick={() => void cancel(item.id)} className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-amber-400/10 hover:text-amber-300"><Ban size={13} /></button>}
            {(item.state === "failed" || item.state === "cancelled") && <button type="button" title="Retry transfer" onClick={() => void retry(item.id)} className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"><RotateCcw size={13} /></button>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
