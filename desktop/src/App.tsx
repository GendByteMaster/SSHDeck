import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Clock3, Copy, Download, Pencil, Plus, RefreshCw, Search, Server, Star, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

const emptyDraft: ServerDraft = {
  id: "", name: "", host: "", user: null, port: 22, identityFile: null,
  group: null, favorite: false, sourceAlias: null,
};

export function App() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [sshHosts, setSshHosts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<SessionView[]>([]);
  const [history, setHistory] = useState<SessionHistoryItem[]>(loadSessionHistory);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServerDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportServer, setExportServer] = useState<ServerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminals = useRef(new Map<string, TerminalEntry>());
  const terminalHost = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<SessionView[]>([]);
  const serversRef = useRef<ServerRecord[]>([]);
  const reconnecting = useRef(new Set<string>());
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
    void Promise.all([refreshServers(), invoke<string[]>("list_hosts").then(setSshHosts)]).catch((value) => setError(String(value)));
  }, []);

  useEffect(() => {
    const unlisten = listen<TerminalOutput>("terminal-output", ({ payload }) => {
      terminals.current.get(payload.sessionId)?.terminal.write(new Uint8Array(payload.data));
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
        fontFamily: "JetBrains Mono, Cascadia Code, ui-monospace, monospace",
        fontSize: 14,
        theme: { background: "#0b0d10", foreground: "#e8ebf0", cursor: "#e8ebf0" },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(element);
      terminal.onData((data) => void invoke("terminal_write", { sessionId: activeId, data }));
      entry = { terminal, fit, element };
      terminals.current.set(activeId, entry);
    }
    terminalHost.current.appendChild(entry.element);
    entry.fit.fit();
    void invoke("terminal_resize", { sessionId: activeId, rows: entry.terminal.rows, cols: entry.terminal.cols });
    const resize = () => {
      entry?.fit.fit();
      if (entry) void invoke("terminal_resize", { sessionId: activeId, rows: entry.terminal.rows, cols: entry.terminal.cols });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeId]);

  async function startSession(server: ServerRecord, autoReconnect = true, reconnectAttempts = 0) {
    const id = await invoke<string>("terminal_start_server", { serverId: server.id });
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
          appendHistory({
            serverId: server.id,
            serverName: server.name,
            state: "reconnected",
            atMs: Date.now(),
            durationMs: 0,
            exitCode: null,
          });
          void refreshServer(server.id).catch(() => undefined);
          return;
        } catch (value) {
          if (attempt >= 3) {
            setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, state: "failed", reconnectAttempts: attempt } : item));
            setError(`Auto-reconnect failed after ${attempt} attempts: ${String(value)}`);
          }
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

          setTabs((current) => current.map((item) => item.id === tab.id ? {
            ...item,
            state: status.state,
            durationMs: status.durationMs,
            exitCode: status.exitCode,
            signal: status.signal,
          } : item));
          appendHistory({
            serverId: tab.serverId,
            serverName: tab.name,
            state: status.state,
            atMs: status.endedAtMs ?? Date.now(),
            durationMs: status.durationMs,
            exitCode: status.exitCode,
          });
          if (status.state === "failed" && tab.autoReconnect && tab.reconnectAttempts < 3) {
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
    const needle = query.toLowerCase();
    return servers.filter((server) => [server.name, server.host, server.group ?? ""].some((value) => value.toLowerCase().includes(needle)));
  }, [servers, query]);

  const favorites = filtered.filter((server) => server.favorite);
  const recents = [...filtered].filter((server) => server.lastConnectedAt).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)).slice(0, 5);
  const groups = useMemo(() => {
    const map = new Map<string, ServerRecord[]>();
    for (const server of filtered) {
      const key = server.group?.trim() || "Ungrouped";
      map.set(key, [...(map.get(key) ?? []), server]);
    }
    return [...map.entries()];
  }, [filtered]);
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
    if (tab) appendHistory({
      serverId: tab.serverId,
      serverName: tab.name,
      state: "closed",
      atMs: Date.now(),
      durationMs: tab.durationMs,
      exitCode: tab.exitCode,
    });
    setTabs((value) => {
      const next = value.filter((tab) => tab.id !== id);
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
      await invoke("save_server", { server: { ...draft, lastConnectedAt: draft.lastConnectedAt ?? null } });
      setDraft(null);
      await refreshServers();
    } catch (value) { setError(String(value)); }
  }

  async function remove(server: ServerRecord) {
    if (!window.confirm(`Delete ${server.name} from SSHDeck?`)) return;
    await invoke("delete_server", { id: server.id });
    await refreshServers();
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

  function ServerRow({ server }: { server: ServerRecord }) {
    const status = statuses[server.id];
    const state = checking.has(server.id) ? "checking" : status?.state ?? "unknown";
    return <div className="server-row-wrap">
      <button className="server-row" onClick={() => void connect(server)}>
        <span className={`status-dot ${state}`} /><Server size={15} />
        <span className="server-copy"><strong>{server.name}</strong><small>{server.user ? `${server.user}@` : ""}{server.host}:{server.port}{status?.latencyMs != null ? ` · ${status.latencyMs} ms` : ""}</small></span>
      </button>
      <div className="row-actions">
        <button title="Favorite" onClick={() => void toggleFavorite(server)}><Star size={13} fill={server.favorite ? "currentColor" : "none"} /></button>
        <button title="Export OpenSSH snippet" onClick={() => setExportServer(server)}><Copy size={13} /></button>
        <button title="Edit" onClick={() => setDraft({ ...server })}><Pencil size={13} /></button>
        <button title="Delete" onClick={() => void remove(server)}><Trash2 size={13} /></button>
      </div>
    </div>;
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><strong>SSHDeck</strong><span>Remote workspace</span></div></div>
      <div className="sidebar-actions">
        <button className="primary" onClick={() => setDraft({ ...emptyDraft })}><Plus size={15} /> Add server</button>
        <button className="secondary" onClick={() => setImportOpen(true)}><Download size={15} /> Import SSH</button>
      </div>
      <div className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" /></div>
      <div className="server-list">
        {favorites.length > 0 && <><div className="section-label">FAVORITES</div>{favorites.map((server) => <ServerRow key={`fav-${server.id}`} server={server} />)}</>}
        {recents.length > 0 && <><div className="section-label"><Clock3 size={11} /> RECENT</div>{recents.map((server) => <ServerRow key={`recent-${server.id}`} server={server} />)}</>}
        {groups.map(([group, items]) => <div key={group}><div className="section-label">{group.toUpperCase()}</div>{items.map((server) => <ServerRow key={server.id} server={server} />)}</div>)}
        {filtered.length === 0 && <div className="empty">No SSHDeck servers yet. Add one or import from OpenSSH.</div>}
      </div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div className="tabs">{tabs.map((tab) => <button key={tab.id} className={`tab ${activeId === tab.id ? "active" : ""}`} onClick={() => setActiveId(tab.id)}>
        <span className={`session-dot ${tab.state}`} /><span>{tab.name}</span>
        <RefreshCw size={12} className={tab.state === "reconnecting" ? "spin" : ""} onClick={(event) => { event.stopPropagation(); void reconnect(tab); }} />
        <X size={13} onClick={(event) => { event.stopPropagation(); void closeTab(tab.id); }} />
      </button>)}</div></header>
      {activeId ? <div ref={terminalHost} className="terminal-host" /> : <div className="welcome"><div className="welcome-icon"><Server size={30} /></div><h1>Your servers, one click away</h1><p>Add a server to SSHDeck or import an existing OpenSSH host. Private keys stay managed by OpenSSH.</p></div>}
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

    {draft && <div className="modal-backdrop"><form className="modal" onSubmit={(event) => void save(event)}>
      <div className="modal-head"><div><h2>{draft.id ? "Edit server" : "Add server"}</h2><p>Stored locally by SSHDeck. Private key contents are never copied.</p></div><button type="button" className="icon-button" onClick={() => setDraft(null)}><X size={16} /></button></div>
      <label>Name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Production API" /></label>
      <label>Host<input required value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="203.0.113.10" /></label>
      <div className="form-grid"><label>User<input value={draft.user ?? ""} onChange={(e) => setDraft({ ...draft, user: e.target.value || null })} placeholder="deploy" /></label><label>Port<input type="number" min="1" max="65535" value={draft.port} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })} /></label></div>
      <label>Identity file<input value={draft.identityFile ?? ""} onChange={(e) => setDraft({ ...draft, identityFile: e.target.value || null })} placeholder="~/.ssh/id_ed25519" /></label>
      <label>Group<input value={draft.group ?? ""} onChange={(e) => setDraft({ ...draft, group: e.target.value || null })} placeholder="Production" /></label>
      <label className="check"><input type="checkbox" checked={draft.favorite} onChange={(e) => setDraft({ ...draft, favorite: e.target.checked })} /> Favorite</label>
      {draft.sourceAlias && <p>Imported from OpenSSH alias <code>{draft.sourceAlias}</code>. Connections keep using that alias so ProxyJump/Match rules remain effective.</p>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button><button className="primary" type="submit">Save server</button></div>
    </form></div>}

    {importOpen && <div className="modal-backdrop"><div className="modal import-modal">
      <div className="modal-head"><div><h2>Import from OpenSSH</h2><p>SSHDeck asks OpenSSH to resolve each host with <code>ssh -G</code>.</p></div><button className="icon-button" onClick={() => setImportOpen(false)}><X size={16} /></button></div>
      <div className="import-list">{sshHosts.map((alias) => <button key={alias} className="import-row" onClick={() => void importAlias(alias)}><Server size={15} /><span>{alias}</span><Download size={14} /></button>)}{sshHosts.length === 0 && <div className="empty">No literal Host aliases found in ~/.ssh/config.</div>}</div>
    </div></div>}

    {exportServer && <div className="modal-backdrop"><div className="modal">
      <div className="modal-head"><div><h2>Export to OpenSSH</h2><p>SSHDeck will not modify ~/.ssh/config. Copy this block and add it yourself.</p></div><button className="icon-button" onClick={() => setExportServer(null)}><X size={16} /></button></div>
      <pre className="config-snippet">{sshSnippet(exportServer)}</pre>
      <div className="modal-actions"><button className="secondary" onClick={() => setExportServer(null)}>Close</button><button className="primary" onClick={() => void copyExport(exportServer)}><Copy size={14} /> Copy</button></div>
    </div></div>}

    {error && <div className="toast"><span>{error}</span><button onClick={() => setError(null)}><X size={14} /></button></div>}
  </main>;
}
