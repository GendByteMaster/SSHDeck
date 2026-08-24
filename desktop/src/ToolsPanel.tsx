import { invoke } from "@tauri-apps/api/core";
import { Activity, Cable, History, Play, Plus, RefreshCw, TerminalSquare, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { classifyCommand, CommandRisk, riskLabel } from "./commandSafety";
import { formatUptime, ServerStatus } from "./serverStatus";
import { formatDuration, SessionHistoryItem, SessionView } from "./sessionLifecycle";
import { useTunnels } from "./TunnelContext";
import { tunnelStateLabel } from "./tunnelHealth";
import { useWorkbench } from "./WorkbenchContext";

type Server = { id: string; name: string; group: string | null };
type QuickCommand = { id: string; name: string; command: string; serverId: string | null; group: string | null };
type WorkspaceData = { quickCommands: QuickCommand[] };
type PendingCommand = { item: QuickCommand; risk: CommandRisk };

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

const emptyWorkspace: WorkspaceData = { quickCommands: [] };

function sessionLabel(session: SessionView | null) {
  if (!session) return "Closed";
  if (session.state === "active") return "Active";
  if (session.state === "reconnecting") return `Reconnecting ${session.reconnectAttempts}/3`;
  if (session.state === "disconnected") return "Disconnected";
  return "Failed";
}

export function ToolsPanel({ servers, activeSession, activeServerId, activeStatus, statusChecking, sessionHistory, onToggleAutoReconnect, onRefreshStatus, onError }: Props) {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [quickOpen, setQuickOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const dataRef = useRef<WorkspaceData>(emptyWorkspace);
  const activeServer = servers.find((server) => server.id === activeServerId) ?? null;
  const sessionUsable = activeSession?.state === "active";
  const { choosePanel } = useWorkbench();
  const { tunnels, statuses, loading: tunnelsLoading, error: tunnelError } = useTunnels();

  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    void invoke<WorkspaceData>("workspace_load")
      .then((next) => { dataRef.current = next; setData(next); })
      .catch((value) => onError(String(value)));
  }, [onError]);

  const visibleCommands = useMemo(() => data.quickCommands.filter((item) => {
    if (item.serverId) return item.serverId === activeServerId;
    if (item.group) return item.group === activeServer?.group;
    return true;
  }), [data.quickCommands, activeServerId, activeServer?.group]);

  const visibleHistory = useMemo(
    () => sessionHistory.filter((item) => !activeServerId || item.serverId === activeServerId).slice(0, 5),
    [sessionHistory, activeServerId],
  );

  async function executeCommand(item: QuickCommand) {
    if (!activeSession || !sessionUsable) return onError("Open an active server session before running a Quick Command.");
    try {
      await invoke("run_quick_command", { sessionId: activeSession.id, commandId: item.id });
      setPendingCommand(null);
    } catch (value) { onError(String(value)); }
  }

  async function runCommand(item: QuickCommand) {
    if (!activeSession || !sessionUsable) return onError("Open an active server session before running a Quick Command.");
    const risk = classifyCommand(item.command);
    if (risk.level === "low") return executeCommand(item);
    setPendingCommand({ item, risk });
  }

  async function deleteCommand(id: string) {
    try {
      const next = await invoke<WorkspaceData>("delete_quick_command", { id });
      dataRef.current = next;
      setData(next);
    } catch (value) { onError(String(value)); }
  }

  const statusState = statusChecking ? "checking" : activeStatus?.state ?? "unknown";
  const statusLabel = statusChecking ? "Checking" : activeStatus?.state === "online" ? "Online" : activeStatus?.state === "auth_required" ? "Auth required" : activeStatus?.state === "offline" ? "Offline" : activeStatus?.state === "error" ? "SSH error" : "Unknown";
  const runningTunnels = tunnels.filter((item) => statuses[item.id]?.state === "running");
  const failedTunnels = tunnels.filter((item) => statuses[item.id]?.state === "failed");

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
        {visibleHistory.map((item) => <div className="history-item" key={item.id}><span className={`session-dot ${item.state === "failed" ? "failed" : item.state === "reconnected" ? "active" : "disconnected"}`} /><div><strong>{item.state}</strong><small>{item.serverName} · {formatDuration(item.durationMs)}{item.exitCode != null ? ` · exit ${item.exitCode}` : ""}</small></div><time>{new Date(item.atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}
        {visibleHistory.length === 0 && <p className="tool-empty">No session events yet.</p>}
      </div>
    </section>

    <section className="tool-section">
      <div className="tool-heading"><div><TerminalSquare size={14} /><strong>Quick Commands</strong></div><button onClick={() => setQuickOpen(true)} title="Add command"><Plus size={14} /></button></div>
      <div className="tool-list">
        {visibleCommands.map((item) => {
          const risk = classifyCommand(item.command);
          return <div className="tool-item" key={item.id}><button className="tool-run" onClick={() => void runCommand(item)} disabled={!sessionUsable}><Play size={12} /><span><strong>{item.name}</strong><small>{item.command}{risk.level !== "low" ? ` · ${riskLabel(risk.level)} risk` : ""}</small></span></button><button className="tool-delete" onClick={() => void deleteCommand(item.id)}><Trash2 size={12} /></button></div>;
        })}
        {visibleCommands.length === 0 && <p className="tool-empty">No commands for this server.</p>}
      </div>
      <p className="status-note">Potentially destructive Quick Commands are classified locally and require confirmation before they are sent to the SSH PTY.</p>
    </section>

    <section className="tool-section tunnels-section">
      <div className="tool-heading"><div><Cable size={14} /><strong>Port Forwarding</strong></div><button onClick={() => choosePanel("ports")} title="Open Ports panel">Open</button></div>
      {tunnelsLoading ? <p className="tool-empty">Loading tunnels…</p> : <div className="status-grid">
        <div><span>Saved</span><strong>{tunnels.length}</strong></div>
        <div><span>Running</span><strong>{runningTunnels.length}</strong></div>
        <div><span>Failed</span><strong>{failedTunnels.length}</strong></div>
        <div><span>Transport</span><strong>OpenSSH</strong></div>
      </div>}
      {tunnels.slice(0, 3).map((item) => <div className="history-item" key={item.id}><span className={`session-dot ${statuses[item.id]?.state === "running" ? "active" : statuses[item.id]?.state === "failed" ? "failed" : "disconnected"}`} /><div><strong>{item.name}</strong><small>{item.kind.toUpperCase()} · :{item.localPort} · {tunnelStateLabel(statuses[item.id] ?? null)}</small></div></div>)}
      {tunnelError && <p className="status-error" title={tunnelError}>{tunnelError}</p>}
      <p className="status-note">Tunnel lifecycle is shared with the Ports workspace and Bottom Panel. Open Ports for CRUD, start/stop, health, and auto-restart controls.</p>
    </section>

    {quickOpen && <QuickCommandDialog servers={servers} activeServerId={activeServerId} onClose={() => setQuickOpen(false)} onSaved={(next) => { dataRef.current = next; setData(next); setQuickOpen(false); }} onError={onError} />}
    {pendingCommand && <DangerousCommandDialog pending={pendingCommand} serverName={activeServer?.name ?? "server"} onClose={() => setPendingCommand(null)} onConfirm={() => void executeCommand(pendingCommand.item)} />}
  </aside>;
}

function DangerousCommandDialog({ pending, serverName, onClose, onConfirm }: { pending: PendingCommand; serverName: string; onClose: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const critical = pending.risk.level === "critical";
  const allowed = !critical || confirmation.trim().toUpperCase() === "RUN";
  return <div className="modal-backdrop"><div className="modal compact-modal"><div className="modal-head"><div><h2>{riskLabel(pending.risk.level)} risk command</h2><p>SSHDeck stopped this Quick Command before sending it to <strong>{serverName}</strong>.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={16} /></button></div><pre className="config-snippet">{pending.item.command}</pre>{pending.risk.reasons.map((reason) => <p className="status-error" key={reason}>{reason}</p>)}{critical && <label>Type RUN to confirm<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RUN" /></label>}<p>Only continue if you have verified the target server and understand the command's effect.</p><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!allowed} onClick={onConfirm}>Run anyway</button></div></div></div>;
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
  return <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={(event) => void submit(event)}><div className="modal-head"><div><h2>Add Quick Command</h2><p>Runs as terminal input in the active SSH session.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={16} /></button></div><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Docker status" /></label><label>Command<input required value={command} onChange={(event) => setCommand(event.target.value)} placeholder="docker compose ps" /></label><label>Server<select value={serverId} onChange={(event) => setServerId(event.target.value)}><option value="">All servers</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save command</button></div></form></div>;
}
