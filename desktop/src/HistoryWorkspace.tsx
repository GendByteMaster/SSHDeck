import { AlertTriangle, Clock3, History, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDuration, SessionHistoryItem } from "./sessionLifecycle";
import { useSessions } from "./SessionContext";

type ServerRef = { id: string; name: string };
type HistoryState = "all" | SessionHistoryItem["state"];

function formatTimestamp(value: number | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function stateTone(state: SessionHistoryItem["state"]) {
  switch (state) {
    case "failed": return "border-rose-400/15 bg-rose-400/[0.07] text-rose-300";
    case "reconnected": return "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300";
    case "closed": return "border-zinc-400/10 bg-white/[0.03] text-zinc-400";
    default: return "border-amber-400/15 bg-amber-400/[0.07] text-amber-300";
  }
}

export function HistoryWorkspace({ servers, onReconnectServer }: { servers: ServerRef[]; onReconnectServer: (serverId: string) => void }) {
  const { history, historyLoading, historyError, clearHistory } = useSessions();
  const [query, setQuery] = useState("");
  const [serverId, setServerId] = useState("all");
  const [state, setState] = useState<HistoryState>("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const serverIds = useMemo(() => new Set(servers.map((server) => server.id)), [servers]);
  const historyServers = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of history) values.set(item.serverId, item.serverName);
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [history]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return history.filter((item) => {
      if (serverId !== "all" && item.serverId !== serverId) return false;
      if (state !== "all" && item.state !== state) return false;
      if (needle && ![item.serverName, item.state, item.signal ?? "", item.exitCode?.toString() ?? ""].some((value) => value.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [history, query, serverId, state]);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0d1015]/92">
    <header className="border-b border-white/[0.055] px-3.5 pb-3 pt-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">History</span>
          <strong className="mt-0.5 block text-[14px] font-semibold tracking-[-0.01em] text-zinc-200">Session history</strong>
          <p className="mt-1 text-[10.5px] leading-4 text-zinc-600">Persisted locally. Up to 200 recent session events are retained.</p>
        </div>
        <span className="grid min-w-7 place-items-center rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 text-[10px] font-medium text-zinc-500">{history.length}</span>
      </div>

      <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-white/[0.065] bg-[#090b0f] px-3 text-zinc-600 focus-within:border-[#5f86ff]/45 focus-within:text-zinc-400">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search history" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] text-zinc-300 outline-none placeholder:text-zinc-700" />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select value={serverId} onChange={(event) => setServerId(event.target.value)} className="h-9 rounded-xl border border-white/[0.065] bg-[#090b0f] px-2.5 text-[11px] text-zinc-400 outline-none focus:border-[#5f86ff]/45">
          <option value="all">All servers</option>
          {historyServers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={state} onChange={(event) => setState(event.target.value as HistoryState)} className="h-9 rounded-xl border border-white/[0.065] bg-[#090b0f] px-2.5 text-[11px] text-zinc-400 outline-none focus:border-[#5f86ff]/45">
          <option value="all">All states</option>
          <option value="failed">Failed</option>
          <option value="disconnected">Disconnected</option>
          <option value="reconnected">Reconnected</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {history.length > 0 && <div className="mt-2 flex justify-end">
        {confirmClear ? <div className="flex items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] p-1.5 pl-2.5 text-[10.5px] text-rose-200">
          Clear all history?
          <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300">Cancel</button>
          <button type="button" onClick={() => { clearHistory(); setConfirmClear(false); }} className="rounded-lg bg-rose-400/15 px-2 py-1 font-medium text-rose-200 hover:bg-rose-400/20">Clear</button>
        </div> : <button type="button" onClick={() => setConfirmClear(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10.5px] text-zinc-600 hover:bg-white/[0.04] hover:text-rose-300"><Trash2 size={12} /> Clear history</button>}
      </div>}
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {historyLoading && <div className="mx-1 rounded-2xl border border-white/[0.055] bg-white/[0.02] px-4 py-8 text-center text-[11px] text-zinc-600">Loading session history…</div>}
      {!historyLoading && historyError && <div className="mx-1 flex items-start gap-2 rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-3 py-3 text-[11px] leading-5 text-rose-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{historyError}</div>}
      {!historyLoading && !historyError && history.length === 0 && <div className="mx-1 mt-5 flex flex-col items-center rounded-2xl border border-dashed border-white/[0.07] px-4 py-8 text-center"><div className="grid size-10 place-items-center rounded-xl bg-white/[0.035] text-zinc-600"><History size={17} /></div><strong className="mt-3 text-[12px] font-medium text-zinc-400">No session history</strong><span className="mt-1 max-w-48 text-[11px] leading-5 text-zinc-700">Disconnect, reconnect, or close a session and the event will appear here.</span></div>}
      {!historyLoading && !historyError && history.length > 0 && filtered.length === 0 && <div className="mx-1 rounded-2xl border border-dashed border-white/[0.07] px-4 py-7 text-center text-[11px] text-zinc-600">No history matches the current filters.</div>}

      {filtered.map((item) => {
        const available = serverIds.has(item.serverId);
        const startedAt = item.startedAtMs ?? (item.durationMs > 0 ? Math.max(0, item.atMs - item.durationMs) : null);
        return <article key={item.id} className="mb-2 rounded-2xl border border-white/[0.055] bg-[#0a0d12] p-3">
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 rounded-lg border px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] ${stateTone(item.state)}`}>{item.state}</span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[12.5px] font-medium text-zinc-200">{item.serverName}</strong>
              <span className="mt-0.5 block truncate text-[10px] text-zinc-700">{item.serverId}</span>
            </div>
            <button type="button" disabled={!available} onClick={() => onReconnectServer(item.serverId)} title={available ? "Reconnect or focus this server" : "Server entry no longer exists"} className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.055] text-zinc-500 transition-colors enabled:hover:border-[#6f91ff]/20 enabled:hover:bg-[#4f7cff]/10 enabled:hover:text-[#8fa8ff] disabled:cursor-not-allowed disabled:opacity-30"><RotateCcw size={13} /></button>
          </div>

          <div className="mt-3 grid gap-1.5 text-[10.5px] text-zinc-600">
            <div className="flex items-center gap-2"><Clock3 size={12} /><span className="w-14 text-zinc-700">Ended</span><span className="truncate text-zinc-500">{formatTimestamp(item.atMs)}</span></div>
            {startedAt && <div className="flex items-center gap-2"><span className="ml-5 w-14 text-zinc-700">Started</span><span className="truncate text-zinc-500">{formatTimestamp(startedAt)}</span></div>}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <div className="rounded-xl border border-white/[0.045] bg-white/[0.018] px-2 py-2"><span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-700">Duration</span><strong className="mt-1 block truncate text-[10.5px] font-medium text-zinc-400">{formatDuration(item.durationMs)}</strong></div>
            <div className="rounded-xl border border-white/[0.045] bg-white/[0.018] px-2 py-2"><span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-700">Exit code</span><strong className="mt-1 block truncate text-[10.5px] font-medium text-zinc-400">{item.exitCode ?? "—"}</strong></div>
            <div className="rounded-xl border border-white/[0.045] bg-white/[0.018] px-2 py-2"><span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-700">Signal</span><strong className="mt-1 block truncate text-[10.5px] font-medium text-zinc-400">{item.signal ?? "—"}</strong></div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
