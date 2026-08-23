import { invoke } from "@tauri-apps/api/core";
import { Activity, Cable, History, Play, Plus, RefreshCw, Square, TerminalSquare, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatUptime, ServerStatus } from "./serverStatus";
import { formatDuration, SessionHistoryItem, SessionView } from "./sessionLifecycle";

type Server = { id: string; name: string; group: string | null };
type QuickCommand = { id: string; name: string; command: string; serverId: string | null; group: string | null };
type TunnelKind = "local" | "remote" | "dynamic";
type Tunnel = {
  id: string;
  name: string;
  serverId: string;
  kind: TunnelKind;
  bindHost: string | null;
  localPort: number;
  remoteHost: string | null;
  remotePort: number | null;
};
type WorkspaceData = { quickCommands: QuickCommand[]; tunnels: Tunnel[] };

type Props = {
  servers: Server[];
  activeSession: SessionView | null;
  activeServerId: string | null;
  activeStatus: ServerStatus | null;
  statusChecking: boolean;
  sessionHistory: SessionHistoryItem[];
  onToggleAutoReconnect: () => void;
  onRefreshStatus: () => Promise<void>;
  onError: (error: string) => void;
};

const emptyWorkspace: WorkspaceData = { quickCommands: [], tunnels: [] };

function sessionLabel(session: SessionView | null) {
  if (!session) return "Closed";
  if (session.state === "active") return "Active";
  if (session.state === "reconnecting") return `Reconnecting ${session.reconnectAttempts}/3`;
  if (session.state === "disconnected") return "Disconnected";
  return "Failed";
}

export function ToolsPanel({ servers, activeSession, activeServerId, activeStatus, statusChecking, sessionHistory, onToggleAutoReconnect, onRefreshStatus, onError }: Props) {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [activeTunnels, setActiveTunnels] = useState<string[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [tunnelOpen, setTunnelOpen] = useState(false);
  const activeServer = servers.find((server) => server.id === activeServerId) ?? null;
  const sessionUsable = activeSession?.state === "active";

  async function refresh() {
    const [workspace, running] = await Promise.all([
      invoke<WorkspaceData>("workspace_load"),
      invoke<string[]>("active_tunnels"),
    ]);
    setData(workspace);
    setActiveTunnels(running);
  }

  useEffect(() => {
    void refresh().catch((value) => onError(String(value)));
  }, []);

  const visibleCommands = useMemo(() => data.quickCommands.filter((item) => {
    if (item.serverId) return item.serverId === activeServerId;
    if (item.group) return item.group === activeServer?.group;
    return true;
  }), [data.quickCommands, activeServerId, activeServer?.group]);

  const visibleHistory = useMemo(
    () => sessionHistory.filter((item) => !activeServerId || item.serverId === activeServerId).slice(0, 5),
    [sessionHistory, activeServerId],
  );

  async function runCommand(id: string) {
    if (!activeSession || !sessionUsable) return onError("Open an active server session before running a Quick Command.");
    try {
      await invoke("run_quick_command", { sessionId: activeSession.id, commandId: id });
    } catch (value) { onError(String(value)); }
  }

  async function deleteCommand(id: string) {
    try { setData(await invoke<WorkspaceData>("delete_quick_command", { id })); }
    catch (value) { onError(String(value)); }
  }

  async function toggleTunnel(id: string) {
    try {
      const running = activeTunnels.includes(id);
      setActiveTunnels(await invoke<string[]>(running ? "stop_tunnel" : "start_tunnel", { id }));
    } catch (value) { onError(String(value)); }
  }

  async function deleteTunnel(id: string) {
    try {
      setData(await invoke<WorkspaceData>("delete_tunnel", { id }));
      setActiveTunnels((value) => value.filter((item) => item !== id));
    } catch (value) { onError(String(value)); }
  }

  const statusState = statusChecking ? "checking" : activeStatus?.state ?? "unknown";
  const statusLabel = statusChecking ? "Checking" : activeStatus?.state === "online" ? "Online" : activeStatus?.state === "auth_required" ? "Auth required" : activeStatus?.state === "offline" ? "Offline" : activeStatus?.state === "error" ? "SSH error" : "Unknown";

  return <aside className="tools-panel">
    <section className="tool-section status-section">
      <div className="tool-heading"><div><Activity size={14} /><strong>Server Status</strong></div><button disabled={!activeServerId || statusChecking} onClick={() => void onRefreshStatus().catch((value) => onError(String(value)))} title="Refresh SSH probe"><RefreshCw size={14} className={statusChecking ? "spin" : ""} /></button></div>
      {activeServer ? <div className="status-card">
        <div className="status-summary"><span className={`status-dot ${statusState}`} /><div><strong>{activeServer.name}</strong><small>{statusLabel}</small></div></div>
        <div className="status-grid">
          <div><span>Session</span><strong>{sessionLabel(activeSession)}</strong></div>
          <div><span>Duration</span><strong>{activeSession ? formatDuration(activeSession.durationMs) : "—"}</strong></div>
          <div><span>Exit code</span><strong>{activeSession?.exitCode ?? "—"}</strong></div>
          <div><span>SSH probe</span><strong>{activeStatus?.latencyMs != null ? `${activeStatus.latencyMs} ms` : "—"}</strong></div>
          <div><span>Authentication</span><strong>{activeStatus?.sshOk ? "Verified" : activeStatus?.state === "auth_required" ? "Required" : "—"}</strong></div>
          <div><span>Uptime</span><strong>{formatUptime(activeStatus?.uptimeSeconds ?? null)}</strong></div>
        </div>
        {activeSession && <button className={`auto-reconnect ${activeSession.autoReconnect ? "enabled" : ""}`} onClick={onToggleAutoReconnect}><span className="status-dot" /> Auto reconnect {activeSession.autoReconnect ? "on" : "off"}</button>}
        {activeSession?.signal && <p className="status-error">Signal: {activeSession.signal}</p>}
        {activeStatus?.error && <p className="status-error" title={activeStatus.error}>{activeStatus.error}</p>}
        <p className="status-note">Server health comes from an authenticated OpenSSH probe. Session state comes from the real SSH child process.</p>
      </div> : <p className="tool-empty">Open a server to inspect its SSH status.</p>}
    </section>

    <section className="tool-section history-section">
      <div className="tool-heading"><div><History size={14} /><strong>Connection History</strong></div></div>
      <div className="history-list">
        {visibleHistory.map((item) => <div className="history-item" key={item.id}>
          <span className={`session-dot ${item.state === "failed" ? "failed" : item.state === "reconnected" ? "active" : "disconnected"}`} />
          <div><strong>{item.state}</strong><small>{item.serverName} · {formatDuration(item.durationMs)}{item.exitCode != null ? ` · exit ${item.exitCode}` : ""}</small></div>
          <time>{new Date(item.atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>)}
        {visibleHistory.length === 0 && <p className="tool-empty">No session events yet.</p>}
      </div>
    </section>

    <section className="tool-section">
      <div className="tool-heading"><div><TerminalSquare size={14} /><strong>Quick Commands</strong></div><button onClick={() => setQuickOpen(true)} title="Add command"><Plus size={14} /></button></div>
      <div className="tool-list">
        {visibleCommands.map((item) => <div className="tool-item" key={item.id}>
          <button className="tool-run" onClick={() => void runCommand(item.id)} disabled={!sessionUsable}><Play size={12} /><span><strong>{item.name}</strong><small>{item.command}</small></span></button>
          <button className="tool-delete" onClick={() => void deleteCommand(item.id)}><Trash2 size={12} /></button>
        </div>)}
        {visibleCommands.length === 0 && <p className="tool-empty">No commands for this server.</p>}
      </div>
    </section>

    <section className="tool-section tunnels-section">
      <div className="tool-heading"><div><Cable size={14} /><strong>Port Forwarding</strong></div><button onClick={() => setTunnelOpen(true)} title="Add tunnel"><Plus size={14} /></button></div>
      <div className="tool-list">
        {data.tunnels.map((item) => {
          const running = activeTunnels.includes(item.id);
          const server = servers.find((value) => value.id === item.serverId);
          return <div className={`tunnel-item ${running ? "running" : ""}`} key={item.id}>
            <button className="tool-run" onClick={() => void toggleTunnel(item.id)}>{running ? <Square size={12} /> : <Play size={12} />}<span><strong>{item.name}</strong><small>{item.kind.toUpperCase()} · {server?.name ?? "Missing server"} · :{item.localPort}</small></span></button>
            <button className="tool-delete" onClick={() => void deleteTunnel(item.id)}><Trash2 size={12} /></button>
          </div>;
        })}
        {data.tunnels.length === 0 && <p className="tool-empty">No saved tunnels.</p>}
      </div>
    </section>

    {quickOpen && <QuickCommandDialog servers={servers} activeServerId={activeServerId} onClose={() => setQuickOpen(false)} onSaved={(next) => { setData(next); setQuickOpen(false); }} onError={onError} />}
    {tunnelOpen && <TunnelDialog servers={servers} activeServerId={activeServerId} onClose={() => setTunnelOpen(false)} onSaved={(next) => { setData(next); setTunnelOpen(false); }} onError={onError} />}
  </aside>;
}

function QuickCommandDialog({ servers, activeServerId, onClose, onSaved, onError }: { servers: Server[]; activeServerId: string | null; onClose: () => void; onSaved: (data: WorkspaceData) => void; onError: (error: string) => void }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [serverId, setServerId] = useState(activeServerId ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const next = await invoke<WorkspaceData>("save_quick_command", { item: { id: "", name, command, serverId: serverId || null, group: null } });
      onSaved(next);
    } catch (value) { onError(String(value)); }
  }

  return <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={(event) => void submit(event)}>
    <div className="modal-head"><div><h2>Add Quick Command</h2><p>Runs as terminal input in the active SSH session.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={16} /></button></div>
    <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Docker status" /></label>
    <label>Command<input required value={command} onChange={(event) => setCommand(event.target.value)} placeholder="docker compose ps" /></label>
    <label>Server<select value={serverId} onChange={(event) => setServerId(event.target.value)}><option value="">All servers</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save command</button></div>
  </form></div>;
}

function TunnelDialog({ servers, activeServerId, onClose, onSaved, onError }: { servers: Server[]; activeServerId: string | null; onClose: () => void; onSaved: (data: WorkspaceData) => void; onError: (error: string) => void }) {
  const [name, setName] = useState("");
  const [serverId, setServerId] = useState(activeServerId ?? servers[0]?.id ?? "");
  const [kind, setKind] = useState<TunnelKind>("local");
  const [bindHost, setBindHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState(5433);
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState(5432);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!serverId) return onError("Choose a server for the tunnel.");
    try {
      const next = await invoke<WorkspaceData>("save_tunnel", { tunnel: {
        id: "", name, serverId, kind, bindHost: bindHost || null, localPort,
        remoteHost: kind === "dynamic" ? null : remoteHost || null,
        remotePort: kind === "dynamic" ? null : remotePort,
      } });
      onSaved(next);
    } catch (value) { onError(String(value)); }
  }

  return <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={(event) => void submit(event)}>
    <div className="modal-head"><div><h2>Add SSH Tunnel</h2><p>Runs independently using system <code>ssh -N</code>.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={16} /></button></div>
    <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Production DB" /></label>
    <div className="form-grid"><label>Server<select required value={serverId} onChange={(event) => setServerId(event.target.value)}><option value="" disabled>Select server</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as TunnelKind)}><option value="local">Local (-L)</option><option value="remote">Remote (-R)</option><option value="dynamic">SOCKS (-D)</option></select></label></div>
    <div className="form-grid"><label>Bind host<input value={bindHost} onChange={(event) => setBindHost(event.target.value)} /></label><label>Listen port<input type="number" min="1" max="65535" value={localPort} onChange={(event) => setLocalPort(Number(event.target.value))} /></label></div>
    {kind !== "dynamic" && <div className="form-grid"><label>Target host<input required value={remoteHost} onChange={(event) => setRemoteHost(event.target.value)} /></label><label>Target port<input required type="number" min="1" max="65535" value={remotePort} onChange={(event) => setRemotePort(Number(event.target.value))} /></label></div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save tunnel</button></div>
  </form></div>;
}
