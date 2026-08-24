import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { EmptyWorkspaceV2 } from "./product-v2";
import { SidebarV2 } from "./SidebarV2";
import { ToolsPanel } from "./ToolsPanel";
import { useServerStatus } from "./serverStatus";
import {
  loadSessionHistory,
  saveSessionHistory,
  SessionHistoryItem,
  SessionProcessStatus,
  SessionView,
} from "./sessionLifecycle";

type TerminalOutput = { sessionId: string; data: number[] };
type ServerRecord = {
  id: string;
  name: string;
  host: string;
  user: string | null;
  port: number;
  identityFile: string | null;
  group: string | null;
  favorite: boolean;
  sourceAlias: string | null;
  lastConnectedAt: number | null;
};
type TerminalEntry = { terminal: Terminal; fit: FitAddon; element: HTMLDivElement };
type ServerDraft = Omit<ServerRecord, "lastConnectedAt"> & { lastConnectedAt?: number | null };
type AuthMode = "key" | "password";

const emptyDraft: ServerDraft = {
  id: "",
  name: "",
  host: "",
  user: null,
  port: 22,
  identityFile: null,
  group: null,
  favorite: false,
  sourceAlias: null,
};

const decoder = new TextDecoder();

export function App() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [sshHosts, setSshHosts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<SessionView[]>([]);
  const [history, setHistory] = useState<SessionHistoryItem[]>(loadSessionHistory);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServerDraft | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("key");
  const [draftPassword, setDraftPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportServer, setExportServer] = useState<ServerRecord | null>(null);
  const [deleteServer, setDeleteServer] = useState<ServerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const terminals = useRef(new Map<string, TerminalEntry>());
  const terminalHost = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<SessionView[]>([]);
  const serversRef = useRef<ServerRecord[]>([]);
  const reconnecting = useRef(new Set<string>());
  const pendingOutput = useRef(new Map<string, Uint8Array[]>());
  const recentOutputText = useRef(new Map<string, string>());
  const sessionServer = useRef(new Map<string, string>());
  const sessionPasswords = useRef(new Map<string, string>());
  const passwordSent = useRef(new Set<string>());
  const { statuses, checking, refreshServer } = useServerStatus(servers);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { serversRef.current = servers; }, [servers]);

  function appendHistory(item: Omit<SessionHistoryItem, "id">) {
    setHistory((current) => {
      const next = [{ ...item, id: `${item.atMs}-${Math.random().toString(36).slice(2, 8)}` }, ...current].slice(0, 30);
      saveSessionHistory(next);
      return next;
    });
  }

  async function refreshServers() {
    setServers(await invoke<ServerRecord[]>("list_servers"));
  }

  useEffect(() => {
    void Promise.all([
      refreshServers(),
      invoke<string[]>("list_hosts").then(setSshHosts),
    ]).catch((value) => setError(String(value)));
  }, []);

  function maybeSendPassword(sessionId: string) {
    if (passwordSent.current.has(sessionId)) return;
    const serverId = sessionServer.current.get(sessionId);
    if (!serverId) return;
    const password = sessionPasswords.current.get(serverId);
    if (!password) return;
    const text = recentOutputText.current.get(sessionId)?.toLowerCase() ?? "";
    if (!/(password|passphrase).*:\s*$/.test(text.slice(-300))) return;
    passwordSent.current.add(sessionId);
    void invoke("terminal_write", { sessionId, data: `${password}\n` }).catch((value) => {
      passwordSent.current.delete(sessionId);
      setError(`Could not send SSH password: ${String(value)}`);
    });
  }

  useEffect(() => {
    const unlisten = listen<TerminalOutput>("terminal-output", ({ payload }) => {
      const chunk = new Uint8Array(payload.data);
      const text = decoder.decode(chunk, { stream: true });
      const previous = recentOutputText.current.get(payload.sessionId) ?? "";
      recentOutputText.current.set(payload.sessionId, (previous + text).slice(-1200));

      const entry = terminals.current.get(payload.sessionId);
      if (entry) entry.terminal.write(chunk);
      else {
        const queued = pendingOutput.current.get(payload.sessionId) ?? [];
        queued.push(chunk);
        pendingOutput.current.set(payload.sessionId, queued.slice(-100));
      }
      maybeSendPassword(payload.sessionId);
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    if (!activeId || !terminalHost.current) return;
    terminalHost.current.replaceChildren();
    let entry = terminals.current.get(activeId);
    if (!entry) {
      const element = document.createElement("div");
      element.className = "terminal-instance";
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: "JetBrains Mono, Cascadia Code, ui-monospace, monospace",
        fontSize: 14,
        lineHeight: 1.25,
        theme: {
          background: "#080a0d",
          foreground: "#e8edf4",
          cursor: "#6b8cff",
          selectionBackground: "#294073",
          black: "#171a20",
          brightBlack: "#697386",
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(element);
      terminal.onData((data) => void invoke("terminal_write", { sessionId: activeId, data }));
      entry = { terminal, fit, element };
      terminals.current.set(activeId, entry);

      const queued = pendingOutput.current.get(activeId) ?? [];
      for (const chunk of queued) terminal.write(chunk);
      pendingOutput.current.delete(activeId);
      maybeSendPassword(activeId);
    }

    terminalHost.current.appendChild(entry.element);
    entry.fit.fit();
    void invoke("terminal_resize", {
      sessionId: activeId,
      rows: entry.terminal.rows,
      cols: entry.terminal.cols,
    });
    entry.terminal.focus();

    const resize = () => {
      entry?.fit.fit();
      if (entry) {
        void invoke("terminal_resize", {
          sessionId: activeId,
          rows: entry.terminal.rows,
          cols: entry.terminal.cols,
        });
      }
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeId]);

  async function startSession(server: ServerRecord, autoReconnect = true, reconnectAttempts = 0) {
    const id = await invoke<string>("terminal_start_server", { serverId: server.id });
    sessionServer.current.set(id, server.id);
    maybeSendPassword(id);
    const status = await invoke<SessionProcessStatus>("terminal_session_status", { sessionId: id });
    return {
      id,
      serverId: server.id,
      name: server.name,
      state: status.state === "running" ? "active" : status.state,
      startedAtMs: status.startedAtMs,
      durationMs: status.durationMs,
      exitCode: status.exitCode,
      signal: status.signal,
      autoReconnect,
      reconnectAttempts,
    } satisfies SessionView;
  }

  async function autoReconnect(tab: SessionView) {
    if (reconnecting.current.has(tab.id)) return;
    reconnecting.current.add(tab.id);
    try {
      terminals.current.get(tab.id)?.terminal.dispose();
      terminals.current.delete(tab.id);
      sessionServer.current.delete(tab.id);
      passwordSent.current.delete(tab.id);
      await invoke("terminal_close", { sessionId: tab.id }).catch(() => undefined);

      let attempt = tab.reconnectAttempts;
      while (attempt < 3) {
        attempt += 1;
        if (!tabsRef.current.some((item) => item.id === tab.id)) return;
        setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, state: "reconnecting", reconnectAttempts: attempt } : item));
        await new Promise((resolve) => window.setTimeout(resolve, 1000 * (2 ** (attempt - 1))));
        const server = serversRef.current.find((item) => item.id === tab.serverId);
        if (!server || !tabsRef.current.some((item) => item.id === tab.id)) return;
        try {
          const replacement = await startSession(server, tab.autoReconnect, attempt);
          setTabs((current) => current.map((item) => item.id === tab.id ? replacement : item));
          setActiveId((current) => current === tab.id ? replacement.id : current);
          appendHistory({ serverId: server.id, serverName: server.name, state: "reconnected", atMs: Date.now(), durationMs: 0, exitCode: null });
          void refreshServer(server.id).catch(() => undefined);
          return;
        } catch (value) {
          if (attempt >= 3) setError(`Auto-reconnect failed after ${attempt} attempts: ${String(value)}`);
        }
      }
    } finally {
      reconnecting.current.delete(tab.id);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function pollSessions() {
      const running = tabsRef.current.filter((tab) => tab.state === "active");
      await Promise.all(running.map(async (tab) => {
        try {
          const status = await invoke<SessionProcessStatus>("terminal_session_status", { sessionId: tab.id });
          if (cancelled) return;
          if (status.state === "running") {
            setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, durationMs: status.durationMs } : item));
            return;
          }
          const endedState: "disconnected" | "failed" = status.state === "failed" ? "failed" : "disconnected";
          setTabs((current) => current.map((item) => item.id === tab.id ? {
            ...item,
            state: endedState,
            durationMs: status.durationMs,
            exitCode: status.exitCode,
            signal: status.signal,
          } : item));
          appendHistory({
            serverId: tab.serverId,
            serverName: tab.name,
            state: endedState,
            atMs: status.endedAtMs ?? Date.now(),
            durationMs: status.durationMs,
            exitCode: status.exitCode,
          });
          if (endedState === "failed" && tab.autoReconnect && tab.reconnectAttempts < 3) {
            void autoReconnect({ ...tab, state: "failed", durationMs: status.durationMs, exitCode: status.exitCode, signal: status.signal });
          }
        } catch (value) {
          if (!cancelled) setError(`Could not read session state: ${String(value)}`);
        }
      }));
    }
    void pollSessions();
    const timer = window.setInterval(() => void pollSessions(), 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return servers.filter((server) => [server.name, server.host, server.group ?? ""].some((value) => value.toLowerCase().includes(needle)));
  }, [servers, query]);
  const favorites = filtered.filter((server) => server.favorite);
  const nonFavorites = filtered.filter((server) => !server.favorite);
  const groups = useMemo(() => {
    const map = new Map<string, ServerRecord[]>();
    for (const server of nonFavorites) {
      const key = server.group?.trim() || "Servers";
      map.set(key, [...(map.get(key) ?? []), server]);
    }
    return [...map.entries()];
  }, [nonFavorites]);
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;
  const activeStatus = activeTab ? statuses[activeTab.serverId] ?? null : null;

  async function connect(server: ServerRecord) {
    const existing = tabs.find((tab) => tab.serverId === server.id);
    if (existing) { setActiveId(existing.id); return; }
    try {
      const tab = await startSession(server);
      setTabs((value) => [...value, tab]);
      setActiveId(tab.id);
      void refreshServers();
      void refreshServer(server.id).catch(() => undefined);
    } catch (value) { setError(String(value)); }
  }

  async function reconnect(tab: SessionView) {
    const server = servers.find((item) => item.id === tab.serverId);
    if (!server) return;
    try {
      await invoke("terminal_close", { sessionId: tab.id });
      terminals.current.get(tab.id)?.terminal.dispose();
      terminals.current.delete(tab.id);
      sessionServer.current.delete(tab.id);
      passwordSent.current.delete(tab.id);
      const replacement = await startSession(server, tab.autoReconnect, 0);
      setTabs((value) => value.map((item) => item.id === tab.id ? replacement : item));
      setActiveId(replacement.id);
      void refreshServers();
      void refreshServer(server.id).catch(() => undefined);
    } catch (value) { setError(String(value)); }
  }

  async function closeTab(id: string) {
    const tab = tabs.find((item) => item.id === id);
    await invoke("terminal_close", { sessionId: id });
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    pendingOutput.current.delete(id);
    recentOutputText.current.delete(id);
    sessionServer.current.delete(id);
    passwordSent.current.delete(id);
    if (tab) appendHistory({ serverId: tab.serverId, serverName: tab.name, state: "closed", atMs: Date.now(), durationMs: tab.durationMs, exitCode: tab.exitCode });
    setTabs((value) => {
      const next = value.filter((item) => item.id !== id);
      if (activeId === id) setActiveId(next.at(-1)?.id ?? null);
      return next;
    });
  }

  function toggleAutoReconnect(id: string) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, autoReconnect: !tab.autoReconnect } : tab));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      const server = {
        ...draft,
        identityFile: authMode === "password" ? null : draft.identityFile,
        lastConnectedAt: draft.lastConnectedAt ?? null,
      };
      const saved = await invoke<ServerRecord>("save_server", { server });
      if (authMode === "password") {
        if (draftPassword) sessionPasswords.current.set(saved.id, draftPassword);
      } else {
        sessionPasswords.current.delete(saved.id);
      }
      setDraft(null);
      setDraftPassword("");
      await refreshServers();
    } catch (value) { setError(String(value)); }
  }

  async function confirmDelete() {
    if (!deleteServer) return;
    const serverId = deleteServer.id;
    const doomedTabs = tabsRef.current.filter((tab) => tab.serverId === serverId);
    const doomedIds = new Set(doomedTabs.map((tab) => tab.id));

    try {
      await Promise.all(doomedTabs.map(async (tab) => {
        await invoke("terminal_close", { sessionId: tab.id }).catch(() => undefined);
        terminals.current.get(tab.id)?.terminal.dispose();
        terminals.current.delete(tab.id);
        pendingOutput.current.delete(tab.id);
        recentOutputText.current.delete(tab.id);
        sessionServer.current.delete(tab.id);
        passwordSent.current.delete(tab.id);
        reconnecting.current.delete(tab.id);
      }));

      const remainingTabs = tabsRef.current.filter((tab) => tab.serverId !== serverId);
      tabsRef.current = remainingTabs;
      setTabs(remainingTabs);
      setActiveId((current) => {
        if (!current || !doomedIds.has(current)) return current;
        terminalHost.current?.replaceChildren();
        return remainingTabs.at(-1)?.id ?? null;
      });

      setHistory((current) => {
        const next = current.filter((item) => item.serverId !== serverId);
        saveSessionHistory(next);
        return next;
      });
      sessionPasswords.current.delete(serverId);

      await invoke("delete_server", { id: serverId });
      setDeleteServer(null);
      await refreshServers();
    } catch (value) { setError(String(value)); }
  }

  async function toggleFavorite(server: ServerRecord) {
    await invoke("save_server", { server: { ...server, favorite: !server.favorite } });
    await refreshServers();
  }

  async function importAlias(alias: string) {
    try {
      await invoke("import_ssh_host", { alias });
      await refreshServers();
      setImportOpen(false);
    } catch (value) { setError(String(value)); }
  }

  function sshSnippet(server: ServerRecord) {
    const alias = server.sourceAlias ?? server.name.trim().replace(/\s+/g, "-").toLowerCase();
    return [
      `Host ${alias}`,
      `    HostName ${server.host}`,
      ...(server.user ? [`    User ${server.user}`] : []),
      ...(server.port !== 22 ? [`    Port ${server.port}`] : []),
      ...(server.identityFile ? [`    IdentityFile ${server.identityFile}`] : []),
    ].join("\n");
  }

  async function copyExport(server: ServerRecord) {
    try {
      await navigator.clipboard.writeText(sshSnippet(server));
      setExportServer(null);
    } catch (value) { setError(`Could not copy to clipboard: ${String(value)}`); }
  }

  function openNewServer() {
    setAuthMode("key");
    setDraftPassword("");
    setDraft({ ...emptyDraft });
  }

  function openEditServer(server: ServerRecord) {
    setAuthMode(server.identityFile ? "key" : "password");
    setDraftPassword(sessionPasswords.current.get(server.id) ?? "");
    setDraft({ ...server });
  }

  function ServerRow({ server }: { server: ServerRecord }) {
    const status = statuses[server.id];
    const state = checking.has(server.id) ? "checking" : status?.state ?? "unknown";
    return <div className="server-row-wrap">
      <button className="server-row" onClick={() => void connect(server)}>
        <span className={`status-dot ${state}`} /><Server size={15} />
        <span className="server-copy">
          <strong>{server.name}</strong>
          <small>{server.user ? `${server.user}@` : ""}{server.host}:{server.port}{status?.latencyMs != null ? ` · ${status.latencyMs} ms` : ""}</small>
        </span>
      </button>
      <div className="row-actions">
        <button title="Favorite" onClick={() => void toggleFavorite(server)}><Star size={13} fill={server.favorite ? "currentColor" : "none"} /></button>
        <button title="Export OpenSSH snippet" onClick={() => setExportServer(server)}><Copy size={13} /></button>
        <button title="Edit" onClick={() => openEditServer(server)}><Pencil size={13} /></button>
        <button title="Delete" onClick={() => setDeleteServer(server)}><Trash2 size={13} /></button>
      </div>
    </div>;
  }

  return <main className="app-shell">
    <SidebarV2
      favorites={favorites}
      groups={groups}
      query={query}
      statuses={statuses}
      checking={checking}
      onQueryChange={setQuery}
      onAdd={openNewServer}
      onImport={() => setImportOpen(true)}
      onConnect={(server) => void connect(server)}
      onFavorite={(server) => void toggleFavorite(server)}
      onExport={(server) => setExportServer(server)}
      onEdit={openEditServer}
      onDelete={(server) => setDeleteServer(server)}
    />

    <section className="workspace">
      <header className="topbar"><div className="tabs">{tabs.map((tab) => <button key={tab.id} className={`tab ${activeId === tab.id ? "active" : ""}`} onClick={() => setActiveId(tab.id)}>
        <span className={`session-dot ${tab.state}`} /><span>{tab.name}</span>
        <RefreshCw size={12} className={tab.state === "reconnecting" ? "spin" : ""} onClick={(event) => { event.stopPropagation(); void reconnect(tab); }} />
        <X size={13} onClick={(event) => { event.stopPropagation(); void closeTab(tab.id); }} />
      </button>)}</div></header>
      {activeId ? <div ref={terminalHost} className="terminal-host" /> : <EmptyWorkspaceV2 onAddServer={openNewServer} onImport={() => setImportOpen(true)} />}
    </section>

    <ToolsPanel
      servers={servers}
      activeSession={activeTab}
      activeServerId={activeTab?.serverId ?? null}
      activeStatus={activeStatus}
      statusChecking={activeTab ? checking.has(activeTab.serverId) : false}
      sessionHistory={history}
      onToggleAutoReconnect={() => { if (activeTab) toggleAutoReconnect(activeTab.id); }}
      onRefreshStatus={async () => { if (activeTab) await refreshServer(activeTab.serverId); }}
      onError={setError}
    />

    {draft && <div className="modal-backdrop"><form className="modal server-editor" onSubmit={(event) => void save(event)}>
      <div className="modal-head"><div><h2>{draft.id ? "Edit Server" : "Add Server"}</h2><p>Connection metadata is local. Passwords are kept in memory only for this app session.</p></div><button type="button" className="icon-button" onClick={() => setDraft(null)}><X size={18} /></button></div>
      <label>Name<input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Production API" /></label>
      <label>Host<input required value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} placeholder="203.0.113.10" /></label>
      <div className="form-grid"><label>User<input value={draft.user ?? ""} onChange={(event) => setDraft({ ...draft, user: event.target.value || null })} placeholder="deploy" /></label><label>Port<input type="number" min="1" max="65535" value={draft.port} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) })} /></label></div>
      <label>Authentication</label>
      <div className="auth-switch">
        <button type="button" className={authMode === "key" ? "active" : ""} onClick={() => setAuthMode("key")}><KeyRound size={15} /> SSH Key</button>
        <button type="button" className={authMode === "password" ? "active" : ""} onClick={() => setAuthMode("password")}><LockKeyhole size={15} /> Password</button>
      </div>
      {authMode === "key" ? <>
        <label>Identity file<input value={draft.identityFile ?? ""} onChange={(event) => setDraft({ ...draft, identityFile: event.target.value || null })} placeholder="~/.ssh/id_ed25519" /></label>
        <p className="auth-note">SSHDeck passes only the path to OpenSSH. Key contents are never copied.</p>
      </> : <>
        <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="Enter password for this app session" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
        <p className="auth-note">Not written to servers.json. SSHDeck sends it only after OpenSSH emits a password prompt.</p>
      </>}
      <label>Group<input value={draft.group ?? ""} onChange={(event) => setDraft({ ...draft, group: event.target.value || null })} placeholder="Production" /></label>
      <label className="check"><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /> Favorite</label>
      {draft.sourceAlias && <p>Imported from OpenSSH alias <code>{draft.sourceAlias}</code>. Connections keep using that alias.</p>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button><button className="primary" type="submit">Save server</button></div>
    </form></div>}

    {deleteServer && <div className="modal-backdrop"><div className="modal confirm-modal">
      <div className="modal-head"><div><h2>Delete server?</h2><p><strong>{deleteServer.name}</strong> will be removed from SSHDeck. Your OpenSSH config and keys are untouched.</p></div><button className="icon-button" onClick={() => setDeleteServer(null)}><X size={16} /></button></div>
      <div className="modal-actions"><button className="secondary" onClick={() => setDeleteServer(null)}>Cancel</button><button className="danger" onClick={() => void confirmDelete()}>Delete server</button></div>
    </div></div>}

    {importOpen && <div className="modal-backdrop"><div className="modal import-modal">
      <div className="modal-head"><div><h2>Import from OpenSSH</h2><p>SSHDeck resolves each alias with <code>ssh -G</code>.</p></div><button className="icon-button" onClick={() => setImportOpen(false)}><X size={16} /></button></div>
      <div className="import-list">{sshHosts.map((alias) => <button key={alias} className="import-row" onClick={() => void importAlias(alias)}><Server size={15} /><span>{alias}</span><Download size={14} /></button>)}{sshHosts.length === 0 && <div className="empty">No literal Host aliases found in ~/.ssh/config.</div>}</div>
    </div></div>}

    {exportServer && <div className="modal-backdrop"><div className="modal">
      <div className="modal-head"><div><h2>Export to OpenSSH</h2><p>SSHDeck never edits ~/.ssh/config automatically.</p></div><button className="icon-button" onClick={() => setExportServer(null)}><X size={16} /></button></div>
      <pre className="config-snippet">{sshSnippet(exportServer)}</pre>
      <div className="modal-actions"><button className="secondary" onClick={() => setExportServer(null)}>Close</button><button className="primary" onClick={() => void copyExport(exportServer)}><Copy size={14} /> Copy</button></div>
    </div></div>}

    {error && <div className="toast"><span>{error}</span><button onClick={() => setError(null)}><X size={14} /></button></div>}
  </main>;
}
