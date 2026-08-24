import { Cable, Pencil, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDuration } from "./sessionLifecycle";
import { Tunnel, useTunnels } from "./TunnelContext";
import { TunnelEditorDialog, TunnelServer } from "./TunnelEditorDialog";
import { tunnelStateLabel } from "./tunnelHealth";
import { useWorkbench } from "./WorkbenchContext";

type Props = {
  servers: TunnelServer[];
  activeServerId?: string | null;
};

function kindLabel(tunnel: Tunnel) {
  if (tunnel.kind === "local") return "LOCAL · -L";
  if (tunnel.kind === "remote") return "REMOTE · -R";
  return "SOCKS · -D";
}

function endpoint(tunnel: Tunnel) {
  const bind = tunnel.bindHost || "127.0.0.1";
  if (tunnel.kind === "dynamic") return `${bind}:${tunnel.localPort} → SOCKS proxy`;
  return `${bind}:${tunnel.localPort} → ${tunnel.remoteHost ?? "127.0.0.1"}:${tunnel.remotePort ?? "—"}`;
}

function stateClass(state?: string) {
  if (state === "running") return "bg-emerald-400";
  if (state === "failed") return "bg-rose-400";
  if (state === "starting" || state === "stopping") return "bg-amber-400 animate-pulse";
  return "bg-zinc-600";
}

export function PortsWorkspace({ servers, activeServerId = null }: Props) {
  const { tunnels, statuses, loading, error, clearError, refresh, toggleTunnel, deleteTunnel, toggleAutoRestart, restartAttempts } = useTunnels();
  const { selectedTunnel, setSelectedTunnel } = useWorkbench();
  const [editor, setEditor] = useState<Tunnel | "new" | null>(null);
  const [filter, setFilter] = useState("all");
  const [deleteCandidate, setDeleteCandidate] = useState<Tunnel | null>(null);

  const visible = useMemo(() => filter === "all" ? tunnels : tunnels.filter((item) => item.serverId === filter), [filter, tunnels]);
  const runningCount = tunnels.filter((item) => statuses[item.id]?.state === "running").length;

  function selectTunnel(tunnel: Tunnel) {
    const state = statuses[tunnel.id]?.state ?? "stopped";
    setSelectedTunnel({ id: tunnel.id, name: tunnel.name, state });
  }

  return <div className="flex min-h-0 flex-1 flex-col bg-[#0d1015]/92">
    <header className="border-b border-white/[0.055] px-3.5 pb-3 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <div><span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Ports</span><strong className="mt-0.5 block text-[14px] font-semibold text-zinc-200">SSH forwarding</strong></div>
        <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[10px] text-zinc-500">{runningCount}/{tunnels.length} running</span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" onClick={() => setEditor("new")} className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#4f7cff] px-3 text-[12px] font-medium text-white"><Plus size={14} /> Add tunnel</button>
        <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh tunnels" className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-500 hover:text-zinc-200 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
      </div>
      <select value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-2.5 h-9 w-full rounded-xl border border-white/[0.065] bg-[#090b0f] px-3 text-[11px] text-zinc-400 outline-none">
        <option value="all">All servers</option>
        {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
      </select>
    </header>

    {error && <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-3 py-2 text-[10.5px] leading-4 text-rose-300"><span className="min-w-0 flex-1">{error}</span><button onClick={clearError} className="text-rose-300/60 hover:text-rose-200">×</button></div>}

    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
      {visible.map((tunnel) => {
        const status = statuses[tunnel.id] ?? null;
        const running = status?.state === "running" || status?.state === "stopping";
        const server = servers.find((item) => item.id === tunnel.serverId);
        const selected = selectedTunnel.id === tunnel.id;
        return <article key={tunnel.id} onPointerDown={() => selectTunnel(tunnel)} className={`mb-2 rounded-xl border p-2.5 transition-colors ${selected ? "border-[#6f91ff]/25 bg-[#4f7cff]/[0.08]" : "border-white/[0.055] bg-white/[0.018] hover:bg-white/[0.03]"}`}>
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${stateClass(status?.state)}`} />
            <div className="min-w-0 flex-1"><strong className="block truncate text-[12.5px] font-medium text-zinc-200">{tunnel.name}</strong><small className="mt-0.5 block truncate text-[10px] text-zinc-600">{kindLabel(tunnel)} · {server?.name ?? "Missing server"}</small></div>
            <button type="button" onClick={(event) => { event.stopPropagation(); void toggleTunnel(tunnel.id).catch(() => undefined); }} className={`grid size-8 place-items-center rounded-lg border ${running ? "border-rose-400/15 bg-rose-400/[0.06] text-rose-300" : "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300"}`} title={running ? "Stop tunnel" : "Start tunnel"}>{running ? <Square size={13} /> : <Play size={13} />}</button>
          </div>
          <div className="mt-2 rounded-lg bg-black/20 px-2.5 py-2 font-mono text-[10px] text-zinc-500">{endpoint(tunnel)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[9.5px] text-zinc-600"><span>{tunnelStateLabel(status)}</span>{status && <><span>·</span><span>{formatDuration(status.durationMs)}</span>{status.exitCode != null && <><span>·</span><span>exit {status.exitCode}</span></>}</>}</div>
          {status?.reason && <p className="mt-1.5 line-clamp-2 text-[9.5px] leading-4 text-rose-300/80" title={status.reason}>{status.reason}</p>}
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={(event) => { event.stopPropagation(); void toggleAutoRestart(tunnel).catch(() => undefined); }} className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[9.5px] ${tunnel.autoRestart ? "bg-[#4f7cff]/10 text-[#91a9ff]" : "bg-white/[0.025] text-zinc-600 hover:text-zinc-300"}`}><RotateCw size={11} /> {tunnel.autoRestart ? `Auto ${restartAttempts(tunnel.id)}/3` : "Auto off"}</button>
            <span className="flex-1" />
            <button type="button" onClick={(event) => { event.stopPropagation(); setEditor(tunnel); }} title="Edit tunnel" className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"><Pencil size={12} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteCandidate(tunnel); }} title="Delete tunnel" className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-rose-400/[0.07] hover:text-rose-300"><Trash2 size={12} /></button>
          </div>
        </article>;
      })}
      {!loading && visible.length === 0 && <div className="mx-2 mt-5 flex flex-col items-center rounded-2xl border border-dashed border-white/[0.07] px-4 py-7 text-center"><span className="grid size-9 place-items-center rounded-xl bg-white/[0.035] text-zinc-600"><Cable size={16} /></span><strong className="mt-3 text-[12px] font-medium text-zinc-400">No tunnels</strong><span className="mt-1 text-[10.5px] leading-5 text-zinc-700">Create a local, remote, or SOCKS forwarding rule.</span></div>}
    </div>

    {editor && <TunnelEditorDialog servers={servers} activeServerId={activeServerId} tunnel={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
    {deleteCandidate && <div className="modal-backdrop"><div className="modal confirm-modal"><div className="modal-head"><div><h2>Delete tunnel?</h2><p><strong>{deleteCandidate.name}</strong> will be stopped if needed and removed from SSHDeck.</p></div></div><div className="modal-actions"><button className="secondary" onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="danger" onClick={() => void deleteTunnel(deleteCandidate.id).then(() => setDeleteCandidate(null)).catch(() => undefined)}>Delete tunnel</button></div></div></div>}
  </div>;
}
