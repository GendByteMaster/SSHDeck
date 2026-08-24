import { Play, RotateCw, Square } from "lucide-react";
import { formatDuration } from "./sessionLifecycle";
import { useTunnels } from "./TunnelContext";
import { tunnelStateLabel } from "./tunnelHealth";

export function PortsPanel() {
  const { tunnels, statuses, toggleTunnel, toggleAutoRestart, error } = useTunnels();

  return <div className="min-h-0 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
    {error && <div className="mb-2 rounded-lg border border-rose-400/15 bg-rose-400/[0.05] px-3 py-2 text-[10.5px] text-rose-300">{error}</div>}
    <div className="grid gap-1.5">
      {tunnels.map((tunnel) => {
        const status = statuses[tunnel.id] ?? null;
        const running = status?.state === "running" || status?.state === "stopping";
        return <div key={tunnel.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-white/[0.055] bg-white/[0.018] px-3 py-2">
          <div className="min-w-0"><strong className="block truncate text-[11.5px] font-medium text-zinc-300">{tunnel.name}</strong><small className="block truncate text-[9.5px] text-zinc-600">{tunnel.kind.toUpperCase()} · :{tunnel.localPort} · {tunnelStateLabel(status)}{status ? ` · ${formatDuration(status.durationMs)}` : ""}</small></div>
          <button type="button" title="Toggle auto restart" onClick={() => void toggleAutoRestart(tunnel).catch(() => undefined)} className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[9.5px] ${tunnel.autoRestart ? "bg-[#4f7cff]/10 text-[#91a9ff]" : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"}`}><RotateCw size={11} /> Auto</button>
          <button type="button" onClick={() => void toggleTunnel(tunnel.id).catch(() => undefined)} className={`grid size-7 place-items-center rounded-lg ${running ? "bg-rose-400/[0.07] text-rose-300" : "bg-emerald-400/[0.07] text-emerald-300"}`}>{running ? <Square size={11} /> : <Play size={11} />}</button>
        </div>;
      })}
      {tunnels.length === 0 && <div className="grid h-full min-h-24 place-items-center text-[11px] text-zinc-600">No saved SSH tunnels.</div>}
    </div>
  </div>;
}
