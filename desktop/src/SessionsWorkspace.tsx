import { RefreshCw, RotateCw, TerminalSquare, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useCommandContextMenu } from "./commands/ContextMenuService";
import { useSessions } from "./SessionContext";
import { formatDuration, SessionState, SessionView } from "./sessionLifecycle";

type Filter = "all" | "active" | "attention";

function stateLabel(state: SessionState) {
  switch (state) {
    case "active": return "Active";
    case "reconnecting": return "Reconnecting";
    case "disconnected": return "Disconnected";
    case "failed": return "Failed";
  }
}

function stateDot(state: SessionState) {
  switch (state) {
    case "active": return "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.08)]";
    case "reconnecting": return "animate-pulse bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,.08)]";
    case "failed": return "bg-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,.08)]";
    default: return "bg-zinc-500";
  }
}

function matchesFilter(session: SessionView, filter: Filter) {
  if (filter === "active") return session.state === "active" || session.state === "reconnecting";
  if (filter === "attention") return session.state === "failed" || session.state === "disconnected";
  return true;
}

export function SessionsWorkspace() {
  const {
    sessions,
    activeId,
    historyError,
    selectSession,
    requestReconnect,
    requestClose,
    toggleAutoReconnect,
  } = useSessions();
  const popupCommands = useCommandContextMenu();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => sessions.filter((session) => matchesFilter(session, filter)), [filter, sessions]);
  const activeCount = sessions.filter((session) => session.state === "active" || session.state === "reconnecting").length;
  const attentionCount = sessions.filter((session) => session.state === "failed" || session.state === "disconnected").length;

  function showContextMenu(session: SessionView, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    selectSession(session.id);
    void popupCommands(["session.reconnect", "session.close"]);
  }

  return <div className="flex min-h-0 min-w-0 flex-col bg-[#0d1015]/92">
    <header className="border-b border-white/[0.055] px-3.5 pb-3 pt-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Sessions</span>
          <strong className="mt-0.5 block truncate text-[14px] font-semibold tracking-[-0.01em] text-zinc-200">SSH workspace</strong>
        </div>
        <span className="grid min-w-6 place-items-center rounded-full border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{sessions.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.055] bg-[#090b0f] p-1">
        {([
          ["all", `All ${sessions.length}`],
          ["active", `Active ${activeCount}`],
          ["attention", `Issues ${attentionCount}`],
        ] as [Filter, string][]).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`h-7 rounded-lg text-[10px] font-medium transition-colors ${filter === id ? "bg-[#4f7cff]/12 text-[#8fa8ff]" : "text-zinc-600 hover:bg-white/[0.035] hover:text-zinc-400"}`}>{label}</button>)}
      </div>
    </header>

    {historyError && <div className="mx-3 mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-3 py-2 text-[10.5px] leading-4 text-rose-300">{historyError}</div>}

    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {visible.map((session) => {
        const selected = session.id === activeId;
        return <div key={session.id} onPointerDown={() => selectSession(session.id)} onContextMenu={(event) => showContextMenu(session, event)} className={`group mb-1.5 rounded-xl border px-2.5 py-2.5 transition-colors ${selected ? "border-[#6f91ff]/20 bg-[#4f7cff]/10" : "border-white/[0.045] bg-white/[0.015] hover:border-white/[0.07] hover:bg-white/[0.03]"}`}>
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${stateDot(session.state)}`} />
            <button type="button" onClick={() => selectSession(session.id)} className="min-w-0 flex-1 text-left">
              <strong className={`block truncate text-[12px] font-medium ${selected ? "text-zinc-100" : "text-zinc-300"}`}>{session.name}</strong>
              <small className="mt-0.5 block truncate text-[9.5px] text-zinc-600">{stateLabel(session.state)} · {formatDuration(session.durationMs)}</small>
              {(session.exitCode != null || session.signal) && <small className="mt-1 block truncate text-[9px] text-rose-300/80">{session.exitCode != null ? `exit ${session.exitCode}` : ""}{session.signal ? `${session.exitCode != null ? " · " : ""}${session.signal}` : ""}</small>}
            </button>
            <TerminalSquare size={14} className={selected ? "mt-0.5 shrink-0 text-[#8fa8ff]" : "mt-0.5 shrink-0 text-zinc-700"} />
          </div>

          <div className="mt-2 flex items-center gap-1 border-t border-white/[0.045] pt-2">
            <button type="button" title="Reconnect session" onClick={(event) => { event.stopPropagation(); requestReconnect(session); }} className="grid size-7 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.045] hover:text-zinc-300"><RefreshCw size={12} className={session.state === "reconnecting" ? "animate-spin" : ""} /></button>
            <button type="button" title="Toggle auto reconnect" onClick={(event) => { event.stopPropagation(); toggleAutoReconnect(session.id); }} className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[9px] font-medium transition-colors ${session.autoReconnect ? "bg-[#4f7cff]/10 text-[#91a9ff]" : "text-zinc-600 hover:bg-white/[0.045] hover:text-zinc-300"}`}><RotateCw size={11} /> Auto</button>
            <span className="flex-1" />
            <button type="button" title="Close session" onClick={(event) => { event.stopPropagation(); requestClose(session); }} className="grid size-7 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-rose-400/[0.08] hover:text-rose-300"><X size={13} /></button>
          </div>
        </div>;
      })}

      {visible.length === 0 && <div className="mx-2 mt-6 flex flex-col items-center rounded-2xl border border-dashed border-white/[0.07] px-4 py-7 text-center">
        <div className="grid size-9 place-items-center rounded-xl bg-white/[0.035] text-zinc-600"><TerminalSquare size={16} /></div>
        <strong className="mt-3 text-[12px] font-medium text-zinc-400">{sessions.length === 0 ? "No SSH sessions" : "No sessions in this filter"}</strong>
        <span className="mt-1 max-w-48 text-[11px] leading-5 text-zinc-700">{sessions.length === 0 ? "Connect to a server to create your first session." : "Switch the filter to inspect other session states."}</span>
      </div>}
    </div>
  </div>;
}
