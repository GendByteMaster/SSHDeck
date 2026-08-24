import { AlertTriangle, Bug, CircleX, Info, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { LogSeverity, LogSubsystem, useLogs } from "./LogContext";

const severities: Array<"all" | LogSeverity> = ["all", "debug", "info", "warn", "error"];
const subsystems: Array<"all" | LogSubsystem> = ["all", "session", "ssh", "tunnel", "sftp", "transfer", "diagnostics", "workbench"];

function severityIcon(severity: LogSeverity) {
  if (severity === "error") return <CircleX size={12} className="text-rose-400" />;
  if (severity === "warn") return <AlertTriangle size={12} className="text-amber-400" />;
  if (severity === "debug") return <Bug size={12} className="text-violet-400" />;
  return <Info size={12} className="text-sky-400" />;
}

function severityClass(severity: LogSeverity) {
  if (severity === "error") return "border-rose-400/10 bg-rose-400/[0.035]";
  if (severity === "warn") return "border-amber-400/10 bg-amber-400/[0.03]";
  return "border-white/[0.045] bg-white/[0.018]";
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LogsPanel() {
  const { events, clearLogs } = useLogs();
  const [severity, setSeverity] = useState<"all" | LogSeverity>("all");
  const [subsystem, setSubsystem] = useState<"all" | LogSubsystem>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (severity !== "all" && event.severity !== severity) return false;
      if (subsystem !== "all" && event.subsystem !== subsystem) return false;
      if (!needle) return true;
      return [event.message, event.detail ?? "", event.serverId ?? "", event.sessionId ?? "", event.resourceId ?? ""]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [events, query, severity, subsystem]);

  return <div className="flex min-h-0 flex-1 flex-col bg-[#0b0e13]">
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-white/[0.05] px-3 py-2">
      <label className="flex h-8 min-w-44 flex-1 items-center gap-2 rounded-lg border border-white/[0.06] bg-[#080a0e] px-2.5 text-zinc-600">
        <Search size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs" className="min-w-0 flex-1 bg-transparent text-[10.5px] text-zinc-300 outline-none placeholder:text-zinc-700" />
      </label>
      <select value={severity} onChange={(event) => setSeverity(event.target.value as "all" | LogSeverity)} className="h-8 rounded-lg border border-white/[0.06] bg-[#080a0e] px-2 text-[10px] capitalize text-zinc-400 outline-none">
        {severities.map((value) => <option key={value} value={value}>{value === "all" ? "All levels" : value}</option>)}
      </select>
      <select value={subsystem} onChange={(event) => setSubsystem(event.target.value as "all" | LogSubsystem)} className="h-8 rounded-lg border border-white/[0.06] bg-[#080a0e] px-2 text-[10px] capitalize text-zinc-400 outline-none">
        {subsystems.map((value) => <option key={value} value={value}>{value === "all" ? "All systems" : value}</option>)}
      </select>
      <span className="text-[9.5px] text-zinc-700">{filtered.length}/{events.length}</span>
      <button type="button" disabled={events.length === 0} onClick={() => { if (window.confirm("Clear the in-memory SSHDeck log buffer?")) clearLogs(); }} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 text-[10px] text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300 disabled:opacity-35"><Trash2 size={12} /> Clear</button>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {events.length === 0 && <div className="flex h-full min-h-28 flex-col items-center justify-center text-center"><Info size={18} className="text-zinc-700" /><strong className="mt-2 text-[11px] font-medium text-zinc-500">No structured events yet</strong><span className="mt-1 max-w-md text-[9.5px] leading-4 text-zinc-700">Session, tunnel, transfer and SFTP diagnostic state changes will appear here. Raw terminal output is never recorded.</span></div>}
      {events.length > 0 && filtered.length === 0 && <div className="py-8 text-center text-[10px] text-zinc-700">No log events match the current filters.</div>}
      <div className="grid gap-1.5">
        {filtered.map((event) => <article key={event.id} className={`rounded-lg border px-2.5 py-2 ${severityClass(event.severity)}`}>
          <div className="flex min-w-0 items-center gap-2">
            {severityIcon(event.severity)}
            <span className="w-[62px] shrink-0 font-mono text-[9px] text-zinc-700">{formatTime(event.atMs)}</span>
            <span className="shrink-0 rounded-md border border-white/[0.055] bg-black/10 px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.07em] text-zinc-600">{event.subsystem}</span>
            <strong className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-zinc-300">{event.message}</strong>
            <span className="shrink-0 text-[8.5px] uppercase text-zinc-700">{event.severity}</span>
          </div>
          {event.detail && <p className="mt-1.5 break-words pl-[82px] font-mono text-[9px] leading-4 text-zinc-600">{event.detail}</p>}
          {(event.serverId || event.sessionId || event.resourceId) && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-[82px] font-mono text-[8px] text-zinc-750">
            {event.serverId && <span>server={event.serverId}</span>}
            {event.sessionId && <span>session={event.sessionId}</span>}
            {event.resourceId && <span>resource={event.resourceId}</span>}
          </div>}
        </article>)}
      </div>
    </div>
  </div>;
}
